// /topology 部署动作面 · mock 后端自动化用例（L1 · 契约层，不依赖任何真实后端）
//
// 用例编号 DA-xx 与 docs/e2e-smoke/remote-deploy-auto-test-cases.md §2 一一对应。
// 同一套 UI 步骤对两种后端响应形状各跑一遍：
//   pmg = plant-model-gen/web_server（`status: 'success' | 'failed'`、`runtime/status` 给 `active/env_id`）
//   pws = plant-web-server standalone-real（`success: boolean` + `reachable`、激活态在 `envs[].active`）
//
// 用法：
//   node scripts/topology-deploy-smoke.mjs                 # 两种形状都跑（缺 dist/ 时自动 vite build）
//   node scripts/topology-deploy-smoke.mjs --shape pws     # 只跑一种：pmg | pws
//   node scripts/topology-deploy-smoke.mjs --build         # 强制先重新 vite build
//   node scripts/topology-deploy-smoke.mjs --headed        # 有头模式调试
// 环境变量：
//   SMOKE_BROWSER_EXECUTABLE  Chrome 路径（默认 Windows 的 Program Files 安装位置；其它平台走 chrome channel）
//   SMOKE_PREVIEW_PORT        vite preview 端口（默认 4177）
//   SMOKE_JSON_REPORT         结果 JSON（默认 docs/e2e-smoke/topology-deploy-smoke-result.json）
//   SMOKE_SCREENSHOT_DIR      截图目录（默认 docs/e2e-smoke/screenshots/topology-deploy，已 .gitignore）
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const shapes = !args.shape || args.shape === 'both' ? ['pmg', 'pws'] : [String(args.shape)];
for (const s of shapes) {
  if (s !== 'pmg' && s !== 'pws') {
    console.error(`未知 --shape=${s}，可选 pmg | pws | both`);
    process.exit(2);
  }
}
const previewPort = Number(process.env.SMOKE_PREVIEW_PORT ?? 4177);
const reportPath = path.resolve(
  ROOT,
  process.env.SMOKE_JSON_REPORT ?? 'docs/e2e-smoke/topology-deploy-smoke-result.json',
);
const screenshotRoot = path.resolve(
  ROOT,
  process.env.SMOKE_SCREENSHOT_DIR ?? 'docs/e2e-smoke/screenshots/topology-deploy',
);
const executablePath =
  process.env.SMOKE_BROWSER_EXECUTABLE ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);

const EDITED_NOTES = 'edited by topology-deploy-smoke';

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
// mock 后端：同一份状态，按 shape 产出两种响应形状
// ---------------------------------------------------------------------------
function createState(shape) {
  const envs = [
    { id: 'env-1', name: '华东协同环境', file_server_host: 'http://127.0.0.1:4101', mqtt_host: '127.0.0.1', mqtt_port: 1883, location: 'local-a', location_dbs: '7999' },
    { id: 'env-2', name: '备用环境', file_server_host: 'http://10.0.0.9:3100', mqtt_host: '10.0.0.9', mqtt_port: 1883, location: 'local-c', location_dbs: '8002' },
    { id: 'env-3', name: '故障环境', file_server_host: 'http://10.0.0.13:3100', mqtt_host: '10.0.0.13', mqtt_port: 1883, location: 'local-d', location_dbs: '8003' },
  ];
  if (shape === 'pws') {
    for (const e of envs) {
      e.active = e.id === 'env-1';
      e.mode = 'standalone-real';
    }
  }
  return {
    shape,
    envs,
    sites: {
      'env-1': [
        { id: 's-1', env_id: 'env-1', name: 'site-b-local', location: 'local-b', http_host: 'http://127.0.0.1:4101', dbnums: '8001', notes: 'Created by smoke' },
        { id: 's-2', env_id: 'env-1', name: 'site-c-remote', location: 'local-c', http_host: 'http://10.0.0.12:3100', dbnums: '8002', notes: '' },
      ],
      'env-2': [],
      'env-3': [],
    },
    // pmg：runtime.env_id / runtime.active；pws：envs[].active（running 恒 true）
    activeEnvId: 'env-1',
    runtimeActive: true,
    taskCount: 3,
    importCalls: 0,
  };
}

function hostPort(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port ? Number(u.port) : null };
  } catch {
    return { host: url, port: null };
  }
}

