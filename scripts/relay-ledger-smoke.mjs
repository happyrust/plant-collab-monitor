// /ledger 中继台账视图 · 自动化用例
//
//   默认（L1 mock 契约层）：RL-01–RL-06 —— mock 后端（scripts/lib/relay-ledger-mock.mjs）三种变体：
//     pws（真实形状，筛选 / 分页真做）· pws-empty（库没建表 → note）· pmg（没有这组路由 → 404）
//   --live（L2 真后端只读层）：RL-L0–RL-L3 —— 视图上看到的与直连 API 拿到的逐项相等；
//     安全闸把除 auth/login|auth/me 之外的一切非 GET 请求直接 abort（台账本来就是只读面）。
//
// 用例编号与 docs/e2e-smoke/remote-deploy-auto-test-cases.md §8 一一对应。
//
// 用法：
//   node scripts/relay-ledger-smoke.mjs                       # mock（缺 dist/ 自动 vite build）
//   node scripts/relay-ledger-smoke.mjs --build               # 强制先重新 vite build（改了视图之后）
//   node scripts/relay-ledger-smoke.mjs --live --api http://127.0.0.1:4100
//   node scripts/relay-ledger-smoke.mjs --headed
// 环境变量：
//   SMOKE_BROWSER_EXECUTABLE  Chrome 路径（默认 Windows 的 Program Files 安装位置；其它平台走 chrome channel）
//   SMOKE_PREVIEW_PORT        vite preview 端口（默认 mock 4179 / live 4180）
//   SMOKE_JSON_REPORT         结果 JSON（默认 docs/e2e-smoke/relay-ledger-smoke-result.json / relay-ledger-live-result.json）
//   SMOKE_SCREENSHOT_DIR      截图目录（默认 docs/e2e-smoke/screenshots/relay-ledger，已 .gitignore）
//   SMOKE_API_TARGET / SMOKE_ADMIN_USER / SMOKE_ADMIN_PASS   live 模式的后端与凭据
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { createState, respond } from './lib/topology-deploy-mock.mjs';
import { createLedgerState, respondLedger, MAX_CHANGES_PER_ROW } from './lib/relay-ledger-mock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const live = Boolean(args.live);
const API = String(args.api ?? process.env.SMOKE_API_TARGET ?? 'http://127.0.0.1:4100').replace(/\/$/, '');
const USER = String(args.user ?? process.env.SMOKE_ADMIN_USER ?? 'admin');
const PASS = String(args.pass ?? process.env.SMOKE_ADMIN_PASS ?? 'admin');
const previewPort = Number(args.port ?? process.env.SMOKE_PREVIEW_PORT ?? (live ? 4180 : 4179));
const reportPath = path.resolve(
  ROOT,
  String(args.report ?? process.env.SMOKE_JSON_REPORT ?? (live ? 'docs/e2e-smoke/relay-ledger-live-result.json' : 'docs/e2e-smoke/relay-ledger-smoke-result.json')),
);
const screenshotRoot = path.resolve(ROOT, String(args.shots ?? process.env.SMOKE_SCREENSHOT_DIR ?? 'docs/e2e-smoke/screenshots/relay-ledger'));
const executablePath =
  process.env.SMOKE_BROWSER_EXECUTABLE ??
  (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[a.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 公共：用例记录 / 页面工具
// ---------------------------------------------------------------------------
function makeRunner(tag, shotDir, pageErrorsRef) {
  const cases = [];
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  async function runCase(id, title, fn, shot) {
    const started = Date.now();
    try {
      const details = await fn();
      cases.push({ id, title, status: 'passed', ms: Date.now() - started, details: details ?? null });
      console.log(`  [${tag}] ${id} passed · ${title}`);
      return true;
    } catch (err) {
      cases.push({ id, title, status: 'failed', ms: Date.now() - started, error: String(err?.message ?? err) });
      console.log(`  [${tag}] ${id} FAILED · ${title} · ${String(err?.message ?? err).split('\n')[0]}`);
      if (shot) await shot(`${id}-failed`).catch(() => {});
      return false;
    }
  }
  return { cases, expect, runCase, pageErrors: pageErrorsRef };
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const num = (s) => Number(String(s).replace(/[^\d.-]/g, ''));
/** Node 侧轮询（mock 的 calls 记录在 Node 进程里，页面看不到） */
async function waitUntil(fn, what, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`等待超时：${what}`);
}

async function loginAndOpenLedger(page, base, expect, user = 'admin', pass = 'admin') {
  await page.goto(`${base}ledger`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({ timeout: 15_000 });
  const redirect = await page.evaluate(() => sessionStorage.getItem('admin_redirect_after_login'));
  await page.getByPlaceholder('ADMIN_USER 环境变量值').fill(user);
  await page.getByPlaceholder('ADMIN_PASS 环境变量值').fill(pass);
  await page.getByRole('dialog').getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/ledger', { timeout: 15_000 });
  await page.getByTestId('relay-ledger-view').waitFor({ timeout: 15_000 });
  expect(redirect === '/ledger', `登录前未记录重定向目标：${redirect}`);
  return redirect;
}

/** naive-ui NSelect：点开 → 点选项（多选时可连点，最后 Escape 收起）。菜单是 teleport 出来的，按可见的那一个定位 */
async function selectOption(page, testId, labels) {
  const list = Array.isArray(labels) ? labels : [labels];
  await page.getByTestId(testId).click();
  const menu = page.locator('.n-base-select-menu:visible').first();
  await menu.waitFor({ timeout: 5_000 });
  for (const label of list) {
    await menu.locator('.n-base-select-option', { hasText: label }).first().click();
    if (list.length > 1) await page.waitForTimeout(150);
  }
  await page.keyboard.press('Escape');
  await page.locator('.n-base-select-menu:visible').first().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
}

const rowsOf = (page) => page.locator('tr[data-testid="ledger-row"]');
const drawer = (page) => page.getByTestId('ledger-drawer');
const changeRows = (page) => drawer(page).locator('[data-testid="change-refno"]');
const rowCountIs = (page, n, timeout = 10_000) =>
  page.waitForFunction((k) => document.querySelectorAll('tr[data-testid="ledger-row"]').length === k, n, { timeout });
const changeCountIs = (page, n, timeout = 10_000) =>
  page.waitForFunction((k) => document.querySelectorAll('[data-testid="change-refno"]').length === k, n, { timeout });
/** 回到干净的 /ledger（已登录：token 在 sessionStorage），清掉筛选与抽屉 */
async function resetLedger(page, base, expectRows) {
  await page.goto(`${base}ledger`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('relay-ledger-view').waitFor({ timeout: 15_000 });
  if (expectRows) await rowCountIs(page, expectRows, 15_000);
}
/** 关抽屉：点右上角关闭按钮（trap-focus 关掉后 Escape 不一定送到抽屉） */
async function closeDrawer(page) {
  if (!(await drawer(page).isVisible().catch(() => false))) return;
  const close = drawer(page).locator('.n-base-close').first();
  if (await close.isVisible().catch(() => false)) await close.click();
  else await page.keyboard.press('Escape');
  await drawer(page).waitFor({ state: 'hidden', timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// L1 · mock
// ---------------------------------------------------------------------------
async function runMock(variant, base, browser) {
  const topology = createState(variant === 'pmg' ? 'pmg' : 'pws');
  const ledger = createLedgerState(variant, topology);
  const shotDir = path.join(screenshotRoot, variant);
  await mkdir(shotDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const calls = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    calls.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams.entries()) });
    const led = respondLedger(ledger, method, url);
    if (led) {
      if (led.text !== undefined) return route.fulfill({ status: led.status, contentType: 'text/plain', body: led.text });
      return route.fulfill({ status: led.status, contentType: 'application/json', body: JSON.stringify(led.json) });
    }
    const res = respond(topology, method, url, body);
    if (res.abort) return route.abort();
    return route.fulfill({ status: res.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(res.json) });
  });
  const shot = (name) => page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
  const { cases, expect, runCase } = makeRunner(variant, shotDir, pageErrors);
  const ledgerCalls = () => calls.filter((c) => c.path === '/api/remote-sync/ledger');
  const lastLedgerCall = () => ledgerCalls().at(-1);
  const writes = () => calls.filter((c) => c.method !== 'GET' && c.path !== '/api/admin/auth/login');
  const fx = ledger.fixture;

  if (variant === 'pws') {
    await runCase('RL-01', '登录 → /ledger → 首页 50 行、汇总 chips 与 fixture 一致、请求带 limit=50&offset=0', async () => {
      await loginAndOpenLedger(page, base, expect);
      await rowsOf(page).first().waitFor({ timeout: 15_000 });
      await page.waitForFunction(() => document.querySelectorAll('tr[data-testid="ledger-row"]').length >= 50, null, { timeout: 10_000 });
      const count = await rowsOf(page).count();
      const first = lastLedgerCall();
      const outboundOk = fx.rows.filter((r) => r.direction === 'outbound' && r.verify_status === 'ok').length;
      const inboundOk = fx.rows.filter((r) => r.direction === 'inbound' && r.verify_status === 'ok').length;
      const problems = fx.rows.filter((r) => !['ok', 'skipped'].includes(r.verify_status)).length;
      await page.getByTestId('chip-outbound-ok').waitFor();
      const chipOut = num(await text(page.getByTestId('chip-outbound-ok')));
      const chipIn = num(await text(page.getByTestId('chip-inbound-ok')));
      const chipProblems = num(await text(page.getByTestId('chip-problems')));
      const chipWm = num(await text(page.getByTestId('chip-watermarks')));
      const prefix = await text(page.locator('[data-testid="ledger-table"] .n-pagination-prefix'));
      expect(count === 50, `首页行数 ${count}，期望 50`);
      expect(first?.query.limit === '50' && first?.query.offset === '0', `首个列表请求参数不对：${JSON.stringify(first?.query)}`);
      expect(chipOut === outboundOk, `广播 ok chip ${chipOut} ≠ ${outboundOk}`);
      expect(chipIn === inboundOk, `接收 ok chip ${chipIn} ≠ ${inboundOk}`);
      expect(chipProblems === problems, `问题行 chip ${chipProblems} ≠ ${problems}`);
      expect(chipWm === fx.watermarks.length, `水位 chip ${chipWm} ≠ ${fx.watermarks.length}`);
      expect(prefix.includes(`共 ${fx.rows.length} 行`), `分页前缀未显示总数：${prefix}`);
      // 首行是 created_at 最新的 L-01
      const firstRowId = await rowsOf(page).first().getAttribute('data-row-id');
      expect(firstRowId === 'L-01', `首行应是 L-01，实际 ${firstRowId}`);
      await shot('01-list');
      return { count, chips: { chipOut, chipIn, chipProblems, chipWm }, prefix, firstQuery: first?.query };
    }, shot);

    await runCase('RL-02', '筛选栏 → 请求 query 正确（direction / verify_status 多选逗号 / file_name 前缀 / since）并回第 1 页', async () => {
      const changesPath = '/api/remote-sync/ledger';
      // 先翻到第 2 页，验证筛选会回第 1 页
      await page.locator('[data-testid="ledger-table"] .n-pagination .n-pagination-item', { hasText: /^2$/ }).click();
      await rowCountIs(page, 10);
      expect(lastLedgerCall()?.query.offset === '50', `第 2 页 offset 应为 50：${JSON.stringify(lastLedgerCall()?.query)}`);

      await selectOption(page, 'filter-direction', '广播（outbound）');
      await waitUntil(() => lastLedgerCall()?.query.direction === 'outbound', 'direction=outbound 的列表请求');
      await rowCountIs(page, 50);
      let q = lastLedgerCall()?.query;
      expect(q?.offset === '0', `direction 筛选后应回第 1 页：${JSON.stringify(q)}`);
      const outboundTotal = fx.rows.filter((r) => r.direction === 'outbound').length;
      expect((await text(page.locator('[data-testid="ledger-table"] .n-pagination-prefix'))).includes(`共 ${outboundTotal} 行`), 'direction 筛选后总数不对');

      await selectOption(page, 'filter-verify-status', ['hash_mismatch', 'skipped']);
      await waitUntil(() => (lastLedgerCall()?.query.verify_status ?? '').split(',').length === 2, 'verify_status 两个值的列表请求');
      await rowCountIs(page, 1);
      q = lastLedgerCall()?.query;
      const statuses = (q?.verify_status ?? '').split(',').sort().join(',');
      expect(statuses === 'hash_mismatch,skipped', `verify_status 应为逗号多选：${JSON.stringify(q)}`);
      expect(q?.direction === 'outbound', 'verify_status 筛选应叠加在 direction 上');
      await shot('02-filters-direction-status');

      // 重开页面清掉筛选，再按文件名前缀 / 时间范围
      await resetLedger(page, base, 50);
      const before = ledgerCalls().length;
      await page.getByTestId('filter-file-name').locator('input').fill('scb');
      await waitUntil(() => ledgerCalls().length > before && lastLedgerCall()?.query.file_name === 'scb', 'file_name=scb 的列表请求');
      q = lastLedgerCall()?.query;
      expect(q?.offset === '0' && !q?.direction && !q?.verify_status, `file_name 前缀 query 不对：${JSON.stringify(q)}`);
      const scbTotal = fx.rows.filter((r) => r.file_name.startsWith('scb')).length;
      await rowCountIs(page, Math.min(scbTotal, 50));
      expect((await text(page.locator('[data-testid="ledger-table"] .n-pagination-prefix'))).includes(`共 ${scbTotal} 行`), `file_name 筛选后总数不对（期望 ${scbTotal}）`);

      await selectOption(page, 'filter-range', '近 24 小时');
      await waitUntil(() => typeof lastLedgerCall()?.query.since === 'string', '带 since 的列表请求');
      q = lastLedgerCall()?.query;
      expect(!Number.isNaN(Date.parse(q.since)), `since 应是 RFC3339：${JSON.stringify(q)}`);
      expect(q?.file_name === 'scb', '时间范围应叠加在 file_name 上');
      await waitUntil(() => typeof calls.filter((c) => c.path === `${changesPath}/summary`).at(-1)?.query.since === 'string', 'summary 也带 since');
      await shot('02-filters-file-range');
      await resetLedger(page, base, 50);
      return { verifyStatusQuery: statuses, since: q?.since };
    }, shot);

    await runCase('RL-03', '点行开抽屉：全字段、msg_id 复制按钮、变更清单 200/页 + 翻页 offset=200 + 种类 / 前缀筛选', async () => {
      const changesPath = '/api/remote-sync/ledger/rows/L-01/changes';
      const lastChanges = () => calls.filter((c) => c.path === changesPath).at(-1)?.query;
      await page.locator('tr[data-row-id="L-01"]').click(); // L-01：450 条
      await drawer(page).waitFor({ timeout: 10_000 });
      await page.getByTestId('detail-msg-id').waitFor();
      const msgId = await text(page.getByTestId('detail-msg-id'));
      expect(msgId === fx.rows[0].msg_id, `抽屉 msg_id ${msgId} ≠ ${fx.rows[0].msg_id}`);
      expect(await page.getByTestId('detail-copy-msg-id').isVisible(), '缺「复制」按钮');
      await changeCountIs(page, 200);
      const totalText = await text(page.getByTestId('changes-total'));
      expect(totalText.includes('共 450 条'), `清单总数文案不对：${totalText}`);
      await page.waitForFunction(() => !(document.querySelector('[data-testid="changes-kinds"]')?.textContent ?? '').includes('…'), null, { timeout: 5_000 });
      const kinds = await text(page.getByTestId('changes-kinds'));
      expect(kinds.includes('新增 300') && kinds.includes('删除 75') && kinds.includes('修改 75') && kinds.includes('移位 0'), `kinds 计数不对：${kinds}`);
      const firstRef = await text(changeRows(page).first());
      expect(firstRef === fx.changes.get('L-01')[0].refno, `清单首条应按主键顺序：${firstRef}`);
      let q = lastChanges();
      expect(q?.limit === '200' && q?.offset === '0', `清单首个请求参数不对：${JSON.stringify(q)}`);

      await drawer(page).locator('.n-pagination .n-pagination-item', { hasText: /^2$/ }).click();
      await waitUntil(() => lastChanges()?.offset === '200', 'offset=200 的清单请求');
      await page.waitForFunction((first) => {
        const nodes = document.querySelectorAll('[data-testid="change-refno"]');
        return nodes.length === 200 && nodes[0].textContent !== first;
      }, firstRef, { timeout: 10_000 });

      await drawer(page).locator('.n-pagination .n-pagination-item', { hasText: /^3$/ }).click();
      await changeCountIs(page, 50);

      await selectOption(page, 'changes-filter-kind', '删除');
      await waitUntil(() => lastChanges()?.kind === 'deleted', 'kind=deleted 的清单请求');
      await changeCountIs(page, 75);
      q = lastChanges();
      expect(q?.offset === '0', `种类筛选后应回第 1 页：${JSON.stringify(q)}`);

      await drawer(page).getByTestId('changes-filter-refno').locator('input').fill('6001/');
      await waitUntil(() => lastChanges()?.refno === '6001/', 'refno=6001/ 的清单请求');
      await changeCountIs(page, 25);
      q = lastChanges();
      expect(q?.kind === 'deleted', `前缀筛选应叠加在种类上：${JSON.stringify(q)}`);
      await shot('03-drawer');
      await closeDrawer(page);
      return { msgId, totalText, kinds };
    }, shot);

    await runCase('RL-04', '清单被截断的行：列表按钮与抽屉都显示「20000 / 25000（截断）」', async () => {
      await closeDrawer(page);
      const row = page.locator('tr[data-row-id="L-05"]');
      const btn = row.getByTestId('ledger-changes-button');
      const btnText = await text(btn);
      expect(btnText === `${MAX_CHANGES_PER_ROW} / 25000（截断）`, `列表按钮文案：${btnText}`);
      await btn.click();
      await drawer(page).waitFor({ timeout: 10_000 });
      await page.waitForFunction(() => (document.querySelector('[data-testid="changes-total"]')?.textContent ?? '').includes('截断'), null, { timeout: 10_000 });
      const totalText = await text(page.getByTestId('changes-total'));
      expect(totalText.includes(`已落库 ${MAX_CHANGES_PER_ROW} / 25000（截断）`), `抽屉总数文案：${totalText}`);
      const detail = await text(page.getByTestId('detail-verify-detail'));
      expect(detail.includes('changes_truncated:25000'), `verify_detail 原文未展示：${detail}`);
      await shot('04-truncated');
      await closeDrawer(page);
      return { btnText, totalText };
    }, shot);

    await runCase('RL-05', 'inbound 行：抽屉说明「接收方不记清单」、不发 changes 请求；「按 msg_id 过滤」→ 列表 query 带 msg_id', async () => {
      await closeDrawer(page);
      const before = calls.filter((c) => c.path.endsWith('/changes')).length;
      await page.locator('tr[data-row-id="L-03"]').click();
      await drawer(page).waitFor({ timeout: 10_000 });
      await page.getByTestId('ledger-changes-inbound').waitFor({ timeout: 5_000 });
      expect(calls.filter((c) => c.path.endsWith('/changes')).length === before, 'inbound 行不该请求 changes');
      const verify = await text(drawer(page).locator('.n-drawer-header .n-tag').nth(1));
      expect(verify === 'skipped', `抽屉头校验 tag：${verify}`);
      await page.getByTestId('detail-filter-msg-id').click();
      await drawer(page).waitFor({ state: 'hidden', timeout: 5_000 });
      await waitUntil(() => lastLedgerCall()?.query.msg_id === fx.rows[2].msg_id, '带 msg_id 的列表请求');
      await rowCountIs(page, 1);
      const q = lastLedgerCall()?.query;
      await shot('05-inbound-filter');
      await resetLedger(page, base, 50);
      return { msgId: q?.msg_id };
    }, shot);

    await runCase('RL-06', '水位面板：展开才请求 watermarks，行数 == fixture；全程 0 写请求、0 pageerror', async () => {
      await closeDrawer(page);
      expect(calls.filter((c) => c.path === '/api/remote-sync/ledger/watermarks').length === 0, '未展开前不该请求 watermarks');
      await page.getByTestId('ledger-watermarks-toggle').click();
      await page.getByTestId('ledger-watermarks-table').waitFor({ timeout: 5_000 });
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid="ledger-watermarks-table"] tbody tr.n-data-table-tr').length === n, fx.watermarks.length, { timeout: 10_000 });
      const wmRows = await page.locator('[data-testid="ledger-watermarks-table"] tbody tr.n-data-table-tr').count();
      expect(wmRows === fx.watermarks.length, `水位行数 ${wmRows} ≠ ${fx.watermarks.length}`);
      expect(writes().length === 0, `出现写请求：${writes().map((c) => `${c.method} ${c.path}`).join(', ')}`);
      expect(pageErrors.length === 0, `pageerror：${pageErrors.join(' | ')}`);
      await shot('06-watermarks');
      return { wmRows, calls: calls.length };
    }, shot);
  } else {
    // pws-empty / pmg：只验空态
    const id = variant === 'pmg' ? 'RL-07' : 'RL-08';
    const title = variant === 'pmg' ? 'pmg 后端（404）→ 「该后端不提供台账 API」空态，无 pageerror' : 'pws 库没建表（note）→ 「台账表尚未建立」空态，无 pageerror';
    await runCase(id, title, async () => {
      await loginAndOpenLedger(page, base, expect);
      if (variant === 'pmg') {
        await page.getByTestId('ledger-unavailable').waitFor({ timeout: 10_000 });
        const t = await text(page.getByTestId('ledger-unavailable'));
        expect(t.includes('该后端不提供台账 API'), `空态文案：${t}`);
        expect((await page.getByTestId('ledger-error').count()) === 0, '404 不该同时出现请求失败 banner');
      } else {
        await page.getByTestId('ledger-empty').waitFor({ timeout: 10_000 });
        const t = await text(page.getByTestId('ledger-empty'));
        expect(t.includes('台账表尚未建立'), `空态文案：${t}`);
        expect(num(await text(page.getByTestId('chip-outbound-ok'))) === 0, 'chips 应全 0');
      }
      expect(pageErrors.length === 0, `pageerror：${pageErrors.join(' | ')}`);
      expect(writes().length === 0, '出现写请求');
      await shot(`${variant}-empty-state`);
      return { variant };
    }, shot);
  }

  await page.close();
  const summary = { passed: cases.filter((c) => c.status === 'passed').length, failed: cases.filter((c) => c.status === 'failed').length };
  return { variant, passed: summary.failed === 0 && pageErrors.length === 0, summary, cases, writeCalls: writes().map((c) => `${c.method} ${c.path}`), consoleErrors, pageErrors, screenshots: path.relative(ROOT, shotDir) };
}

// ---------------------------------------------------------------------------
// L2 · live（只读）
// ---------------------------------------------------------------------------
async function apiGet(p, token) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${API}${p}`, { headers });
  const t = await r.text();
  try {
    return { status: r.status, body: JSON.parse(t) };
  } catch {
    return { status: r.status, body: null, text: t.slice(0, 200) };
  }
}

async function runLive(base, browser) {
  const shotDir = path.join(screenshotRoot, 'live');
  await mkdir(shotDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const blocked = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET' && !/\/auth\/(login|me)$/.test(url.pathname)) {
      blocked.push(`${req.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  const shot = (name) => page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
  const { cases, expect, runCase } = makeRunner('live', shotDir, pageErrors);
  const snapshot = {};

  await runCase('RL-L0', '后端可达 · 直连 GET ledger / summary / watermarks 拿到基准', async () => {
    const health = await apiGet('/api/health');
    expect(health.status < 500, `/api/health ${health.status}`);
    const login = await fetch(`${API}/api/admin/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASS }) }).then((r) => r.json());
    const token = login?.data?.token ?? login?.token ?? null;
    const list = await apiGet('/api/remote-sync/ledger?limit=50&offset=0', token);
    expect(list.status === 200 && list.body?.success === true, `GET ledger 不可用：HTTP ${list.status} ${JSON.stringify(list.body ?? list.text)}（后端要 pws ≥ b61b7ca）`);
    const summary = await apiGet('/api/remote-sync/ledger/summary', token);
    const wm = await apiGet('/api/remote-sync/ledger/watermarks', token);
    expect(summary.body?.success === true && wm.body?.success === true, 'summary / watermarks 不可用');
    Object.assign(snapshot, { token, list: list.body, summary: summary.body, wm: wm.body });
    return { total: list.body.total, items: list.body.items.length, note: list.body.note ?? null, watermarks: wm.body.total, problems: summary.body.problems_total };
  }, shot);

  await runCase('RL-L1', 'UI 登录 → /ledger → 行数 == GET ledger?limit=50 的 items.length；chips == summary', async () => {
    await loginAndOpenLedger(page, base, expect, USER, PASS);
    const expectRows = snapshot.list?.items?.length ?? 0;
    if (expectRows === 0) {
      await page.getByTestId('ledger-empty').waitFor({ timeout: 15_000 });
      return { rows: 0, empty: true };
    }
    await page.waitForFunction((n) => document.querySelectorAll('tr[data-testid="ledger-row"]').length === n, expectRows, { timeout: 15_000 });
    const rows = await rowsOf(page).count();
    const by = snapshot.summary.by_direction_status ?? [];
    const cnt = (d, s) => by.filter((e) => e.direction === d && e.verify_status === s).reduce((a, e) => a + e.count, 0);
    const chipOut = num(await text(page.getByTestId('chip-outbound-ok')));
    const chipIn = num(await text(page.getByTestId('chip-inbound-ok')));
    const chipProblems = num(await text(page.getByTestId('chip-problems')));
    expect(rows === expectRows, `行数 ${rows} ≠ ${expectRows}`);
    expect(chipOut === cnt('outbound', 'ok'), `广播 ok chip ${chipOut} ≠ ${cnt('outbound', 'ok')}`);
    expect(chipIn === cnt('inbound', 'ok'), `接收 ok chip ${chipIn} ≠ ${cnt('inbound', 'ok')}`);
    expect(chipProblems === snapshot.summary.problems_total, `问题行 chip ${chipProblems} ≠ ${snapshot.summary.problems_total}`);
    const prefix = await text(page.locator('[data-testid="ledger-table"] .n-pagination-prefix'));
    expect(prefix.includes(`共 ${snapshot.list.total} 行`), `分页前缀 ${prefix} 应含总数 ${snapshot.list.total}`);
    await shot('L1-list');
    return { rows, total: snapshot.list.total, chipOut, chipIn, chipProblems };
  }, shot);

  await runCase('RL-L2', '第一条有清单的 outbound 行：抽屉清单 total == GET rows/{id}/changes 的 total，kinds 之和 == changes_count', async () => {
    const target = (snapshot.list?.items ?? []).find((r) => r.direction === 'outbound' && r.changes_count > 0);
    if (!target) return { skipped: '当前台账没有带清单的 outbound 行' };
    const api = await apiGet(`/api/remote-sync/ledger/rows/${encodeURIComponent(target.id)}/changes?limit=1`, snapshot.token);
    const detail = await apiGet(`/api/remote-sync/ledger/rows/${encodeURIComponent(target.id)}`, snapshot.token);
    await page.locator(`tr[data-row-id="${target.id}"]`).click();
    await drawer(page).waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => (document.querySelector('[data-testid="changes-total"]')?.textContent ?? '').match(/\d/), null, { timeout: 15_000 });
    const totalText = await text(page.getByTestId('changes-total'));
    expect(totalText.includes(String(api.body.total)), `抽屉总数「${totalText}」≠ API total ${api.body.total}`);
    const expectRows = Math.min(api.body.total, 200);
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="change-refno"]').length === n, expectRows, { timeout: 15_000 });
    const kinds = detail.body.item.kinds;
    const kindSum = kinds.inserted + kinds.deleted + kinds.modified + kinds.relocated;
    expect(kindSum === detail.body.item.changes_count, `kinds 之和 ${kindSum} ≠ changes_count ${detail.body.item.changes_count}`);
    const kindsText = await text(page.getByTestId('changes-kinds'));
    expect(kindsText.includes(`新增 ${kinds.inserted}`) && kindsText.includes(`修改 ${kinds.modified}`), `kinds chips「${kindsText}」与 API 不一致`);
    await shot('L2-drawer');
    await closeDrawer(page);
    return { id: target.id, total: api.body.total, kinds };
  }, shot);

  await runCase('RL-L3', '水位面板行数 == GET watermarks 的 total；安全闸 0 拦截、0 pageerror', async () => {
    await closeDrawer(page);
    await page.getByTestId('ledger-watermarks-toggle').click();
    await page.getByTestId('ledger-watermarks-table').waitFor({ timeout: 5_000 });
    const expectRows = snapshot.wm?.total ?? 0;
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="ledger-watermarks-table"] tbody tr.n-data-table-tr').length === n, expectRows, { timeout: 15_000 });
    const rows = await page.locator('[data-testid="ledger-watermarks-table"] tbody tr.n-data-table-tr').count();
    expect(rows === expectRows, `水位行数 ${rows} ≠ ${expectRows}`);
    expect(blocked.length === 0, `安全闸拦下了写请求：${blocked.join(', ')}`);
    expect(pageErrors.length === 0, `pageerror：${pageErrors.join(' | ')}`);
    await shot('L3-watermarks');
    return { rows, blocked: blocked.length };
  }, shot);

  await page.close();
  const summary = { passed: cases.filter((c) => c.status === 'passed').length, failed: cases.filter((c) => c.status === 'failed').length };
  return { api: API, passed: summary.failed === 0 && pageErrors.length === 0 && blocked.length === 0, summary, cases, mutatingBlocked: blocked, consoleErrors, pageErrors, screenshots: path.relative(ROOT, shotDir) };
}

// ---------------------------------------------------------------------------
async function main() {
  if (args.build || !existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.log('dist/ 缺失或要求重建，先执行 vite build …');
    await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'production', logLevel: 'warn' });
  }
  const server = await preview({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    preview: {
      port: previewPort,
      strictPort: true,
      open: false,
      proxy: live ? { '/api': { target: API, changeOrigin: true } } : undefined,
    },
  });
  const base = server.resolvedUrls.local[0];
  console.log(`preview: ${base}  mode: ${live ? `live → ${API}` : 'mock (pws · pws-empty · pmg)'}`);
  const browser = await chromium.launch({ channel: executablePath ? undefined : 'chrome', executablePath, headless: !args.headed });
  const report = { generatedAt: new Date().toISOString(), mode: live ? 'live' : 'mock', baseUrl: base, browser: executablePath ?? 'chrome channel', passed: true };
  try {
    if (live) {
      report.live = await runLive(base, browser);
      report.passed = report.live.passed;
    } else {
      report.variants = {};
      for (const variant of ['pws', 'pws-empty', 'pmg']) {
        console.log(`\n=== variant: ${variant} ===`);
        const result = await runMock(variant, base, browser);
        report.variants[variant] = result;
        if (!result.passed) report.passed = false;
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('');
  const blocks = live ? { live: report.live } : report.variants;
  for (const [name, r] of Object.entries(blocks)) {
    console.log(`${name}: ${r.passed ? 'PASS' : 'FAIL'} · ${r.summary.passed} passed / ${r.summary.failed} failed · pageErrors ${r.pageErrors.length}`);
    for (const c of r.cases.filter((x) => x.status !== 'passed')) console.log(`  - ${c.id} ${c.title}: ${c.error}`);
  }
  console.log(`report: ${path.relative(ROOT, reportPath)}`);
  process.exitCode = report.passed ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
