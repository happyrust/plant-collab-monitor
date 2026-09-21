import type { TourStep } from '@/stores/guideTour';

/**
 * 「协同配置向导」（`/guide`，2026-09-21）的步骤内容 —— 与 `docs/tutorials/topology-deploy-live-tutorial.md`
 * 同一条主线：建环境 → 测连通 → 激活 → 登记对端 → 核对 → 停止。文案按 plant-web-server 中继语义写，
 * pmg（plant-model-gen）差异在 notes 里点明。`tour` 是跳到 `/topology` 后的高亮导览，目标靠 `data-tour` 定位。
 */

export type GuideStepId =
  | 'prepare'
  | 'concepts'
  | 'create-env'
  | 'probe'
  | 'activate'
  | 'sites'
  | 'verify'
  | 'stop';

/** 「要填什么」表格的一行；`key` 指向 `GET /api/site/info` 里的字段，页面会填入本站实时值 */
export interface GuideField {
  label: string;
  hint: string;
  key?: 'file_server_host' | 'mqtt' | 'location' | 'location_dbs';
  example?: string;
}

export interface GuideStepDef {
  id: GuideStepId;
  title: string;
  /** 一句话目标 */
  goal: string;
  why: string;
  /** 在页面上怎么做（有序） */
  howto: string[];
  fields?: GuideField[];
  notes?: string[];
  /** 「完成判定」怎么判（给人看的说明；真正的判定在视图里） */
  checkHint: string;
  /** 是否能被自动判定完成 */
  checkable: boolean;
  /** 去哪个页面操作 */
  route?: string;
  /** 高亮导览（在 route 页面上） */
  tour?: TourStep[];
}

const T = (target: string, title: string, body: string, extra: Partial<TourStep> = {}): TourStep => ({
  target: `[data-tour="${target}"]`,
  title,
  body,
  ...extra,
});