/** 返回 { status, json } 或 { abort: true } */
function respond(state, method, url, body) {
  const p = url.pathname;
  const pmg = state.shape === 'pmg';
  const now = new Date().toISOString();
  const ok = (json, status = 200) => ({ status, json });
  const findEnv = (id) => state.envs.find((e) => e.id === id) ?? { id, mqtt_host: '?', mqtt_port: 0, file_server_host: '?' };
  const findSite = (id) => Object.values(state.sites).flat().find((s) => s.id === id) ?? { id, http_host: '?' };
  let m;

  // ---- 跨站点直连（TopologyView 用原生 fetch 探活）----
  if (p === '/api/health') {
    return url.hostname === '10.0.0.12' ? ok({ status: 'down' }, 503) : ok({ status: 'ok' });
  }

  // ---- admin auth ----
  if (p === '/api/admin/auth/login' && method === 'POST') {
    if (body?.username !== 'admin' || body?.password !== 'admin') {
      return ok({ success: false, message: '用户名或密码错误' }, 401);
    }
    return ok(
      pmg
        ? { success: true, data: { token: 'mock-pmg-token', expires_at: '2099-01-01T00:00:00Z', user: { username: 'admin', role: 'admin' } } }
        // plant-web-server：没有 expires_at（bb60405 之前监控台对它登录必失败）
        : { success: true, data: { token: 'detached-admin-token', user: { username: 'admin', role: 'admin' } } },
    );
  }
  if (p === '/api/admin/auth/me') return ok({ success: true, data: { user: { username: 'admin', role: 'admin' } } });

  // ---- envs ----
  // DA-16：从 DbOption 导入。pmg 每次新建（UUID + 「导入环境 - 时间戳」，action_success 顶层给 id）；
  // pws 是 create_or_update_env，id 固定 dboption-<site_id>，重复导入就是覆盖（响应 item/data）
  if (p === '/api/remote-sync/envs/import-from-dboption' && method === 'POST') {
    state.importCalls += 1;
    if (pmg) {
      const id = `imported-${state.importCalls}`;
      state.envs.push({ id, name: `导入环境 - 20260914_2230${String(state.importCalls).padStart(2, '0')}`, file_server_host: 'http://127.0.0.1:4100', mqtt_host: '127.0.0.1', mqtt_port: 1883, location: 'local-a', location_dbs: '7999' });
      return ok({ status: 'success', message: '已从当前配置导入协同组', id, checked_at: now });
    }
    const id = 'dboption-local-a';
    let env = state.envs.find((e) => e.id === id);
    if (!env) {
      env = { id, name: 'AvevaMarineSample', source: 'DbOption', active: false, mode: 'standalone-real', config: { location: 'local-a', mqtt_host: '127.0.0.1', mqtt_port: 1883, file_server_host: 'http://127.0.0.1:4100' } };
      state.envs.push(env);
    }
    env.updated_at = now;
    return ok({ success: true, item: env, data: env, mode: 'standalone-real' });
  }
  if (p === '/api/remote-sync/envs' && method === 'GET') {
    return ok(
      pmg
        ? { status: 'success', items: state.envs }
        : { success: true, items: state.envs, active: state.envs.find((e) => e.active) ?? null, total: state.envs.length },
    );
  }
  if (p === '/api/remote-sync/runtime/status') {
    return ok(
      pmg
        ? { status: 'success', active: state.runtimeActive, env_id: state.runtimeActive ? state.activeEnvId : null, mqtt_connected: state.runtimeActive ? true : null }
        : { success: true, running: true, env_count: state.envs.length, site_count: 2, active_task_count: state.taskCount, root: 'runtime/remote_sync', mode: 'standalone-real' },
    );
  }
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/sites$/)) && method === 'GET') {
    const items = state.sites[m[1]] ?? [];
    return ok(pmg ? { status: 'success', items } : { success: true, items, total: items.length });
  }

  // ---- env 诊断 ----
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/test-mqtt$/)) && method === 'POST') {
    // DA-13：后端 5xx，前端必须落到「请求失败」banner 而不是红错
    if (m[1] === 'env-3') return ok({ status: 'failed', message: 'internal error' }, 500);
    const env = findEnv(m[1]);
    return ok(
      pmg
        ? { status: 'success', message: 'MQTT 连接可达', checked_at: now, addr: `${env.mqtt_host}:${env.mqtt_port}`, latency_ms: 3 }
        : { success: true, kind: 'mqtt', host: env.mqtt_host, port: env.mqtt_port, reachable: true },
    );
  }
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/test-http$/)) && method === 'POST') {
    const env = findEnv(m[1]);
    const hp = hostPort(env.file_server_host);
    return ok(
      pmg
        ? { status: 'failed', message: '请求失败: error sending request (connection refused)', checked_at: now, url: env.file_server_host }
        : { success: true, kind: 'http', host: hp.host, port: hp.port, reachable: false },
    );
  }

  // ---- env → 运行时 ----
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/activate$/)) && method === 'POST') {
    state.activeEnvId = m[1];
    state.runtimeActive = true;
    state.taskCount += 1;
    for (const e of state.envs) if ('active' in e) e.active = e.id === m[1];
    return ok(
      pmg
        ? { status: 'success', message: '已写入配置文件并启动 watcher + MQTT 订阅。', env_id: m[1] }
        : { success: true, item: findEnv(m[1]), task: { id: `remote-sync-activate-${m[1]}`, kind: 'activate', status: 'Active' } },
    );
  }
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/apply$/)) && method === 'POST') {
    // DA-08：env-1 的 apply 固定失败（HTTP 200 + 业务失败）
    if (m[1] === 'env-1') {
      return ok(
        pmg
          ? { status: 'failed', message: 'db_options/DbOption.toml 不存在，无法写入当前配置。', env_id: m[1] }
          : { success: false, message: 'env env-1 is locked by another task' },
      );
    }
    state.taskCount += 1;
    return ok(
      pmg
        ? { status: 'success', message: '已写入配置文件。部分运行期组件需重启或重新加载配置后生效。', env_id: m[1] }
        : { success: true, task: { id: `remote-sync-apply-${m[1]}`, kind: 'apply', status: 'Active' } },
    );
  }
  if (p === '/api/remote-sync/runtime/stop' && method === 'POST') {
    const prev = state.activeEnvId;
    if (pmg) {
      state.runtimeActive = false;
      state.activeEnvId = null;
      return ok({ status: 'success', message: '已停止运行时 watcher + MQTT', env_id: prev });
    }
    // plant-web-server 实测语义（2026-09-14）：只把活动任务标 Stopped；running 恒 true、active 不清
    state.taskCount = 0;
    return ok({ success: true, stopped: true });
  }

  // ---- sites ----
  if ((m = p.match(/^\/api\/remote-sync\/sites\/([^/]+)\/test-http$/)) && method === 'POST') {
    const site = findSite(m[1]);
    const hp = hostPort(site.http_host);
    const reachable = m[1] === 's-1';
    if (pmg) {
      return ok(
        reachable
          ? { status: 'success', message: '站点 metadata 可达', checked_at: now, url: `${site.http_host}/metadata.json`, code: 200, latency_ms: 12 }
          : { status: 'failed', message: '请求失败: error sending request (connection refused)', checked_at: now, url: `${site.http_host}/metadata.json` },
      );
    }
    return ok({ success: true, kind: 'http', host: hp.host, port: hp.port, reachable });
  }
  if ((m = p.match(/^\/api\/remote-sync\/sites\/([^/]+)$/)) && method === 'PUT') {
    const site = findSite(m[1]);
    Object.assign(site, body ?? {});
    return ok(pmg ? { status: 'success' } : { success: true, item: site });
  }

  // ---- 其它页面基础请求 ----
  if (p === '/api/site-config' && method === 'GET') {
    return ok({ config: { project_name: 'demo', project_code: 'DEMO', location: 'local-a', location_dbs: [7999], mqtt_host: '127.0.0.1', mqtt_port: 1883, file_server_host: 'http://127.0.0.1:4100' } });
  }
  if (p === '/api/site/info') {
    return ok({ success: true, location: 'local-a', role: 'master', file_server_host: 'http://127.0.0.1:4100', mqtt_host: '127.0.0.1', mqtt_port: 1883 });
  }
  if (p === '/api/sync/status') return ok({ status: 'running' });
  if (p === '/api/sync/queue') return ok({ items: [], failed: 0 });
  if (p === '/api/sync/events/stream') return { abort: true };
  return ok({ status: 'success', items: [] });
}

