# AGENTS.md · plant-collab-monitor

> 给 AI agent / 新接手工程师用。介绍项目架构、关键决策、编码约定与查阅入口。
> 历史详细信息在 `README.md` 与 `docs/plans/`，本文是浓缩版。

---

## 1. 一句话定位

异地协同站点专业监控台，从 `web-server/frontend` 剥离出的独立 Vue 3 SPA，**唯一后端**是 `plant-model-gen` 的 `web_server`（默认 `http://127.0.0.1:3100`）。

---

## 2. 快速启动

```bash
# 后端（另一个终端，必须先起）
cd ../plant-model-gen
$env:ADMIN_USER='admin'; $env:ADMIN_PASS='admin'    # PowerShell
cargo run --bin web_server --features web_server     # 监听 :3100

# 前端
npm install
npm run dev          # → http://localhost:4000
npm run type-check   # vue-tsc -b · 必须 0 errors
npm run build        # 产物 dist/ · base 默认 /monitor/
```

环境要求：Node **≥ 20.19**（Vite 8 / Tailwind 4 toolchain）。

环境变量：
- `VITE_API_TARGET`：dev 期 vite proxy 目标（默认 `http://127.0.0.1:3100`）
- `VITE_API_BASE`：axios baseURL（生产同源时留空）
- `VITE_BASE`：vite 部署 base（生产默认 `/monitor/`）
- `VITE_ADMIN_AUTO_LOGIN`：管理员自动登录开关，缺省 = 开发态开 / 生产构建关（`stores/adminAuth.ts` `adminAutoLogin`，2026-09-21）
- `VITE_ADMIN_USER` / `VITE_ADMIN_PASS`：自动登录与登录框预填的账密，缺省 `admin / admin`（须与后端 `ADMIN_USER / ADMIN_PASS` 一致）

---

## 3. 技术栈速查

| 层 | 选型 |
|---|---|
| 框架 | Vue 3.5 + `<script setup lang="ts">` + Vite 8.0 + TypeScript 6.0 strict |
| UI | Naive UI 2.40 + Tailwind 4.2 + DaisyUI 5.5 |
| 状态 | Pinia 3.0（`stores/adminAuth.ts` + `stores/appStatus.ts`）|
| 路由 | vue-router 5.0（`router/index.ts` 含 `requiresAdmin` 守卫）|
| HTTP | axios 1.7 + admin token interceptor |
| SSE | 自研 `composables/useSse.ts`（双路径：原生 EventSource / fetch+ReadableStream + Bearer）|
| 图表 | echarts 6（独立 vendor chunk，按需 import）|
| 自动 import | `unplugin-auto-import` + `unplugin-vue-components`（NaiveUiResolver）|

---

## 4. 关键架构决策

### 4.1 admin login flow（必须理解）

**完整闭环路径**：

```
未登录访问 admin 视图（meta.requiresAdmin = true）
  → router.beforeEach 拦截
  → sessionStorage 写 admin_redirect_after_login = '/topology'
  → adminAuth.promptLogin('该页面需要管理员登录')
  → router.push({ name: 'dashboard', replace: true })
  → LoginDialog 弹起（adminAuth.loginVisible = true）
  → 输 admin/admin → POST /api/admin/auth/login → token 存 sessionStorage + adminAuth store
  → handleLogin: consumeRedirectAfterLogin() 取出 '/topology'
  → router.push('/topology') → 视图加载
  → axios interceptor 自动注入 Authorization: Bearer ${token}
  → SSE 流的 useSse 也通过 getToken() 注入 token
```

**守卫视图**：`/topology` `/ledger` `/mqtt/nodes` `/archives` `/site-config` `/settings`（详见 `router/index.ts` `meta.requiresAdmin`；`/topology-viz` 不设门）。

**开发态自动登录（2026-09-21）**：上面「→ LoginDialog 弹起」之前多一步 `adminAuth.ensureAutoLogin()`——`adminAutoLogin.enabled`（缺省 `import.meta.env.DEV`）为真就用配置账密静默 `login`，成功直接放行、失败才 `promptLogin('该页面需要管理员登录（自动登录失败：…）')`，登录框预填那对账密。`App.vue` 的 `onMounted`（无会话时）与 `registerUnauthorizedHandler`（401 / 503 时）同样先 `ensureAutoLogin()` 再决定弹不弹。并发调用共用一个请求；`http.ts` 对 `/api/admin/auth/login` 自己的 401 不再触发 `onUnauthorized`（那是账密不对，不是会话过期）。生产构建默认关，`vite preview` 上的 smoke / 教程（`DA-01`、`phase7-plus`）仍走手工登录流，不受影响。

