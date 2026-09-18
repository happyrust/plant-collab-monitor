// 异地部署操作教程 · 真浏览器 + 真后端自动生成（截图 + Markdown）—— plant-web-server 中继站点版
//
// 与 scripts/topology-deploy-tutorial.mjs 的区别只有一个，但很关键：那一份用 mock 喂页面，
// 这一份**真的在浏览器里把操作做一遍**——登录、从 DbOption 导入、新建环境、测 MQTT / 测文件服务、
// 激活（真把连接参数写进本站 DbOption.toml 并起中继运行态）、应用、站点探测与编辑、停止运行时，
// 每一步的截图都是真实后端的真实响应。
//
// 后端语义按 plant-web-server（2026-09-16 起的站点后端，中继在它的 src/relay/）写：
//   · 环境（env）= 本站怎么接入协同：共用 broker（mqtt_host / mqtt_port）+ 本站身份（location / location_dbs /
//     file_server_host——对端来这里下载本站广播的 CBA）。
//   · 激活 = 把这五个键写进本站 DbOption.toml（env 上没有的键不动）→ 起 / 重建中继运行态（MQTT 订阅 + 源文件轮询）。
//   · 应用 = 只落账（标为当前环境 + 记一条 apply 任务），不写文件、不动运行态。
//   · 从 DbOption 导入 = 按本站 id 生成 / 覆盖一张「本站登记卡」（工程 / 端口 / 配置文件路径），**不带**连接参数。
//   · 停止运行时 = 停中继（runtime.active → false），配置文件不回滚，账面上的「当前环境」标记也不动。
//
// 收尾（无论中途成败都做）：删掉本次新建的 env / 站点；若本轮的激活真改写了 DbOption.toml，就用开跑前
// `GET /api/site/info` 记下的五个键建一张临时「恢复卡」激活写回，再激活一次确认 changed=false（文件已与原值一致）；
// 运行态与账面「当前环境」标记恢复成开跑前的样子；临时卡删掉。
//
// ⚠ 因此**只对隔离环境跑**（本机 ../plant-web-server/runtime/local-collab 的 Site A），别指向生产后端。
//
// 产物：
//   docs/tutorials/screenshots/topology-deploy-live/*.png    截图（入库）
//   docs/tutorials/topology-deploy-live-tutorial.md          教程 Markdown（整篇由本脚本生成，改文案改脚本）
//   docs/e2e-smoke/topology-deploy-live-tutorial-result.json 这一跑的事实记录（做了什么、收尾是否复原）
//
// 用法：
//   node scripts/topology-deploy-live-tutorial.mjs --api http://127.0.0.1:4100 --peer http://127.0.0.1:4101
//   node scripts/topology-deploy-live-tutorial.mjs --headed          # 有头模式看着它操作
//   node scripts/topology-deploy-live-tutorial.mjs --build           # 强制先 vite build
//
// 参数 / 环境变量：
//   --api   SMOKE_API_TARGET   目标后端（默认 http://127.0.0.1:4100，即 Site A）
//   --peer                     教程里扮演「对端站点」的地址（默认 http://127.0.0.1:4101，即 Site B）
//   --user  SMOKE_ADMIN_USER   默认 admin      --pass SMOKE_ADMIN_PASS 默认 admin
//   --port  SMOKE_PREVIEW_PORT vite preview 端口（默认 4179，避开 live smoke 的 4178）
//   SMOKE_BROWSER_EXECUTABLE   Chrome 路径
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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
const previewPort = Number(args.port ?? process.env.SMOKE_PREVIEW_PORT ?? 4179);
const SHOT_DIR_REL = 'docs/tutorials/screenshots/topology-deploy-live';
const MD_REL = 'docs/tutorials/topology-deploy-live-tutorial.md';
const RESULT_REL = 'docs/e2e-smoke/topology-deploy-live-tutorial-result.json';
const shotDir = path.resolve(ROOT, SHOT_DIR_REL);
const mdPath = path.resolve(ROOT, MD_REL);
const resultPath = path.resolve(ROOT, RESULT_REL);
const executablePath =
  process.env.SMOKE_BROWSER_EXECUTABLE ??
  (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

const DEMO_ENV = '演示环境-总部中继';
const RESTORE_ENV = '教程收尾-恢复本站配置（临时）';
/** 教程里多标一个自有库，让「激活会真的改写 DbOption.toml」看得见；收尾写回原值 */
const EXTRA_DBNUM = 6001;
/** 对端站点的 HTTP 服务地址：站点探测会对它拼 /metadata.json，本机 Site B 的 output/ 下有这个 fixture */
const PEER_SITE_HOST = `${PEER}/files/output`;
const CONNECTION_KEYS = ['mqtt_host', 'mqtt_port', 'file_server_host', 'location', 'location_dbs'];

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
// 直连 API：开跑前的事实、收尾复原、以及“页面说的和后端存的是不是一回事”的对照
// ---------------------------------------------------------------------------
let TOKEN = null;
async function api(method, p, body) {
  const headers = { accept: 'application/json' };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${API}${p}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  try {
    return { status: r.status, body: JSON.parse(text) };
  } catch {
    return { status: r.status, body: null, text: text.slice(0, 200) };
  }
}
/** plant-web-server ≥ 2026-09-16：runtime/status 带中继运行态 active / env_id / relay / mqtt_connected */
const hasRelayRuntime = (rt) => Boolean(rt) && typeof rt.active === 'boolean' && typeof rt.relay === 'boolean';
/** 运行态上正在跑的 env（没跑 = null） */
const runtimeEnvIdOf = (rt) => (hasRelayRuntime(rt) && rt.active && rt.env_id ? String(rt.env_id) : null);
/** 账面上标为「当前环境」的 env（envs[].active，apply / activate 都会改它，stop 不改） */
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
  steps: [],
  apiCalls: [],
  writes: [],
  /** 页面发出的 activate 的响应里 runtime_config（path / keys / changed）——「激活真改了文件吗」的证据 */
  activations: [],
  consoleErrors: [],
  pageErrors: [],
  demoEnvId: null,
  importedEnvId: null,
  importedPreexisted: false,
  cleanup: null,
  ok: false,
};
const note = (name, data) => facts.steps.push({ name, at: new Date().toISOString(), ...data });
const fmtDbs = (list) => (list.length ? list.join(', ') : '（空）');