export const COLLAB_GUIDE_STEPS: GuideStepDef[] = [
  {
    id: 'prepare',
    title: '准备：后端在线、管理员已登录',
    goal: '监控台连着你要配置的那台站点后端，并且拿到了管理员 token。',
    why: '异地拓扑 / 中继台账等页面的接口都是管理员端点（`/api/remote-sync/*`），没 token 一律拒绝；而「激活」会改写这台后端的 `DbOption.toml`，动手之前先看清端口后面是哪台实例。',
    howto: [
      '看下面「本站身份」卡：显示的 site_id / location / 配置文件路径就是当前接的后端；不是你要配的那台，先改 `VITE_API_TARGET` 再起 dev server。',
      '未登录时点「登录」（开发态默认会用 admin / admin 自动登录，登不上才弹框）。',
      '登录后侧栏左下角会显示 `admin ⏎`。',
    ],
    notes: [
      '本机联调请对隔离环境（`runtime/local-collab/site-a`，`:4100`）操作，不要对 `:3100` 那台历史实例点「激活」。',
    ],
    checkHint: '`GET /api/site/info` 有响应 且 已持有管理员 token。',
    checkable: true,
  },
  {
    id: 'concepts',
    title: '三个词与一条主线',
    goal: '分清「环境 / 站点 / 运行时」，知道页面上哪块对应哪个。',
    why: '整个 `/topology` 页面就是围着这三个词转的；分不清就会把对端的 location 填进环境、或以为「应用」等于生效。',
    howto: [
      '环境（Env）= 本站怎么接入协同：共用 broker（mqtt_host / mqtt_port）+ 本站身份（location / 自有库 location_dbs / 对端来下载 CBA 的 file_server_host）。激活写进本站 DbOption.toml 的就是这五个键。→ 页面左侧卡片。',
      '站点（Site）= 环境下登记的一个对端节点（location + http_host），给拓扑图、探测、详情用；中继靠 MQTT 发现对端，不靠它。→ 页面右侧表格的一行。',
      '运行时（Runtime）= 本站中继运行态：MQTT 订阅（收对端广播）+ 源文件轮询（发本站变更）此刻按哪个环境在跑。→ 页头 pill + 卡片「已激活」徽标。',
      '一次完整部署：建环境 → 测连通 → 激活 → 看 pill 与 runtime/status 确认 →（需要时）停止。',
    ],
    checkHint: '概念页，不做判定。',
    checkable: false,
    route: '/topology',
    tour: [
      T('runtime-pill', '运行时 pill', '每 30 秒读一次 GET /api/remote-sync/runtime/status，回答「本站中继此刻按哪个环境在跑」。鼠标停上去能看到 env_id、MQTT 连接状态、mode。', { advanceOnClick: false }),
      T('env-list', '环境（Env）列表', '每张卡是一份「本站怎么接入协同」的配置：broker 地址 + 本站身份。卡片下方四个按钮就是部署动作面：测 MQTT / 测文件服务 / 应用 / 激活。', { advanceOnClick: false }),
      T('sites-panel', '站点（Site）列表', '选中一张环境卡后，这里列它登记的对端节点。行尾「听诊器」由后端探测该站点 HTTP 可达，「笔」编辑地址。', { advanceOnClick: false }),
    ],
  },
  {
    id: 'create-env',
    title: '新建协同环境（填本站身份 + 共用 broker）',
    goal: '左侧多一张带 broker 地址的环境卡。',
    why: '真正要跑中继，得有一张带 mqtt_host 的卡；「从 DbOption 导入」生成的本站登记卡不带连接参数，对它激活 = 按文件现状原样起中继、一个键都不改。',
    howto: [
      '（可选）先点「从 DbOption 导入」，给本站登记一张卡（id 固定 dboption-<site_id>，重复导入只是覆盖），认识一下本站当前的工程 / 端口 / 配置文件路径。',
      '点「新建」，按下表填——填的是本站怎么接入协同，不是对端长什么样。表单会用本站配置预填，通常只改名字和 broker 地址。',
      '点「保存环境」。新卡被选中，右侧自动加入本站作为第一个站点（它的 HTTP 地址会被填成监控台自己，第 6 步要改）。',
    ],
    fields: [
      { label: '环境名称', hint: '人能看懂的名字', example: '演示环境-总部中继' },
      { label: '文件服务地址 file_server_host', hint: '本站的 CBA 目录地址：本站广播时带上它，对端从 <它>/<file>.cba 下载', key: 'file_server_host' },
      { label: 'MQTT 主机 / 端口', hint: '两站共用的 broker；「测 MQTT」会 TCP 探它', key: 'mqtt' },
      { label: '位置标识 location', hint: '本站的 location，全网唯一；对端消息里 location 与本站相同的会被忽略', key: 'location' },
      { label: '数据库编号 location_dbs', hint: '本站自有库：只广播这些库的变更', key: 'location_dbs' },
    ],
    notes: [
      '想亲眼看到「激活确实改了文件」，可以比文件里多标一个自有库（例如 6000, 6001）；收尾记得按第 1 步卡里的原值复原。',
    ],
    checkHint: '环境列表里至少有一张带 mqtt_host 的卡。',
    checkable: true,
    route: '/topology',
    tour: [
      T('import-env', '（可选）从 DbOption 导入', '读后端自己进程那份 DbOption.toml，按本站 id 生成一张登记卡。不改配置、不激活。想先看看本站长什么样就点它，不想就「下一步」。'),
      T('create-env', '点「新建」', '弹出表单后按向导「要填什么」那张表填：本站的 file_server_host、共用 broker 的 mqtt_host / mqtt_port、本站 location、本站自有库 location_dbs。填完点「保存环境」。'),
    ],
  },
  {
    id: 'probe',
    title: '先测连通，再动运行时',
    goal: '选中的环境「测 MQTT」「测文件服务」两条都是绿的。',
    why: '探测由后端发起，探的是「后端到目标」的网络：broker 端口没开、/assets/archives 没挂出来，都在这一步就能发现，别等激活了才发现中继连不上。',
    howto: [
      '在左侧选中要用的环境卡，点「测 MQTT」：后端 TCP 连 mqtt_host:mqtt_port。绿 = 通。',
      '点「测文件服务」：后端对 file_server_host 发一次 GET（本站的 /assets/archives 能不能被访问到，对端将来就是从这里下载 CBA）。绿 = 通。',
      '红条会透出后端原话（connection refused / HTTP 404 / 目标 URL / 耗时），照着排网络问题。红只说明目标不通，不代表页面出错。',
      '也可以直接在本页点「帮我测」，结果一样是后端发起的。',
    ],
    checkHint: '这张卡的「测 MQTT」「测文件服务」最近一次都可达——在本页「帮我测」或在 /topology 卡片上测都算（结果按环境记在本标签页的 sessionStorage，刷新不丢；换标签页要重测）。',
    checkable: true,
    route: '/topology',
    tour: [
      T('env-test-mqtt', '测 MQTT', '后端 TCP 探这张卡的 mqtt_host:mqtt_port。结果条留在卡片里：绿 = 通，红 = 不通并带原因。', { missingHint: '先在左侧点一张环境卡把它选中，按钮会出现在那张卡下面。' }),
      T('env-test-http', '测文件服务', '后端对 file_server_host 发一次 GET。真实部署里第一次常是红的：/assets/archives 没挂出来、地址写成了对端。', { missingHint: '先在左侧点一张环境卡把它选中。' }),
    ],
  },
  {
    id: 'activate',
    title: '激活环境（会真的改本站配置文件）',
    goal: '页头 pill 变成「已激活 <环境名>」，卡片挂上绿色徽标。',
    why: '激活 = 让本站从此按这个环境跑中继。plant-web-server 先把五个连接键写进本站 DbOption.toml（环境上没有的键不动），再起 / 重建中继运行态，不用重启进程；写不进文件或中继起不来整条失败，不会留下「账面已激活、跑的还是旧配置」的中间态。',
    howto: [
      '在选中的环境卡上点「激活」→ 确认弹窗写明会写哪五个键、会先停掉当前运行态 → 确定。',
      '成功后三处同时变：pill →「运行时 · 已激活 <环境名>」、卡片右上角绿色「已激活」徽标、卡内结果条「激活环境：成功」。',
      '想核实：GET /api/remote-sync/runtime/status 应见 active:true、relay:true、mqtt_connected:true，relay_location / relay_mqtt_host / relay_mqtt_port 就是这次实际用的连接参数。',
    ],
    notes: [
      '「应用」在 plant-web-server 上只落账：标为当前环境 + 记一条 apply 任务，不写文件、不动运行态，更像「先选中、稍后再切」的书签。要让连接参数真正生效只有「激活」一条路。（旧 pmg 后端的「应用」会写文件不重启。）',
      '这是整页最重的动作。对真实后端点之前确认端口后面是哪台实例。',
    ],
    checkHint: 'runtime/status 的 active 为 true（pmg：running 且有账面 active 环境）。',
    checkable: true,
    route: '/topology',
    tour: [
      T('env-activate', '点「激活」', '写五个键进本站 DbOption.toml + 起 / 重建中继运行态。会弹确认框把后果说清楚，看完再点「确定」。', { missingHint: '先在左侧点一张环境卡把它选中；已经是激活态的卡「激活」按钮是灰的。' }),
      T('runtime-pill', '看 pill 变化', '激活成功后这里变绿：「运行时 · 已激活 <环境名>」。停上去能看到 env_id 与 MQTT 连接状态。', { advanceOnClick: false }),
      T('env-apply', '「应用」和「激活」差在哪', 'plant-web-server 的「应用」只落账（标当前环境 + 一条 apply 任务），不写文件、不动运行态。要生效只有「激活」。', { advanceOnClick: false, missingHint: '先在左侧点一张环境卡把它选中。' }),
    ],
  },
  {
    id: 'sites',
    title: '登记对端站点：探测 → 改地址 → 再探测',
    goal: '当前环境下至少一个站点，且探测可达。',
    why: '右表登记的是对端节点，给拓扑图、探测和「查看站点详情」用。保存环境时自动加进来的那个站点指向的是你自己（监控台地址），不是对端 —— 真要登记对端必须手动改成对端地址。生产 / `vite preview` 下对它探测是 HTTP 404；`npm run dev` 下 vite 会对任何路径回 index.html（200），探测会「可达」，那是误报，地址照样要改。',
    howto: [
      '选中环境，看右侧站点表：自动加入的「本站」那行，点行尾「听诊器」探测 → 生产 / preview 预期红：HTTP 404 · <监控台地址>/metadata.json（开发态 `npm run dev` 会绿——vite 把 /metadata.json 当页面路由回了 index.html，后端只看状态码；别被它骗了）。',
      '点「笔」编辑，把「HTTP 服务地址」改成对端 plant-web-server 的 /files/output（它下面有 metadata.json），备注写明改动原因，保存。',
      '再点「听诊器」→ 预期绿：HTTP 200。',
      '要加更多对端，点「添加站点」手填 location + http_host。',
    ],
    fields: [
      { label: 'HTTP 服务地址 http_host', hint: '对端 plant-web-server 的文件输出地址，探测请求 <它>/metadata.json', example: 'http://127.0.0.1:4101/files/output' },
      { label: '位置标识 location', hint: '对端的 location（与本站不同）', example: 'local-b' },
    ],
    checkHint: '选中的环境下 sites ≥ 1，且其中至少一个站点最近一次探测可达——在本页站点表或 /topology 站点行探都算（同样记在 sessionStorage）。',
    checkable: true,
    route: '/topology',
    tour: [
      T('site-test-http', '探测这一行', '让后端对这个站点的 http_host 拼上 /metadata.json 发一次 GET。自动加进来的「本站」行指向监控台自己：生产 / preview 下不通（404）；开发态 vite 会回 200 的 index.html，那是误报。', { missingHint: '先在左侧选中一个环境；该环境下还没有站点就先点「添加站点」。' }),
      T('site-edit', '编辑站点', '把「HTTP 服务地址」改成对端真实可达的 /files/output，保存后再探一次，应当变绿。', { missingHint: '先在左侧选中一个环境；该环境下还没有站点就先点「添加站点」。' }),
      T('add-site', '添加更多对端', '手填对端的名称 / location / HTTP 服务地址 / 负责 dbnums。也可以粘一段对端的 site/info JSON 一键导入。', { missingHint: '先在左侧选中一个环境。' }),
    ],
  },
  {
    id: 'verify',
    title: '核对运行态与台账',
    goal: 'MQTT 已连上，中继在跑；台账开始有行。',
    why: '页面上的成功提示不等于后端真在跑。runtime/status 的 mqtt_connected 与 relay 才是中继活着的证据；每一次广播 / 接收都记在 SQLite 台账里，`/ledger` 能点开看 RefNo 级变更清单。',
    howto: [
      '看本页「运行态」卡：active / relay / mqtt_connected 三项应全为 true，relay_location 应是本站 location。',
      '侧栏「中继台账」：激活成功时三张表就建好了；有变更被广播 / 接收后这里出现行，点任意一行看 RefNo 级变更清单。',
      '对端也要激活自己的环境（同一 broker、不同 location），两边才互相收得到。',
    ],
    checkHint: 'runtime/status 的 active 与 mqtt_connected 为 true（pmg 无 mqtt_connected 时只看 active）。',
    checkable: true,
    route: '/ledger',
  },
  {
    id: 'stop',
    title: '停止运行时 / 复原',
    goal: '知道「停」停的是什么，以及怎么把配置文件写回原值。',
    why: '「停止运行时」停的是运行态不是配置：MQTT 订阅与源文件轮询都停、pill 回到「运行中 · 未激活环境」，但 DbOption.toml 里刚写进去的五个键不回滚、账面「当前环境」标记也留着，再点一次「激活」就按同一份配置跑起来。',
    howto: [
      '页头「停止运行时」→ 确认。后端 runtime.active 变 false、env_id 变 null。',
      '看下面的对照表：「开跑前」是第 1 步首次读到 site/info 时的快照，「文件现状」是后端刚重读的 DbOption.toml（plant-web-server ≥ 2026-09-21 每次重读；更老的版本只回启动快照，表下会有红字提醒）。哪一键被激活改过会标黄。',
      '要把配置文件写回原值：按「开跑前」那一列的五个键新建一张「恢复卡」并激活；再激活一次，响应 runtime_config.changed 应为 false，说明文件已与原值一致；然后删掉恢复卡、按需「停止运行时」。',
      '删除环境：plant-web-server 2026-09-21 起会级联删它下面的站点（响应带 deleted_sites）。',
    ],
    checkHint: '收尾步骤，不做判定。',
    checkable: false,
    route: '/topology',
    tour: [
      T('stop-runtime', '停止运行时', '停中继运行态：MQTT 订阅 + 源文件轮询。不回滚 DbOption.toml，不清账面标记。', { missingHint: '运行时没在跑时这个按钮不显示——先激活一个环境。' }),
    ],
  },
];

export function getGuideStep(id: string | null | undefined): GuideStepDef | undefined {
  return COLLAB_GUIDE_STEPS.find((s) => s.id === id);
}

/** 按步骤 id 取高亮导览（没有导览的步骤返回 undefined） */
export function getGuideTour(id: string | null | undefined): TourStep[] | undefined {
  const step = getGuideStep(id);
  return step?.tour && step.tour.length > 0 ? step.tour : undefined;
}