### 4.2 SSE 双路径

`useSse` 根据 `getToken()` 返回值切换：

| 路径 | 触发条件 | 实现 |
|---|---|---|
| **A · 原生 EventSource** | `getToken()` 返回 null/undefined | `new EventSource(url)`，浏览器自带重连 |
| **B · fetch + ReadableStream** | `getToken()` 返回非空字符串 | `fetch(url, { headers: { Authorization: 'Bearer <token>' } })` + 自实现 `parseSseChunk` 解析 `data:` `event:` `id:` 字段 + `\n\n` 分隔事件 + `AbortController` 配合 `onUnmounted` 关流 |

**为什么不直接 EventSource**：HTML5 `EventSource` 标准**不支持自定义 header**（无法注入 Authorization），admin-gated SSE 必须 Path B。

**指数退避重连**：`initialBackoffMs * 2^attempt`，cap `maxBackoffMs = 30s`。`reconnectAttempt` 与 `nextRetryAt` 双暴露给 UI 做 `重连中 #N · Xs 后重试` 倒计时。

### 4.3 API 三轨收口（已完成 G1）

历史曾有 3 种调用方式：`useApi.js`（已删）/ 视图裸 fetch（已删）/ `src/api/*.ts`（保留为唯一）。

**所有视图必须只走 `src/api/*.ts`**，禁止裸 `fetch()`（仅跨站点 site/info 这类绝对 URL 例外，参考 `TopologyView.vue` `handleViewSiteDetails`）。

API 模块清单：

| 模块 | endpoint 前缀 | admin-gated |
|---|---|---|
| `adminAuthApi` | `/api/admin/auth/*` | — |
| `syncApi` | `/api/sync/*` | 否 |
| `mqttApi` | `/api/mqtt/*` | 部分 |
| `siteConfigApi` | `/api/site-config/*` | 否 |
| `incrementalApi` | `/api/incremental/*`（11 endpoint） | 否 |
| `remoteSyncApi` | `/api/remote-sync/*`（31 方法 · 对应后端 `remote_sync_handlers.rs::create_remote_sync_routes()` 35 路由；含部署动作 `apply / activate / test-mqtt / test-http / runtime/stop`） | **是** |
| `deploymentSitesApi` | `/api/deployment-sites`（公开只读 `list / get` · 2 endpoint；2026-09-14 收敛，其余 7 个后端不存在） | 否 |
| `relayLedgerApi` | `/api/remote-sync/ledger/*`（只读 5 方法 `list / get / changes / summary / watermarks`；**只有 `plant-web-server` ≥ 2026-09-17 `b61b7ca` 有**，pmg / 旧版 pws 回 404 → 视图用 `isLedgerUnavailable()` 显示「该后端不提供台账 API」；库没建表回 `note: 'ledger_not_initialized'`；形状见 `docs/plans/2026-09-17-relay-ledger-read-api-plan.md` §8） | 前端路由门（`/ledger` `requiresAdmin`），后端不校验 |

**API 层与后端路由必须一一对应**：新增方法前先在后端里确认路由真实注册（pws：`plant-web-server/src/standalone_runtime.rs` 的 `.route(...)` + `standalone_services.rs::RemoteSyncService::handle`；pmg：`plant-model-gen/src/web_server/*_handlers.rs`）；删掉悬空方法时同步本表与 README「项目结构」。

### 4.3.1 部署动作面（`/topology`，2026-09-14）

`TopologyView.vue` 承担「把 remote env 推到运行时」的全部入口，全部走 `remoteSyncApi`，二次确认用 `confirmDialog`（NDialog）：

