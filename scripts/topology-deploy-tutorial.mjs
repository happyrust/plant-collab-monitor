// 异地部署操作教程 · 自动生成（截图 + Markdown）
//
// 用 Playwright 驱动真实前端页面（vite preview 产物），后端用与自动化用例 DA-01–16 **同一份 mock**
// （scripts/lib/topology-deploy-mock.mjs），按运维人员实际操作顺序走一遍 /topology 部署动作面，
// 每一步截一张带高亮的图，并把步骤说明、截图与对应的自动化用例编号一起写成教程 Markdown。
//
// 产物：
//   docs/tutorials/screenshots/topology-deploy/*.png   （入库；1440×900 视口图）
//   docs/tutorials/topology-deploy-tutorial.md           （入库；由本脚本整篇生成，不要手改——改脚本里的文案）
//
// 用法：
//   node scripts/topology-deploy-tutorial.mjs             # 缺 dist/ 时自动 vite build
//   node scripts/topology-deploy-tutorial.mjs --build     # 强制先重新 vite build
//   node scripts/topology-deploy-tutorial.mjs --headed    # 有头模式看过程
//   node scripts/topology-deploy-tutorial.mjs --no-md     # 只出图、不重写 Markdown
// 环境变量：同 scripts/topology-deploy-smoke.mjs（SMOKE_BROWSER_EXECUTABLE / SMOKE_PREVIEW_PORT）
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { createState, respond } from './lib/topology-deploy-mock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const previewPort = Number(process.env.SMOKE_PREVIEW_PORT ?? 4178);
const SHOT_DIR_REL = 'docs/tutorials/screenshots/topology-deploy';
const MD_REL = 'docs/tutorials/topology-deploy-tutorial.md';
const shotDir = path.resolve(ROOT, SHOT_DIR_REL);
const mdPath = path.resolve(ROOT, MD_REL);
const executablePath =
  process.env.SMOKE_BROWSER_EXECUTABLE ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);

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
// 页面驱动小工具
// ---------------------------------------------------------------------------
async function attachMock(page, state) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    const res = respond(state, req.method(), url, body);
    if (res.abort) return route.abort();
    return route.fulfill({
      status: res.status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(res.json),
    });
  });
  await page.route('http://10.0.0.12:3100/**', (route) => route.abort());
}

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
      // 卡片带 transition-all，不关掉的话 200ms 内截图看不到红框
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
    // 鼠标挪开：刚点过的按钮上挂着 DaisyUI tooltip，会盖住要讲的内容
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

/** 隐藏已经弹出的 toast，别让上一步的提示串到下一张图里 */
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
// 教程内容：章节 → 截图步骤（文案与动作放在一起，改这里就能重出整篇）
// ---------------------------------------------------------------------------
const sections = [];
function section(def) {
  sections.push({ ...def, shots: [] });
  return sections[sections.length - 1];
}

async function main() {
  if (args.build || !existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.log('dist/ 缺失或要求重建，先执行 vite build …');
    await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'production', logLevel: 'warn' });
  }
  await mkdir(shotDir, { recursive: true });
  const server = await preview({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    preview: { port: previewPort, strictPort: true, open: false },
  });
  const base = server.resolvedUrls.local[0];
  console.log(`preview: ${base}`);
  const browser = await chromium.launch({
    channel: executablePath ? undefined : 'chrome',
    executablePath,
    headless: !args.headed,
  });

  try {
    await captureMainFlow(browser, base);
    await capturePwsAppendix(browser, base);
  } finally {
    await browser.close();
    await server.close();
  }

  if (!args['no-md']) {
    await writeFile(mdPath, renderMarkdown(), 'utf8');
    console.log(`markdown: ${MD_REL}`);
  }
  const total = sections.reduce((n, s) => n + s.shots.length, 0);
  console.log(`screenshots: ${total} → ${SHOT_DIR_REL}/`);
}

