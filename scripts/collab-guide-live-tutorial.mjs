// 「协同配置向导」实操教程 · 真浏览器 + 真后端自动生成（截图 + Markdown）
//
// 与 scripts/topology-deploy-live-tutorial.mjs 是同一条主线（建环境 → 测连通 → 激活 → 登记对端 → 核对 → 停止），
// 区别在**走的入口**：那一份直接在 /topology 上点按钮；这一份照着监控台自带的 `/guide`「协同配置向导」（2026-09-21）
// 从第 1 步走到第 8 步——每一步先截向导页（为什么 / 怎么做 / 填什么 / 完成判定），再点「去页面操作」进 /topology
// 看高亮导览、在真实按钮上做动作，回到向导看判定是否跟着变绿。后端是真后端，截图里的每一条提示都是它当时的真实响应。
//
// 后端语义按 plant-web-server（2026-09-16 起的站点后端）写，见 topology-deploy-live-tutorial.mjs 顶部那段。
//
// 收尾（无论中途成败都做）：删掉本次新建的 env / 站点；若本轮的激活真改写了 DbOption.toml，就用开跑前
// `GET /api/site/info` 记下的五个键建一张临时「恢复卡」激活写回，再激活一次确认 changed=false；运行态与账面
// 「当前环境」标记恢复成开跑前的样子；对端（--peer，教程第 7 步会让它也激活一张卡）同样复原。
//
// ⚠ 因此**只对隔离环境跑**（本机 ../plant-web-server/runtime/local-collab 的 Site A / Site B），别指向生产后端。
//
// 产物：
//   docs/tutorials/screenshots/collab-guide-live/*.png     截图（入库）
//   docs/tutorials/collab-guide-live-tutorial.md           教程 Markdown（整篇由本脚本生成，改文案改脚本）
//   docs/e2e-smoke/collab-guide-live-tutorial-result.json  这一跑的事实记录（做了什么、收尾是否复原）
//
// 用法：
//   node scripts/collab-guide-live-tutorial.mjs --api http://127.0.0.1:4100 --peer http://127.0.0.1:4101
//   node scripts/collab-guide-live-tutorial.mjs --headed          # 有头模式看着它操作
//   node scripts/collab-guide-live-tutorial.mjs --build           # 强制先 vite build（改了 src 之后要带）
//
// 参数 / 环境变量：
//   --api   SMOKE_API_TARGET   目标后端（默认 http://127.0.0.1:4100，即 Site A）
//   --peer                     对端站点（默认 http://127.0.0.1:4101，即 Site B）：第 6 步登记它、第 7 步让它也激活
//   --user  SMOKE_ADMIN_USER   默认 admin      --pass SMOKE_ADMIN_PASS 默认 admin（两站同一对）
//   --port  SMOKE_PREVIEW_PORT vite preview 端口（默认 4180，避开 live smoke 的 4178 / 拓扑教程的 4179）
//   SMOKE_BROWSER_EXECUTABLE   Chrome 路径
//
// 注意：教程跑在生产构建（vite preview）上，开发态的「自动登录」默认关着，所以第 1 步会真的走一遍登录框——
// 这正是生产部署里用户看到的样子。
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const API = String(args.api ?? process.env.SMOKE_API_TARGET ?? 'http://127.0.0.1:4100').replace(/\/$/, '');
const PEER = String(args.peer ?? 'http://127.0.0.1:4101').replace(/\/$/, '');
const USER = String(args.user ?? process.env.SMOKE_ADMIN_USER ?? 'admin');
const PASS = String(args.pass ?? process.env.SMOKE_ADMIN_PASS ?? 'admin');
const previewPort = Number(args.port ?? process.env.SMOKE_PREVIEW_PORT ?? 4180);
const SHOT_DIR_REL = 'docs/tutorials/screenshots/collab-guide-live';
const MD_REL = 'docs/tutorials/collab-guide-live-tutorial.md';
const RESULT_REL = 'docs/e2e-smoke/collab-guide-live-tutorial-result.json';
const shotDir = path.resolve(ROOT, SHOT_DIR_REL);
const mdPath = path.resolve(ROOT, MD_REL);
const resultPath = path.resolve(ROOT, RESULT_REL);
const executablePath =
  process.env.SMOKE_BROWSER_EXECUTABLE ??
  (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

const DEMO_ENV = '向导演示-本站中继';
const PEER_ENV = '向导演示-对端中继';
const RESTORE_ENV = '向导收尾-恢复本站配置（临时）';
/** 比文件里多标一个自有库，让「激活会真的改写 DbOption.toml」看得见（向导第 3 步的 note 就是这么建议的）；收尾写回原值 */
const EXTRA_DBNUM = 6001;
/** 对端站点的 HTTP 服务地址：站点探测会对它拼 /metadata.json，本机 Site B 的 output/ 下有这个 fixture */
const PEER_SITE_HOST = `${PEER}/files/output`;
const CONNECTION_KEYS = ['mqtt_host', 'mqtt_port', 'file_server_host', 'location', 'location_dbs'];
const GUIDE_STEP_TITLES = ['准备', '三个词与一条主线', '新建协同环境', '先测连通', '激活环境', '登记对端站点', '核对运行态与台账', '停止运行时 / 复原'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[a.slice(2)] = argv[i + 1];
      i += 1;
    } else out[a.slice(2)] = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 直连 API（两站）：开跑前的事实、收尾复原、以及“页面说的和后端存的是不是一回事”的对照
// ---------------------------------------------------------------------------
function makeApi(base) {
  let token = null;
  const call = async (method, p, body) => {
    // pws 对带 content-type 却没 body 的 GET 回 400，所以只在有 body 时带
    const headers = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(`${base}${p}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text();
    try {
      return { status: r.status, body: JSON.parse(text) };
    } catch {
      return { status: r.status, body: null, text: text.slice(0, 200) };
    }
  };
  call.login = async () => {
    const login = await call('POST', '/api/admin/auth/login', { username: USER, password: PASS });
    token = login.body?.data?.token ?? login.body?.token ?? null;
    if (!token) throw new Error(`后端 ${base} 登录失败：HTTP ${login.status} ${JSON.stringify(login.body)?.slice(0, 200)}`);
  };
  call.base = base;
  return call;
}
const api = makeApi(API);
const peerApi = makeApi(PEER);

/** plant-web-server ≥ 2026-09-16：runtime/status 带中继运行态 active / env_id / relay / mqtt_connected */
const hasRelayRuntime = (rt) => Boolean(rt) && typeof rt.active === 'boolean' && typeof rt.relay === 'boolean';
const runtimeEnvIdOf = (rt) => (hasRelayRuntime(rt) && rt.active && rt.env_id ? String(rt.env_id) : null);
const ledgerEnvIdOf = (envs) => {
  const flagged = envs?.active?.id ?? (envs?.items ?? []).find((e) => e.active === true)?.id ?? null;
  return flagged ? String(flagged) : null;
};
const dbList = (value) => {
  if (Array.isArray(value)) return value.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  if (typeof value === 'string') return value.split(/[\s,，]+/).map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return [];
};
const pickConnection = (obj) => ({
  mqtt_host: obj?.mqtt_host ?? null,
  mqtt_port: obj?.mqtt_port !== undefined && obj?.mqtt_port !== null ? Number(obj.mqtt_port) : null,
  file_server_host: obj?.file_server_host ?? null,
  location: obj?.location ?? null,
  location_dbs: dbList(obj?.location_dbs),
});
const fmtDbs = (list) => (list.length ? list.join(', ') : '（空）');
const sameConn = (a, b) =>
  Boolean(a && b) &&
  a.mqtt_host === b.mqtt_host &&
  Number(a.mqtt_port) === Number(b.mqtt_port) &&
  a.file_server_host === b.file_server_host &&
  a.location === b.location &&
  JSON.stringify(dbList(a.location_dbs)) === JSON.stringify(dbList(b.location_dbs));

/**
 * 直接读本站 DbOption.toml 的五个键（只在后端与本脚本同一台机器、identity 给了 repo_root + config 时可行；
 * 读不到返回 null）。用它对照「site/info 回的」与「文件里写的」是不是一回事——旧 plant-web-server 的
 * site/info 只回启动时读进内存的那份，激活写了文件它也不知道。
 */
let tomlPath = null;
async function readTomlKeys() {
  if (!tomlPath || !existsSync(tomlPath)) return null;
  const txt = await readFile(tomlPath, 'utf8');
  const pick = (re) => {
    const m = txt.match(re);
    return m ? m[1].trim() : null;
  };
  const dbs = pick(/^\s*location_dbs\s*=\s*(\[[^\]]*\])/m);
  return {
    mqtt_host: pick(/^\s*mqtt_host\s*=\s*"([^"]*)"/m),
    mqtt_port: pick(/^\s*mqtt_port\s*=\s*(\d+)/m),
    file_server_host: pick(/^\s*file_server_host\s*=\s*"([^"]*)"/m),
    location: pick(/^\s*location\s*=\s*"([^"]*)"/m),
    location_dbs: dbs ? dbList(dbs.replace(/[[\]]/g, '')) : [],
  };
}

// ---------------------------------------------------------------------------
// 页面小工具
// ---------------------------------------------------------------------------
/** 给要讲的元素描一圈红边，截完图恢复 */
async function withHighlight(locators, fn) {
  const list = Array.isArray(locators) ? locators : [locators];
  const applied = [];
  for (const loc of list) {
    if ((await loc.count()) === 0) continue;
    const target = loc.first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.evaluate((el) => {
      el.dataset.tutorialPrevStyle = el.getAttribute('style') ?? '';
      el.style.transition = 'none';
      el.style.outline = '3px solid #f43f5e';
      el.style.outlineOffset = '3px';
      el.style.boxShadow = '0 0 0 6px rgba(244, 63, 94, 0.18)';
      if (!el.style.borderRadius) el.style.borderRadius = '8px';
    });
    applied.push(target);
  }
  if (applied.length) {
    const page = applied[0].page();
    await page.mouse.move(4, 4);
    await page.waitForTimeout(250);
  }
  try {
    return await fn();
  } finally {
    for (const target of applied) {
      await target
        .evaluate((el) => {
          const prev = el.dataset.tutorialPrevStyle ?? '';
          if (prev) el.setAttribute('style', prev);
          else el.removeAttribute('style');
          delete el.dataset.tutorialPrevStyle;
        })
        .catch(() => {});
    }
  }
}

async function hideToasts(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll('.n-message').forEach((el) => {
        el.style.display = 'none';
      });
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
const sections = [];
function section(def) {
  sections.push({ ...def, shots: [] });
  return sections[sections.length - 1];
}

const facts = {
  generatedAt: new Date().toISOString(),
  api: API,
  peer: PEER,
  backend: null,
  ownConfig: null,
  demoConfig: null,
  peerConfig: null,
  steps: [],
  apiCalls: [],
  writes: [],
  activations: [],
  /** 每一节结束时向导页的判定状态（data-status），是「向导判得对不对」的证据 */
  guideStatuses: [],
  consoleErrors: [],
  pageErrors: [],
  demoEnvId: null,
  peerEnvId: null,
  cleanup: null,
  ok: false,
};
const note = (name, data) => facts.steps.push({ name, at: new Date().toISOString(), ...data });

async function main() {
  await mkdir(shotDir, { recursive: true });
  await mkdir(path.dirname(resultPath), { recursive: true });

  // ---- 开跑前：登录两站 + 记下原始状态 ----
  await api.login();
  const identity = (await api('GET', '/api/site/identity')).body ?? {};
  const before = {
    envs: (await api('GET', '/api/remote-sync/envs')).body,
    runtime: (await api('GET', '/api/remote-sync/runtime/status')).body,
  };
  before.runtimeEnvId = runtimeEnvIdOf(before.runtime);
  before.ledgerEnvId = ledgerEnvIdOf(before.envs);
  before.envIds = (before.envs?.items ?? []).map((e) => String(e.id));
  const isPws = identity?.mode === 'detached' || before.runtime?.mode === 'standalone-real';
  if (!isPws || !hasRelayRuntime(before.runtime)) {
    throw new Error(
      `本教程按 plant-web-server（≥ 2026-09-16，runtime/status 带 active / relay）的语义写，${API} 不是：` +
        `identity.mode=${identity?.mode ?? '?'} runtime=${JSON.stringify(before.runtime)?.slice(0, 160)}。确认 --api 指向哪台。`,
    );
  }
  const siteInfo = (await api('GET', '/api/site/info')).body ?? {};
  facts.ownConfig = pickConnection(siteInfo?.data ?? siteInfo);
  const missing = CONNECTION_KEYS.filter((k) => facts.ownConfig[k] === null || facts.ownConfig[k] === '' || (k === 'location_dbs' && !Array.isArray(facts.ownConfig[k])));
  if (missing.length) throw new Error(`GET /api/site/info 缺 ${missing.join(' / ')}，收尾没法把 DbOption.toml 写回原值，不往下激活`);
  if (facts.ownConfig.location_dbs.length === 0) {
    throw new Error('本站 location_dbs 为空：pws 对 env 上为空的键一律不动 toml，收尾写不回 []，不往下激活（换一台 location_dbs 非空的站，或先给它配上）');
  }
  facts.backend = {
    shape: 'pws',
    identity,
    envCountBefore: before.envIds.length,
    runtimeEnvIdBefore: before.runtimeEnvId,
    ledgerEnvIdBefore: before.ledgerEnvId,
    runtimeBefore: before.runtime,
    site: siteInfo?.data ?? siteInfo,
  };
  const demoDbs = [...facts.ownConfig.location_dbs];
  if (!demoDbs.includes(EXTRA_DBNUM)) demoDbs.push(EXTRA_DBNUM);
  facts.demoConfig = { ...facts.ownConfig, location_dbs: demoDbs };
  if (typeof identity?.repo_root === 'string' && typeof identity?.config === 'string') {
    tomlPath = path.resolve(identity.repo_root, identity.config);
    if (!existsSync(tomlPath)) tomlPath = null;
  }
  facts.backend.tomlReadable = Boolean(tomlPath);
  facts.backend.tomlBefore = await readTomlKeys();

  // 对端：记下它的身份与状态，第 7 步会让它按自己的身份激活一张卡
  await peerApi.login();
  const peerInfo = (await peerApi('GET', '/api/site/info')).body ?? {};
  facts.peerConfig = pickConnection(peerInfo?.data ?? peerInfo);
  const peerBefore = {
    envs: (await peerApi('GET', '/api/remote-sync/envs')).body,
    runtime: (await peerApi('GET', '/api/remote-sync/runtime/status')).body,
  };
  peerBefore.runtimeEnvId = runtimeEnvIdOf(peerBefore.runtime);
  peerBefore.ledgerEnvId = ledgerEnvIdOf(peerBefore.envs);
  peerBefore.envIds = (peerBefore.envs?.items ?? []).map((e) => String(e.id));

  // 同名残留先清掉，免得卡片选择器撞上上一跑的遗留
  for (const [client, names, list] of [
    [api, [DEMO_ENV, RESTORE_ENV], before],
    [peerApi, [PEER_ENV, RESTORE_ENV], peerBefore],
  ]) {
    for (const e of list.envs?.items ?? []) {
      if (!names.includes(e.name)) continue;
      await client('DELETE', `/api/remote-sync/envs/${e.id}`);
      note('cleanup-stale-env', { api: client.base, id: String(e.id), name: e.name });
      list.envIds = list.envIds.filter((id) => id !== String(e.id));
      if (list.ledgerEnvId === String(e.id)) list.ledgerEnvId = null;
    }
  }

  // ---- 起 preview（/api 反代到真后端）+ 真 Chrome ----
  if (args.build || !existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.log('dist/ 缺失或要求重建，先执行 vite build …');
    await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'production', logLevel: 'warn' });
  }
  const server = await preview({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    preview: { port: previewPort, strictPort: true, open: false, proxy: { '/api': { target: API, changeOrigin: true } } },
  });
  const base = server.resolvedUrls.local[0];
  console.log(`preview: ${base} → ${API}（真后端，会真的写它的配置）；对端 ${PEER}`);

  const browser = await chromium.launch({ channel: executablePath ? undefined : 'chrome', executablePath, headless: !args.headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') facts.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => facts.pageErrors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) facts.apiCalls.push(`${r.method()} ${u.pathname}`);
  });
  page.on('response', async (r) => {
    const req = r.request();
    const u = new URL(req.url());
    if (!u.pathname.startsWith('/api/') || req.method() === 'GET') return;
    facts.writes.push({ method: req.method(), path: u.pathname, status: r.status() });
    const m = u.pathname.match(/^\/api\/remote-sync\/envs\/([^/]+)\/activate$/);
    if (m) {
      const body = await r.json().catch(() => null);
      facts.activations.push({ envId: decodeURIComponent(m[1]), status: r.status(), relay: body?.relay ?? null, runtime_config: body?.runtime_config ?? null });
    }
  });

  // ---- 页面定位器 ----
  const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const stepBtn = (id) => page.locator(`[data-testid="guide-step-${id}"]`);
  const detail = page.locator('[data-testid="guide-detail"]');
  const tourCard = page.locator('[data-testid="guide-tour-card"]');
  const tourRing = page.locator('.guide-tour__ring');
  const pill = page.locator('[data-testid="remote-runtime-status"]');
  const card = (name) => page.locator('.card', { hasText: name });
  const bannerOf = (c, prefixText) => c.locator('.rounded-lg.border.px-3').filter({ hasText: prefixText });
  const confirmDlg = (title) => page.locator('.n-dialog', { hasText: title });

  async function shot(sec, file, alt, caption, highlight) {
    const target = path.join(shotDir, `${file}.png`);
    const take = () => page.screenshot({ path: target, fullPage: false });
    if (highlight) await withHighlight(highlight, take);
    else await take();
    sec.shots.push({ file: `${file}.png`, alt, caption });
    console.log(`  shot ${file}.png`);
  }
  /** 读向导 8 步的判定状态 */
  async function guideStatuses() {
    return page.locator('[data-testid^="guide-step-"]').evaluateAll((els) =>
      Object.fromEntries(els.map((el) => [el.getAttribute('data-testid').replace('guide-step-', ''), el.getAttribute('data-status')])),
    );
  }
  async function openGuide(stepId) {
    await page.goto(`${base}guide`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="guide-steps"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1_800);
    if (stepId) {
      await stepBtn(stepId).click();
      await page.waitForTimeout(600);
    }
    await hideToasts(page);
  }
  async function recordStatuses(after) {
    const statuses = await guideStatuses();
    const progress = await text(page.locator('[data-testid="guide-progress"]'));
    facts.guideStatuses.push({ after, statuses, progress });
    return { statuses, progress };
  }
  /** 「去页面操作」→ /topology?tour=<id> → 等导览卡出现 */
  async function goWithTour() {
    await page.locator('[data-testid="guide-start-tour"]').click();
    await page.waitForURL('**/topology**', { timeout: 20_000 });
    await tourCard.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    await hideToasts(page);
  }
  async function endTour() {
    if ((await tourCard.count()) > 0) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }
  /**
   * 「去页面操作」会把向导里选中的卡（?env=）带过去，/topology 先选中它再起导览，所以卡片级目标应当就在演示卡上。
   * 这里只核对，不去点别处——导览遮罩挡着目标以外的区域，中途换卡得先 Esc。
   */
  async function expectTourOnDemoCard(anchor) {
    const c = card(DEMO_ENV);
    await c.waitFor({ timeout: 15_000 });
    await c.locator(`[data-tour="${anchor}"]`).waitFor({ timeout: 10_000 });
    await tourRing.waitFor({ timeout: 8_000 }).catch(() => {});
    return c;
  }

  let runError = null;
  try {
    // =====================================================================
    // 1 准备：打开向导、登录
    // =====================================================================
    const s1 = section({
      title: '第 1 步 · 准备：后端在线、管理员已登录',
      intro:
        '侧栏「监控」组里点 **配置向导**（不设登录门），左边是 8 步清单，右边是当前步的「为什么 / 在页面上怎么做 / 要填什么 / 完成判定」。第 1 步先看「本站身份」卡——显示的 `site_id / location / 配置文件` 就是监控台此刻接着的那台后端；**不是你要配的那台，先改 `VITE_API_TARGET`**。生产构建默认不自动登录，所以这里要真的登一次（开发态 `npm run dev` 会用 `admin / admin` 静默登录，这一步直接绿）。',
    });
    await openGuide();
    let st = await guideStatuses();
    note('guide-open', { statuses: st });
    await shot(
      s1,
      '01-guide-first-open',
      '刚打开的协同配置向导：左侧 8 步清单，第 1 步「准备」等待登录，右侧显示本站身份',
      '打开 `/guide`：右侧「本站身份」卡已经拿到后端的 `site/info`，「管理员登录」卡显示未登录。',
      [page.locator('[data-testid="guide-site-info"]'), detail.getByRole('button', { name: '登录' })],
    );
    await detail.getByRole('button', { name: '登录' }).click();
    await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({ timeout: 20_000 });
    await page.getByPlaceholder('ADMIN_USER 环境变量值').fill(USER);
    await page.getByPlaceholder('ADMIN_PASS 环境变量值').fill(PASS);
    await shot(
      s1,
      '02-login-dialog',
      `向导第 1 步点「登录」弹出的管理员登录框，已填入 ${USER} / ${PASS}`,
      '账号密码就是后端进程的 `ADMIN_USER / ADMIN_PASS`（本机两站写死为 `admin / admin`）。',
      page.getByRole('dialog').getByRole('button', { name: '登录' }),
    );
    await page.getByRole('dialog').getByRole('button', { name: '登录' }).click();
    await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({ state: 'hidden', timeout: 20_000 });
    await page.waitForTimeout(2_500);
    await hideToasts(page);
    st = await guideStatuses();
    const r1 = await recordStatuses('login');
    note('login', { statuses: st, progress: r1.progress });
    await shot(
      s1,
      '03-prepare-done',
      '登录后向导第 1 步变为「已完成」，后续步骤的判定开始对着后端实时算',
      `登录成功：第 1 步「已完成」，右上角进度「${r1.progress}」；此时向导已把本站五个连接键快照进 sessionStorage，第 8 步复原时用。`,
      [stepBtn('prepare'), page.locator('[data-testid="guide-progress"]')],
    );
    s1.after = `登录后向导自动重查：第 1 步 \`${st.prepare}\`，第 3 步 \`${st['create-env']}\`（${st['create-env'] === 'done' ? '列表里已有带 broker 的卡' : '列表里还没有带 broker 的环境卡'}），第 5 步 \`${st.activate}\`。它默认会停在**第一个没完成的步骤**。`;

    // =====================================================================
    // 2 三个词与一条主线（导览）
    // =====================================================================
    const s2 = section({
      title: '第 2 步 · 三个词与一条主线',
      intro:
        '概念页，不做判定。三个词：**环境（Env）= 本站怎么接入协同**（共用 broker + 本站身份，激活写进 `DbOption.toml` 的就是这五个键）、**站点（Site）= 环境下登记的对端节点**、**运行时（Runtime）= 本站中继此刻按哪个环境在跑**。点「去页面看导览」到 `/topology` 上认一遍三块区域。',
    });
    await stepBtn('concepts').click();
    await page.waitForTimeout(500);
    await shot(s2, '04-concepts', '向导第 2 步「三个词与一条主线」：环境 / 站点 / 运行时各对应页面哪一块', '看完概念点「去页面操作（高亮导览）」。', page.locator('[data-testid="guide-start-tour"]'));
    await goWithTour();
    await shot(s2, '05-tour-runtime-pill', '高亮导览第 1 站：页头运行时 pill 被聚光，说明卡贴在旁边', '导览 1/3：运行时 pill——每 30 秒读一次 `runtime/status`，回答「本站中继此刻按哪个环境在跑」。');
    await page.locator('[data-testid="guide-tour-next"]').click();
    await page.waitForTimeout(600);
    await shot(s2, '06-tour-env-list', '高亮导览第 2 站：左侧环境列表被聚光', '导览 2/3：环境（Env）列表，每张卡是一份「本站怎么接入协同」的配置，卡片下方四个按钮就是部署动作面。');
    await page.locator('[data-testid="guide-tour-next"]').click();
    await page.waitForTimeout(600);
    await shot(s2, '07-tour-sites-panel', '高亮导览第 3 站：右侧站点列表被聚光', '导览 3/3：站点（Site）列表，选中环境卡后列它登记的对端节点；点「完成」结束。');
    await page.locator('[data-testid="guide-tour-next"]').click();
    await page.waitForTimeout(400);
    await endTour();
    note('concepts-tour', { done: true });

    // =====================================================================
    // 3 新建环境
    // =====================================================================
    const demo = facts.demoConfig;
    const s3 = section({
      title: '第 3 步 · 新建协同环境（填本站身份 + 共用 broker）',
      intro:
        '目标：左侧多一张**带 broker 地址**的环境卡。「从 DbOption 导入」生成的本站登记卡不带连接参数，对它激活 = 按文件现状原样起中继、一个键都不改，所以真要跑中继得手填新建。向导的「要填什么」表把本站 `site/info` 的实时值列出来了，点一下就能复制——填的是**本站怎么接入协同**，不是对端长什么样。',
      after: [
        '| 字段 | 填什么 | 这一跑填的 |',
        '|---|---|---|',
        `| 环境名称 | 人能看懂的名字 | \`${DEMO_ENV}\` |`,
        `| 文件服务地址 file_server_host | 本站的 CBA 目录地址：本站广播时带上它，对端从 \`<它>/<file>.cba\` 下载 | \`${demo.file_server_host}\` |`,
        `| MQTT 主机 / 端口 | 两站共用的 broker | \`${demo.mqtt_host}\` / \`${demo.mqtt_port}\` |`,
        `| 位置标识 location | 本站的 location，全网唯一 | \`${demo.location}\` |`,
        `| 数据库编号 location_dbs | 本站自有库：只广播这些库的变更 | \`${fmtDbs(demo.location_dbs)}\`（比文件里多标了 \`${EXTRA_DBNUM}\`，向导第 3 步的「注意」就是这么建议的——第 5 步好看出激活确实改了文件） |`,
      ].join('\n'),
    });
    await openGuide('create-env');
    await shot(
      s3,
      '08-create-env-guide',
      '向导第 3 步「新建协同环境」：为什么、在页面上怎么做、要填什么（本站实时值可点击复制）、完成判定',
      '「要填什么」表格里的「本站当前值」直接来自 `GET /api/site/info`，点击即复制。',
      detail.locator('table').first(),
    );
    await goWithTour();
    await shot(s3, '09-tour-import-env', '高亮导览：「从 DbOption 导入」按钮被聚光（可选步骤）', '导览 1/2：（可选）「从 DbOption 导入」给本站登记一张卡，不改配置、不激活；这里直接「下一步」。');
    await page.locator('[data-testid="guide-tour-next"]').click();
    await page.waitForTimeout(600);
    await shot(s3, '10-tour-create-env', '高亮导览：「新建」按钮被聚光，说明卡提示按向导表格填', '导览 2/2：点亮着的「新建」——直接点它就打开表单，导览随之结束。');
    // 点亮着的目标 → 表单打开（DaisyUI modal 在遮罩之上），导览是最后一步所以结束
    await page.locator('[data-tour="create-env"]').click();
    const envModal = page.locator('dialog.modal-open').filter({ hasText: '添加新环境' });
    await envModal.waitFor({ timeout: 10_000 });
    const prefill = {
      file_server_host: await envModal.locator('input[placeholder="http://192.168.1.10:3000"]').inputValue(),
      location: await envModal.locator('input[placeholder="如: 上海园区"]').inputValue(),
      location_dbs: await envModal.locator('input[placeholder="7999,8001,8002"]').inputValue(),
      mqtt_host: await envModal.locator('input[placeholder="192.168.1.10"]').inputValue(),
      mqtt_port: await envModal.locator('input[placeholder="1883"]').inputValue(),
    };
    await envModal.locator('input[placeholder="例如: 北京总部、上海分部"]').fill(DEMO_ENV);
    await envModal.locator('input[placeholder="http://192.168.1.10:3000"]').fill(demo.file_server_host);
    await envModal.locator('input[placeholder="如: 上海园区"]').fill(demo.location);
    await envModal.locator('input[placeholder="7999,8001,8002"]').fill(demo.location_dbs.join(','));
    await envModal.locator('input[placeholder="192.168.1.10"]').fill(demo.mqtt_host);
    await envModal.locator('input[placeholder="1883"]').fill(String(demo.mqtt_port));
    await shot(
      s3,
      '11-create-env-form',
      `「添加新环境」表单，已填入 ${DEMO_ENV} 的名称、本站 CBA 地址、location、自有库与共用 broker 地址`,
      `表单默认用本站配置预填（这一跑预填的 file_server_host 是 \`${prefill.file_server_host}\`），按向导表格核对 / 改动后点「保存环境」。`,
      envModal.getByRole('button', { name: '保存环境' }),
    );
    await envModal.getByRole('button', { name: '保存环境' }).click();
    const demoCard = card(DEMO_ENV);
    await demoCard.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1_500);
    const envsAfterCreate = (await api('GET', '/api/remote-sync/envs')).body;
    const created = (envsAfterCreate?.items ?? []).find((e) => e.name === DEMO_ENV);
    if (!created) throw new Error('后端 GET envs 里没有新建的演示环境');
    facts.demoEnvId = String(created.id);
    const autoSites = (await api('GET', `/api/remote-sync/envs/${facts.demoEnvId}/sites`)).body;
    note('create-env', {
      id: facts.demoEnvId,
      prefill,
      stored: pickConnection(created),
      autoSites: (autoSites?.items ?? []).map((s) => ({ id: String(s.id), name: s.name, http_host: s.http_host })),
    });
    await hideToasts(page);
    await shot(
      s3,
      '12-created-env',
      `新环境「${DEMO_ENV}」出现在列表并被选中，右侧站点列表里已自动加入本站`,
      `保存后新卡被选中，右侧自动加入了 ${(autoSites?.items ?? []).length} 个站点（本站，HTTP 地址被填成监控台自己——第 6 步要改）。`,
      [demoCard, page.locator('table').first()],
    );
    await openGuide('create-env');
    const r3 = await recordStatuses('create-env');
    await shot(
      s3,
      '13-create-env-done',
      '回到向导：第 3 步变为「已完成」，环境表里新卡「能跑中继？」一列为「是」',
      `回到向导，第 3 步 \`${r3.statuses['create-env']}\`，进度「${r3.progress}」；环境表按 \`envs\` 实时列出每张卡能不能跑中继（有 \`mqtt_host\` 才算）。`,
      [stepBtn('create-env'), page.locator('[data-testid="guide-env-table"]')],
    );

    // =====================================================================
    // 4 测连通
    // =====================================================================
    const s4 = section({
      title: '第 4 步 · 先测连通，再动运行时',
      intro:
        '探测由后端发起，探的是「后端到目标」的网络：**测 MQTT** 让后端 TCP 连 `mqtt_host:mqtt_port`，**测文件服务** 让后端对 `file_server_host` 发一次 GET。向导页自带「帮我测」，在 `/topology` 卡片上点也一样算——两处的结果记在同一份 sessionStorage 里（按环境），刷新不丢。红条会透出后端原话（connection refused / HTTP 404 / 目标 URL / 耗时）。',
    });
    await stepBtn('probe').click();
    await page.waitForTimeout(600);
    const probeSel = detail.locator('.n-select').first();
    if (!(await text(probeSel)).includes(DEMO_ENV)) {
      await probeSel.click();
      await page.locator('.n-base-select-option', { hasText: DEMO_ENV }).first().click();
      await page.waitForTimeout(500);
    }
    await shot(s4, '14-probe-guide', '向导第 4 步「先测连通」：选好环境卡，两条「尚未探测」', '选中刚建的环境，点「帮我测 MQTT」「帮我测文件服务」。', [detail.getByRole('button', { name: '帮我测 MQTT' }), detail.getByRole('button', { name: '帮我测文件服务' })]);
    await detail.getByRole('button', { name: '帮我测 MQTT' }).click();
    await page.locator('[data-testid="guide-probe-mqtt"]').filter({ hasNotText: '尚未探测' }).waitFor({ timeout: 25_000 });
    await hideToasts(page);
    await detail.getByRole('button', { name: '帮我测文件服务' }).click();
    await page.locator('[data-testid="guide-probe-http"]').filter({ hasNotText: '尚未探测' }).waitFor({ timeout: 25_000 });
    await page.waitForTimeout(800);
    await hideToasts(page);
    const probeMqtt = await text(page.locator('[data-testid="guide-probe-mqtt"]'));
    const probeHttp = await text(page.locator('[data-testid="guide-probe-http"]'));
    const r4 = await recordStatuses('probe');
    note('probe', { mqtt: probeMqtt, http: probeHttp, statuses: r4.statuses });
    await shot(
      s4,
      '15-probe-done',
      `两条探测结果：${probeMqtt}；${probeHttp}；第 4 步变为「已完成」`,
      `这一跑的真实结果：「${probeMqtt}」「${probeHttp}」→ 第 4 步 \`${r4.statuses.probe}\`，进度「${r4.progress}」。`,
      [page.locator('[data-testid="guide-probe-mqtt"]'), page.locator('[data-testid="guide-probe-http"]'), stepBtn('probe')],
    );
    s4.after =
      '> 红只说明目标不通，不代表页面出错：broker 端口没开、`/assets/archives` 没挂出来、地址写成了对端，都在这一步就能发现，别等激活了才发现中继连不上。';

    // =====================================================================
    // 5 激活
    // =====================================================================
    const s5 = section({
      title: '第 5 步 · 激活环境（会真的改本站配置文件）',
      intro:
        '**激活** = 让本站从此按这个环境跑中继。plant-web-server 先把五个连接键写进本站 `DbOption.toml`（环境上没有的键不动），再起 / 重建中继运行态，不用重启进程；写不进文件或中继起不来整条失败，不会留下「账面已激活、跑的还是旧配置」的中间态。这是整页最重的动作——点之前确认端口后面是哪台实例。',
    });
    await stepBtn('activate').click();
    await page.waitForTimeout(600);
    await shot(s5, '16-activate-guide', '向导第 5 步「激活环境」：说明会写哪五个键，运行态 chips 此刻 active · false', '激活前运行态 chips：`active · false`。点「去页面操作」。', page.locator('[data-testid="guide-runtime-chips"]'));
    await goWithTour();
    // 向导把它正在看的卡（?env=）带了过来，/topology 先选中它再起导览：聚光框应当就在演示卡的「激活」上
    await expectTourOnDemoCard('env-activate');
    await shot(s5, '17-tour-activate', '高亮导览：演示卡上的「激活」按钮被聚光，说明卡写明后果', '导览 1/3：点亮着的「激活」——会先弹确认框把后果说清楚。');
    await page.locator('[data-tour="env-activate"]').click();
    const actDlg = confirmDlg('确认激活环境');
    await actDlg.waitFor({ timeout: 8_000 });
    const actDlgText = await text(actDlg);
    await shot(s5, '18-activate-confirm', '「确认激活环境」弹窗浮在导览遮罩之上，说明会把五个连接参数写进本站 DbOption.toml 并起 / 重建中继运行态', '确认弹窗（在导览之上可操作）：看完再点「确定」。', actDlg.getByRole('button', { name: '确定' }));
    await actDlg.getByRole('button', { name: '确定' }).click();
    await pill.getByText(`已激活 ${DEMO_ENV}`).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1_200);
    await hideToasts(page);
    await shot(s5, '19-tour-pill-after-activate', '导览第 2 站：页头 pill 已变成「运行时 · 已激活 向导演示-本站中继」，卡片挂上绿色「已激活」徽标', '导览 2/3：pill 变绿；卡片右上角「已激活」徽标、卡内「激活环境：成功」三处同时变。');
    await page.locator('[data-testid="guide-tour-next"]').click();
    await page.waitForTimeout(600);
    await shot(s5, '20-tour-apply-vs-activate', '导览第 3 站：「应用」按钮被聚光，说明卡解释「应用」只落账、「激活」才生效', '导览 3/3：plant-web-server 的「应用」只落账（标当前环境 + 一条 apply 任务），不写文件、不动运行态；要生效只有「激活」。');
    await page.locator('[data-testid="guide-tour-next"]').click();
    await page.waitForTimeout(400);
    await endTour();
    const rtAfterActivate = (await api('GET', '/api/remote-sync/runtime/status')).body;
    const lastActivation = facts.activations[facts.activations.length - 1] ?? null;
    const infoAfterActivateRaw = (await api('GET', '/api/site/info')).body ?? {};
    const infoAfterActivate = pickConnection(infoAfterActivateRaw.data ?? infoAfterActivateRaw);
    const tomlAfterActivate = await readTomlKeys();
    // site/info 跟着文件变了吗？（旧 pws 只回启动快照；2026-09-21 起每次重读）
    const siteInfoTracksFile = sameConn(infoAfterActivate, demo);
    note('activate', { dialog: actDlgText, response: lastActivation, runtime: rtAfterActivate, siteInfoAfter: infoAfterActivate, tomlAfter: tomlAfterActivate, siteInfoTracksFile });
    await openGuide('activate');
    const r5 = await recordStatuses('activate');
    await shot(
      s5,
      '21-activate-done',
      '回到向导：第 5 步「已完成」，运行态 chips 全绿（active / relay / mqtt_connected 都为 true）',
      `回到向导：第 5 步 \`${r5.statuses.activate}\`，第 7 步也随之 \`${r5.statuses.verify}\`，进度「${r5.progress}」。`,
      [page.locator('[data-testid="guide-runtime-chips"]'), stepBtn('activate')],
    );
    const fileLine = tomlAfterActivate
      ? `直接打开 \`${path.relative(ROOT, tomlPath).replace(/\\/g, '/')}\` 看：\`location_dbs = [${fmtDbs(tomlAfterActivate.location_dbs)}]\`（开跑前 \`[${fmtDbs(facts.backend.tomlBefore?.location_dbs ?? facts.ownConfig.location_dbs)}]\`），多出来的 \`${EXTRA_DBNUM}\` 就是第 3 步多标的那一个。`
      : '';
    const siteInfoLine = siteInfoTracksFile
      ? `激活后 \`GET /api/site/info\` 读回的自有库也变成了 \`[${fmtDbs(infoAfterActivate.location_dbs)}]\`——这台 plant-web-server 每次 \`site/info\` 都重读文件，向导第 8 步「文件现状」那一列因此可信。`
      : `**但激活后 \`GET /api/site/info\` 读回的自有库仍是 \`[${fmtDbs(infoAfterActivate.location_dbs)}]\`**——这台 plant-web-server（进程 \`${facts.backend?.identity?.site_id ?? ''}\`）的 \`site/info\` 回的是启动时读进内存的那份配置，激活写了文件它不知道；所以判断「文件被改了没」要看 \`runtime_config.changed\`，向导第 8 步「文件现状」那一列在这种后端上也会跟不上（plant-web-server 2026-09-21 起改为每次重读，换新版本即可）。`;
    s5.after = [
      `激活的真实响应：\`relay: ${lastActivation?.relay}\`，\`runtime_config: ${JSON.stringify(lastActivation?.runtime_config)}\`——**\`changed: true\` 就是「文件真被改了」的凭证**，\`keys\` 是写进去的五个键。${fileLine}`,
      '',
      `${siteInfoLine} \`runtime/status\`：\`active: ${rtAfterActivate?.active}\`、\`relay: ${rtAfterActivate?.relay}\`、\`mqtt_connected: ${rtAfterActivate?.mqtt_connected}\`、\`relay_location: ${rtAfterActivate?.relay_location}\`。`,
    ].join('\n');

    // =====================================================================
    // 6 登记对端站点
    // =====================================================================
    const s6 = section({
      title: '第 6 步 · 登记对端站点：探测 → 改地址 → 再探测',
      intro:
        '右表登记的是对端节点（`location` + `http_host`），给拓扑图、探测和「查看站点详情」用；中继靠 MQTT 发现对端，不靠它。保存环境时自动加进来的那个站点指向的是**你自己**（监控台地址），生产 / `vite preview` 下探测必然 `404`（开发态 `npm run dev` 会误报 200——vite 把 `/metadata.json` 当页面路由回了 index.html）。真要登记对端必须手动改成对端地址：对端 plant-web-server 的 `/files/output`，它下面有 `metadata.json`。',
    });
    await stepBtn('sites').click();
    await page.waitForTimeout(800);
    const siteTable = page.locator('[data-testid="guide-site-table"]');
    await siteTable.waitFor({ timeout: 10_000 });
    const siteRowsBefore = await siteTable.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()));
    await siteTable.locator('tbody tr').first().locator('button[title^="由后端探测"]').click();
    await siteTable.locator('tbody tr').first().locator('span.text-xs.ml-1').waitFor({ timeout: 25_000 });
    await page.waitForTimeout(600);
    const guideSiteProbe1 = await text(siteTable.locator('tbody tr').first().locator('span.text-xs.ml-1'));
    await shot(
      s6,
      '22-sites-guide-probe-404',
      `向导第 6 步的站点表：自动加入的本站行，探测结果「${guideSiteProbe1}」`,
      `向导页站点表直接探：「${guideSiteProbe1}」——指向监控台自己，所以不通。点「去页面操作」去改地址。`,
      siteTable,
    );
    await goWithTour();
    await expectTourOnDemoCard('env-test-mqtt'); // 卡片级锚点在演示卡上 = 它已被选中，站点表列的就是它的站点
    await page.locator('[data-tour="site-test-http"]').waitFor({ timeout: 10_000 });
    await shot(s6, '23-tour-site-test-http', '高亮导览：站点行末尾的「探测」按钮被聚光', '导览 1/3：点亮着的「探测」——让后端对这个站点的 `http_host` 拼上 `/metadata.json` 发一次 GET。');
    const rows = page.locator('tbody tr').filter({ has: page.locator('[data-tip="编辑站点"]') });
    const probeRow = async () => {
      const resp = page
        .waitForResponse((r) => r.request().method() === 'POST' && /^\/api\/remote-sync\/sites\/[^/]+\/test-http$/.test(new URL(r.url()).pathname), { timeout: 25_000 })
        .catch(() => null);
      await rows.first().locator('[data-tip="由后端探测该站点 HTTP 可达性"]').click();
      await resp;
      const result = rows.first().locator('[data-testid="site-test-http-result"]');
      await result.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(600);
      return { summary: await text(result), title: await result.getAttribute('title') };
    };
    const sitesBeforeEdit = (await api('GET', `/api/remote-sync/envs/${facts.demoEnvId}/sites`)).body;
    const autoHost = (sitesBeforeEdit?.items ?? [])[0]?.http_host ?? null;
    const probe1 = await probeRow(); // 点亮着的目标 → 导览进下一步（编辑）
    await hideToasts(page);
    await shot(s6, '24-tour-site-edit', `探测结果留在行里（${probe1.summary}），导览进到「编辑站点」，笔形按钮被聚光`, `第一次探测：${probe1.title}。导览 2/3：点亮着的「编辑」改地址。`);
    await page.locator('[data-tour="site-edit"]').click();
    // 导览说明卡的标题也叫「编辑站点」，所以标题要在弹窗里找
    const editDlg = page.locator('dialog.modal-open');
    await editDlg.getByRole('heading', { name: '编辑站点' }).waitFor({ timeout: 8_000 });
    const notes = `向导演示：HTTP 地址由 ${autoHost ?? '（空）'} 改为对端 Site B 的 /files/output`;
    await editDlg.locator('input[placeholder="http://192.168.1.20:8080"]').fill(PEER_SITE_HOST);
    await editDlg.locator('textarea').first().fill(notes);
    await shot(
      s6,
      '25-site-edit-form',
      `「编辑站点」弹窗浮在导览之上，HTTP 服务地址改成了 ${PEER_SITE_HOST}，备注写明了改动原因`,
      '把「HTTP 服务地址」改成对端真实可达的 `/files/output`，备注写明原因，点「保存修改」。',
      [editDlg.locator('input[placeholder="http://192.168.1.20:8080"]'), editDlg.getByRole('button', { name: '保存修改' })],
    );
    await editDlg.getByRole('button', { name: '保存修改' }).click();
    await page.locator('dialog.modal-open').filter({ hasText: '编辑站点' }).waitFor({ state: 'hidden', timeout: 15_000 });
    await page.waitForTimeout(1_200);
    await hideToasts(page);
    // 导览第 3 站是「添加更多对端」，看一眼就结束
    await shot(s6, '26-tour-add-site', '导览第 3 站：「添加站点」按钮被聚光，说明可以手填或粘 site/info JSON 导入更多对端', '导览 3/3：要加更多对端点「添加站点」；这里点「完成」结束导览。');
    await page.locator('[data-testid="guide-tour-next"]').click().catch(() => {});
    await page.waitForTimeout(400);
    await endTour();
    const sitesNow = (await api('GET', `/api/remote-sync/envs/${facts.demoEnvId}/sites`)).body;
    const savedSite = (sitesNow?.items ?? [])[0] ?? {};
    const saved = savedSite.http_host === PEER_SITE_HOST && savedSite.notes === notes;
    const probe2 = await probeRow();
    await hideToasts(page);
    await shot(s6, '27-site-probe-ok', `改完地址再探测：${probe2.summary}`, `第二次探测：${probe2.title}。`, rows.first());
    note('site-actions', { rows: siteRowsBefore, guideProbeBefore: guideSiteProbe1, autoHost, probeBefore: probe1, newHost: PEER_SITE_HOST, savedToBackend: saved, probeAfter: probe2 });
    await openGuide('sites');
    const r6 = await recordStatuses('sites');
    await shot(
      s6,
      '28-sites-done',
      '回到向导：第 6 步「已完成」，站点表里 http_host 已是对端地址',
      `回到向导：在 /topology 上探的那次可达已被记住，第 6 步 \`${r6.statuses.sites}\`，进度「${r6.progress}」。`,
      [stepBtn('sites'), page.locator('[data-testid="guide-site-table"]')],
    );
    s6.after = [
      `自动加入的本站行原来的地址是 \`${autoHost}\`（监控台自己）：改之前 \`${probe1.title}\`；改成对端 \`${PEER_SITE_HOST}\` 之后 \`${probe2.title}\`。保存后回查后端 \`GET envs/{id}/sites\`，\`http_host\` 与 \`notes\` **${saved ? '都已更新' : '没有按预期更新'}**。`,
    ].join('\n');

    // =====================================================================
    // 7 核对运行态与台账（含对端也激活）
    // =====================================================================
    const s7 = section({
      title: '第 7 步 · 核对运行态与台账（对端也要激活自己的环境）',
      intro:
        '页面上的成功提示不等于后端真在跑：`runtime/status` 的 `active / relay / mqtt_connected` 才是中继活着的证据；每一次广播 / 接收都记在 SQLite 台账里，`/ledger` 能点开看 RefNo 级变更清单。**对端也要激活自己的环境**（同一 broker、不同 location），两边才互相收得到——这一跑让对端 Site B 按它自己的 `site/info` 建卡并激活（走它自己的 API，监控台只接着 Site A）。',
    });
    // 对端：建卡 + 激活
    const peerCreated = await peerApi('POST', '/api/remote-sync/envs', { name: PEER_ENV, ...facts.peerConfig });
    facts.peerEnvId = peerCreated.body?.item?.id ? String(peerCreated.body.item.id) : peerCreated.body?.data?.id ? String(peerCreated.body.data.id) : null;
    const peerAct = facts.peerEnvId ? await peerApi('POST', `/api/remote-sync/envs/${facts.peerEnvId}/activate`) : null;
    const peerRt = (await peerApi('GET', '/api/remote-sync/runtime/status')).body;
    note('peer-activate', { api: PEER, config: facts.peerConfig, envId: facts.peerEnvId, status: peerAct?.status ?? null, relay: peerAct?.body?.relay ?? null, runtime_config: peerAct?.body?.runtime_config ?? null, runtime: peerRt });
    await stepBtn('verify').click();
    await page.waitForTimeout(600);
    const chips = await text(page.locator('[data-testid="guide-runtime-chips"]'));
    const ledgerBox = await text(page.locator('[data-testid="guide-ledger"]'));
    const rtVerify = (await api('GET', '/api/remote-sync/runtime/status')).body;
    const ledgerSummary = (await api('GET', '/api/remote-sync/ledger/summary')).body;
    note('verify', { chips, ledger: ledgerBox, runtime: rtVerify, ledgerSummary });
    await shot(s7, '29-verify-guide', '向导第 7 步「核对运行态与台账」：运行态 chips 全为 true，台账汇总有行数', `运行态 chips：「${chips}」；台账：「${ledgerBox}」。`, [page.locator('[data-testid="guide-runtime-chips"]'), page.locator('[data-testid="guide-ledger"]')]);
    await page.goto(`${base}ledger`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2_500);
    await hideToasts(page);
    await shot(s7, '30-ledger-view', '侧栏「中继台账」视图：汇总 chips 与广播 / 接收记录', '「中继台账」：激活成功时三张表就建好了；有变更被广播 / 接收后这里出现行，点任意一行看 RefNo 级变更清单。');
    s7.after = [
      `本站 \`runtime/status\`：\`active: ${rtVerify?.active}\`、\`relay: ${rtVerify?.relay}\`、\`mqtt_connected: ${rtVerify?.mqtt_connected}\`、\`relay_location: ${rtVerify?.relay_location}\`。台账 \`ledger/summary\`：rows ${ledgerSummary?.rows_total ?? '—'} · changes ${ledgerSummary?.changes_total ?? '—'} · problems ${ledgerSummary?.problems_total ?? '—'}。`,
      '',
      `对端 Site B（\`${PEER}\`）按自己的身份（location \`${facts.peerConfig.location}\`、broker \`${facts.peerConfig.mqtt_host}:${facts.peerConfig.mqtt_port}\`、自有库 \`[${fmtDbs(facts.peerConfig.location_dbs)}]\`）建卡激活：HTTP ${peerAct?.status ?? '—'}，\`relay: ${peerAct?.body?.relay ?? '—'}\`，\`runtime_config.changed: ${peerAct?.body?.runtime_config?.changed ?? '—'}\`（${peerAct?.body?.runtime_config?.changed === false ? '它的文件本来就是这几个值，所以一个字节没改' : '它的文件被写了'}）；它的 \`runtime/status\`：\`active: ${peerRt?.active}\`、\`relay_location: ${peerRt?.relay_location}\`。两站同一 broker、不同 location，至此互相收得到。`,
    ].join('\n');

    // =====================================================================
    // 8 停止运行时 / 复原
    // =====================================================================
    const s8 = section({
      title: '第 8 步 · 停止运行时 / 复原',
      intro:
        '「停止运行时」停的是运行态不是配置：MQTT 订阅与源文件轮询都停、pill 回到「运行中 · 未激活环境」，但 `DbOption.toml` 里刚写进去的五个键**不回滚**、账面「当前环境」标记也留着，再点一次「激活」就按同一份配置跑起来。要把文件写回原值：按第 1 步记下的五个键新建一张「恢复卡」并激活；再激活一次，响应 `runtime_config.changed` 应为 `false`。向导第 8 步把开跑前的五个键列在那里，就是给这一步用的。',
    });
    await openGuide('stop');
    const snapshotEl = page.locator('[data-testid="guide-snapshot"]');
    const verdictEl = page.locator('[data-testid="guide-snapshot-verdict"]');
    const verdict = (await verdictEl.count()) ? { kind: await verdictEl.getAttribute('data-verdict'), text: await text(verdictEl) } : null;
    const tomlAtStop = await readTomlKeys();
    const fileReallyDiffers = tomlAtStop && facts.backend.tomlBefore ? !sameConn(tomlAtStop, facts.backend.tomlBefore) : null;
    note('stop-guide', { snapshot: await text(snapshotEl).catch(() => ''), verdict, tomlNow: tomlAtStop, fileReallyDiffers });
    const verdictCaption = !verdict
      ? '向导把开跑前记下的五个键列在这里，复原时照着建卡。'
      : verdict.kind === 'differs'
        ? `向导对照「开跑前快照 vs 文件现状」后提示：「${verdict.text}」——第 5 步确实改了文件，复原时按「开跑前」那一列建卡激活。`
        : fileReallyDiffers
          ? `向导对照后显示「${verdict.text}」——**但文件其实已被第 5 步改过**（直接读文件：\`location_dbs = [${fmtDbs(tomlAtStop.location_dbs)}]\`）：这台后端的 \`site/info\` 只回启动快照，「文件现状」一列跟不上；以第 5 步的 \`runtime_config.changed: true\` 为准，照样要复原。`
          : `向导对照后显示「${verdict.text}」。`;
    await shot(s8, '31-stop-guide', '向导第 8 步「停止运行时 / 复原」：开跑前记下的五个键与文件现状的对照表', verdictCaption, snapshotEl);
    await goWithTour();
    await shot(s8, '32-tour-stop-runtime', '高亮导览：页头「停止运行时」按钮被聚光', '导览：点亮着的「停止运行时」——停中继运行态，不回滚 DbOption.toml，不清账面标记。');
    await page.locator('[data-tour="stop-runtime"]').click();
    const stopDlg = confirmDlg('确认停止运行时');
    await stopDlg.waitFor({ timeout: 8_000 });
    await shot(s8, '33-stop-confirm', '「确认停止运行时」弹窗', '确认后后端停掉 MQTT 订阅与源文件轮询。', stopDlg.getByRole('button', { name: '确定' }));
    await stopDlg.getByRole('button', { name: '确定' }).click();
    await page.waitForTimeout(3_000);
    await endTour();
    await hideToasts(page);
    const rtAfterStop = (await api('GET', '/api/remote-sync/runtime/status')).body;
    const envsAfterStop = (await api('GET', '/api/remote-sync/envs')).body;
    const pillAfterStop = await text(pill);
    const infoAfterStopRaw = (await api('GET', '/api/site/info')).body ?? {};
    const infoAfterStop = pickConnection(infoAfterStopRaw.data ?? infoAfterStopRaw);
    note('stop-runtime', { pill: pillAfterStop, runtime: rtAfterStop, ledgerEnvId: ledgerEnvIdOf(envsAfterStop), siteInfoAfter: infoAfterStop });
    await shot(s8, '34-stopped', `停止后：pill 变为「${pillAfterStop}」`, `停止后的真实状态：pill「${pillAfterStop}」，后端 \`runtime.active = ${rtAfterStop?.active}\`。`, pill);
    await openGuide('stop');
    const r8 = await recordStatuses('stop');
    const tomlAfterStop = await readTomlKeys();
    await shot(s8, '35-guide-after-stop', '回到向导：第 5、7 步退回「未完成」，第 8 步的对照表还在', `停止后向导第 5 步 \`${r8.statuses.activate}\`、第 7 步 \`${r8.statuses.verify}\`（运行态没了），但文件还是第 5 步改过的那份——所以还要复原。`, [stepBtn('activate'), page.locator('[data-testid="guide-snapshot"]')]);
    const fileAfterStopLine = tomlAfterStop
      ? `文件里 \`location_dbs\` 仍是 \`[${fmtDbs(tomlAfterStop.location_dbs)}]\``
      : `\`site/info\` 读回的自有库是 \`[${fmtDbs(infoAfterStop.location_dbs)}]\``;
    s8.after = [
      `停完后端 \`runtime.active = ${rtAfterStop?.active}\`、\`env_id = ${rtAfterStop?.env_id}\`，账面 \`envs[].active\` 仍指向 \`${ledgerEnvIdOf(envsAfterStop)}\`，${fileAfterStopLine}——这就是「停的是运行态不是配置」。`,
      '',
      '**复原**按向导说的做：用开跑前的五个键新建一张「恢复卡」→ 激活（`changed: true`，写回）→ 再激活一次（`changed: false`，说明文件已与原值一致）→ 停止运行时 → 删掉演示卡与恢复卡。本教程的脚本在收尾时就是这么做的，两站都做，结果见附录 B；自己手动做时在页面上新建 / 激活两次即可，`changed` 的值在「激活环境」结果条与 `runtime_config` 里都看得到。',
    ].join('\n');
  } catch (err) {
    runError = String(err?.message ?? err);
    console.error(`步骤失败：${runError}`);
    await page.screenshot({ path: path.join(shotDir, '99-error.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    await server.close();
  }

  // ---- 收尾：无论上面成没成，都把两站恢复成开跑前的样子 ----
  facts.error = runError;
  facts.cleanup = await cleanup(api, before, { demoEnvId: facts.demoEnvId, restoreConfig: facts.ownConfig, changedByRun: facts.activations.some((a) => a.runtime_config?.changed === true) });
  facts.peerCleanup = await cleanup(peerApi, peerBefore, {
    demoEnvId: facts.peerEnvId,
    restoreConfig: facts.peerConfig,
    changedByRun: facts.steps.some((s) => s.name === 'peer-activate' && s.runtime_config?.changed === true),
  });
  // 文件层面再核一次（能读到文件时）：五个键与开跑前逐键相等
  facts.tomlAfterCleanup = await readTomlKeys();
  facts.tomlRestoredByFile = facts.tomlAfterCleanup && facts.backend?.tomlBefore ? sameConn(facts.tomlAfterCleanup, facts.backend.tomlBefore) : null;
  const restoredOk = (c) => Boolean(c?.envIdsRestored && c?.runtimeRestored && c?.ledgerRestored && c?.configRestored !== false && !c?.error);
  facts.ok = !runError && restoredOk(facts.cleanup) && restoredOk(facts.peerCleanup) && facts.tomlRestoredByFile !== false && facts.pageErrors.length === 0;

  if (!runError) await writeFile(mdPath, renderMarkdown(), 'utf8');
  await writeFile(resultPath, `${JSON.stringify(facts, null, 2)}\n`, 'utf8');
  const total = sections.reduce((n, s) => n + s.shots.length, 0);
  console.log('');
  console.log(`截图 ${total} 张 → ${SHOT_DIR_REL}/`);
  console.log(runError ? `教程      → 未重写（本轮有步骤失败：${runError}）` : `教程      → ${MD_REL}`);
  console.log(`事实记录  → ${RESULT_REL}`);
  for (const [label, c] of [['本站', facts.cleanup], ['对端', facts.peerCleanup]]) {
    console.log(`收尾复原（${label}）：envIdsRestored=${c?.envIdsRestored} runtimeRestored=${c?.runtimeRestored} ledgerRestored=${c?.ledgerRestored} configRestored=${c?.configRestored}${c?.error ? ` error=${c.error}` : ''}`);
  }
  console.log(`pageErrors=${facts.pageErrors.length}`);
  process.exitCode = facts.ok ? 0 : 1;
}

/** 把一台站恢复成开跑前：删演示卡 → 需要时用恢复卡写回文件并二次激活核 changed=false → 运行态 / 账面标记复原 → 删恢复卡 */
async function cleanup(client, before, { demoEnvId, restoreConfig, changedByRun }) {
  const out = { api: client.base, steps: [] };
  const step = (name, data) => out.steps.push({ name, ...data });
  try {
    if (demoEnvId) {
      // pws 2026-09-21 起 DELETE env 级联删站点；老版本要先删站点，这里两种都兼容
      const sites = (await client('GET', `/api/remote-sync/envs/${demoEnvId}/sites`)).body;
      for (const s of sites?.items ?? []) step('delete-site', { id: String(s.id), status: (await client('DELETE', `/api/remote-sync/sites/${s.id}`)).status });
      step('delete-demo-env', { id: demoEnvId, status: (await client('DELETE', `/api/remote-sync/envs/${demoEnvId}`)).status });
    }
    out.tomlChangedByRun = Boolean(changedByRun);
    let restoreEnvId = null;
    if (changedByRun && restoreConfig) {
      const created = await client('POST', '/api/remote-sync/envs', { name: RESTORE_ENV, ...restoreConfig });
      restoreEnvId = created.body?.item?.id ? String(created.body.item.id) : created.body?.data?.id ? String(created.body.data.id) : null;
      step('create-restore-env', { id: restoreEnvId, status: created.status, config: restoreConfig });
      if (!restoreEnvId) throw new Error('建不出恢复卡，DbOption.toml 没法写回原值');
      const first = await client('POST', `/api/remote-sync/envs/${restoreEnvId}/activate`);
      step('activate-restore-env', { id: restoreEnvId, status: first.status, runtime_config: first.body?.runtime_config ?? null });
      const second = await client('POST', `/api/remote-sync/envs/${restoreEnvId}/activate`);
      step('activate-restore-env-verify', { id: restoreEnvId, status: second.status, runtime_config: second.body?.runtime_config ?? null });
      const keys = second.body?.runtime_config?.keys ?? [];
      const expectKeys = CONNECTION_KEYS.filter((k) => !(k === 'location_dbs' && restoreConfig.location_dbs.length === 0));
      out.configRestored = first.status === 200 && second.status === 200 && second.body?.runtime_config?.changed === false && expectKeys.every((k) => keys.includes(k));
    } else {
      out.configRestored = changedByRun ? false : null;
    }
    if (before.runtimeEnvId) {
      step('reactivate-original', { id: before.runtimeEnvId, status: (await client('POST', `/api/remote-sync/envs/${before.runtimeEnvId}/activate`)).status });
    } else {
      step('stop-runtime', { status: (await client('POST', '/api/remote-sync/runtime/stop')).status });
    }
    if (restoreEnvId) step('delete-restore-env', { id: restoreEnvId, status: (await client('DELETE', `/api/remote-sync/envs/${restoreEnvId}`)).status });
    if (before.ledgerEnvId && before.ledgerEnvId !== before.runtimeEnvId) {
      step('reapply-ledger-flag', { id: before.ledgerEnvId, status: (await client('POST', `/api/remote-sync/envs/${before.ledgerEnvId}/apply`)).status });
    }
    const after = {
      envs: (await client('GET', '/api/remote-sync/envs')).body,
      runtime: (await client('GET', '/api/remote-sync/runtime/status')).body,
    };
    const afterIds = (after.envs?.items ?? []).map((e) => String(e.id)).sort();
    out.envIdsRestored = JSON.stringify(afterIds) === JSON.stringify([...before.envIds].sort());
    out.runtimeRestored = runtimeEnvIdOf(after.runtime) === before.runtimeEnvId;
    out.ledgerRestored = ledgerEnvIdOf(after.envs) === before.ledgerEnvId;
    out.leftoverEnvIds = afterIds.filter((id) => !before.envIds.includes(id));
    out.runtimeAfter = after.runtime;
  } catch (err) {
    out.error = String(err?.message ?? err);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
function renderMarkdown() {
  const d = new Date(facts.generatedAt);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const own = facts.ownConfig ?? {};
  const peer = facts.peerConfig ?? {};
  const out = [];
  out.push('# 协同配置向导 · 实操教程（真浏览器 + 真后端，照着 `/guide` 走完 8 步）');
  out.push('');
  out.push('> 适用对象：第一次要把一个站点接入异地协同、想在监控台里边学边配的实施 / 运维人员。');
  out.push('> 预计用时：10–15 分钟。');
  out.push(
    `> 生成方式：本文由 \`scripts/collab-guide-live-tutorial.mjs\` 于 ${day} 自动生成——Playwright 开真实 Chrome，照着监控台自带的「协同配置向导」（\`/guide\`）**从第 1 步走到第 8 步**，每一步先截向导页，再点「去页面操作」进 \`/topology\` 看高亮导览、在真实按钮上做动作，回来看判定是否变绿。后端是真后端（\`${facts.api}\`，plant-web-server 中继模式；对端 \`${facts.peer}\`），截图里的每一条提示都是它当时的真实响应。`,
  );
  out.push('> 与另两份教程的分工：`topology-deploy-tutorial.md` 用 mock 喂页面、数据整齐可重复；`topology-deploy-live-tutorial.md` 直接在 `/topology` 上对真后端点按钮；**这一份走向导**——多了「为什么」「填什么（本站实时值）」「完成判定」三样，适合第一次上手。');
  out.push('> 收尾：本次新建的环境与站点跑完即删；激活改写过的 `DbOption.toml` 用开跑前记下的五个键写回原值并再激活一次确认无差；两站运行态恢复原状（核对见附录 B）。');
  out.push('');
  out.push('## 你将学会');
  out.push('');
  out.push('- 在向导里看清「本站身份」与登录态，再决定动不动手（第 1 步）。');
  out.push('- 分清环境 / 站点 / 运行时三个词，并在 `/topology` 上认出对应的三块区域（第 2 步）。');
  out.push('- 照着向导的「要填什么」表新建协同环境，用「帮我测」在动运行时之前确认 broker 与本站 CBA 目录可达（第 3、4 步）。');
  out.push('- 激活并核实 `runtime_config.changed` / `runtime/status`，把自动加进来的「本站」站点改成对端并再探测（第 5、6 步）。');
  out.push('- 核对运行态与台账、让对端也激活，最后停止运行时并把配置文件复原（第 7、8 步）。');
  out.push('');
  out.push('## 0. 这一跑的现场');
  out.push('');
  out.push('| 项 | 值 |');
  out.push('|---|---|');
  out.push(`| 后端 | \`${facts.api}\`（plant-web-server，\`identity.mode = ${facts.backend?.identity?.mode ?? '?'}\`，site_id \`${facts.backend?.identity?.site_id ?? '?'}\`） |`);
  out.push(`| 对端 Site B | \`${facts.peer}\`（location \`${peer.location}\`，自有库 \`[${fmtDbs(peer.location_dbs ?? [])}]\`） |`);
  out.push(`| 本站 DbOption.toml 的五个连接键（开跑前） | broker \`${own.mqtt_host}:${own.mqtt_port}\` · location \`${own.location}\` · 自有库 \`[${fmtDbs(own.location_dbs ?? [])}]\` · CBA \`${own.file_server_host}\` |`);
  out.push(`| 开跑前环境数 / 运行态 env / 账面当前环境 | ${facts.backend?.envCountBefore} 张 / ${facts.backend?.runtimeEnvIdBefore ?? '无'} / ${facts.backend?.ledgerEnvIdBefore ?? '无'} |`);
  out.push(`| 前端 | 生产构建（\`vite preview\`，自动登录默认关，第 1 步要真登录） |`);
  out.push(`| 生成时间 | ${d.toLocaleString('zh-CN', { hour12: false })}（本机时区） |`);
  out.push('');
  out.push(
    '> 本机这套两站环境由 `scripts/local-remote-collab-setup.ps1` 生成在 `../plant-web-server/runtime/local-collab/`，起法见那里的 `COMMANDS.md`。**别把本教程的脚本指向生产后端**——它会真的建环境、真的改配置（两站都改）。',
  );
  out.push('');

  sections.forEach((s) => {
    out.push(`## ${s.title}`);
    out.push('');
    if (s.intro) {
      out.push(s.intro);
      out.push('');
    }
    for (const shot of s.shots) {
      out.push(`![${shot.alt}](./screenshots/collab-guide-live/${shot.file})`);
      out.push('');
      out.push(`*${shot.caption}*`);
      out.push('');
    }
    if (s.after) {
      out.push(s.after);
      out.push('');
    }
  });

  out.push('## 附录 A · 向导的判定在每一步之后长什么样');
  out.push('');
  out.push('向导右上角的进度和左侧每一步的状态都是对着后端实时算的。下面是这一跑每做完一件事回到向导时读到的状态（`done` 已完成 / `todo` 未完成 / `info` 讲解页 / `locked` 需先登录）：');
  out.push('');
  out.push(`| 做完什么 | ${GUIDE_STEP_TITLES.map((t, i) => `${i + 1} ${t}`).join(' | ')} | 进度 |`);
  out.push(`|---|${GUIDE_STEP_TITLES.map(() => '---').join('|')}|---|`);
  const order = ['prepare', 'concepts', 'create-env', 'probe', 'activate', 'sites', 'verify', 'stop'];
  for (const g of facts.guideStatuses) {
    out.push(`| ${g.after} | ${order.map((id) => `\`${g.statuses[id] ?? '—'}\``).join(' | ')} | ${g.progress} |`);
  }
  out.push('');
  out.push('这一跑真实发生的步骤（`docs/e2e-smoke/collab-guide-live-tutorial-result.json` 里有完整版）：');
  out.push('');
  out.push('| 步骤 | 结果 |');
  out.push('|---|---|');
  for (const st of facts.steps) out.push(`| \`${st.name}\` | ${summarizeStep(st)} |`);
  out.push('');
  out.push('页面在这一跑里发出的写请求（`GET` 不计）：');
  out.push('');
  for (const w of dedupeWrites(facts.writes)) out.push(`- \`${w}\``);
  out.push('');
  out.push('## 附录 B · 收尾把两站恢复成什么样');
  out.push('');
  out.push(
    '教程会真的改两站——包括 `DbOption.toml`——所以脚本跑完必须能还原。核对方式：env 集合、运行态 env、账面「当前环境」标记三样跟开跑前逐一对比；文件那一项靠「用开跑前的五个键建一张临时卡激活写回，再激活一次看 `changed = false`」——第二次一个字节都没改，说明文件已经与原值一致。这正是向导第 8 步教的复原法。',
  );
  out.push('');
  for (const [label, c, isPrimary] of [['本站 Site A', facts.cleanup ?? {}, true], ['对端 Site B', facts.peerCleanup ?? {}, false]]) {
    out.push(`### ${label}（\`${c.api ?? ''}\`）`);
    out.push('');
    out.push('| 核对项 | 结果 |');
    out.push('|---|---|');
    out.push(`| 本轮的激活是否改写过 DbOption.toml | ${c.tomlChangedByRun ? '是' : '否'} |`);
    out.push(`| DbOption.toml 已写回原值（第二次激活 \`changed = false\`） | ${c.configRestored === null || c.configRestored === undefined ? '不需要（没改过）' : c.configRestored ? '是' : '**否**'} |`);
    if (isPrimary && facts.tomlRestoredByFile !== null && facts.tomlRestoredByFile !== undefined) {
      out.push(`| 直接读文件核对：五个键与开跑前逐键相等 | ${facts.tomlRestoredByFile ? '是' : '**否**'}（\`location_dbs = [${fmtDbs(facts.tomlAfterCleanup?.location_dbs ?? [])}]\`） |`);
    }
    out.push(`| env 集合与开跑前一致 | ${c.envIdsRestored ? '是' : '否'} |`);
    out.push(`| 运行态 env 与开跑前一致 | ${c.runtimeRestored ? '是' : '否'} |`);
    out.push(`| 账面「当前环境」标记与开跑前一致 | ${c.ledgerRestored ? '是' : '否'} |`);
    out.push(`| 残留的 env | ${(c.leftoverEnvIds ?? []).length === 0 ? '无' : (c.leftoverEnvIds ?? []).join(', ')} |`);
    out.push(`| 收尾后 \`runtime.active\` | \`${c.runtimeAfter?.active}\` |`);
    if (c.error) out.push(`| 收尾出错 | ${c.error} |`);
    out.push('');
    out.push('收尾动作依次是：');
    out.push('');
    for (const st of c.steps ?? []) {
      const extra = st.runtime_config ? `，runtime_config \`${JSON.stringify(st.runtime_config)}\`` : '';
      out.push(`- \`${st.name}\`${st.id ? ` · id \`${st.id}\`` : ''} → HTTP ${st.status}${extra}`);
    }
    out.push('');
  }
  out.push(`页面 JS 报错（pageerror）：${facts.pageErrors.length} 条。`);
  out.push('');
  out.push(
    '> 自己手动操作真实环境时同一招管用：**动配置之前先把向导第 1 步「本站身份」卡里的五个键记下来**（向导会自动快照到第 8 步），出事就建一张填着原值的环境点「激活」写回去；「从 DbOption 导入」那张卡不带连接参数，退不回任何东西。',
  );
  out.push('');
  return `${out.join('\n')}\n`;
}

function summarizeStep(st) {
  const skip = new Set(['name', 'at']);
  const parts = [];
  for (const [k, v] of Object.entries(st)) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      const compact = JSON.stringify(v);
      parts.push(`${k}: \`${compact.length > 160 ? `${compact.slice(0, 157)}…` : compact}\``);
    } else {
      parts.push(`${k}: \`${String(v)}\``);
    }
  }
  return parts.join('，') || '—';
}

function dedupeWrites(writes) {
  const seen = new Map();
  for (const w of writes) {
    const key = `${w.method} ${w.path.replace(/(env|site)-\d{6,}(-\d+)?/g, '{id}')} → ${w.status}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
}

main().catch(async (err) => {
  console.error(err);
  try {
    facts.error = String(err?.message ?? err);
    await writeFile(resultPath, `${JSON.stringify(facts, null, 2)}\n`, 'utf8');
  } catch {
    /* 记录失败就算了，原始错误更重要 */
  }
  process.exit(1);
});