| 入口 | 端点 | 行为 |
|---|---|---|
| 头部运行时 pill + 「停止运行时」 | `GET runtime/status`（30s 轮询）· `POST runtime/stop` | 显示 `active / env_id / mqtt_connected`；停止 watcher + MQTT 订阅 |
| 环境卡片「测 MQTT」「测文件服务」 | `POST envs/{id}/test-mqtt` · `POST envs/{id}/test-http` | 结果（addr / url / code / latency_ms）以 inline banner 显示在卡片内 |
| 环境卡片「应用」 | `POST envs/{id}/apply` | 只把 env 写回后端 `DbOption.toml`，不重启运行态 |
| 环境卡片「激活」 | `POST envs/{id}/activate` | 写 `DbOption.toml` + 进程内重启 watcher + MQTT；成功后卡片挂「已激活」徽标 |
| 站点行「听诊器」 | `POST sites/{id}/test-http` | 由后端探测站点 HTTP 可达（区别于浏览器直连的 `online_status`） |
| 站点行「编辑」 | `PUT sites/{id}` | 复用添加站点弹窗，`editingSiteId !== null` 时提交走 `updateSite` |

⚠ `apply / activate` 会**改写后端进程的 `DbOption.toml`**（`remote_sync_handlers.rs::write_env_to_runtime_config`）。本地联调只在隔离配置（`runtime/local-collab/site-*/DbOption.toml`）上操作；后端要带 `--features web_server,mqtt` 编译，否则 activate 的 MQTT 分支为空。

### 4.3.2 两种后端、两种响应形状（2026-09-14 实测）

本机 `:3100` 上实际在跑的是 **`../plant-web-server`**（`plant-web-server.exe`，README 自述"extracted project home"，`mode: standalone-real`），不是 `plant-model-gen/web_server`。两者路由一致，**响应形状不同**：

| 端点 | plant-model-gen `web_server` | plant-web-server（standalone-real） |
|---|---|---|
| `POST admin/auth/login` | `data.{token, expires_at, user}` | `data.{token, user}`（**无 `expires_at`**） |
| `GET runtime/status` | `{status, active, env_id, mqtt_connected}` | `{success, running, env_count, site_count, active_task_count, mode}` + 2026-09-16 起的中继运行态 `active / env_id / relay / mqtt_connected / relay_location / relay_mqtt_host / relay_mqtt_port`（账面「当前环境」另在 `GET envs` 的 `items[].active`） |
| `apply / activate / runtime/stop` | `{status:'success'│'failed', message, env_id}` | `{success, item, task}`（activate 另带 `relay` 与 `runtime_config:{path, keys, changed}` = 这次写了哪几个键进 toml、文件有没有变）/ `{success, stopped, relay_stopped}` |
| `test-mqtt / test-http` | `{status, message, checked_at, addr│url, code, latency_ms}` | `{success, kind, reachable, message, latency_ms}` + TCP 探测的 `host, port` 或 HTTP 探测的 `url, code`（2026-09-18 起真探，见下） |
| 出错 | `status:'failed'` + `message` | `success:false` + `message` |

前端约定：判成功一律走 `isRemoteSyncActionOk()`（`remoteSyncApi.ts`），**别直接比 `status === 'success'`**；运行时激活态用 `TopologyView` 的 `activeEnvId / runtimeActive` computed（兼容两种来源）；`adminAuthApi.normalizeAdminSession` 只强制 `token / username / role`，`expires_at` 可为 null。新增任何写后端形状假设的代码，两种后端都要过一遍。

