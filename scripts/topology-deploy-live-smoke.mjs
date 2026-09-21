// /topology 部署动作面 · 真后端自动化用例（L2 只读安全层 LR-xx · L3 完整闭环 LF-xx）
//
// 用例编号与 docs/e2e-smoke/remote-deploy-auto-test-cases.md §3 / §4 一一对应。
// 起 vite preview 把 /api 反代到目标后端，用真实 Chrome 走 UI；两种后端（plant-model-gen / plant-web-server）都能跑，
// 形状由 runtime/status 自动识别（有 boolean `active` = pmg，否则 pws）。
//
// 用法：
//   node scripts/topology-deploy-live-smoke.mjs                                   # readonly（默认）
//   node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100       # 指向别的后端（P3 的 Site A）
//   node scripts/topology-deploy-live-smoke.mjs --mode full --confirm-writes      # 完整闭环：会改后端运行时状态，结束后自动恢复
//
// readonly：登录 / 列表 / 运行时 pill / 测 MQTT / 测文件服务 / 站点 test-http；脚本层安全闸拦下一切非探测写请求。
// full   ：UI 新建测试 env → 探测 → 激活 → 应用 → 站点 test-http + 编辑 → 停止运行时；收尾走 API 删测试 env / 站点、
//          恢复原激活 env（pmg 且原本未激活时：用开跑前 import-from-dboption 的快照 env 把 DbOption.toml 写回，再 stop）。
//          ⚠ 对 plant-model-gen 这会真实改写 DbOption.toml 并重启 watcher + MQTT，只在隔离配置上跑。
//
// 参数 / 环境变量：
//   --api      SMOKE_API_TARGET        后端地址（默认 http://127.0.0.1:3100）
//   --user     SMOKE_ADMIN_USER        默认 admin       --pass  SMOKE_ADMIN_PASS  默认 admin
//   --port     SMOKE_PREVIEW_PORT      vite preview 端口（默认 4178）
//   --report   SMOKE_JSON_REPORT       默认 docs/e2e-smoke/topology-deploy-live-<mode>-result.json
//   --shots    SMOKE_SCREENSHOT_DIR    默认 docs/e2e-smoke/screenshots/topology-deploy-live/<mode>（已 .gitignore）
//   --headed   有头模式                 --build  强制先 vite build（缺 dist/ 时自动 build）
//   SMOKE_BROWSER_EXECUTABLE           Chrome 路径
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const mode = String(args.mode ?? 'readonly');
if (mode !== 'readonly' && mode !== 'full') {
  console.error(`未知 --mode=${mode}，可选 readonly | full`);
  process.exit(2);
}
if (mode === 'full' && !args['confirm-writes']) {
  console.error('--mode full 会对真实后端做写操作（建 env / 激活 / 应用 / 编辑 / 停止运行时），必须显式加 --confirm-writes。');
  process.exit(2);
}
const API = String(args.api ?? process.env.SMOKE_API_TARGET ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const USER = String(args.user ?? process.env.SMOKE_ADMIN_USER ?? 'admin');
const PASS = String(args.pass ?? process.env.SMOKE_ADMIN_PASS ?? 'admin');
const previewPort = Number(args.port ?? process.env.SMOKE_PREVIEW_PORT ?? 4178);
const reportPath = path.resolve(
  ROOT,
  String(args.report ?? process.env.SMOKE_JSON_REPORT ?? `docs/e2e-smoke/topology-deploy-live-${mode}-result.json`),
);
const shotDir = path.resolve(
  ROOT,
  String(args.shots ?? process.env.SMOKE_SCREENSHOT_DIR ?? `docs/e2e-smoke/screenshots/topology-deploy-live/${mode}`),
);
const executablePath =
  process.env.SMOKE_BROWSER_EXECUTABLE ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const ENV_NAME = `monitor-e2e-${stamp}`;
const PROBE_PATH = /\/(test-mqtt|test-http|auth\/login|auth\/me)$/;

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
// 直连 API（快照 / 收尾 / 断言后端状态）
// ---------------------------------------------------------------------------
let TOKEN = null;
async function api(method, p, body) {
  const headers = { accept: 'application/json' };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  // plant-web-server 对带 content-type 但空 body 的 GET 回 400，所以只有真有 body 才带
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${API}${p}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  try {
    return { status: r.status, body: JSON.parse(text) };
  } catch {
    return { status: r.status, body: null, text: text.slice(0, 200) };
  }
}
const isPmgRuntime = (rt) => Boolean(rt) && typeof rt.active === 'boolean';
/** 当前激活 env id（兼容两种后端） */
function activeEnvIdOf(rt, envs) {
  if (isPmgRuntime(rt)) return rt.active && rt.env_id ? String(rt.env_id) : null;
  const flagged = envs?.active?.id ?? (envs?.items ?? []).find((e) => e.active === true)?.id ?? null;
  return flagged ? String(flagged) : null;
}

// ---------------------------------------------------------------------------
async function main() {
  await mkdir(shotDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });

  const report = {
    mode,
    api: API,
    envName: mode === 'full' ? ENV_NAME : null,
    generatedAt: new Date().toISOString(),
    backend: null,
    cases: [],
    apiCalls: [],
    mutatingBlocked: [],
    writes: [],
    consoleErrors: [],
    pageErrors: [],
    cleanup: null,
    passed: false,
  };
  const cases = report.cases;
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  let page = null;
  const shot = (name) => (page ? page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true }) : Promise.resolve());
  async function runCase(id, title, fn) {
    const started = Date.now();
    try {
      const details = await fn();
      cases.push({ id, title, status: 'passed', ms: Date.now() - started, details: details ?? null });
      console.log(`  ${id} passed · ${title}`);
      return true;
    } catch (err) {
      cases.push({ id, title, status: 'failed', ms: Date.now() - started, error: String(err?.message ?? err) });
      console.log(`  ${id} FAILED · ${title} · ${String(err?.message ?? err).split('\n')[0]}`);
      await shot(`${id}-failed`).catch(() => {});
      return false;
    }
  }
  const skipCase = (id, title, reason) => {
    cases.push({ id, title, status: 'skipped', reason });
    console.log(`  ${id} skipped · ${title} · ${reason}`);
  };

  // ---- L0：后端可达 + 形状识别（不进浏览器）----
  const prefix = mode === 'full' ? 'LF' : 'LR';
  const health = await api('GET', '/api/health').catch((e) => ({ status: 0, error: String(e?.message ?? e) }));
  const reachable = await runCase(`${prefix}-00`, '后端可达、admin 登录、识别响应形状', async () => {
    expect(health.status > 0, `后端不可达：${API}（${health.error ?? ''}）`);
    const login = await api('POST', '/api/admin/auth/login', { username: USER, password: PASS });
    TOKEN = login.body?.data?.token ?? login.body?.token ?? null;
    expect(Boolean(TOKEN), `登录失败：HTTP ${login.status} ${JSON.stringify(login.body)?.slice(0, 200)}`);
    const rt = (await api('GET', '/api/remote-sync/runtime/status')).body;
    const envs = (await api('GET', '/api/remote-sync/envs')).body;
    const shape = isPmgRuntime(rt) ? 'pmg' : 'pws';
    report.backend = {
      shape,
      health: health.body,
      mode: rt?.mode ?? null,
      loginHasExpiresAt: Boolean(login.body?.data?.expires_at ?? login.body?.expires_at),
      envCount: (envs?.items ?? []).length,
      activeEnvId: activeEnvIdOf(rt, envs),
      runtime: rt,
    };
    return report.backend;
  });
  if (!reachable) {
    await finish(report);
    return;
  }
  const shape = report.backend.shape;

  // ---- full 模式：开跑前快照 ----
  let before = null;
  let snapshotEnvId = null;
  if (mode === 'full') {
    before = {
      envs: (await api('GET', '/api/remote-sync/envs')).body,
      runtime: (await api('GET', '/api/remote-sync/runtime/status')).body,
      tasks: (await api('GET', '/api/remote-sync/tasks/active')).body,
    };
    before.activeEnvId = activeEnvIdOf(before.runtime, before.envs);
    before.envIds = (before.envs?.items ?? []).map((e) => String(e.id));
    if (shape === 'pmg' && !before.activeEnvId) {
      // 没有可回激活的 env 时，先把当前 DbOption.toml 快照成一个 env，收尾用它 apply 回去
      const snap = await api('POST', '/api/remote-sync/envs/import-from-dboption');
      snapshotEnvId = snap.body?.id ?? null;
    }
    report.before = { activeEnvId: before.activeEnvId, envIds: before.envIds, taskTotal: before.tasks?.total ?? null, snapshotEnvId };
  }

  // ---- 起 preview + Chrome ----
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
      proxy: { '/api': { target: API, changeOrigin: true } },
    },
  });
  const base = server.resolvedUrls.local[0];
  console.log(`preview: ${base} → ${API}  mode: ${mode}  shape: ${shape}`);

  const browser = await chromium.launch({
    channel: executablePath ? undefined : 'chrome',
    executablePath,
    headless: !args.headed,
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) report.apiCalls.push(`${r.method()} ${u.pathname}`);
  });
  page.on('response', async (r) => {
    const req = r.request();
    const u = new URL(req.url());
    if (u.pathname.startsWith('/api/') && req.method() !== 'GET' && !PROBE_PATH.test(u.pathname)) {
      let body = null;
      try {
        body = (await r.text()).slice(0, 400);
      } catch {
        body = null;
      }
      report.writes.push({ method: req.method(), path: u.pathname, status: r.status(), body });
    }
  });
  if (mode === 'readonly') {
    // 安全闸：任何非探测类写请求直接拦下，绝不打到真后端
    await page.route('**/api/**', (route) => {
      const r = route.request();
      const p = new URL(r.url()).pathname;
      if (r.method() !== 'GET' && !PROBE_PATH.test(p)) {
        report.mutatingBlocked.push(`${r.method()} ${p}`);
        return route.abort();
      }
      return route.continue();
    });
  }

  const pill = page.locator('[data-testid="remote-runtime-status"]');
  const card = (name) => page.locator('.card', { hasText: name });
  const bannerOf = (c, prefixText) => c.locator('.rounded-lg.border.px-3').filter({ hasText: prefixText });
  const confirm = (title) => page.locator('.n-dialog', { hasText: title });
  const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const results = {};

  try {
    // ---- 登录（两种模式共用）----
    await runCase(`${prefix}-01`, 'UI admin 登录 → 重定向回 /topology → 运行时 pill 拿到状态', async () => {
      await page.goto(`${base}topology`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({ timeout: 15_000 });
      await page.getByPlaceholder('ADMIN_USER 环境变量值').fill(USER);
      await page.getByPlaceholder('ADMIN_PASS 环境变量值').fill(PASS);
      const loginResp = page.waitForResponse((r) => r.url().includes('/api/admin/auth/login'), { timeout: 15_000 }).catch(() => null);
      await page.getByRole('dialog').getByRole('button', { name: '登录' }).click();
      const lr = await loginResp;
      await page.waitForURL('**/topology', { timeout: 15_000 });
      await page.getByText('异地拓扑管理').first().waitFor({ timeout: 15_000 });
      await pill.getByText(/已激活|运行中|未激活/).waitFor({ timeout: 15_000 });
      await page.waitForTimeout(1_000);
      results.pill = await text(pill);
      results.pillTitle = await pill.locator('span[title]').first().getAttribute('title');
      await shot('01-topology');
      return { loginStatus: lr?.status() ?? null, pill: results.pill, title: results.pillTitle };
    });

    if (mode === 'readonly') {
      await runReadonly();
    } else {
      await runFull();
    }
  } catch (err) {
    report.error = String(err?.message ?? err);
    await shot('99-error').catch(() => {});
  } finally {
    await browser.close();
    await server.close();
  }

  if (mode === 'full') await cleanupFull();
  await finish(report);

  // =========================================================================
  async function runReadonly() {
    await runCase('LR-02', 'env 卡片与「已激活」徽标一致：徽标 ≤1，挂徽标的卡「激活」置灰', async () => {
      const envCards = await page.locator('.card', { has: page.getByRole('button', { name: '激活' }) }).count();
      const badges = await page.locator('.card').getByText('已激活', { exact: true }).count();
      expect(envCards === report.backend.envCount, `卡片数 ${envCards} ≠ 后端 env 数 ${report.backend.envCount}`);
      expect(badges <= 1, `「已激活」徽标应 ≤1，实际 ${badges}`);
      if (report.backend.activeEnvId) {
        expect(badges === 1, `后端有激活 env（${report.backend.activeEnvId}）但页面无徽标`);
        expect(results.pill.includes('已激活'), `pill 应显示已激活：${results.pill}`);
        const activeCard = page.locator('.card', { hasText: '已激活' }).first();
        expect(await activeCard.getByRole('button', { name: '激活' }).isDisabled(), '已激活卡片的「激活」按钮应禁用');
      } else {
        expect(badges === 0, '后端无激活 env 但页面有徽标');
      }
      return { envCards, badges };
    });

    const targetCard = report.backend.activeEnvId
      ? page.locator('.card', { hasText: '已激活' }).first()
      : page.locator('.card', { has: page.getByRole('button', { name: '激活' }) }).first();
    const hasCard = (await targetCard.count()) > 0;

    if (!hasCard) {
      skipCase('LR-03', '环境「测 MQTT」', '后端没有 env');
      skipCase('LR-04', '环境「测文件服务」', '后端没有 env');
      skipCase('LR-05', '站点 test-http', '后端没有 env');
    } else {
      results.targetEnv = (await targetCard.locator('h5').innerText()).replace(/\s+/g, ' ').trim();
      await runCase('LR-03', '环境「测 MQTT」→ 后端返回诊断（可达 / 不可达皆可），非传输失败', async () => {
        await targetCard.getByRole('button', { name: '测 MQTT' }).click();
        const banner = bannerOf(targetCard, '测 MQTT：');
        await banner.waitFor({ timeout: 15_000 });
        const t = await text(banner);
        expect(!t.includes('请求失败'), `test-mqtt 传输层失败：${t}`);
        return { env: results.targetEnv, banner: t };
      });
      await runCase('LR-04', '环境「测文件服务」→ 后端返回诊断，非传输失败', async () => {
        await targetCard.getByRole('button', { name: '测文件服务' }).click();
        const banner = bannerOf(targetCard, '测文件服务：');
        await banner.waitFor({ timeout: 15_000 });
        const t = await text(banner);
        expect(!t.includes('请求失败'), `test-http 传输层失败：${t}`);
        await shot('02-env-probe');
        return { env: results.targetEnv, banner: t };
      });
      await runCase('LR-05', '选中 env → 站点表加载 → 有站点则后端 test-http 出结果', async () => {
        await targetCard.locator('h5').click();
        await page.waitForTimeout(2_500);
        const rows = page.locator('tbody tr').filter({ has: page.locator('[data-tip="编辑站点"]') });
        const rowCount = await rows.count();
        let siteTest = null;
        if (rowCount > 0) {
          await rows.first().locator('[data-tip="由后端探测该站点 HTTP 可达性"]').click();
          const result = rows.first().locator('[data-testid="site-test-http-result"]');
          await result.waitFor({ timeout: 15_000 });
          siteTest = { summary: await text(result), title: await result.getAttribute('title') };
          expect(siteTest.summary !== '请求失败', `站点 test-http 传输层失败：${siteTest.title}`);
        }
        await shot('03-sites');
        return { rowCount, siteTest };
      });
    }

    await runCase('LR-06', '安全闸：全程 0 次非探测写请求、0 pageerror', async () => {
      expect(report.mutatingBlocked.length === 0, `页面尝试发出写请求（已被拦下）：${report.mutatingBlocked.join(', ')}`);
      expect(report.writes.length === 0, `有写请求真的发出去了：${JSON.stringify(report.writes)}`);
      expect(report.pageErrors.length === 0, `pageerror：${report.pageErrors.join(' | ')}`);
      return { apiCalls: [...new Set(report.apiCalls)] };
    });
  }

  // =========================================================================
  async function runFull() {
    const cardOf = () => card(ENV_NAME);

    await runCase('LF-02', 'UI 新建测试 env → 卡片出现 → 后端能查到（含自动加入的本站站点）', async () => {
      await page.getByRole('button', { name: '新建' }).click();
      const envDialog = page.locator('dialog.modal-open').filter({ hasText: '添加新环境' });
      await envDialog.waitFor({ timeout: 8_000 });
      await envDialog.locator('input[placeholder="例如: 北京总部、上海分部"]').fill(ENV_NAME);
      await envDialog.locator('input[placeholder="http://192.168.1.10:3000"]').fill('http://127.0.0.1:4101');
      await envDialog.locator('input[placeholder="如: 上海园区"]').fill('local-e2e');
      await envDialog.locator('input[placeholder="7999,8001,8002"]').fill('7999');
      await envDialog.locator('input[placeholder="192.168.1.10"]').fill('127.0.0.1');
      await envDialog.locator('input[placeholder="1883"]').fill('1883');
      await shot('02-env-form');
      await envDialog.getByRole('button', { name: '保存环境' }).click();
      await cardOf().waitFor({ timeout: 15_000 });
      await page.waitForTimeout(1_500);
      const envs = (await api('GET', '/api/remote-sync/envs')).body;
      const created = (envs?.items ?? []).find((e) => e.name === ENV_NAME);
      expect(Boolean(created), '后端 GET envs 里没有新建的 env');
      results.testEnvId = String(created.id);
      const sites = (await api('GET', `/api/remote-sync/envs/${results.testEnvId}/sites`)).body;
      await shot('03-env-created');
      return { id: results.testEnvId, autoSites: (sites?.items ?? []).map((s) => ({ id: s.id, name: s.name, http_host: s.http_host })) };
    });
    if (!results.testEnvId) {
      for (const [id, title] of [['LF-03', '测 MQTT / 测文件服务'], ['LF-04', '激活'], ['LF-05', '应用'], ['LF-06', '站点 test-http + 编辑'], ['LF-07', '停止运行时']]) {
        skipCase(id, title, '测试 env 未创建');
      }
      return;
    }

    await runCase('LF-03', '测 MQTT / 测文件服务 → 都拿到后端诊断（结果按环境真实情况记录）', async () => {
      const c = cardOf();
      await c.getByRole('button', { name: '测 MQTT' }).click();
      await bannerOf(c, '测 MQTT：').waitFor({ timeout: 15_000 });
      const mqtt = await text(bannerOf(c, '测 MQTT：'));
      await c.getByRole('button', { name: '测文件服务' }).click();
      await bannerOf(c, '测文件服务：').waitFor({ timeout: 15_000 });
      const http = await text(bannerOf(c, '测文件服务：'));
      expect(!mqtt.includes('请求失败') && !http.includes('请求失败'), `探测传输层失败：${mqtt} / ${http}`);
      return { mqtt, http };
    });

    await runCase('LF-04', '激活 → 确认 → pill 切到测试 env，后端激活态 == 测试 env', async () => {
      const c = cardOf();
      await c.getByRole('button', { name: '激活' }).click();
      const dlg = confirm('确认激活环境');
      await dlg.waitFor({ timeout: 5_000 });
      const dialogText = await text(dlg);
      await dlg.getByRole('button', { name: '确定' }).click();
      await pill.getByText(`已激活 ${ENV_NAME}`).waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      const rt = (await api('GET', '/api/remote-sync/runtime/status')).body;
      const envs = (await api('GET', '/api/remote-sync/envs')).body;
      const backendActive = activeEnvIdOf(rt, envs);
      const banner = await text(bannerOf(c, '激活环境：'));
      expect(backendActive === results.testEnvId, `后端激活态 ${backendActive} ≠ 测试 env ${results.testEnvId}`);
      expect((await c.getByText('已激活', { exact: true }).count()) === 1, '测试 env 卡片未挂徽标');
      expect(await c.getByRole('button', { name: '激活' }).isDisabled(), '测试 env「激活」应禁用');
      results.activated = true;
      await shot('04-activated');
      return { dialogText, banner, backendActive, mqtt_connected: rt?.mqtt_connected ?? null };
    });

    await runCase('LF-05', '应用 → 确认 → 拿到后端结果 banner', async () => {
      const c = cardOf();
      await c.getByRole('button', { name: '应用' }).click();
      const dlg = confirm('确认应用环境配置');
      await dlg.waitFor({ timeout: 5_000 });
      await dlg.getByRole('button', { name: '确定' }).click();
      await bannerOf(c, '应用配置：').waitFor({ timeout: 15_000 });
      const banner = await text(bannerOf(c, '应用配置：'));
      expect(!banner.includes('请求失败'), `apply 传输层失败：${banner}`);
      return { banner };
    });

    await runCase('LF-06', '站点 test-http → 结果；编辑备注 → PUT → 后端 notes 更新', async () => {
      await cardOf().locator('h5').click();
      await page.waitForTimeout(2_000);
      const rows = page.locator('tbody tr').filter({ has: page.locator('[data-tip="编辑站点"]') });
      const rowCount = await rows.count();
      if (rowCount === 0) return { rowCount, note: '测试 env 下没有站点（后端未自动加入本站），跳过站点动作' };
      await rows.first().locator('[data-tip="由后端探测该站点 HTTP 可达性"]').click();
      const result = rows.first().locator('[data-testid="site-test-http-result"]');
      await result.waitFor({ timeout: 15_000 });
      const siteTest = { summary: await text(result), title: await result.getAttribute('title') };
      await rows.first().locator('[data-tip="编辑站点"]').click();
      await page.getByRole('heading', { name: '编辑站点' }).waitFor({ timeout: 5_000 });
      const notes = `edited by topology-deploy-live-smoke ${stamp}`;
      await page.locator('dialog.modal-open textarea').fill(notes);
      await shot('05-site-edit');
      await page.locator('dialog.modal-open').getByRole('button', { name: '保存修改' }).click();
      await page.getByRole('heading', { name: '编辑站点' }).waitFor({ state: 'hidden', timeout: 10_000 });
      await page.waitForTimeout(1_200);
      const sites = (await api('GET', `/api/remote-sync/envs/${results.testEnvId}/sites`)).body;
      const saved = (sites?.items ?? []).some((s) => s.notes === notes);
      expect(saved, `后端站点 notes 未更新：${JSON.stringify((sites?.items ?? []).map((s) => s.notes))}`);
      return { rowCount, siteTest, notes };
    });

    await runCase('LF-07', '停止运行时 → 确认 → 后端运行时状态按各自语义变化', async () => {
      await page.getByRole('button', { name: '停止运行时' }).click();
      const dlg = confirm('确认停止运行时');
      await dlg.waitFor({ timeout: 5_000 });
      await dlg.getByRole('button', { name: '确定' }).click();
      await page.waitForTimeout(2_500);
      const rt = (await api('GET', '/api/remote-sync/runtime/status')).body;
      const envs = (await api('GET', '/api/remote-sync/envs')).body;
      const pillText = await text(pill);
      if (shape === 'pmg') {
        expect(rt?.active === false, `pmg 停止后 runtime.active 应为 false：${JSON.stringify(rt)}`);
        expect(pillText.includes('未激活'), `pmg 停止后 pill 应为未激活：${pillText}`);
      } else {
        // plant-web-server：stop 只标任务 Stopped，running 恒 true、active 不清（AGENTS.md §4.3.2）
        expect(rt?.running === true, `pws runtime.running 应仍为 true：${JSON.stringify(rt)}`);
      }
      await shot('06-after-stop');
      return { pill: pillText, runtime: rt, backendActive: activeEnvIdOf(rt, envs) };
    });
  }

  // =========================================================================
  async function cleanupFull() {
    const cleanup = { steps: [] };
    const step = (name, data) => cleanup.steps.push({ name, ...data });
    try {
      if (results.testEnvId) {
        // 直接删 env，靠后端级联删它的站点（pmg 一直如此；pws 2026-09-21 起也级联），删完回查一次：
        // 还剩站点 = 后端没级联，记 noOrphanSites=false 让 LF-08 失败，但仍把它们删掉、别给环境留垃圾。
        const sitesBefore = (await api('GET', `/api/remote-sync/envs/${results.testEnvId}/sites`)).body;
        step('delete-env', { id: results.testEnvId, siteCountBefore: (sitesBefore?.items ?? []).length, ...(await api('DELETE', `/api/remote-sync/envs/${results.testEnvId}`)) });
        const leftover = (await api('GET', `/api/remote-sync/envs/${results.testEnvId}/sites`)).body;
        cleanup.noOrphanSites = (leftover?.items ?? []).length === 0;
        for (const s of leftover?.items ?? []) step('delete-orphan-site', { id: s.id, ...(await api('DELETE', `/api/remote-sync/sites/${s.id}`)) });
      } else {
        cleanup.noOrphanSites = true;
      }
      if (before?.activeEnvId) {
        step('reactivate-original', { id: before.activeEnvId, ...(await api('POST', `/api/remote-sync/envs/${before.activeEnvId}/activate`)) });
      } else if (shape === 'pmg') {
        if (snapshotEnvId) step('apply-dboption-snapshot', { id: snapshotEnvId, ...(await api('POST', `/api/remote-sync/envs/${snapshotEnvId}/apply`)) });
        step('stop-runtime', await api('POST', '/api/remote-sync/runtime/stop'));
      }
      if (snapshotEnvId) step('delete-snapshot-env', { id: snapshotEnvId, ...(await api('DELETE', `/api/remote-sync/envs/${snapshotEnvId}`)) });

      const after = {
        envs: (await api('GET', '/api/remote-sync/envs')).body,
        runtime: (await api('GET', '/api/remote-sync/runtime/status')).body,
        tasks: (await api('GET', '/api/remote-sync/tasks/active')).body,
      };
      const afterIds = (after.envs?.items ?? []).map((e) => String(e.id)).sort();
      cleanup.envIdsRestored = JSON.stringify(afterIds) === JSON.stringify([...(before?.envIds ?? [])].sort());
      cleanup.activeRestored = activeEnvIdOf(after.runtime, after.envs) === (before?.activeEnvId ?? null);
      cleanup.taskTotalBefore = before?.tasks?.total ?? null;
      cleanup.taskTotalAfter = after.tasks?.total ?? null;
      cleanup.leftoverEnvIds = afterIds.filter((id) => !(before?.envIds ?? []).includes(id));
    } catch (err) {
      cleanup.error = String(err?.message ?? err);
    }
    report.cleanup = cleanup;
    const lf08Ok = Boolean(cleanup.envIdsRestored && cleanup.activeRestored && cleanup.noOrphanSites && !cleanup.error);
    cases.push({
      id: 'LF-08',
      title: '收尾：删测试 env（后端级联删站点，回查无孤儿），恢复原激活态，env 集合与联调前一致',
      status: lf08Ok ? 'passed' : 'failed',
      details: { envIdsRestored: cleanup.envIdsRestored, activeRestored: cleanup.activeRestored, noOrphanSites: cleanup.noOrphanSites, leftoverEnvIds: cleanup.leftoverEnvIds, error: cleanup.error ?? null },
    });
    console.log(`  LF-08 ${lf08Ok ? 'passed' : 'FAILED'} · 收尾恢复 · envIdsRestored=${cleanup.envIdsRestored} activeRestored=${cleanup.activeRestored} noOrphanSites=${cleanup.noOrphanSites}`);
  }

  // =========================================================================
  async function finish(rep) {
    const failed = rep.cases.filter((c) => c.status === 'failed');
    rep.summary = {
      passed: rep.cases.filter((c) => c.status === 'passed').length,
      failed: failed.length,
      skipped: rep.cases.filter((c) => c.status === 'skipped').length,
    };
    rep.passed = failed.length === 0 && !rep.error && rep.pageErrors.length === 0;
    rep.apiCalls = [...new Set(rep.apiCalls)];
    rep.screenshots = path.relative(ROOT, shotDir);
    await writeFile(reportPath, `${JSON.stringify(rep, null, 2)}\n`, 'utf8');
    console.log('');
    console.log(`${mode} @ ${API} (${rep.backend?.shape ?? '?'}): ${rep.passed ? 'PASS' : 'FAIL'} · ${rep.summary.passed} passed / ${rep.summary.failed} failed / ${rep.summary.skipped} skipped · pageErrors ${rep.pageErrors.length}`);
    for (const c of failed) console.log(`  - ${c.id} ${c.title}: ${c.error ?? JSON.stringify(c.details)}`);
    if (rep.error) console.log(`  ! ${rep.error}`);
    console.log(`report: ${path.relative(ROOT, reportPath)}`);
    process.exitCode = rep.passed ? 0 : 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