// ---------------------------------------------------------------------------
// 主线：plant-model-gen 语义（真·写 DbOption.toml + 重启 watcher / MQTT）
// ---------------------------------------------------------------------------
async function captureMainFlow(browser, base) {
  const state = createState('pmg');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await attachMock(page, state);

  const pill = page.locator('[data-testid="remote-runtime-status"]');
  const card = (name) => page.locator('.card', { hasText: name });
  const bannerOf = (c, prefix) => c.locator('.rounded-lg.border.px-3').filter({ hasText: prefix });
  const row = (siteName) => page.locator('tbody tr', { hasText: siteName });
  const confirm = (title) => page.locator('.n-dialog', { hasText: title });
  const loginDialog = page.getByRole('dialog');

  async function shot(sec, file, alt, caption, highlight) {
    const target = path.join(shotDir, `${file}.png`);
    const take = () => page.screenshot({ path: target, fullPage: false });
    if (highlight) await withHighlight(highlight, take);
    else await take();
    sec.shots.push({ file: `${file}.png`, alt, caption });
    console.log(`  shot ${file}.png`);
  }

  // 1 -----------------------------------------------------------------------
  const s1 = section({
    title: '登录并进入「异地拓扑」',
    cases: ['DA-01'],
    intro:
      '`/topology` 是管理员页面。未登录时直接打开它，监控台会记住你要去的地址、弹出「管理员登录」；登录成功后自动回到 `/topology`。账号密码是后端启动时的 `ADMIN_USER` / `ADMIN_PASS` 环境变量（本地联调通常都是 `admin` / `admin`），输入框里的「ADMIN_USER 环境变量值」只是占位提示。',
    after:
      '> 监控台同时兼容两种后端的登录响应：plant-model-gen 带 `expires_at`，plant-web-server 不带。2026-09-14 之前对后者登录必失败，现已放宽。',
  });
  await page.goto(`${base}topology`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({ timeout: 15_000 });
  await page.getByPlaceholder('ADMIN_USER 环境变量值').fill('admin');
  await page.getByPlaceholder('ADMIN_PASS 环境变量值').fill('admin');
  await shot(
    s1,
    '01-login',
    '未登录打开 /topology 弹出的管理员登录框，已填入 admin / admin',
    '直接访问 `/topology` 被拦下，填入管理员账号密码后点「登录」。',
    loginDialog.getByRole('button', { name: '登录' }),
  );
  await loginDialog.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/topology', { timeout: 15_000 });
  await page.getByText('异地拓扑管理').first().waitFor({ timeout: 15_000 });
  await pill.getByText('运行时 · 已激活 华东协同环境').waitFor({ timeout: 10_000 });
  await card('华东协同环境').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await hideToasts(page);

  // 2 -----------------------------------------------------------------------
  const s2 = section({
    title: '读懂首屏：运行时 pill 与「已激活」徽标',
    cases: ['DA-02', 'DA-14'],
    intro:
      '左边是**环境（Env）**列表，右边是选中环境下的**站点（Site）**。页头右侧的胶囊是**运行时 pill**：它每 30 秒读一次 `GET /api/remote-sync/runtime/status`，告诉你后端此刻用的是哪个环境；鼠标停上去能看到 `env_id`、MQTT 连接状态等细节。',
    after: [
      '看图要点：',
      '',
      '- pill 显示「运行时 · 已激活 华东协同环境」，旁边有「停止运行时」按钮——说明后端 watcher + MQTT 订阅正在跑。',
      '- 被激活的环境卡片右上角挂绿色「已激活」徽标，它自己的「激活」按钮置灰（不能重复激活）。',
      '- 每张卡片下方 4 个动作按钮：**测 MQTT / 测文件服务 / 应用 / 激活**，这就是部署动作面。',
      '- 所有动作做完，监控台都会立刻重拉 `runtime/status` 与环境列表，不用手动刷新。',
    ].join('\n'),
  });
  await shot(
    s2,
    '02-overview',
    '登录后的 /topology 首屏：左侧 3 张环境卡片，华东协同环境带「已激活」徽标，页头运行时 pill 显示已激活',
    '登录后的首屏。红框：运行时 pill 与当前激活的环境卡片。',
    [pill, card('华东协同环境')],
  );

  // 3 -----------------------------------------------------------------------
  const s3 = section({
    title: '一键从 DbOption 导入环境',
    cases: ['DA-16'],
    intro:
      '最省事的建环境方式：点环境列表右上角的「从 DbOption 导入」，后端会读**它自己进程**的 `DbOption.toml`（`mqtt_host` / `mqtt_port` / `file_server_host` / `location` / `location_dbs`），反向生成一个环境。这一步**不改写配置、不激活运行时**，只是把当前配置登记成一张卡片，方便接着「激活」或作为模板对照。',
    after: [
      '> 两种后端的差别要知道：plant-model-gen **每次导入都新建**一个「导入环境 - 时间戳」（点两次就有两张）；plant-web-server 按本站 id 覆盖同一个 env。所以按钮前面有一道确认弹窗，别手滑连点。',
    ].join('\n'),
  });
  const importBtn = page.getByRole('button', { name: '从 DbOption 导入' });
  await importBtn.click();
  const importDlg = confirm('确认从 DbOption 导入环境');
  await importDlg.waitFor({ timeout: 5_000 });
  await shot(
    s3,
    '03-import-confirm',
    '「确认从 DbOption 导入环境」弹窗，说明将读取后端当前进程的 DbOption.toml 且不改写配置',
    '点「从 DbOption 导入」先弹确认，弹窗写明读什么、不会改什么。点「确定」。',
    importDlg.getByRole('button', { name: '确定' }),
  );
  await importDlg.getByRole('button', { name: '确定' }).click();
  await importDlg.waitFor({ state: 'hidden', timeout: 5_000 });
  const importedCard = card('导入环境 - 20260914_223001');
  await importedCard.waitFor({ timeout: 10_000 });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.card')).some((c) => c.textContent.includes('导入环境 - ') && c.className.includes('border-primary')),
    null,
    { timeout: 5_000 },
  );
  await shot(
    s3,
    '04-imported',
    '导入完成：环境数变为 4，新卡片「导入环境 - 20260914_223001」被自动选中，右侧显示其站点列表（空）',
    '导入成功：环境计数 +1，新卡片自动被选中（蓝色边框），右侧切到它的站点列表。',
    importedCard,
  );
  await hideToasts(page);

  // 4 -----------------------------------------------------------------------
  const s4 = section({
    title: '手填新建环境',
    cases: ['LF-02'],
    intro:
      '要接一个**别处**的协同环境（比如把上海分部纳入），就点「新建」手填。表单会用本站配置预填 MQTT / 文件服务地址（`localhost` 会被替换成本机出口 IP），你只需改成对方的地址。保存后监控台会**自动把本站加为该环境的第一个站点**。',
    after: [
      '字段含义：',
      '',
      '| 字段 | 填什么 |',
      '|---|---|',
      '| 环境名称 | 人能看懂的名字，例如「西南协同环境」 |',
      '| 文件服务地址 | 对端站点的文件服务根 URL，`envs/{id}/test-http` 会对它发 GET |',
      '| MQTT 主机 / 端口 | 对端 broker；`test-mqtt` 会 TCP 探这个地址 |',
      '| 位置标识（location） | 对端站点的 `location`，全网唯一，会写进 DbOption |',
      '| 数据库编号（location_dbs） | 逗号分隔，决定同步范围 |',
      '',
      '> 真后端上这一步由闭环用例 LF-02 覆盖（真的 `POST envs` + 自动 `POST envs/{id}/sites`）。',
    ].join('\n'),
  });
  await page.getByRole('button', { name: '新建' }).click();
  const envModal = page.locator('dialog.modal-open');
  await envModal.getByRole('heading', { name: '添加新环境' }).waitFor({ timeout: 5_000 });
  await envModal.getByPlaceholder('例如: 北京总部、上海分部').fill('西南协同环境');
  await envModal.getByPlaceholder('http://192.168.1.10:3000').fill('http://10.20.0.5:3100');
  await envModal.getByPlaceholder('如: 上海园区').fill('local-sw');
  await envModal.getByPlaceholder('7999,8001,8002').fill('8100');
  await envModal.getByPlaceholder('192.168.1.10', { exact: true }).fill('10.20.0.5');
  await shot(
    s4,
    '05-create-env-form',
    '「添加新环境」表单，已填入西南协同环境的名称、文件服务、位置、数据库编号与 MQTT 地址',
    '「新建」表单：改成对端的地址后点「保存环境」。',
    envModal.getByRole('button', { name: '保存环境' }),
  );
  await envModal.getByRole('button', { name: '保存环境' }).click();
  await envModal.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  const createdCard = card('西南协同环境');
  await createdCard.waitFor({ timeout: 10_000 });
  await page.getByText('demo').first().waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(
    s4,
    '06-created-env',
    '新环境「西南协同环境」出现在列表并被选中，右侧站点列表里已自动加入本站（demo）',
    '保存后：新环境被选中，右侧已自动加入本站作为第一个站点。',
    [createdCard, page.locator('table').first()],
  );
  await hideToasts(page);

  // 5 -----------------------------------------------------------------------
  const s5 = section({
    title: '先测连通，再动运行时',
    cases: ['DA-03', 'DA-04'],
    intro:
      '激活之前先在卡片上点两下探测：**测 MQTT** 让后端 TCP 探 `mqtt_host:mqtt_port`，**测文件服务** 让后端对 `file_server_host` 发一次 GET。结果以横条留在卡片里（绿 = 通，红 = 不通），同时右上角弹 toast。探测**由后端发起**，探的是后端到对端的网络，不是你浏览器到对端的。',
    after:
      '> 红条里会透出后端原话（`connection refused`、目标 URL、HTTP code、耗时），排网络问题时直接照着看。红条不代表页面出错，只是对端不通。',
  });
  const env2 = card('备用环境');
  await env2.scrollIntoViewIfNeeded();
  await env2.getByRole('button', { name: '测 MQTT' }).click();
  await bannerOf(env2, '测 MQTT：').waitFor({ timeout: 8_000 });
  await shot(
    s5,
    '07-test-mqtt',
    '「备用环境」卡片内出现绿色横条：测 MQTT：MQTT 连接可达 · 10.0.0.9:1883 · 3 ms',
    '「测 MQTT」成功：卡片里出现绿色结果条，写着目标地址与耗时。',
    bannerOf(env2, '测 MQTT：'),
  );
  await hideToasts(page);
  await env2.getByRole('button', { name: '测文件服务' }).click();
  await bannerOf(env2, '测文件服务：').waitFor({ timeout: 8_000 });
  await shot(
    s5,
    '08-test-http-failed',
    '「备用环境」卡片内出现红色横条：测文件服务：请求失败: connection refused · http://10.0.0.9:3100',
    '「测文件服务」失败：红色结果条透出后端原话与目标 URL。',
    bannerOf(env2, '测文件服务：'),
  );
  await hideToasts(page);

  // 6 -----------------------------------------------------------------------
  const s6 = section({
    title: '激活环境（切换运行时）',
    cases: ['DA-05', 'DA-06'],
    intro:
      '**激活** = 让后端从此按这个环境跑：plant-model-gen 会把环境写进 `DbOption.toml`，并在进程内重启 watcher + MQTT 订阅，立即生效。这是整页最重的动作，所以有确认弹窗；弹窗会点名当前已激活的环境「会先被停止」。',
    after: [
      '激活成功后三处同时变化：pill 换成新环境名、「已激活」徽标搬到新卡片、新卡片的「激活」置灰而旧卡片恢复可点。卡片里还会留一条绿色「激活环境：…」结果条。',
      '',
      '> 对着真实后端点「激活」会真的改它的配置——联调时先确认 `:3100` 后面是哪台实例（见 HANDOFF「先看清楚后端是谁」）。',
    ].join('\n'),
  });
  await env2.getByRole('button', { name: '激活' }).click();
  const actDlg = confirm('确认激活环境');
  await actDlg.waitFor({ timeout: 5_000 });
  await shot(
    s6,
    '09-activate-confirm',
    '「确认激活环境」弹窗：说明会写入 DbOption.toml 并重启 watcher + MQTT，且当前已激活的华东协同环境会先被停止',
    '「激活」前的确认弹窗：写明会改 DbOption.toml、重启 watcher + MQTT，并提示当前环境会先被停止。',
    actDlg.getByRole('button', { name: '确定' }),
  );
  await actDlg.getByRole('button', { name: '确定' }).click();
  await pill.getByText('运行时 · 已激活 备用环境').waitFor({ timeout: 10_000 });
  await bannerOf(env2, '激活环境：').waitFor({ timeout: 5_000 });
  await hideToasts(page);
  await shot(
    s6,
    '10-activated',
    '激活后：pill 显示「运行时 · 已激活 备用环境」，徽标移到备用环境卡片，卡片内有绿色「激活环境」结果条',
    '激活成功：pill、徽标、按钮状态一起切到「备用环境」。',
    [pill, env2],
  );

  // 7 -----------------------------------------------------------------------
  const s7 = section({
    title: '应用配置（只写盘，不重启）',
    cases: ['DA-07', 'DA-08'],
    intro:
      '**应用** 比激活轻：plant-model-gen 只把环境写进 `DbOption.toml`，**不**重启运行态，等你下次重启或重载配置时生效。适合「先把配置落盘，等维护窗口再切」的场景。同样有确认弹窗。',
    after:
      '> 后端 HTTP 200 但业务失败（例如 `DbOption.toml 不存在`）时，卡片里是红色「应用配置：…」条并透出原因，pill 不变——监控台按响应里的 `status` / `success` 判断成败，不是按 HTTP 状态码。',
  });
  await env2.getByRole('button', { name: '应用' }).click();
  await confirm('确认应用环境配置').waitFor({ timeout: 5_000 });
  await confirm('确认应用环境配置').getByRole('button', { name: '确定' }).click();
  await bannerOf(env2, '应用配置：').waitFor({ timeout: 8_000 });
  await hideToasts(page);
  await shot(
    s7,
    '11-apply-success',
    '「备用环境」卡片内绿色横条：应用配置：已写入配置文件。部分运行期组件需重启或重新加载配置后生效',
    '「应用」成功：绿色结果条提示已写入配置文件、部分组件需重载后生效。',
    bannerOf(env2, '应用配置：'),
  );
  const env1 = card('华东协同环境');
  await env1.scrollIntoViewIfNeeded();
  await env1.getByRole('button', { name: '应用' }).click();
  await confirm('确认应用环境配置').waitFor({ timeout: 5_000 });
  await confirm('确认应用环境配置').getByRole('button', { name: '确定' }).click();
  await bannerOf(env1, '应用配置：').waitFor({ timeout: 8_000 });
  await hideToasts(page);
  await shot(
    s7,
    '12-apply-failed',
    '「华东协同环境」卡片内红色横条：应用配置：db_options/DbOption.toml 不存在，无法写入当前配置',
    '「应用」业务失败的样子：红色结果条透出后端原因，运行时 pill 不变。',
    bannerOf(env1, '应用配置：'),
  );

  // 8 -----------------------------------------------------------------------
  const s8 = section({
    title: '站点：后端探测与编辑',
    cases: ['DA-09', 'DA-10', 'DA-11', 'DA-15'],
    intro:
      '点卡片标题选中环境，右侧就是它的站点表。每行有两种「在线」判断：**状态列**是你的浏览器直连对端 `/api/health` 的结果（受 CORS / 内网限制），**听诊器按钮**是让后端去探 `sites/{id}/test-http`——两者不一致时以后端探测为准。「编辑」复用添加站点弹窗，保存走 `PUT /api/remote-sync/sites/{id}`。',
    after:
      '> 探测结果写在行内（「可达 · 12 ms」/「不可达」），完整原因放在鼠标悬停的 title 里。',
  });
  await env1.locator('h5').click();
  await page.getByText('site-b-local').first().waitFor({ timeout: 10_000 });
  await page.getByText('site-c-remote').first().waitFor({ timeout: 10_000 });
  await row('site-b-local').locator('[data-tip="由后端探测该站点 HTTP 可达性"]').click();
  await row('site-b-local').locator('[data-testid="site-test-http-result"]').waitFor({ timeout: 8_000 });
  await row('site-c-remote').locator('[data-tip="由后端探测该站点 HTTP 可达性"]').click();
  await row('site-c-remote').locator('[data-testid="site-test-http-result"]').waitFor({ timeout: 8_000 });
  await hideToasts(page);
  await shot(
    s8,
    '13-sites-test-http',
    '华东协同环境的站点表：site-b-local 行显示「可达 · 12 ms」（绿），site-c-remote 行显示「不可达」（红）',
    '选中「华东协同环境」后的站点表：两行都点过听诊器，一绿一红。',
    [row('site-b-local').locator('[data-testid="site-test-http-result"]'), row('site-c-remote').locator('[data-testid="site-test-http-result"]')],
  );
  await row('site-b-local').locator('[data-tip="编辑站点"]').click();
  await page.getByRole('heading', { name: '编辑站点' }).waitFor({ timeout: 5_000 });
  const siteModal = page.locator('dialog.modal-open');
  await siteModal.locator('textarea').fill('北楼机房 · 2026-09 起承担备份节点');
  await shot(
    s8,
    '14-site-edit',
    '「编辑站点」弹窗，名称等字段已预填，备注改为新内容，底部是「保存修改」按钮',
    '「编辑站点」：字段预填，改完点「保存修改」（走 PUT sites/{id}）。',
    siteModal.getByRole('button', { name: '保存修改' }),
  );
  await siteModal.getByRole('button', { name: '保存修改' }).click();
  await page.getByRole('heading', { name: '编辑站点' }).waitFor({ state: 'hidden', timeout: 8_000 });
  await hideToasts(page);

  // 9 -----------------------------------------------------------------------
  const s9 = section({
    title: '停止运行时',
    cases: ['DA-12'],
    intro:
      '维护、换 broker、或者要彻底停掉跨站点同步时，点页头的「停止运行时」。plant-model-gen 会终止 watcher + MQTT 订阅并清掉激活态；确认弹窗会点名当前环境。',
    after:
      '停止后 pill 变成「运行时 · 未激活」，「停止运行时」按钮消失，所有卡片的「激活」恢复可点、徽标消失——再点任意一张卡片的「激活」即可恢复。',
  });
  await page.getByRole('button', { name: '停止运行时' }).click();
  const stopDlg = confirm('确认停止运行时');
  await stopDlg.waitFor({ timeout: 5_000 });
  await shot(
    s9,
    '15-stop-confirm',
    '「确认停止运行时」弹窗：将终止后端 watcher + MQTT 订阅（当前环境：备用环境）',
    '「停止运行时」的确认弹窗，点名当前环境。',
    stopDlg.getByRole('button', { name: '确定' }),
  );
  await stopDlg.getByRole('button', { name: '确定' }).click();
  await pill.getByText('运行时 · 未激活').waitFor({ timeout: 10_000 });
  await hideToasts(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(
    s9,
    '16-stopped',
    '停止后：pill 显示「运行时 · 未激活」，「停止运行时」按钮消失，卡片上不再有「已激活」徽标',
    '停止后的页头：pill 变为「未激活」，停止按钮消失。',
    pill,
  );

  // 10 ----------------------------------------------------------------------
  const s10 = section({
    title: '出错时你会看到什么',
    cases: ['DA-13'],
    intro:
      '后端 5xx、网络断开、token 过期，监控台都不会白屏或弹浏览器原生 alert：动作类失败落成红色结果条「…：请求失败 — <原因>」+ 一条错误 toast；401/403 会自动弹回登录框。',
    after: [
      '排查顺序：',
      '',
      '1. 红条里的原因是后端原话，先照它查（`connection refused` = 对端没起 / 防火墙；`DbOption.toml 不存在` = 后端工作目录不对）。',
      '2. 左下角状态条若显示后端离线，先看 `:3100` 上跑的是不是你要的实例。',
      '3. 再看后端日志；监控台不吞错，浏览器控制台里也有同样的 `console.error`。',
    ].join('\n'),
  });
  const env3 = card('故障环境');
  await env3.scrollIntoViewIfNeeded();
  await env3.getByRole('button', { name: '测 MQTT' }).click();
  await bannerOf(env3, '测 MQTT：请求失败').waitFor({ timeout: 8_000 });
  await shot(
    s10,
    '17-error-5xx',
    '「故障环境」卡片内红色横条：测 MQTT：请求失败 — internal error（后端返回 HTTP 500）',
    '后端返回 500 时：红色「请求失败 — internal error」结果条，页面照常可用。',
    bannerOf(env3, '测 MQTT：请求失败'),
  );
  await hideToasts(page);
  await page.close();
}

// ---------------------------------------------------------------------------
// 附录：plant-web-server（standalone-real）下同一套按钮的不同表现
// ---------------------------------------------------------------------------
async function capturePwsAppendix(browser, base) {
  const state = createState('pws');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await attachMock(page, state);
  const pill = page.locator('[data-testid="remote-runtime-status"]');
  const confirm = (title) => page.locator('.n-dialog', { hasText: title });

  const sa = section({
    appendix: 'A',
    title: '同一套按钮在 plant-web-server 上的差别',
    cases: ['DA-02', 'DA-12'],
    intro: [
      '本机 `:3100` 现在跑的是 `../plant-web-server`（standalone-real），不是 plant-model-gen 的 `web_server`。路由相同、语义更轻，监控台两边都兼容，但你看到的现象不同：',
      '',
      '| 动作 | plant-model-gen | plant-web-server |',
      '|---|---|---|',
      '| 激活 | 写 `DbOption.toml` + 重启 watcher / MQTT | 只切 `envs[].active` 标记 + 记一条 activate 任务 |',
      '| 应用 | 只写 `DbOption.toml` | = 激活 + 一条 apply 任务，不写文件 |',
      '| 测 MQTT / 测文件服务 | 真探 `mqtt_host:port` / GET `file_server_host` | 只 TCP 探 env 的 `host/port` 字段，**不读** `mqtt_host` / `file_server_host` → 监控台建的 env 一律「目标不可达 · 127.0.0.1」 |',
      '| 停止运行时 | 清激活态，pill →「未激活」 | 只把活动任务标 Stopped，`running` 恒 true → pill **仍**显示已激活 |',
      '| 删除环境 | 级联删站点 | 不级联（sites.json 留孤儿） |',
      '| 从 DbOption 导入 | 每次新建 | 覆盖同一个 `dboption-<site_id>` |',
      '',
      '这些差异已记在 `AGENTS.md` §4.3.2，等后端修正后监控台的判定不用改（统一走 `isRemoteSyncActionOk()`）。',
    ].join('\n'),
    after: '',
  });

  async function shot(file, alt, caption, highlight) {
    const target = path.join(shotDir, `${file}.png`);
    const take = () => page.screenshot({ path: target, fullPage: false });
    if (highlight) await withHighlight(highlight, take);
    else await take();
    sa.shots.push({ file: `${file}.png`, alt, caption });
    console.log(`  shot ${file}.png`);
  }

  await page.goto(`${base}topology`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({ timeout: 15_000 });
  await page.getByPlaceholder('ADMIN_USER 环境变量值').fill('admin');
  await page.getByPlaceholder('ADMIN_PASS 环境变量值').fill('admin');
  await page.getByRole('dialog').getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/topology', { timeout: 15_000 });
  await pill.getByText('运行时 · 已激活 华东协同环境').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(
    'a1-pws-overview',
    'plant-web-server 形状下的首屏：pill 同样显示「已激活 华东协同环境」，激活态来自 envs 列表里的 active 标记',
    'plant-web-server 下首屏与 plant-model-gen 一样，只是 pill 的悬停详情换成 `mode: standalone-real · 活动任务: N`。',
    pill,
  );
  await page.getByRole('button', { name: '停止运行时' }).click();
  await confirm('确认停止运行时').waitFor({ timeout: 5_000 });
  await confirm('确认停止运行时').getByRole('button', { name: '确定' }).click();
  await page.waitForTimeout(1_500);
  await hideToasts(page);
  await shot(
    'a2-pws-after-stop',
    'plant-web-server 下点过「停止运行时」后：toast 成功，但 pill 仍显示「已激活 华东协同环境」',
    '同样点了「停止运行时」并成功，但 plant-web-server 不清 `active`，pill 照旧——这是后端语义，不是监控台没刷新。',
    pill,
  );
  await page.close();
}

// ---------------------------------------------------------------------------
// Markdown 渲染
// ---------------------------------------------------------------------------
function renderMarkdown() {
  const today = new Date().toISOString().slice(0, 10);
  const main = sections.filter((s) => !s.appendix);
  const appendices = sections.filter((s) => s.appendix);
  const lines = [];
  const img = (shot) => `![${shot.alt}](./screenshots/topology-deploy/${shot.file})`;

  lines.push('# 异地部署操作教程 · `/topology` 部署动作面');
  lines.push('');
  lines.push('> 适用对象：要把某个协同环境推到后端运行时、或排查站点连通性的实施 / 运维人员。  ');
  lines.push('> 预计用时：10–15 分钟。  ');
  lines.push(`> 生成方式：本文由 \`scripts/topology-deploy-tutorial.mjs\` 于 ${today} 自动生成——Playwright 驱动**真实前端页面**（\`vite preview\` 产物），后端用与自动化用例 \`DA-01–16\` **同一份 mock**（\`scripts/lib/topology-deploy-mock.mjs\`），按操作顺序逐步截图。每一节标注了验证该步骤的自动化用例编号，用例说明见 \`docs/e2e-smoke/remote-deploy-auto-test-cases.md\`。  `);
  lines.push('> 主线按 plant-model-gen 后端语义讲（激活 = 写 `DbOption.toml` + 重启 watcher / MQTT）；本机 `:3100` 若跑的是 plant-web-server，看附录 A 的差别。');
  lines.push('');
  lines.push('## 你将学会');
  lines.push('');
  lines.push('- 从 DbOption 一键导入、或手填新建一个协同环境。');
  lines.push('- 用「测 MQTT / 测文件服务 / 站点探测」在动运行时之前确认对端可达。');
  lines.push('- 分清「应用」（只写盘）与「激活」（写盘 + 重启运行态），并看懂运行时 pill 与「已激活」徽标。');
  lines.push('- 停止运行时、编辑站点，以及后端出错时页面会怎么提示。');
  lines.push('');
  lines.push('## 0. 三个词');
  lines.push('');
  lines.push('| 词 | 是什么 | 在页面上 |');
  lines.push('|---|---|---|');
  lines.push('| **环境（Env）** | 一组参与同一次异地协同的站点 + 它们共用的 MQTT / 文件服务地址；对应后端 `remote_sync_envs` | 左侧卡片 |');
  lines.push('| **站点（Site）** | 环境下的一个对端节点（`location` + `http_host`） | 右侧表格的一行 |');
  lines.push('| **运行时（Runtime）** | 后端此刻按哪个环境在跑 watcher + MQTT 订阅 | 页头 pill + 卡片「已激活」徽标 |');
  lines.push('');
  lines.push('一次完整的部署就是：**建环境 → 测连通 → 激活 → 看 pill 确认 →（需要时）停止**。下面按这个顺序走。');
  lines.push('');

  main.forEach((sec, i) => {
    lines.push(`## ${i + 1}. ${sec.title}`);
    lines.push('');
    lines.push(sec.intro);
    lines.push('');
    for (const shot of sec.shots) {
      lines.push(img(shot));
      lines.push('');
      lines.push(`*${shot.caption}*`);
      lines.push('');
    }
    if (sec.after) {
      lines.push(sec.after);
      lines.push('');
    }
    lines.push(`> 自动化用例：${sec.cases.map((c) => `\`${c}\``).join(' · ')}`);
    lines.push('');
  });

  for (const sec of appendices) {
    lines.push(`## 附录 ${sec.appendix}. ${sec.title}`);
    lines.push('');
    lines.push(sec.intro);
    lines.push('');
    for (const shot of sec.shots) {
      lines.push(img(shot));
      lines.push('');
      lines.push(`*${shot.caption}*`);
      lines.push('');
    }
    if (sec.after) {
      lines.push(sec.after);
      lines.push('');
    }
    lines.push(`> 自动化用例：${sec.cases.map((c) => `\`${c}\``).join(' · ')}（pws 形状）`);
    lines.push('');
  }

  lines.push('## 附录 B. 步骤 ↔ 自动化用例对照');
  lines.push('');
  lines.push('| 教程步骤 | 用例 | 验证点 |');
  lines.push('|---|---|---|');
  const caseNotes = {
    'DA-01': '登录并重定向回 /topology（两种 login 形状）',
    'DA-02': '运行时 pill 初始态、已激活徽标、激活按钮禁用',
    'DA-03': '测 MQTT 成功 → 绿色结果条含目标地址',
    'DA-04': '测文件服务失败 → 红色结果条含原因',
    'DA-05': '激活 → 确认弹窗文案 → 取消 = 0 写请求',
    'DA-06': '激活 → 确定 → pill / 徽标 / 按钮随之切换',
    'DA-07': '应用成功 → 绿色结果条',
    'DA-08': '应用业务失败（HTTP 200）→ 红色结果条，运行态不变',
    'DA-09': '站点 test-http 可达',
    'DA-10': '站点 test-http 不可达 + title 含原因',
    'DA-11': '编辑站点 → PUT sites/{id} 落到后端',
    'DA-12': '停止运行时 → pill 跟随后端语义',
    'DA-13': '后端 5xx → 「请求失败」结果条，无未捕获错误',
    'DA-14': '动作后重拉 runtime/status 与 env 列表',
    'DA-15': '站点表 1440 宽度无横向溢出',
    'DA-16': '从 DbOption 导入：取消 0 写、确定 1 次、新卡选中',
    'LF-02': '（真后端闭环）新建 env + 自动加入本站',
  };
  main.forEach((sec, i) => {
    for (const c of sec.cases) lines.push(`| ${i + 1}. ${sec.title} | \`${c}\` | ${caseNotes[c] ?? ''} |`);
  });
  lines.push('');
  lines.push('## 附录 C. 重新生成本教程');
  lines.push('');
  lines.push('改了 `/topology` 的文案或布局，先跑用例再重出图，两者用的是同一份 mock：');
  lines.push('');
  lines.push('```powershell');
  lines.push('npm run smoke:topology-deploy -- --build      # DA-01–16 × pmg/pws，先保证全过');
  lines.push('npm run tutorial:topology-deploy              # 重出 docs/tutorials/screenshots/topology-deploy/*.png + 本文');
  lines.push('node scripts/generate-remote-collab-docx.mjs docs/tutorials/topology-deploy-tutorial.md   # 需要 Word 版时（docx 不入库）');
  lines.push('```');
  lines.push('');
  lines.push('截图是 mock 数据（环境名、地址都是演示值）；真实联调请按 `HANDOFF.md`「先看清楚后端是谁」确认 `:3100` 后面的实例，再对着它操作。');
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