plant-web-server 的语义（2026-09-14 真后端联调实测，详见 `docs/e2e-smoke/2026-09-14-live-plant-web-server-topology-smoke.md` §3；此后两轮后端修正）：
- **激活**（2026-09-16 起）：把 env 的 `mqtt_host / mqtt_port / file_server_host / location / location_dbs` 写进本站 `DbOption.toml`（env 上没有的键不动），再起 / 重建中继运行态；`apply` 仍只落账（标当前环境 + 一条 apply 任务，不写文件、不动运行态）。
- **探测**（2026-09-18 起真探，pws `standalone_services::connection_probe_response`）：`test-mqtt` TCP 连 `mqtt_host:mqtt_port`；env `test-http` GET `file_server_host`；site `test-http` GET `<http_host>/metadata.json`；2xx / 3xx 算可达，`message` 带原因（`HTTP 404` / 连接被拒 / 超时）。此前只读 `host/port`，监控台建的 env 恒「不可达」。
- `runtime/stop`：停中继（`active` → false），`running` 恒 true，账面 `envs[].active` 不清。
- **删环境**（2026-09-21 起级联，pws `afff42f`）：`DELETE envs/{id}` 连带删该 env 下全部站点，响应带 `deleted_sites[] / deleted_site_count`；进程启动时还会扫一遍 `sites.json`，父 env 已不存在的孤儿行直接清掉并记一条 info 日志（没有 `env_id` 字段的行不动）。此前不级联、`sites.json` 留孤儿（09-14 报告第 4 条）；LF-08 现在断言「删测试 env 后回查其站点为 0」（`noOrphanSites`）。
- **`GET /api/site/info` / `GET /api/site-config` 的五个连接键以文件现状为准**（2026-09-21 起，pws `ac299df`）：每次请求重读本站 `DbOption.toml` 的 `mqtt_host / mqtt_port / file_server_host / location / location_dbs` 盖到启动快照上（其余键仍是启动快照，改了要重启），所以激活写进去的值下一次 `site/info` 就能看到。此前只回进程启动时的快照——激活改了文件 `site/info` 还是旧值，向导第 8 步「文件是否被改过」永远显示「一致」，教程 / live smoke 收尾按 `site/info` 记的「原值」其实是「启动时的值」。前端：`CollabGuideView` 第 8 步按键对照「开跑前快照 vs 文件现状」，并在 `runtime/status.relay_location ≠ site/info.location` 时提示后端太旧。
- 「从 DbOption 导入」按本站 id 覆盖 `dboption-<site_id>`，只带工程 / 端口 / 配置文件路径，**不带连接参数**——激活它 = 按文件现状起中继。
前端不要用 hack 绕后端语义；真后端实操教程 `docs/tutorials/topology-deploy-live-tutorial.md` 按上述语义写并实跑。

### 4.4 UI 风格规范

**禁止**：
- `alert()` / `confirm()` / `window.confirm()`（破坏性 modal blocking）
- 视图内裸 `import { NDialog, NMessage }`（自动 import 已接管）
- 写死兜底假数据（如 `[12,18,15,...]`）—— echarts 用 `graphic` 显示空状态，列表用占位文案

**推荐**：
- 失败 → `setActionError(msg)` / `errorMsg.value = ...` 显示 inline rose banner
- 成功 → `flashSuccess(msg)`（带 5s 自动清除）显示 inline emerald banner
- 二次确认（删除等破坏性操作）→ `useDialog().warning({ ... })` Promise wrapper（参考 `TopologyView.vue::confirmDialog`）
- 正反馈 → `useMessage().success('已删除站点')`（toast 风格）

**console.error 序列化**：必须 `console.error('xxx失败:', err?.message || err)`，避免 `[object Object]`。

### 4.5 顶部 StatusBar 数据流

`AppStatusBar.vue` 4 项徽标：

| 徽标 | 数据源 | 更新机制 |
|---|---|---|
| location + role | `siteConfigApi.get()` | `useAppStatusStore` 30s polling |
| runtime status | `syncApi.status()` | 30s polling |
| queue + failed | `syncApi.queue()` | 30s polling |
| 1min events | SSE 累加 | `appStatus.trackEvent()` 由 `LogsView` / `MqttNodesView` 在 SSE onMessage 里调 |

每个徽标都是 `RouterLink`，点击跳转对应视图。

### 4.6 Tailwind 4 / DaisyUI 5 配置

Tailwind v4 的 PostCSS 插件已拆到 `@tailwindcss/postcss`：

- `postcss.config.js` 必须使用 `@tailwindcss/postcss`，不要写旧的 `tailwindcss: {}`。
- `src/styles/main.css` 使用 CSS-first 入口：`@import "tailwindcss"` + `@config "../../tailwind.config.js"` + `@plugin "daisyui"`。
- DaisyUI v5 通过 CSS `@plugin "daisyui"` 配置 light/dark theme；不要再在 `tailwind.config.js` 里 `require('daisyui')`。
- `tailwind.config.js` 只保留 content 与 font theme 扩展。
- `@vueuse/core` 不是 direct dependency；源码无直接使用，不要重新加入。

### 4.7 协同配置向导 `/guide` 与页面内高亮导览（2026-09-21）