// ---------------------------------------------------------------------------
// 一种形状跑一遍
// ---------------------------------------------------------------------------
async function runShape(shape, base, browser) {
  const state = createState(shape);
  const shotDir = path.join(screenshotRoot, shape);
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
    calls.push({ method, path: url.pathname, host: url.host, body });
    const res = respond(state, method, url, body);
    if (res.abort) return route.abort();
    return route.fulfill({
      status: res.status,
      contentType: 'application/json',
      // 跨站点探活是跨域 fetch，缺 CORS 头浏览器会拒读
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(res.json),
    });
  });
  // 离线站点：连 HEAD 兜底也直接失败，别让脚本等 2s 超时
  await page.route('http://10.0.0.12:3100/**', (route) => route.abort());

  const shot = (name) => page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
  const pill = page.locator('[data-testid="remote-runtime-status"]');
  const card = (name) => page.locator('.card', { hasText: name });
  const bannerOf = (c, prefix) => c.locator('.rounded-lg.border.px-3').filter({ hasText: prefix });
  const row = (siteName) => page.locator('tbody tr', { hasText: siteName });
  // 登录弹窗（naive-ui NModal）：页面上此时只有它一个 dialog
  const dialog = page.getByRole('dialog');
  // 二次确认（naive-ui NDialog）：DaisyUI 的 <dialog class="modal"> 打开过一次后会留在 DOM 里，
  // 所以不能再用 getByRole('dialog')，改按 .n-dialog + 标题定位
  const confirm = (title) => page.locator('.n-dialog', { hasText: title });
  const posts = () => calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);
  const countCalls = (method, p) => calls.filter((c) => c.method === method && c.path === p).length;

  const cases = [];
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  async function runCase(id, title, fn) {
    const started = Date.now();
    try {
      const details = await fn();
      cases.push({ id, title, status: 'passed', ms: Date.now() - started, details: details ?? null });
      console.log(`  [${shape}] ${id} passed · ${title}`);
    } catch (err) {
      cases.push({ id, title, status: 'failed', ms: Date.now() - started, error: String(err?.message ?? err) });
      console.log(`  [${shape}] ${id} FAILED · ${title} · ${String(err?.message ?? err).split('\n')[0]}`);
      await shot(`${id}-failed`).catch(() => {});
    }
  }
  const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const hasClass = async (loc, cls) => ((await loc.getAttribute('class')) ?? '').includes(cls);

  // DA-01 ------------------------------------------------------------------
  await runCase('DA-01', 'admin 登录（两种 login 形状）并重定向回 /topology', async () => {
    await page.goto(`${base}topology`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({ timeout: 15_000 });
    const redirect = await page.evaluate(() => sessionStorage.getItem('admin_redirect_after_login'));
    await page.getByPlaceholder('ADMIN_USER 环境变量值').fill('admin');
    await page.getByPlaceholder('ADMIN_PASS 环境变量值').fill('admin');
    await dialog.getByRole('button', { name: '登录' }).click();
    await page.waitForURL('**/topology', { timeout: 15_000 });
    await page.getByText('异地拓扑管理').first().waitFor({ timeout: 15_000 });
    const token = await page.evaluate(() => sessionStorage.getItem('admin_token'));
    expect(redirect === '/topology', `登录前未记录重定向目标：${redirect}`);
    expect(Boolean(token), '登录后 sessionStorage 没有 admin_token');
    expect(countCalls('POST', '/api/admin/auth/login') === 1, 'login 请求数不为 1');
    await shot('01-after-login');
    return { redirect, token };
  });

  // DA-02 ------------------------------------------------------------------
  await runCase('DA-02', '运行时 pill 初始态 + 已激活徽标 + 激活按钮禁用', async () => {
    await pill.getByText('运行时 · 已激活 华东协同环境').waitFor({ timeout: 10_000 });
    await card('华东协同环境').waitFor({ timeout: 10_000 });
    const env1 = card('华东协同环境');
    const title = (await pill.locator('span[title]').first().getAttribute('title')) ?? '';
    expect((await env1.getByText('已激活', { exact: true }).count()) === 1, 'env-1 卡片没有「已激活」徽标');
    expect(await env1.getByRole('button', { name: '激活' }).isDisabled(), 'env-1 的「激活」按钮应禁用');
    expect((await card('备用环境').getByText('已激活', { exact: true }).count()) === 0, 'env-2 不应有徽标');
    expect(await page.getByRole('button', { name: '停止运行时' }).isVisible(), '「停止运行时」按钮应可见');
    expect(title.includes('env_id: env-1'), `pill title 缺 env_id：${title}`);
    if (shape === 'pmg') expect(title.includes('MQTT: true'), `pmg pill title 缺 MQTT：${title}`);
    if (shape === 'pws') expect(title.includes('mode: standalone-real') && title.includes('活动任务: 3'), `pws pill title 缺 mode/活动任务：${title}`);
    await shot('02-initial');
    return { pill: await text(pill), title };
  });

  // DA-03 ------------------------------------------------------------------
  await runCase('DA-03', '环境「测 MQTT」成功 → emerald banner 含目标地址', async () => {
    const env2 = card('备用环境');
    await env2.getByRole('button', { name: '测 MQTT' }).click();
    const banner = bannerOf(env2, '测 MQTT：');
    await banner.waitFor({ timeout: 8_000 });
    const t = await text(banner);
    expect(await hasClass(banner, 'bg-emerald-50'), `banner 不是成功色：${t}`);
    expect(t.includes('10.0.0.9:1883'), `banner 缺目标地址：${t}`);
    if (shape === 'pmg') expect(t.includes('MQTT 连接可达') && t.includes('3 ms'), `pmg banner 缺 message/latency：${t}`);
    if (shape === 'pws') expect(t.includes('目标可达'), `pws banner 缺「目标可达」：${t}`);
    expect(countCalls('POST', '/api/remote-sync/envs/env-2/test-mqtt') === 1, 'test-mqtt 未命中或重复');
    return { banner: t };
  });

  // DA-04 ------------------------------------------------------------------
  await runCase('DA-04', '环境「测文件服务」失败 → rose banner 含原因', async () => {
    const env2 = card('备用环境');
    const before = pageErrors.length;
    await env2.getByRole('button', { name: '测文件服务' }).click();
    const banner = bannerOf(env2, '测文件服务：');
    await banner.waitFor({ timeout: 8_000 });
    const t = await text(banner);
    expect(await hasClass(banner, 'bg-rose-50'), `banner 不是失败色：${t}`);
    if (shape === 'pmg') expect(t.includes('connection refused') && t.includes('http://10.0.0.9:3100'), `pmg banner 缺原因/url：${t}`);
    if (shape === 'pws') expect(t.includes('目标不可达') && t.includes('10.0.0.9:3100'), `pws banner 缺「目标不可达」/host:port：${t}`);
    expect(pageErrors.length === before, `出现 pageerror：${pageErrors.slice(before).join(' | ')}`);
    await shot('03-env-diagnostics');
    return { banner: t };
  });

  // DA-13 ------------------------------------------------------------------
  await runCase('DA-13', '后端 5xx → 「请求失败」banner，无未捕获错误', async () => {
    const env3 = card('故障环境');
    const before = pageErrors.length;
    await env3.getByRole('button', { name: '测 MQTT' }).click();
    const banner = bannerOf(env3, '测 MQTT：请求失败');
    await banner.waitFor({ timeout: 8_000 });
    const t = await text(banner);
    expect(await hasClass(banner, 'bg-rose-50'), `banner 不是失败色：${t}`);
    expect(t.includes('internal error'), `banner 未透出后端 message：${t}`);
    expect(pageErrors.length === before, `出现 pageerror：${pageErrors.slice(before).join(' | ')}`);
    return { banner: t };
  });

  // DA-05 ------------------------------------------------------------------
  await runCase('DA-05', '激活 → 确认弹窗文案 → 取消 = 0 写请求', async () => {
    const env2 = card('备用环境');
    const writesBefore = posts().length;
    await env2.getByRole('button', { name: '激活' }).click();
    const dlg = confirm('确认激活环境');
    await dlg.waitFor({ timeout: 5_000 });
    const dialogText = await text(dlg);
    await shot('04-activate-confirm');
    await dlg.getByRole('button', { name: '取消' }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 });
    expect(dialogText.includes('备用环境'), `弹窗未点名环境：${dialogText}`);
    expect(dialogText.includes('DbOption.toml'), `弹窗未说明会改写 DbOption.toml：${dialogText}`);
    expect(dialogText.includes('华东协同环境'), `弹窗未提示当前已激活环境会被停止：${dialogText}`);
    expect(posts().length === writesBefore, `取消后仍发出了写请求：${posts().slice(writesBefore).join(', ')}`);
    expect(countCalls('POST', '/api/remote-sync/envs/env-2/activate') === 0, '取消后不应命中 activate');
    return { dialogText };
  });

  // DA-06 ------------------------------------------------------------------
  await runCase('DA-06', '激活 → 确定 → pill / 徽标 / 按钮禁用随之切换', async () => {
    const env1 = card('华东协同环境');
    const env2 = card('备用环境');
    const envsBefore = countCalls('GET', '/api/remote-sync/envs');
    const rtBefore = countCalls('GET', '/api/remote-sync/runtime/status');
    await env2.getByRole('button', { name: '激活' }).click();
    await confirm('确认激活环境').waitFor({ timeout: 5_000 });
    await confirm('确认激活环境').getByRole('button', { name: '确定' }).click();
    await pill.getByText('运行时 · 已激活 备用环境').waitFor({ timeout: 10_000 });
    const banner = bannerOf(env2, '激活环境：');
    await banner.waitFor({ timeout: 5_000 });
    const t = await text(banner);
    expect(await hasClass(banner, 'bg-emerald-50'), `激活 banner 不是成功色：${t}`);
    expect((await env2.getByText('已激活', { exact: true }).count()) === 1, 'env-2 未挂「已激活」徽标');
    expect((await env1.getByText('已激活', { exact: true }).count()) === 0, 'env-1 徽标未移除');
    expect(await env2.getByRole('button', { name: '激活' }).isDisabled(), 'env-2「激活」应禁用');
    expect(await env1.getByRole('button', { name: '激活' }).isEnabled(), 'env-1「激活」应恢复可用');
    expect(countCalls('POST', '/api/remote-sync/envs/env-2/activate') === 1, 'activate 未命中或重复');
    expect(countCalls('GET', '/api/remote-sync/runtime/status') > rtBefore, '激活后未刷新 runtime/status');
    expect(countCalls('GET', '/api/remote-sync/envs') > envsBefore, '激活后未刷新 env 列表');
    await shot('05-activated');
    return { pill: await text(pill), banner: t };
  });

  // DA-07 ------------------------------------------------------------------
  await runCase('DA-07', '应用 → 确定 → 成功 banner', async () => {
    const env2 = card('备用环境');
    await env2.getByRole('button', { name: '应用' }).click();
    const dlg = confirm('确认应用环境配置');
    await dlg.waitFor({ timeout: 5_000 });
    const dialogText = await text(dlg);
    await dlg.getByRole('button', { name: '确定' }).click();
    const banner = bannerOf(env2, '应用配置：');
    await banner.waitFor({ timeout: 8_000 });
    const t = await text(banner);
    expect(dialogText.includes('备用环境') && dialogText.includes('DbOption.toml'), `应用弹窗文案不完整：${dialogText}`);
    expect(await hasClass(banner, 'bg-emerald-50'), `应用 banner 不是成功色：${t}`);
    if (shape === 'pmg') expect(t.includes('已写入配置文件'), `pmg 应用 banner 缺 message：${t}`);
    if (shape === 'pws') expect(t.includes('成功'), `pws 应用 banner 缺「成功」：${t}`);
    expect(countCalls('POST', '/api/remote-sync/envs/env-2/apply') === 1, 'apply 未命中或重复');
    return { banner: t };
  });

  // DA-08 ------------------------------------------------------------------
  await runCase('DA-08', '应用 → 后端业务失败（HTTP 200）→ rose banner，运行态不变', async () => {
    const env1 = card('华东协同环境');
    await env1.getByRole('button', { name: '应用' }).click();
    await confirm('确认应用环境配置').waitFor({ timeout: 5_000 });
    await confirm('确认应用环境配置').getByRole('button', { name: '确定' }).click();
    const banner = bannerOf(env1, '应用配置：');
    await banner.waitFor({ timeout: 8_000 });
    const t = await text(banner);
    expect(await hasClass(banner, 'bg-rose-50'), `失败 banner 不是失败色：${t}`);
    if (shape === 'pmg') expect(t.includes('DbOption.toml 不存在'), `pmg 失败 banner 缺 message：${t}`);
    if (shape === 'pws') expect(t.includes('locked by another task'), `pws 失败 banner 缺 message：${t}`);
    expect((await text(pill)).includes('已激活 备用环境'), `失败的 apply 不应改变 pill：${await text(pill)}`);
    await shot('06-apply-failed');
    return { banner: t };
  });

  // DA-09 ------------------------------------------------------------------
  await runCase('DA-09', '选中环境 → 站点表 → 后端 test-http 可达', async () => {
    await card('华东协同环境').locator('h5').click();
    await page.getByText('site-b-local').first().waitFor({ timeout: 10_000 });
    await page.getByText('site-c-remote').first().waitFor({ timeout: 10_000 });
    const r = row('site-b-local');
    await r.locator('[data-tip="由后端探测该站点 HTTP 可达性"]').click();
    const result = r.locator('[data-testid="site-test-http-result"]');
    await result.waitFor({ timeout: 8_000 });
    const summary = await text(result);
    const title = (await result.getAttribute('title')) ?? '';
    expect(summary.startsWith('可达'), `站点诊断摘要应为「可达」：${summary}`);
    expect(await hasClass(result, 'text-emerald-600'), '站点诊断结果不是成功色');
    if (shape === 'pmg') expect(summary.includes('12 ms') && title.includes('HTTP 200'), `pmg 站点诊断缺 latency/HTTP 200：${summary} / ${title}`);
    if (shape === 'pws') expect(title.includes('127.0.0.1:4101'), `pws 站点诊断 title 缺 host:port：${title}`);
    expect(countCalls('POST', '/api/remote-sync/sites/s-1/test-http') === 1, 'sites/s-1/test-http 未命中或重复');
    return { summary, title };
  });

  // DA-10 ------------------------------------------------------------------
  await runCase('DA-10', '站点 test-http 不可达 → 「不可达」+ title 含原因', async () => {
    const r = row('site-c-remote');
    await r.locator('[data-tip="由后端探测该站点 HTTP 可达性"]').click();
    const result = r.locator('[data-testid="site-test-http-result"]');
    await result.waitFor({ timeout: 8_000 });
    const summary = await text(result);
    const title = (await result.getAttribute('title')) ?? '';
    expect(summary === '不可达', `摘要应为「不可达」：${summary}`);
    expect(await hasClass(result, 'text-rose-600'), '站点诊断结果不是失败色');
    if (shape === 'pmg') expect(title.includes('connection refused'), `pmg title 缺原因：${title}`);
    if (shape === 'pws') expect(title.includes('目标不可达') && title.includes('10.0.0.12:3100'), `pws title 缺「目标不可达」/host:port：${title}`);
    await shot('07-site-test-http');
    return { summary, title };
  });

  // DA-11 ------------------------------------------------------------------
  await runCase('DA-11', '编辑站点 → 预填 → 改备注 → PUT sites/{id} 落到后端', async () => {
    await row('site-b-local').locator('[data-tip="编辑站点"]').click();
    await page.getByRole('heading', { name: '编辑站点' }).waitFor({ timeout: 5_000 });
    const modal = page.locator('dialog.modal-open');
    const nameValue = await modal.locator('input[placeholder="例如: 1号服务器、备份节点"]').inputValue();
    await modal.locator('textarea').fill(EDITED_NOTES);
    await shot('08-site-edit');
    await modal.getByRole('button', { name: '保存修改' }).click();
    await page.getByRole('heading', { name: '编辑站点' }).waitFor({ state: 'hidden', timeout: 8_000 });
    const put = calls.find((c) => c.method === 'PUT' && c.path === '/api/remote-sync/sites/s-1');
    expect(nameValue === 'site-b-local', `编辑弹窗未预填名称：${nameValue}`);
    expect(Boolean(put), '未发出 PUT /api/remote-sync/sites/s-1');
    expect(put?.body?.notes === EDITED_NOTES, `PUT body.notes 不对：${JSON.stringify(put?.body)}`);
    expect(put?.body?.name === 'site-b-local', `PUT body.name 不对：${JSON.stringify(put?.body)}`);
    expect(state.sites['env-1'][0].notes === EDITED_NOTES, 'mock 后端未收到新的 notes');
    return { nameValue, putBody: put?.body };
  });

  // DA-15 ------------------------------------------------------------------
  await runCase('DA-15', '站点表 1440 宽度无横向溢出，「操作」列可见', async () => {
    const table = page.locator('table').first();
    const widths = await table.evaluate((t) => ({
      scrollWidth: t.scrollWidth,
      containerWidth: t.parentElement.clientWidth,
      cols: Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent.trim()),
    }));
    expect(widths.scrollWidth <= widths.containerWidth, `站点表横向溢出：${JSON.stringify(widths)}`);
    expect(await page.getByRole('columnheader', { name: '操作' }).isVisible(), '「操作」列不可见');
    return widths;
  });

  // DA-12 ------------------------------------------------------------------
  await runCase('DA-12', '停止运行时 → 确认 → pill 跟随后端状态', async () => {
    await page.getByRole('button', { name: '停止运行时' }).click();
    const dlg = confirm('确认停止运行时');
    await dlg.waitFor({ timeout: 5_000 });
    const dialogText = await text(dlg);
    await dlg.getByRole('button', { name: '确定' }).click();
    expect(dialogText.includes('备用环境'), `停止弹窗未点名当前环境：${dialogText}`);
    if (shape === 'pmg') {
      await pill.getByText('运行时 · 未激活').waitFor({ timeout: 10_000 });
      await page.getByRole('button', { name: '停止运行时' }).waitFor({ state: 'hidden', timeout: 5_000 });
      expect((await card('备用环境').getByText('已激活', { exact: true }).count()) === 0, 'pmg 停止后徽标应消失');
      expect(await card('备用环境').getByRole('button', { name: '激活' }).isEnabled(), 'pmg 停止后「激活」应恢复可用');
    } else {
      // plant-web-server：stop 只标任务 Stopped，active 不清 → pill 仍显示已激活（AGENTS.md §4.3.2 已记录的后端语义）
      await page.waitForTimeout(1_500);
      expect((await text(pill)).includes('已激活 备用环境'), `pws 停止后 pill 应仍跟随 envs[].active：${await text(pill)}`);
      const title = (await pill.locator('span[title]').first().getAttribute('title')) ?? '';
      expect(title.includes('活动任务: 0'), `pws 停止后活动任务数应刷新为 0：${title}`);
    }
    expect(countCalls('POST', '/api/remote-sync/runtime/stop') === 1, 'runtime/stop 未命中或重复');
    await shot('09-after-stop');
    return { dialogText, pill: await text(pill) };
  });

  // DA-14 ------------------------------------------------------------------
  await runCase('DA-14', '动作后刷新：runtime/status 与 env 列表都被重新拉取', async () => {
    const rt = countCalls('GET', '/api/remote-sync/runtime/status');
    const envs = countCalls('GET', '/api/remote-sync/envs');
    expect(rt >= 3, `runtime/status 只拉了 ${rt} 次（期望 ≥3：首屏 + 激活后 + 停止后）`);
    expect(envs >= 3, `envs 只拉了 ${envs} 次（期望 ≥3）`);
    return { runtimeStatusCalls: rt, envsCalls: envs };
  });

  // DA-16 ------------------------------------------------------------------
  await runCase('DA-16', '「从 DbOption 导入」→ 取消 0 写 → 确定 → import-from-dboption 1 次 → 新卡出现并被选中', async () => {
    const importPath = '/api/remote-sync/envs/import-from-dboption';
    const btn = page.getByRole('button', { name: '从 DbOption 导入' });
    const envsBefore = countCalls('GET', '/api/remote-sync/envs');
    const cardsBefore = state.envs.length;
    await page.getByText(`共 ${cardsBefore} 个环境`).waitFor({ timeout: 5_000 });

    // 取消：0 写请求
    await btn.click();
    const dlg = confirm('确认从 DbOption 导入环境');
    await dlg.waitFor({ timeout: 5_000 });
    const dialogText = await text(dlg);
    await shot('11-import-confirm');
    await dlg.getByRole('button', { name: '取消' }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 });
    expect(dialogText.includes('DbOption.toml'), `弹窗未说明读取 DbOption.toml：${dialogText}`);
    expect(dialogText.includes('不会改写配置'), `弹窗未说明不改写配置：${dialogText}`);
    expect(countCalls('POST', importPath) === 0, '取消后不应命中 import-from-dboption');

    // 确定：命中一次，新卡出现、列表刷新、新卡被选中
    await btn.click();
    await confirm('确认从 DbOption 导入环境').waitFor({ timeout: 5_000 });
    await confirm('确认从 DbOption 导入环境').getByRole('button', { name: '确定' }).click();
    await confirm('确认从 DbOption 导入环境').waitFor({ state: 'hidden', timeout: 5_000 });
    const newName = shape === 'pmg' ? '导入环境 - 20260914_223001' : 'AvevaMarineSample';
    const newCard = card(newName);
    await newCard.waitFor({ timeout: 10_000 });
    await page.getByText(`共 ${cardsBefore + 1} 个环境`).waitFor({ timeout: 5_000 });
    // 选中态是异步的（loadEnvs → selectEnv），等 class 落下来
    await page.waitForFunction(
      (name) => Array.from(document.querySelectorAll('.card')).some((c) => c.textContent.includes(name) && c.className.includes('border-primary')),
      newName,
      { timeout: 5_000 },
    );
    expect(countCalls('POST', importPath) === 1, `import-from-dboption 命中 ${countCalls('POST', importPath)} 次（期望 1）`);
    expect(countCalls('GET', '/api/remote-sync/envs') > envsBefore, '导入后未刷新 env 列表');
    expect(state.envs.length === cardsBefore + 1, `mock 后端 env 数不对：${state.envs.length}`);
    expect(await btn.isEnabled(), '导入结束后按钮应恢复可用');
    await shot('12-imported');
    return { dialogText, newName, envCount: state.envs.length };
  });

  // 暗色一张，不计用例
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(400);
  await shot('10-topology-dark').catch(() => {});
  await page.close();

  const summary = {
    passed: cases.filter((c) => c.status === 'passed').length,
    failed: cases.filter((c) => c.status === 'failed').length,
  };
  return {
    shape,
    passed: summary.failed === 0 && pageErrors.length === 0,
    summary,
    cases,
    writeCalls: posts(),
    consoleErrors,
    pageErrors,
    screenshots: path.relative(ROOT, shotDir),
  };
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
    preview: { port: previewPort, strictPort: true, open: false },
  });
  const base = server.resolvedUrls.local[0]; // e.g. http://localhost:4177/monitor/
  console.log(`preview: ${base}  shapes: ${shapes.join(', ')}`);

  const browser = await chromium.launch({
    channel: executablePath ? undefined : 'chrome',
    executablePath,
    headless: !args.headed,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    browser: executablePath ?? 'chrome channel',
    shapes: {},
    passed: true,
  };
  try {
    for (const shape of shapes) {
      console.log(`\n=== shape: ${shape} ===`);
      const result = await runShape(shape, base, browser);
      report.shapes[shape] = result;
      if (!result.passed) report.passed = false;
    }
  } finally {
    await browser.close();
    await server.close();
  }

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('');
  for (const [shape, r] of Object.entries(report.shapes)) {
    console.log(`${shape}: ${r.passed ? 'PASS' : 'FAIL'} · ${r.summary.passed} passed / ${r.summary.failed} failed · pageErrors ${r.pageErrors.length}`);
    for (const c of r.cases.filter((x) => x.status !== 'passed')) console.log(`  - ${c.id} ${c.title}: ${c.error}`);
  }
  console.log(`report: ${path.relative(ROOT, reportPath)}`);
  process.exitCode = report.passed ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