async function main() {
  await mkdir(shotDir, { recursive: true });
  await mkdir(path.dirname(resultPath), { recursive: true });

  // ---- 开跑前：登录 + 记下原始状态 ----
  const health = await api('GET', '/api/health');
  const login = await api('POST', '/api/admin/auth/login', { username: USER, password: PASS });
  TOKEN = login.body?.data?.token ?? login.body?.token ?? null;
  if (!TOKEN) throw new Error(`后端 ${API} 登录失败：HTTP ${login.status} ${JSON.stringify(login.body)?.slice(0, 200)}`);
  const identity = (await api('GET', '/api/site/identity')).body ?? {};
  const before = {
    envs: (await api('GET', '/api/remote-sync/envs')).body,
    runtime: (await api('GET', '/api/remote-sync/runtime/status')).body,
  };
  before.runtimeEnvId = runtimeEnvIdOf(before.runtime);
  before.ledgerEnvId = ledgerEnvIdOf(before.envs);
  before.envIds = (before.envs?.items ?? []).map((e) => String(e.id));

  // 只认 plant-web-server（detached 运行时 + 中继运行态）。旧 plant-model-gen 的 web_server 已经没有中继，
  // 而且它的 apply 会写文件、import 会带连接参数——下面每一节的叙述和收尾复原都按 pws 的行为写，形状不对就别跑。
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
  if (missing.length) {
    throw new Error(`GET /api/site/info 缺 ${missing.join(' / ')}，收尾没法把 DbOption.toml 写回原值，不往下激活`);
  }
  const siteConfig = (await api('GET', '/api/site-config')).body ?? {};
  facts.backend = {
    shape: 'pws',
    identity,
    health: health.body,
    envCountBefore: before.envIds.length,
    runtimeEnvIdBefore: before.runtimeEnvId,
    ledgerEnvIdBefore: before.ledgerEnvId,
    runtimeBefore: before.runtime,
    site: { info: siteInfo?.data ?? siteInfo, configFile: siteConfig?.config_file_location ?? null },
  };
  // 演示环境 = 本站身份原样 + 多标一个自有库（让激活真的改写文件，收尾再写回去）
  const demoDbs = [...facts.ownConfig.location_dbs];
  if (!demoDbs.includes(EXTRA_DBNUM)) demoDbs.push(EXTRA_DBNUM);
  facts.demoConfig = { ...facts.ownConfig, location_dbs: demoDbs };

  // 同名残留先清掉，免得卡片选择器撞上上一跑的遗留
  for (const e of before.envs?.items ?? []) {
    if (e.name === DEMO_ENV || e.name === RESTORE_ENV) {
      const sites = (await api('GET', `/api/remote-sync/envs/${e.id}/sites`)).body;
      for (const s of sites?.items ?? []) await api('DELETE', `/api/remote-sync/sites/${s.id}`);
      await api('DELETE', `/api/remote-sync/envs/${e.id}`);
      note('cleanup-stale-demo-env', { id: String(e.id), name: e.name });
      before.envIds = before.envIds.filter((id) => id !== String(e.id));
      if (before.ledgerEnvId === String(e.id)) before.ledgerEnvId = null;
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
  console.log(`preview: ${base} → ${API}（真后端，会真的写它的配置）`);

  const browser = await chromium.launch({
    channel: executablePath ? undefined : 'chrome',
    executablePath,
    headless: !args.headed,
  });
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

  const pill = page.locator('[data-testid="remote-runtime-status"]');
  const card = (name) => page.locator('.card', { hasText: name });
  const bannerOf = (c, prefixText) => c.locator('.rounded-lg.border.px-3').filter({ hasText: prefixText });
  const confirm = (title) => page.locator('.n-dialog', { hasText: title });
  const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

  async function shot(sec, file, alt, caption, highlight) {
    const target = path.join(shotDir, `${file}.png`);
    const take = () => page.screenshot({ path: target, fullPage: false });
    if (highlight) await withHighlight(highlight, take);
    else await take();
    sec.shots.push({ file: `${file}.png`, alt, caption });
    console.log(`  shot ${file}.png`);
  }

  let runError = null;
  try {
    // =====================================================================
    // 1 登录
    // =====================================================================
    const s1 = section({
      title: '登录并进入「异地拓扑」',
      intro:
        '`/topology` 是管理员页面。未登录直接打开，监控台会记住你要去的地址、弹出「管理员登录」，登录成功后自动回到 `/topology`。账号密码就是后端进程启动时的 `ADMIN_USER` / `ADMIN_PASS` 环境变量（本机两站的启动脚本里写死为 `admin` / `admin`），输入框里的「ADMIN_USER 环境变量值」只是占位提示。',
    });
    await page.goto(`${base}topology`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({ timeout: 20_000 });
    await page.getByPlaceholder('ADMIN_USER 环境变量值').fill(USER);
    await page.getByPlaceholder('ADMIN_PASS 环境变量值').fill(PASS);
    await shot(
      s1,
      '01-login',
      `未登录打开 /topology 弹出的管理员登录框，已填入 ${USER} / ${PASS}`,
      '直接访问 `/topology` 被拦下，填入管理员账号密码后点「登录」。',
      page.getByRole('dialog').getByRole('button', { name: '登录' }),
    );
    await page.getByRole('dialog').getByRole('button', { name: '登录' }).click();
    await page.waitForURL('**/topology', { timeout: 20_000 });
    await page.getByText('异地拓扑管理').first().waitFor({ timeout: 20_000 });
    await pill.getByText(/已激活|运行中|未激活/).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    await hideToasts(page);

    // =====================================================================
    // 2 首屏
    // =====================================================================
    const pillText = await text(pill);
    const pillTitle = await pill.locator('span[title]').first().getAttribute('title');
    const envCards = await page.locator('.card', { has: page.getByRole('button', { name: '激活' }) }).count();
    note('first-screen', { pill: pillText, pillTitle, envCards });
    const own = facts.ownConfig;
    const s2 = section({
      title: '读懂首屏：运行时 pill 与「已激活」徽标',
      intro:
        '左边是**环境（Env）**列表，右边是选中环境下的**站点（Site）**。页头右侧那颗胶囊是**运行时 pill**，它每 30 秒读一次 `GET /api/remote-sync/runtime/status`，回答「本站的中继运行态此刻按哪个环境在跑」；鼠标停上去能看到 `env_id`、MQTT 连接状态、`mode: standalone-real`（这就是 plant-web-server）。',
      after: [
        `这一跑开始时后端的真实状态：pill 是「${pillText}」，环境卡片 ${envCards} 张，中继运行态${before.runtimeEnvId ? `正按 \`${before.runtimeEnvId}\` 在跑` : '**没有**在跑（`active: false`）——MQTT 订阅与源文件轮询都没起'}。`,
        '',
        `本站（Site A）自己的 \`DbOption.toml\` 里此刻是：broker \`${own.mqtt_host}:${own.mqtt_port}\`、location \`${own.location}\`、自有库 \`[${fmtDbs(own.location_dbs)}]\`、CBA 下载地址 \`${own.file_server_host}\`（\`GET /api/site/info\` 读到的）。记住这五个值——**激活写的就是这五个键**，本教程收尾也要拿它们把文件写回去。`,
        '',
        '- 每张卡片下方 4 个动作按钮：**测 MQTT / 测文件服务 / 应用 / 激活**，这就是「部署动作面」。',
        '- 有环境被激活时，它的卡片右上角会挂绿色「已激活」徽标，自己的「激活」按钮置灰（防重复激活），页头同时出现「停止运行时」。',
        '- 任何动作做完，监控台都会立刻重拉 `runtime/status` 与环境列表，不用手动刷新。',
      ].join('\n'),
    });
    await shot(
      s2,
      '02-overview',
      `登录后的 /topology 首屏：左侧 ${envCards} 张环境卡片，页头运行时 pill 显示「${pillText}」`,
      '登录后的首屏。红框：运行时 pill 与环境列表。',
      [pill, page.locator('.card').first()],
    );

    // =====================================================================
    // 3 从 DbOption 导入
    // =====================================================================
    const s3 = section({
      title: '「从 DbOption 导入」：给本站登记一张卡',
      intro:
        '点环境列表右上角的「从 DbOption 导入」，后端会读**它自己进程**那份 `DbOption.toml`，按本站 id 生成一张「本站登记卡」（工程名 / 工程码 / 工程路径、绑定端口、配置文件路径），id 固定是 `dboption-<本站 site_id>`，**重复导入只是覆盖同一张**。这一步不改写配置、也不激活运行时。',
    });
    const importBtn = page.getByRole('button', { name: '从 DbOption 导入' });
    await importBtn.click();
    const importDlg = confirm('确认从 DbOption 导入环境');
    await importDlg.waitFor({ timeout: 8_000 });
    await shot(
      s3,
      '03-import-confirm',
      '「确认从 DbOption 导入环境」弹窗，写明将读取后端当前进程的 DbOption.toml 且不改写配置',
      '弹窗写清楚读什么、不会改什么。点「确定」。',
      importDlg.getByRole('button', { name: '确定' }),
    );
    await importDlg.getByRole('button', { name: '确定' }).click();
    await importDlg.waitFor({ state: 'hidden', timeout: 10_000 });
    await page.waitForTimeout(1_500);
    const envsAfterImport = (await api('GET', '/api/remote-sync/envs')).body;
    const imported =
      (envsAfterImport?.items ?? []).find((e) => e.source === 'DbOption' || String(e.id).startsWith('dboption-')) ?? null;
    if (!imported) throw new Error('「从 DbOption 导入」之后后端里找不到 source = DbOption / id = dboption-* 的环境');
    facts.importedEnvId = String(imported.id);
    facts.importedPreexisted = before.envIds.includes(facts.importedEnvId);
    const importedConn = pickConnection(imported);
    const importedHasConn = CONNECTION_KEYS.some((k) => (k === 'location_dbs' ? importedConn[k].length > 0 : importedConn[k]));
    note('import-from-dboption', {
      id: facts.importedEnvId,
      envName: imported.name,
      preexisted: facts.importedPreexisted,
      source: imported.source ?? null,
      hasConnectionKeys: importedHasConn,
      config: imported.config ?? null,
    });
    const importedCard = card(imported.name);
    await importedCard.waitFor({ timeout: 10_000 });
    const cfg = imported.config ?? {};
    s3.after = [
      `这一跑${facts.importedPreexisted ? '**覆盖**了已有的' : '生成了'}「**${imported.name}**」（id \`${facts.importedEnvId}\`）：工程 \`${cfg.project_name ?? '?'}\` / 工程码 \`${cfg.project_code ?? '?'}\`、绑定 \`${cfg.bind_host ?? '?'}:${cfg.web_port ?? '?'}\`、配置文件 \`${cfg.associated_project?.config_path ?? '?'}\`。`,
      '',
      `卡片上写着「未配置文件服务 / 未配置 MQTT」——**不是坏了**：plant-web-server 的导入卡${importedHasConn ? '这一跑居然带了连接参数（后端版本可能变了，注意）' : '**不带** `mqtt_host / mqtt_port / file_server_host / location / location_dbs`'}，那五个键仍然只在 \`DbOption.toml\` 里。所以对着这张卡点「激活」= **按文件现状原样起中继、一个键都不改**（激活响应里 \`runtime_config.keys\` 会是空的）；它不是配置快照，退不回任何东西。`,
      '',
      '> 想给自己留退路，记的是第 2 节那五个值（或直接备份 `DbOption.toml`）——本教程收尾就是这么复原的，见附录 B。',
    ].join('\n');
    await shot(
      s3,
      '04-imported',
      `导入完成：卡片「${imported.name}」${facts.importedPreexisted ? '被覆盖更新' : '出现'}，显示未配置文件服务 / MQTT`,
      `导入${facts.importedPreexisted ? '覆盖了同 id 的旧卡' : '成功：环境计数 +1'}，新卡自动被选中（蓝色边框），右侧切到它的站点列表。`,
      importedCard,
    );
    await hideToasts(page);

    // =====================================================================
    // 4 新建环境
    // =====================================================================
    const demo = facts.demoConfig;
    const s4 = section({
      title: '手填新建一个协同环境（填的是本站身份 + 共用 broker）',
      intro:
        '真正要跑中继，点「新建」手填。**填的是本站怎么接入协同**，不是对端长什么样：共用 broker 的地址、本站的 `location`、本站的自有库、以及**对端来本站下载 CBA 的地址**（本站的 `/assets/archives`）。表单会用本站配置预填，通常只改 broker 地址和名字。保存后监控台会**自动把本站加为该环境的第一个站点**，右侧表格立刻能看到。',
      after: [
        '| 字段 | 填什么 | 这一跑填的 |',
        '|---|---|---|',
        `| 环境名称 | 人能看懂的名字 | \`${DEMO_ENV}\` |`,
        `| 文件服务地址（file_server_host） | **本站**的 CBA 目录地址：本站广播消息时带上它，**对端**从 \`<它>/<file>.cba\` 下载 | \`${demo.file_server_host}\` |`,
        `| MQTT 主机 / 端口 | 两站共用的 broker，\`test-mqtt\` 会 TCP 探它 | \`${demo.mqtt_host}\` / \`${demo.mqtt_port}\` |`,
        `| 位置标识（location） | **本站**的 location，全网唯一；对端消息里 location 与本站相同的会被忽略 | \`${demo.location}\` |`,
        `| 数据库编号（location_dbs） | **本站自有库**：只广播这些库的变更 | \`${fmtDbs(demo.location_dbs)}\`（比文件里多标了 \`${EXTRA_DBNUM}\`，下一步好看出激活确实改了文件） |`,
      ].join('\n'),
    });
    await page.getByRole('button', { name: '新建' }).click();
    const envModal = page.locator('dialog.modal-open').filter({ hasText: '添加新环境' });
    await envModal.waitFor({ timeout: 10_000 });
    await envModal.locator('input[placeholder="例如: 北京总部、上海分部"]').fill(DEMO_ENV);
    await envModal.locator('input[placeholder="http://192.168.1.10:3000"]').fill(demo.file_server_host);
    await envModal.locator('input[placeholder="如: 上海园区"]').fill(demo.location);
    await envModal.locator('input[placeholder="7999,8001,8002"]').fill(demo.location_dbs.join(','));
    await envModal.locator('input[placeholder="192.168.1.10"]').fill(demo.mqtt_host);
    await envModal.locator('input[placeholder="1883"]').fill(String(demo.mqtt_port));
    await shot(
      s4,
      '05-create-env-form',
      `「添加新环境」表单，已填入 ${DEMO_ENV} 的名称、本站 CBA 地址、location、自有库与共用 broker 地址`,
      '填好本站身份与 broker 地址，然后点「保存环境」。',
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
      stored: pickConnection(created),
      autoSites: (autoSites?.items ?? []).map((s) => ({ id: String(s.id), name: s.name, http_host: s.http_host })),
    });
    await hideToasts(page);
    await shot(
      s4,
      '06-created-env',
      `新环境「${DEMO_ENV}」出现在列表并被选中，右侧站点列表里已自动加入本站`,
      `保存后：新环境被选中，右侧自动加入了 ${(autoSites?.items ?? []).length} 个站点（本站）。`,
      [demoCard, page.locator('table').first()],
    );

    // =====================================================================
    // 5 测连通
    // =====================================================================
    const s5 = section({
      title: '先测连通，再动运行时',
      intro:
        '激活之前先在卡片上点两下探测：**测 MQTT** 让后端 TCP 探 `mqtt_host:mqtt_port`（broker 通不通），**测文件服务** 让后端对 `file_server_host` 发一次 GET（本站的 `/assets/archives` 能不能被访问到——对端将来就是从这里下载 CBA 的）。结果以横条留在卡片里（绿 = 通，红 = 不通），右上角同时弹 toast。注意探测**由后端发起**，探的是「后端到目标」的网络，不是你浏览器到目标的。',
    });
    await demoCard.scrollIntoViewIfNeeded();
    await demoCard.getByRole('button', { name: '测 MQTT' }).click();
    await bannerOf(demoCard, '测 MQTT：').waitFor({ timeout: 20_000 });
    const mqttBanner = await text(bannerOf(demoCard, '测 MQTT：'));
    await shot(
      s5,
      '07-test-mqtt',
      `「${DEMO_ENV}」卡片内出现结果条：${mqttBanner}`,
      `「测 MQTT」的真实结果：${mqttBanner}`,
      bannerOf(demoCard, '测 MQTT：'),
    );
    await hideToasts(page);
    await demoCard.getByRole('button', { name: '测文件服务' }).click();
    await bannerOf(demoCard, '测文件服务：').waitFor({ timeout: 20_000 });
    const httpBanner = await text(bannerOf(demoCard, '测文件服务：'));
    note('probe', { mqtt: mqttBanner, http: httpBanner });
    await shot(
      s5,
      '08-test-http',
      `「${DEMO_ENV}」卡片内出现结果条：${httpBanner}`,
      `「测文件服务」的真实结果：${httpBanner}`,
      bannerOf(demoCard, '测文件服务：'),
    );
    s5.after = [
      '这一跑拿到的两条真实结果：',
      '',
      `- 测 MQTT：\`${mqttBanner}\``,
      `- 测文件服务：\`${httpBanner}\``,
      '',
      '> 红条里会透出后端原话（`connection refused`、目标 URL、HTTP code、耗时），排网络问题直接照着看。红条只说明目标不通，不代表页面出错。本机两站共用一个 Mosquitto、CBA 目录里放了 `index.html`，所以这里两条都是绿的；真实部署里第一次点常常是红的——broker 端口没开、`/assets/archives` 没挂出来，都在这一步就能发现。',
    ].join('\n');
    await hideToasts(page);

    // =====================================================================
    // 6 激活
    // =====================================================================
    const s6 = section({
      title: '激活环境（这一步会真的改本站配置文件）',
      intro:
        '**激活** = 让本站从此按这个环境跑中继。plant-web-server 分两步：先把环境的 `mqtt_host / mqtt_port / file_server_host / location / location_dbs` 写进本站 `DbOption.toml`（环境上没有的键不动，其余行与注释原样保留），再起 / 重建中继运行态——MQTT 订阅（收对端广播）+ 源文件轮询（发本站变更），**不用重启进程**。写不进文件或中继起不来，整条激活失败，不会留下「账面已激活、跑的还是旧配置」的中间态。这是整页最重的动作，所以有确认弹窗；当前已有运行态时弹窗还会点名它「会先被停止」。',
    });
    await demoCard.getByRole('button', { name: '激活' }).click();
    const actDlg = confirm('确认激活环境');
    await actDlg.waitFor({ timeout: 8_000 });
    const actDlgText = await text(actDlg);
    await shot(
      s6,
      '09-activate-confirm',
      '「确认激活环境」弹窗，说明会把五个连接参数写进本站 DbOption.toml 并起 / 重建中继运行态',
      '确认弹窗把后果说清楚了再点「确定」。',
      actDlg.getByRole('button', { name: '确定' }),
    );
    await actDlg.getByRole('button', { name: '确定' }).click();
    await pill.getByText(`已激活 ${DEMO_ENV}`).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1_200);
    const rtAfterActivate = (await api('GET', '/api/remote-sync/runtime/status')).body;
    const envsAfterActivate = (await api('GET', '/api/remote-sync/envs')).body;
    const backendActive = runtimeEnvIdOf(rtAfterActivate);
    const ledgerActive = ledgerEnvIdOf(envsAfterActivate);
    const activateBanner = await text(bannerOf(demoCard, '激活环境：'));
    const act = facts.activations.find((a) => a.envId === facts.demoEnvId) ?? null;
    const rc = act?.runtime_config ?? null;
    note('activate', {
      runtimeEnvId: backendActive,
      ledgerEnvId: ledgerActive,
      matchesDemoEnv: backendActive === facts.demoEnvId && ledgerActive === facts.demoEnvId,
      runtime: rtAfterActivate,
      runtime_config: rc,
      dialog: actDlgText,
      banner: activateBanner,
    });
    await hideToasts(page);
    await shot(
      s6,
      '10-activated',
      `激活成功：pill 变为「运行时 · 已激活 ${DEMO_ENV}」，该卡片挂上「已激活」徽标，「激活」按钮置灰`,
      '激活后三处同时变：pill、绿色「已激活」徽标、卡片里的结果条。',
      [pill, demoCard],
    );
    s6.after = [
      '这一跑激活后从后端直接查到的事实（不是只看页面）：',
      '',
      `- 页面发出的 \`POST envs/${facts.demoEnvId}/activate\` 响应里 \`runtime_config\`：写了 \`${(rc?.keys ?? []).join(' / ') || '（无）'}\` 这几个键到 \`${rc?.path ?? '?'}\`，\`changed: ${rc?.changed ?? '?'}\`——${rc?.changed ? `文件**真的变了**（自有库从 \`[${fmtDbs(own.location_dbs)}]\` 变成 \`[${fmtDbs(demo.location_dbs)}]\`，另四个键与原值相同）` : '五个键都与文件原值相同，所以没落盘'}。`,
      `- \`GET /api/remote-sync/runtime/status\` → \`active: ${rtAfterActivate?.active}\`、\`env_id: ${rtAfterActivate?.env_id}\`、\`relay: ${rtAfterActivate?.relay}\`、\`mqtt_connected: ${rtAfterActivate?.mqtt_connected}\`，这次激活实际用的连接参数 \`relay_location: ${rtAfterActivate?.relay_location}\`、\`relay_mqtt_host: ${rtAfterActivate?.relay_mqtt_host}\`、\`relay_mqtt_port: ${rtAfterActivate?.relay_mqtt_port}\`——对着它核对环境是否生效。`,
      `- 运行态上跑的 env（\`${backendActive}\`）与账面「当前环境」标记（\`envs[].active\`，\`${ledgerActive}\`）都指向页面上被点的这张卡。`,
      `- 卡片里的结果条：\`${activateBanner}\``,
      '',
      `> \`relay: ${rtAfterActivate?.relay}\` 是中继模式（\`sync_relay_mode = true\`）的标志：这台后端不连 SurrealDB，靠 SQLite 台账 + MQTT 广播与对端协同；激活成功时台账三张表也一并建好，\`/ledger\`「中继台账」视图从此有数据可看。`,
      '',
      '> 对着真实后端点「激活」是真的改它的配置文件。联调前先确认端口后面是哪台实例（见 `HANDOFF.md`「先看清楚后端是谁」）。',
    ].join('\n');

    // =====================================================================
    // 7 应用
    // =====================================================================
    const s7 = section({
      title: '「应用」和「激活」差在哪',
      intro:
        '**应用（apply）** 在 plant-web-server 上**只落账**：把这张卡标为「当前环境」、记一条 apply 任务，**不写 `DbOption.toml`、不碰运行态**。**激活（activate）** 才是写盘 + 起 / 重建中继。所以这里的「应用」更像「先选中、稍后再切」的书签；要让连接参数真正生效，只有「激活」一条路。（旧 plant-model-gen 后端的「应用」会写文件不重启，监控台的确认弹窗把两种都写明了。）',
    });
    await demoCard.getByRole('button', { name: '应用' }).click();
    const applyDlg = confirm('确认应用环境配置');
    await applyDlg.waitFor({ timeout: 8_000 });
    const applyDlgText = await text(applyDlg);
    await applyDlg.getByRole('button', { name: '确定' }).click();
    await bannerOf(demoCard, '应用配置：').waitFor({ timeout: 20_000 });
    const applyBanner = await text(bannerOf(demoCard, '应用配置：'));
    const rtAfterApply = (await api('GET', '/api/remote-sync/runtime/status')).body;
    note('apply', { dialog: applyDlgText, banner: applyBanner, runtimeUnchanged: runtimeEnvIdOf(rtAfterApply) === backendActive, runtime: rtAfterApply });
    await hideToasts(page);
    await shot(
      s7,
      '11-apply',
      `「应用」完成，卡片内结果条：${applyBanner}`,
      `「应用」的真实返回：${applyBanner}`,
      bannerOf(demoCard, '应用配置：'),
    );
    s7.after = `「应用」之后 \`runtime/status\` 的 \`env_id\` 仍是 \`${runtimeEnvIdOf(rtAfterApply)}\`，\`relay_mqtt_host\` 等一个都没变——它没碰运行态，也没有第二条 activate 那样的 \`runtime_config\` 写盘记录。`;

    // =====================================================================
    // 8 站点：探测 + 编辑
    // =====================================================================
    const s8 = section({
      title: '站点这一侧：登记对端 → 探测不通 → 改地址 → 再探测',
      intro:
        '右侧表格是选中环境下的**站点**——登记的是对端节点（`location` + `http_host`），给拓扑图、探测和「查看站点详情」用；中继本身靠 MQTT 发现对端，不靠这张表。每行末尾两个动作：**探测**（让后端对这个站点的 `http_host` 拼上 `/metadata.json` 发一次 GET）和**编辑站点**（改名称 / 位置 / 负责 dbnums / HTTP 服务地址 / 备注）。探测同样由后端发起。下面故意把这条链走完整：先探一次不通的，再把地址改成对端（Site B）的，再探一次。',
    });
    await demoCard.locator('h5').click();
    await page.waitForTimeout(2_000);
    const rows = page.locator('tbody tr').filter({ has: page.locator('[data-tip="编辑站点"]') });
    const rowCount = await rows.count();
    if (rowCount > 0) {
      // 结果元素点一次之后就一直挂在行里，只 waitFor 会读到上一次的旧值——等这一次的响应回来再读
      const probe = async () => {
        const resp = page
          .waitForResponse(
            (r) => r.request().method() === 'POST' && /^\/api\/remote-sync\/sites\/[^/]+\/test-http$/.test(new URL(r.url()).pathname),
            { timeout: 25_000 },
          )
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
      const probe1 = await probe();
      await hideToasts(page);
      await shot(
        s8,
        '12-site-test-http-failed',
        `站点行末尾的探测结果：${probe1.summary}`,
        `第一次探测：${probe1.title}`,
        rows.first(),
      );

      await rows.first().locator('[data-tip="编辑站点"]').click();
      await page.getByRole('heading', { name: '编辑站点' }).waitFor({ timeout: 8_000 });
      const editDlg = page.locator('dialog.modal-open');
      const notes = `教程演示：HTTP 地址由 ${autoHost ?? '（空）'} 改为对端 Site B`;
      await editDlg.locator('input[placeholder="http://192.168.1.20:8080"]').fill(PEER_SITE_HOST);
      await editDlg.locator('textarea').first().fill(notes);
      await shot(
        s8,
        '13-site-edit',
        `「编辑站点」弹窗，HTTP 服务地址改成了 ${PEER_SITE_HOST}，备注写明了改动原因`,
        '把「HTTP 服务地址」改成对端真实可达的地址，点「保存修改」。',
        [editDlg.locator('input[placeholder="http://192.168.1.20:8080"]'), editDlg.getByRole('button', { name: '保存修改' })],
      );
      await editDlg.getByRole('button', { name: '保存修改' }).click();
      await page.getByRole('heading', { name: '编辑站点' }).waitFor({ state: 'hidden', timeout: 15_000 });
      await page.waitForTimeout(1_500);
      const sitesNow = (await api('GET', `/api/remote-sync/envs/${facts.demoEnvId}/sites`)).body;
      const savedSite = (sitesNow?.items ?? [])[0] ?? {};
      const saved = savedSite.http_host === PEER_SITE_HOST && savedSite.notes === notes;

      await hideToasts(page);
      const probe2 = await probe();
      await hideToasts(page);
      await shot(
        s8,
        '14-site-test-http-ok',
        `改完地址再探测：${probe2.summary}`,
        `第二次探测：${probe2.title}`,
        rows.first(),
      );
      note('site-actions', { rowCount, autoHost, probeBefore: probe1, newHost: PEER_SITE_HOST, savedToBackend: saved, probeAfter: probe2 });
      s8.after = [
        `这一跑站点表有 ${rowCount} 行，唯一那行是保存环境时**自动加入的本站**，它的 HTTP 服务地址被填成了打开页面的那个地址（\`${autoHost}\`，也就是监控台自己）——所以第一次探测必然不通：`,
        '',
        `- 改之前：\`${probe1.title}\``,
        `- 改成对端 \`${PEER_SITE_HOST}\` 之后：\`${probe2.title}\``,
        '',
        `保存后回查后端 \`GET envs/{id}/sites\`，\`http_host\` 与 \`notes\` **${saved ? '都已更新' : '没有按预期更新'}**——页面上的成功提示不等于后端真写了，这一步是回查过的。`,
        '',
        '> 记住这条：**自动加进来的那个站点指向的是你自己**，真要登记对端必须手动改成对端地址（对端 plant-web-server 的 `/files/output`，它下面有 `metadata.json`）。',
      ].join('\n');
    } else {
      note('site-actions', { rowCount, skipped: '该环境下没有站点' });
      s8.after = '这一跑该环境下没有站点，本节两个动作未演示。';
    }
    await hideToasts(page);

    // =====================================================================
    // 9 停止运行时
    // =====================================================================
    const s9 = section({
      title: '停止运行时',
      intro:
        '页头「停止运行时」让后端停掉中继运行态——MQTT 订阅与源文件轮询都停，`runtime.active` 变 `false`、pill 不再显示「已激活」。**停的是运行态，不是配置**：`DbOption.toml` 里刚写进去的五个键不会被回滚，账面上「当前环境」的标记（`envs[].active`）也还留着，再点一次「激活」就按同一份配置跑起来。',
    });
    await page.getByRole('button', { name: '停止运行时' }).click();
    const stopDlg = confirm('确认停止运行时');
    await stopDlg.waitFor({ timeout: 8_000 });
    await shot(
      s9,
      '15-stop-confirm',
      '「确认停止运行时」弹窗',
      '确认后后端停掉 MQTT 订阅与源文件轮询。',
      stopDlg.getByRole('button', { name: '确定' }),
    );
    await stopDlg.getByRole('button', { name: '确定' }).click();
    await page.waitForTimeout(3_000);
    const rtAfterStop = (await api('GET', '/api/remote-sync/runtime/status')).body;
    const envsAfterStop = (await api('GET', '/api/remote-sync/envs')).body;
    const pillAfterStop = await text(pill);
    note('stop-runtime', { pill: pillAfterStop, runtime: rtAfterStop, ledgerEnvId: ledgerEnvIdOf(envsAfterStop) });
    await hideToasts(page);
    await shot(
      s9,
      '16-stopped',
      `停止后：pill 变为「${pillAfterStop}」`,
      `停止后的真实状态：pill「${pillAfterStop}」，后端 \`runtime.active = ${rtAfterStop?.active}\`。`,
      pill,
    );
    s9.after = [
      `停完后端 \`runtime.active = ${rtAfterStop?.active}\`、\`env_id = ${rtAfterStop?.env_id}\`，页面 pill 同步变成「${pillAfterStop}」（\`running: true\` 是进程活着，\`未激活环境\` 是中继没在跑）。账面上 \`envs[].active\` 仍指向 \`${ledgerEnvIdOf(envsAfterStop)}\`——这就是「停的是运行态不是配置」。要再跑起来，对着想用的环境卡再点一次「激活」。`,
    ].join('\n');
  } catch (err) {
    runError = String(err?.message ?? err);
    console.error(`步骤失败：${runError}`);
    await page.screenshot({ path: path.join(shotDir, '99-error.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    await server.close();
  }

  // ---- 收尾：无论上面成没成，都把后端恢复成开跑前的样子 ----
  facts.error = runError;
  facts.cleanup = await cleanup(before);
  facts.ok =
    !runError &&
    Boolean(
      facts.cleanup?.envIdsRestored &&
        facts.cleanup?.runtimeRestored &&
        facts.cleanup?.ledgerRestored &&
        facts.cleanup?.configRestored !== false &&
        !facts.cleanup?.error,
    ) &&
    facts.pageErrors.length === 0;

  // 半截的教程不要覆盖上一份好的
  if (!runError) await writeFile(mdPath, renderMarkdown(), 'utf8');
  await writeFile(resultPath, `${JSON.stringify(facts, null, 2)}\n`, 'utf8');
  const total = sections.reduce((n, s) => n + s.shots.length, 0);
  console.log('');
  console.log(`截图 ${total} 张 → ${SHOT_DIR_REL}/`);
  console.log(runError ? `教程      → 未重写（本轮有步骤失败：${runError}）` : `教程      → ${MD_REL}`);
  console.log(`事实记录  → ${RESULT_REL}`);
  console.log(
    `收尾复原：envIdsRestored=${facts.cleanup?.envIdsRestored} runtimeRestored=${facts.cleanup?.runtimeRestored} ledgerRestored=${facts.cleanup?.ledgerRestored} configRestored=${facts.cleanup?.configRestored} pageErrors=${facts.pageErrors.length}`,
  );
  process.exitCode = facts.ok ? 0 : 1;
}

async function cleanup(before) {
  const out = { steps: [] };
  const step = (name, data) => out.steps.push({ name, ...data });
  try {
    // 1. 演示环境连同它的站点删掉
    if (facts.demoEnvId) {
      const sites = (await api('GET', `/api/remote-sync/envs/${facts.demoEnvId}/sites`)).body;
      for (const s of sites?.items ?? []) step('delete-site', { id: String(s.id), status: (await api('DELETE', `/api/remote-sync/sites/${s.id}`)).status });
      step('delete-demo-env', { id: facts.demoEnvId, status: (await api('DELETE', `/api/remote-sync/envs/${facts.demoEnvId}`)).status });
    }

    // 2. 本轮的激活若真改写了 DbOption.toml，用开跑前记下的五个键建一张临时卡激活写回；再激活一次拿 changed=false 当凭证
    const tomlChanged = facts.activations.some((a) => a.runtime_config?.changed === true);
    out.tomlChangedByRun = tomlChanged;
    let restoreEnvId = null;
    if (tomlChanged && facts.ownConfig) {
      const created = await api('POST', '/api/remote-sync/envs', { name: RESTORE_ENV, ...facts.ownConfig });
      restoreEnvId = created.body?.item?.id ? String(created.body.item.id) : null;
      step('create-restore-env', { id: restoreEnvId, status: created.status, config: facts.ownConfig });
      if (!restoreEnvId) throw new Error('建不出恢复卡，DbOption.toml 没法写回原值');
      const first = await api('POST', `/api/remote-sync/envs/${restoreEnvId}/activate`);
      step('activate-restore-env', { id: restoreEnvId, status: first.status, runtime_config: first.body?.runtime_config ?? null });
      const second = await api('POST', `/api/remote-sync/envs/${restoreEnvId}/activate`);
      step('activate-restore-env-verify', { id: restoreEnvId, status: second.status, runtime_config: second.body?.runtime_config ?? null });
      const keys = second.body?.runtime_config?.keys ?? [];
      out.configRestored =
        first.status === 200 && second.status === 200 && second.body?.runtime_config?.changed === false && CONNECTION_KEYS.every((k) => keys.includes(k));
    } else {
      out.configRestored = tomlChanged ? false : null; // null = 本轮没改过文件，无需写回
    }

    // 3. 运行态：开跑前在跑就把那个 env 再激活，否则 stop
    if (before.runtimeEnvId) {
      step('reactivate-original', { id: before.runtimeEnvId, status: (await api('POST', `/api/remote-sync/envs/${before.runtimeEnvId}/activate`)).status });
    } else {
      step('stop-runtime', { status: (await api('POST', '/api/remote-sync/runtime/stop')).status });
    }

    // 4. 临时卡、以及本轮才生成的导入卡删掉
    if (restoreEnvId) step('delete-restore-env', { id: restoreEnvId, status: (await api('DELETE', `/api/remote-sync/envs/${restoreEnvId}`)).status });
    if (facts.importedEnvId && !facts.importedPreexisted) {
      const sites = (await api('GET', `/api/remote-sync/envs/${facts.importedEnvId}/sites`)).body;
      for (const s of sites?.items ?? []) step('delete-imported-site', { id: String(s.id), status: (await api('DELETE', `/api/remote-sync/sites/${s.id}`)).status });
      step('delete-imported-env', { id: facts.importedEnvId, status: (await api('DELETE', `/api/remote-sync/envs/${facts.importedEnvId}`)).status });
    }

    // 5. 账面「当前环境」标记：apply / activate 会把别的卡全标 false，开跑前有标记的就用 apply（只落账）标回去
    if (before.ledgerEnvId && before.ledgerEnvId !== before.runtimeEnvId) {
      step('reapply-ledger-flag', { id: before.ledgerEnvId, status: (await api('POST', `/api/remote-sync/envs/${before.ledgerEnvId}/apply`)).status });
    }

    const after = {
      envs: (await api('GET', '/api/remote-sync/envs')).body,
      runtime: (await api('GET', '/api/remote-sync/runtime/status')).body,
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
  const rt = facts.backend?.runtimeBefore ?? {};
  const own = facts.ownConfig ?? {};
  const out = [];
  out.push('# 异地部署操作教程 · 真实后端实操版（plant-web-server 中继站点）');
  out.push('');
  out.push('> 适用对象：要把一个协同环境推上站点后端运行时、或排查站点连通性的实施 / 运维人员。');
  out.push('> 预计用时：10–15 分钟。');
  out.push(
    `> 生成方式：本文由 \`scripts/topology-deploy-live-tutorial.mjs\` 于 ${day} 自动生成——Playwright 开真实 Chrome，把下面每一步**真的在页面上做了一遍**，后端是真后端（\`${facts.api}\`，plant-web-server 中继模式），截图里的每一条提示都是它当时的真实响应。`,
  );
  out.push('> 与 `docs/tutorials/topology-deploy-tutorial.md` 的分工：那一份用 mock 喂页面、胜在数据整齐可重复；这一份胜在真实，包括真实的失败提示。');
  out.push('> 收尾：本次新建的环境与站点跑完即删；激活改写过的 `DbOption.toml` 用开跑前记下的五个键写回原值，并再激活一次确认无差；运行态恢复原状（核对结果见文末附录 B）。');
  out.push('');
  out.push('## 你将学会');
  out.push('');
  out.push('- 给本站登记一张「从 DbOption 导入」的卡，以及手填新建一个协同环境——填的是**本站身份 + 共用 broker**。');
  out.push('- 用「测 MQTT / 测文件服务 / 站点探测」在动运行时之前确认 broker、本站 CBA 目录、对端站点可达。');
  out.push('- 分清「应用」（只落账）与「激活」（写 `DbOption.toml` 五个键 + 起 / 重建中继运行态），并看懂运行时 pill、「已激活」徽标与 `runtime/status` 的字段。');
  out.push('- 停止运行时、登记 / 编辑对端站点，以及动手之前怎么给自己留一条退路。');
  out.push('');
  out.push('## 0. 三个词与一条主线');
  out.push('');
  out.push('| 词 | 是什么 | 在页面上 |');
  out.push('|---|---|---|');
  out.push('| **环境（Env）** | 本站怎么接入协同：共用 broker（`mqtt_host` / `mqtt_port`）+ 本站身份（`location` / 自有库 `location_dbs` / 对端来下载 CBA 的 `file_server_host`）。激活写进本站 `DbOption.toml` 的就是这五个键 | 左侧卡片 |');
  out.push('| **站点（Site）** | 环境下登记的一个对端节点（`location` + `http_host`），给拓扑、探测、详情用；中继靠 MQTT 发现对端，不靠它 | 右侧表格的一行 |');
  out.push('| **运行时（Runtime）** | 本站的中继运行态：MQTT 订阅（收对端广播）+ 源文件轮询（发本站变更）此刻按哪个环境在跑 | 页头 pill + 卡片「已激活」徽标 |');
  out.push('');
  out.push('一次完整的部署就是：**建环境 → 测连通 → 激活 → 看 pill 与 `runtime/status` 确认 →（需要时）停止**。下面按这个顺序走。');
  out.push('');
  out.push('## 0.1 这一跑的现场');
  out.push('');
  out.push('| 项 | 值 |');
  out.push('|---|---|');
  out.push(`| 后端 | \`${facts.api}\`（plant-web-server，\`identity.mode = ${facts.backend?.identity?.mode ?? '?'}\`，site_id \`${facts.backend?.identity?.site_id ?? '?'}\`） |`);
  out.push(`| 对端（教程里扮演另一个站点 Site B） | \`${facts.peer}\` |`);
  out.push(`| 本站 DbOption.toml 的五个连接键（开跑前） | broker \`${own.mqtt_host}:${own.mqtt_port}\` · location \`${own.location}\` · 自有库 \`[${fmtDbs(own.location_dbs ?? [])}]\` · CBA \`${own.file_server_host}\` |`);
  out.push(`| 开跑前环境数 / 运行态 env / 账面当前环境 | ${facts.backend?.envCountBefore} 张 / ${facts.backend?.runtimeEnvIdBefore ?? '无'} / ${facts.backend?.ledgerEnvIdBefore ?? '无'} |`);
  out.push(`| 开跑前运行时 | \`active: ${rt.active}\`、\`relay: ${rt.relay}\`、\`mode: ${rt.mode}\` |`);
  out.push(`| 生成时间 | ${d.toLocaleString('zh-CN', { hour12: false })}（本机时区） |`);
  out.push('');
  out.push(
    '> 本机这套两站环境由 `scripts/local-remote-collab-setup.ps1` 生成在 `../plant-web-server/runtime/local-collab/`（模板 `../plant-web-server/db_options/DbOption.toml`，两站 `--repo-root` 也是 plant-web-server；2026-09-18 前在 `../plant-model-gen` 下），起法见那里的 `COMMANDS.md`。**别把本教程的脚本指向生产后端**——它会真的建环境、真的改配置。',
  );
  out.push('');

  sections.forEach((s, i) => {
    out.push(`## ${i + 1}. ${s.title}`);
    out.push('');
    if (s.intro) {
      out.push(s.intro);
      out.push('');
    }
    for (const shot of s.shots) {
      out.push(`![${shot.alt}](./screenshots/topology-deploy-live/${shot.file})`);
      out.push('');
      out.push(`*${shot.caption}*`);
      out.push('');
    }
    if (s.after) {
      out.push(s.after);
      out.push('');
    }
  });

  const c = facts.cleanup ?? {};
  out.push('## 附录 A · 这一跑真实发生了什么');
  out.push('');
  out.push('教程里每张图都对应一次真实请求。下面是同一跑的机器记录，`docs/e2e-smoke/topology-deploy-live-tutorial-result.json` 里有完整版。');
  out.push('');
  out.push('| 步骤 | 结果 |');
  out.push('|---|---|');
  for (const st of facts.steps) {
    out.push(`| \`${st.name}\` | ${summarizeStep(st)} |`);
  }
  out.push('');
  out.push('页面在这一跑里发出的写请求（`GET` 不计）：');
  out.push('');
  for (const w of dedupeWrites(facts.writes)) out.push(`- \`${w}\``);
  out.push('');
  out.push('## 附录 B · 收尾把后端恢复成什么样');
  out.push('');
  out.push(
    '教程会真的改后端——包括 `DbOption.toml`——所以脚本跑完必须能还原，否则这份教程就是在给环境留垃圾。核对方式：env 集合、运行态 env、账面「当前环境」标记三样跟开跑前逐一对比；文件那一项靠「用开跑前的五个键建一张临时卡激活写回，再激活一次看 `changed = false`」——第二次一个字节都没改，说明文件已经与原值一致。',
  );
  out.push('');
  out.push('| 核对项 | 结果 |');
  out.push('|---|---|');
  out.push(`| 本轮的激活是否改写过 DbOption.toml | ${c.tomlChangedByRun ? '是（自有库多标了一个）' : '否'} |`);
  out.push(`| DbOption.toml 已写回原值（第二次激活 \`changed = false\`） | ${c.configRestored === null ? '不需要（没改过）' : c.configRestored ? '是' : '**否**'} |`);
  out.push(`| env 集合与开跑前一致 | ${c.envIdsRestored ? '是' : '否'} |`);
  out.push(`| 运行态 env 与开跑前一致 | ${c.runtimeRestored ? '是' : '否'} |`);
  out.push(`| 账面「当前环境」标记与开跑前一致 | ${c.ledgerRestored ? '是' : '否'} |`);
  out.push(`| 残留的 env | ${(c.leftoverEnvIds ?? []).length === 0 ? '无' : (c.leftoverEnvIds ?? []).join(', ')} |`);
  out.push(`| 收尾后 \`runtime.active\` | \`${c.runtimeAfter?.active}\` |`);
  out.push(`| 页面 JS 报错（pageerror） | ${facts.pageErrors.length} 条 |`);
  out.push('');
  out.push('收尾动作依次是：');
  out.push('');
  for (const st of c.steps ?? []) {
    const extra = st.runtime_config ? `，runtime_config \`${JSON.stringify(st.runtime_config)}\`` : '';
    out.push(`- \`${st.name}\`${st.id ? ` · id \`${st.id}\`` : ''} → HTTP ${st.status}${extra}`);
  }
  out.push('');
  out.push(
    '> 自己手动操作真实环境时同一招管用：**动配置之前先把 `GET /api/site/info` 的五个键（或整份 `DbOption.toml`）记下来**，出事就建一张填着原值的环境点「激活」写回去；「从 DbOption 导入」那张卡不带连接参数，退不回任何东西。',
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
    const key = `${w.method} ${w.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '{id}').replace(/(env|site)-\d{6,}(-\d+)?/g, '{id}')} → ${w.status}`;
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