三块：**内容** `src/guide/collabGuide.ts`（`COLLAB_GUIDE_STEPS`：8 步，每步 `goal / why / howto / fields / notes / checkHint / checkable / route / tour`）、**页面** `views/CollabGuideView.vue`（左步骤条 + 右详情；判定对着后端算，不写死）、**导览** `stores/guideTour.ts` + `components/GuideTourOverlay.vue`（全局挂在 `App.vue`，`Teleport` 到 body）。

- 判定口径与 `TopologyView` 同一套（`activeEnvId / runtimeActive` 兼容两种后端）；admin 端点只在 `adminAuth.isLoggedIn` 后才读，未登录先 `ensureAutoLogin()`。第 1 步首次拿到 `site/info` 就把五个连接键写进 `sessionStorage['guide_site_info_snapshot']`，第 8 步拿它对照「文件是否被激活改过」。
- **探测结果的记忆**（`src/guide/probeMemory.ts`，`sessionStorage['guide_probe_results']`，2026-09-21 实跑后加）：`TopologyView` 的「测 MQTT / 测文件服务」（`runEnvAction`）与站点行「探测」（`handleTestSiteHttp`）、向导页的「帮我测」「站点探测」都 `recordEnvProbe / recordSiteProbe` 写同一份；第 4 / 6 步的判定读它（`envProbes(targetEnvId)` / 当前环境下 `siteProbe(site.id)`），所以在哪个页面测都算、刷新不丢、按标签页隔离。只记最后一次。新加探测入口时别忘了写进去。
- 导览目标靠 **`data-tour="<name>"`** 定位：`TopologyView` 里页级元素直接标（`runtime-pill / stop-runtime / env-list / import-env / create-env / sites-panel / add-site`），卡片级按钮只标在**选中那张卡**上（`tourAnchor(env, name)`：`env-test-mqtt / env-test-http / env-apply / env-activate`），站点行只标第一行（`site-test-http / site-edit`）。`?tour=<步骤 id>` 进 `/topology` 时 `onMounted` 等 `loadEnvs()` 回来、没选中就替用户选一张（激活的优先），再 `guideTour.start()`，随后 `router.replace` 摘掉 query。
- 遮罩 z-index **900–902**，故意压在 DaisyUI `.modal`（999）与 naive-ui 弹层之下：导览中点「新建 / 激活」弹出的表单、确认框浮在遮罩上面可操作。被高亮的目标本身留空不盖（四块遮罩），点它 → `advanceOnClick`（默认 true）自动 `next()`；目标不存在 → 说明卡居中 + `missingHint`。
- 改 `TopologyView` 的按钮时**别丢 `data-tour`**；改向导文案只动 `collabGuide.ts`；加一步 = 在 `COLLAB_GUIDE_STEPS` 加一项 + 视图里 `完成判定` 那段按 `id` 加一个分支 + `checks` 加一条。

---

## 5. 编码约定

| 项 | 约定 |
|---|---|
| Vue script | 一律 `<script setup lang="ts">`，禁止新增 plain JS |
| API 调用 | 走 `@/api/*`，禁止裸 fetch（除跨站点 site/info） |
| 错误对象 | catch (err) 默认 unknown，使用 `err?.message \|\| err` 序列化 |
| 类型化 | 后端响应 unknown / Record<string, unknown>，前端定义 narrowing |
| import 路径 | 用 `@/...` 而非相对路径 |
| naive-ui hooks | 自动 import（无需手写），见 `vite.config.ts` AutoImport |
| naive-ui 组件 | 自动注册（无需手写 import），见 `vite.config.ts` Components |
| Tailwind/DaisyUI | Tailwind 4 CSS-first；DaisyUI 5 用 `@plugin`，见 `src/styles/main.css` |
| .vue 文件结构 | template → script → style scoped 顺序 |
| commit message | `<type>(<scope>): 中文一句话 + 多行说明 + 关 Gap-Gx`，type ∈ feat/fix/refactor/chore/docs/build/perf/style |

---

## 6. 关键文件入口（常用）

| 关注点 | 入口 |
|---|---|
| 路由 + admin guard | `src/router/index.ts` |
| admin token 管理 | `src/stores/adminAuth.ts` + `src/api/http.ts` |
| StatusBar 数据 | `src/stores/appStatus.ts` + `src/components/AppStatusBar.vue` |
| SSE 双路径实现 | `src/composables/useSse.ts` |
| Dashboard 6 卡片 | `src/views/DashboardView.vue` + `src/composables/useDashboardSummary.ts` |
| 拓扑 CRUD | `src/views/TopologyView.vue` |
| 协同配置向导（8 步内容 / 判定 / 高亮导览） | `src/guide/collabGuide.ts` + `src/views/CollabGuideView.vue` + `src/stores/guideTour.ts` + `src/components/GuideTourOverlay.vue`（§4.7） |
| 中继台账（列表 / 抽屉变更清单 / 水位） | `src/views/RelayLedgerView.vue` + `src/api/relayLedgerApi.ts`；用例 `scripts/relay-ledger-smoke.mjs`（mock + `--live`） |
| MQTT 节点 + SSE 自动 reload | `src/views/MqttNodesView.vue` |
| 站点配置编辑器 | `src/views/SiteConfigView.vue` |
| 全局参数 | `src/views/SettingsView.vue` |
| 异地拓扑可视化 | `src/views/TopologyVisualizationView.vue` |
| Vite + auto-import 配置 | `vite.config.ts` |
| Tailwind/DaisyUI 配置 | `postcss.config.js` + `src/styles/main.css` + `tailwind.config.js` |

---

## 7. 当前实现度（2026-04-26 Phase 7-Plus 闭环后）

| 维度 | 数值 |
|---|---|
| 视图加权平均实现度 | **~99%** |
| API 调用层 | **1 轨**（全 `@/api/*`）|
| 后端 stub 数 | **0**（B1-B7 全闭环 · 20/20 PASS）|
| admin-gated endpoint 可用度 | 26/26（admin/admin 凭据下） |
| `.js` 文件占比（src/） | **0**（全 `.ts` / `.vue`）|
| 验收报告 | ✅ 11/11（无后端基线 · `docs/e2e-smoke/2026-04-26-e2e-smoke-report.md`） |
| Phase 7-Plus 浏览器联调 | ✅ passed（`scripts/phase7-plus-smoke.mjs` · Playwright + Chrome） |
| 依赖健康 | `npm audit` 0 vulnerabilities；`npm outdated` 无剩余输出 |
| 生产预览 smoke | ✅ `/monitor/` base + SPA fallback + assets + DaisyUI CSS 产物通过 |

Phase 7-Plus 验证要点：
- 11 路由截图 + 标题校验全部通过
- SSE 流 Bearer token 注入验证通过
- 登录重定向 `/topology` 验证通过
- SiteConfig 保存确认弹窗：非破坏性取消验证通过（writeRequests = 0）
- Topology 删除确认弹窗：skipped（本地环境无可删除拓扑项，非 failure）

**G7 100% 闭环**：Phase 20 rs-core `OnceCell<DbOption>` → `RwLock<Arc<DbOption>>` 真热加载已落地。
`POST /api/site-config/reload` 对 hot 字段变更返回 `actions: ["hot_reloaded"]`，无需重启。

Phase 21-25 增强特性：
- **Dark Mode**（Phase 21）：`stores/theme.ts` + Tailwind `@variant dark` + DaisyUI dark + 11 视图/组件/echarts 全适配 + 侧栏 ☀/🌙 切换
- **后端连接健康检测**（Phase 22）：`appStatus.connected` + 连续失败计数 → 红色横幅
- **浏览器标签页告警**（Phase 23）：断连/任务失败时 `document.title` 加前缀提醒
- **侧栏可折叠**（Phase 24）：64px/256px 切换 + localStorage 持久化 + 300ms 过渡
- **键盘快捷键**（Phase 25）：`Alt+D` 切换主题 · `Alt+B` 折叠侧栏

---

## 8. 不要做的事（hot rules）

1. **不要**重新引入 `composables/useApi.js`（API 三轨已收口，1 轨 axios）
2. **不要**视图里裸 `fetch()`（除跨站点绝对 URL）
3. **不要**用 `alert()` / `window.confirm()`（用 NMessage / NDialog）
4. **不要**手动 import 已 auto-import 的 hooks（`useDialog/useMessage/useNotification` + vue/vue-router 常用 API）
5. **不要**把 `auto-imports.d.ts` / `components.d.ts` / `*.vue.js` / `*.vue.d.ts` 入库（已 .gitignore）
6. **不要**用 `console.error('xxx', err)` 直接打 err 对象（用 `err?.message || err`）
7. **不要**写死 chart 兜底假数据（用 echarts `graphic` 空状态）
8. **不要**新增 `<script setup>` plain JS 视图（一律 lang="ts"）
9. **不要**把 Tailwind v4 PostCSS 插件写成旧 `tailwindcss: {}`（必须 `@tailwindcss/postcss`）
10. **不要**在 `tailwind.config.js` 里重新 `require('daisyui')`（DaisyUI v5 在 CSS `@plugin` 配置）
11. **不要**改 `tsconfig.json` `composite` 与 `noEmit` 字段（vue-tsc 自管理，TS6310 兼容已修复）
12. **不要**push 前不跑 `npm run type-check`

---

## 9. 文档索引

### 本仓
- `README.md` — 完整项目说明（含部署、状态表、相关文档）
- `CHANGELOG.md` — 中文 changelog（maintenance S1-S4 与 smoke 记录）
- `docs/maintenance/2026-04-26-deps-health-check.md` — 依赖体检 / 升级 backlog / S1-S4 结果
- `docs/maintenance/2026-04-26-maintenance-upgrade-preview-smoke.md` — 依赖升级后的生产预览 smoke
- `docs/prd/2026-04-25-collab-monitor-prd.md` — 整体能力规范 PRD
- `docs/prd/2026-04-26-remote-site-prd.md` — 异地站点专题 PRD
- `docs/plans/2026-04-25-collab-monitor-completion-gap.md` — 14 项 Gap 清单
- `docs/plans/2026-04-26-next-step-plan.md` + `2026-04-26-sprint-bc-plan.md` — Sprint A/C 执行
- `docs/plans/2026-04-26-phase12-plus-mqtt-sse-subscribe.md` — MqttNodes SSE 接入
- `docs/plans/2026-04-26-phase7-plus-preparation.md` — **Phase 7-Plus 浏览器联调清单（下次必读）**
- `docs/e2e-smoke/2026-04-26-e2e-smoke-report.md` — 无后端基线 11/11 验收
- `docs/e2e-smoke/2026-04-26-phase7-plus-smoke-result.json` — Phase 7-Plus 浏览器 smoke JSON 结果
- `docs/e2e-smoke/2026-04-26-phase7-plus-browser-smoke-report.md` — Phase 7-Plus 浏览器联调报告

### 跨仓
- `../plant-model-gen/docs/plans/2026-04-26-sprint-b-plan.md` — 后端 Sprint B 计划（B1-B7）
- `../plant-model-gen/docs/plans/2026-04-26-sprint-b-verification-report.md` — **后端 20/20 PASS 验收（关键）**
- `../plant-model-gen/docs/architecture/异地协同API汇总清单.md` — 81 endpoint 全表
- `../web-server/MIGRATION_NOTICE.md` — legacy 迁移公告

---

## 10. 给下次会话的 5 个最常见任务速查

| 任务 | 起手式 |
|---|---|
| 加新视图 | 1) `src/views/Foo.vue` `<script setup lang="ts">` 2) `router/index.ts` 加路由（`meta.requiresAdmin?` 视情况） 3) `App.vue` 侧栏加导航 4) `npm run type-check` |
| 加新 API 模块 | 1) `src/api/fooApi.ts` 2) `src/api/index.ts` re-export 3) 视图 `import { fooApi } from '@/api'` |
| 接 SSE | 1) `import { useSse } from '@/composables/useSse'` 2) 传 `getToken: () => adminAuth.token` 3) onMessage 解析 + appStatus.trackEvent() |
| 加 admin guard | router 路由 `meta.requiresAdmin = true`（其余 router.beforeEach 自动接管） |
| Phase 7-Plus 联调 | 严格按 `docs/plans/2026-04-26-phase7-plus-preparation.md` 14 步执行 |

---

> 本文档与代码同步。重大架构调整后**必须**更新本文件，否则下次接手会吃陈旧信息亏。
