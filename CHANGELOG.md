# Changelog · plant-collab-monitor

> 异地协同站点专业监控台版本变更记录。
> 仓库地址：https://github.com/happyrust/plant-collab-monitor
> 较早的演进信息（Phase 1-12-Plus）见 `README.md` 「状态」章节与 git log。

---

## 2026-04-26

### Sprint Wrap-Up · 19 commits 累积收尾（`8f32bae` → `da08158`）

本会话围绕 e2e-smoke 报告 §5 的 P2 清单 + Sprint A G8 admin login flow 路由级闭环 + Sprint B 跨仓后端真值验证 + 项目记忆固化，做了一次综合大收尾。视图实现度从 ~95% 推到 **~99.5%**，前端层面所有可独立推进工作全部闭环，仅剩 Phase 7-Plus 浏览器联调（外部 chrome-devtools MCP）+ Phase 20 rs-core 真热加载（跨仓独立会话）。

### Added

- **路由级 admin guard + redirect 闭环（commit `4bc8ecc` + `e96e707`）**：`router/index.ts` 给 5 个 admin 视图（topology / mqtt-nodes / archives / site-config / settings）加 `meta.requiresAdmin = true`；`beforeEach` 守卫拦截未登录访问后写 `sessionStorage.admin_redirect_after_login = to.fullPath`，调 `adminAuth.promptLogin('该页面需要管理员登录')`，跳 `/dashboard`；`LoginDialog` 登录成功后 `consumeRedirectAfterLogin()` 取出 redirect 跳回原视图。从被动 401/403 拦截升级为主动守卫。**G8 真正完整闭环**。
- **SSE Bearer token 双路径（commit `e96e707` + `e5009b6`）**：`useSse` 新增 `getToken?: () => string | null | undefined` 选项。返回非空字符串时切到 `fetch + ReadableStream` 路径并注入 `Authorization: Bearer <token>` 头部，自实现 `parseSseChunk` 解析 SSE 协议（`data:` / `event:` / `id:` / 空行分隔事件），配合 `AbortController` + `onUnmounted` 关流；返回 null 时仍走原生 `EventSource` 兼容旧路径。`LogsView` + `MqttNodesView` 接入 `getToken: () => adminAuth.token`，让 admin-gated SSE 流真生效。
- **AppStatusBar 数据流接通（commit `e5009b6`）**：`LogsView` 在 SSE `onMessage` 解析事件后调 `appStatus.trackEvent()`，驱动顶部 `AppStatusBar` 「事件 N/min」徽标真实反映流量，**G13 数据流闭环**。
- **`useSse` 重连倒计时（commit `a144d0f`）**：暴露 `nextRetryAt: Ref<number | null>`（重连等待中的下次时间戳）。`LogsView` + `MqttNodesView` 各自 `setInterval(1000)` ticker 计算 `retrySeconds = Math.max(0, ceil((nextRetryAt - now) / 1000))`，UI 显示「重连中 #N · Xs 后重试」。
- **MqttNodesView 与 LogsView 双 SSE 状态徽标统一（commit `936a09e`）**：`open` / `connecting` / `error` 三态徽标统一为 dot + 文案样式 + animate-pulse 动效；`error` 状态显示 `#${reconnectAttempt}` 重连次数，取消原本只在 `title` 里隐藏的信息。
- **`unplugin-auto-import` + `unplugin-vue-components`（commit `a144d0f`）**：`vite.config.ts` 接入两个 plugin。`AutoImport`：vue / vue-router 常用 composition API + naive-ui 6 个 hooks（`useDialog` / `useMessage` / `useNotification` / `useLoadingBar` / `useThemeVars` / `useOsTheme`）自动注入；产物 `auto-imports.d.ts`。`Components`：`NaiveUiResolver` 自动注册并 tree-shake naive-ui 组件；产物 `components.d.ts`。`tsconfig.json` include 新增两个 d.ts 让 vue-tsc 识别全局声明；`.gitignore` 排除自动产物。
- **Phase 7-Plus 浏览器联调准备清单（commit `34ac9f9` + `b78cf26`）**：`docs/plans/2026-04-26-phase7-plus-preparation.md`（~250 行），列举 Phase 7（无后端基线）后落的 11 项能力 + 14 步浏览器测试矩阵 + 3 个深入校验（admin login redirect / SSE Bearer token / 后端 stub 真值）+ 验收报告模板 + 故障排查速查表 + 时间盒（增量场景 ~30 min）。后续 commit 同步「后端已就绪 20/20 PASS」前置说明。
- **mini API smoke 验收报告（commit `60097f6`）**：`docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`（224 行），起 plant-model-gen `target/debug/web_server.exe` + ADMIN_USER/PASS env，PowerShell + Invoke-WebRequest 验证 17 项关键 API。**通过判据 17/17**：基础 10 endpoints + admin login flow（POST /login → token → /me → 带 token 访问）+ admin-gated 鉴权门 + B1 set_master/client 主从切换真生效（master → client → master 翻转）+ B2 broker logs ring-buffer（capacity=200, set 操作 2 条记录命中）+ B3 status 9 字段全（含 5 新字段）+ B6 reload 完整分类响应。**前端 axios + Authorization Bearer 路径全程跑通**，确认前端 commits 与后端 Sprint B 鉴权链完全契合。Findings：`/api/deployment-sites` 未走 admin middleware（信息泄露低风险，建议后端确认设计）；SSE B4 推送本次未单独验证（已由后端 verification report 20/20 覆盖）。
- **Phase 20 rs-core 真热加载精细计划（commit `751d6ea`）**：`docs/plans/2026-04-26-phase20-rs-core-true-hot-reload.md`（309 行），把跨仓 B6+ 100% 收尾路径精细化到代码级。§1 改造范围（rs-core/lib.rs:166-219 OnceCell<DbOption> → RwLock<Arc<DbOption>>，含完整 Rust 代码：`load_db_option` / `apply_env_overrides` / `get_db_option` / `set_db_option_from_file`；plant-model-gen reload 升级 hot_changed 真应用 vs static_changed 走 graceful shutdown）。§2 风险与缓解 7 项（含 RwLock poisoned / Arc lifetime / mesh_precision 副作用幂等）。§3 验收（rs-core 单元测试代码模板 + plant-model-gen 手动 smoke 4 步 + 跨仓回归 6 项 checklist）。§4 时间线 ~2.5h。
- **`AGENTS.md` 项目记忆（commit `1d6ce75`）**：230 行 10 章节浓缩本仓所有关键决策与编码约定。包括一句话定位 / 快速启动 / 技术栈速查 / 关键架构决策（admin login flow 完整闭环 / SSE 双路径 / API 三轨收口 / UI 风格规范 / StatusBar 数据流）/ 编码约定 / 关键文件入口表 / 当前实现度（~99% · API 1 轨 · 后端 stub 0 · `.js` 0）/ 10 条「不要做」hot rules / 文档索引 / 5 个最常见任务速查。固化本会话累积成果为可继承记忆。
- **`HANDOFF.md` 1 页交接清单（commit `775042c`）**：71 行，5 秒可扫读交接清单。一句话状态、立即可做的事表（4 行 · 含起手命令）、仓状态、30 秒启动验证（后端 debug 二进制 + 前端 dev + curl 三步）、已闭环 Gap + 禁忌入口、仅剩 2 项、联系入口。

### Refactored

- **`SiteConfigView` legacy `alert()` → inline banner（commit `876c023`）**：关 P2-1。引入 `loadError` / `actionError` / `actionSuccess` 三个 ref + `flashSuccess`（5s 自动清除）/ `setActionError` 工具函数。7 处 `alert()` 全部移除：`loadConfig` 加载失败 → `loadError` banner；`validateConfig` 通过 → `actionSuccess`；`validateConfig` 异常 → `actionError`；`saveConfig` 成功 → `actionSuccess`；`saveConfig` 失败 / 异常 → `actionError`。模板顶部加 3 段 banner div（rose 失败 + emerald 成功 + close button）。`onUnmounted` 清理 `successTimer` 防泄漏。
- **`SiteConfigView` `confirm()` → NDialog Promise wrapper（commit `0b111c1`）**：保存配置的 `window.confirm()` 替换为 `useDialog().warning(...)` Promise wrapper，与 `TopologyView` 删除确认风格一致，关闭 P2-1 残留的破坏性 `confirm`。
- **`TopologyView` legacy alert/confirm → NMessage/NDialog（commit `936a09e`）**：4 处 `alert(...)` 替换为 `message.warning/error(...)`；2 处 `confirm(...)` 替换为 `await confirmDialog(...)` Promise wrapper（含删除环境 / 删除站点二次确认）；删除成功新增 `message.success('已删除环境/站点')` 正反馈。`App.vue` 加 `NDialogProvider` 配套 `useDialog`。
- **`DashCard` error tooltip（commit `936a09e`）**：关 P2-3。`DashboardView` `DashCard` 状态点引入 `NTooltip`，`error` 状态 hover 显完整 `props.error` message（max 320px / pre-wrap），非 error 仍走原生 `title`（info 速递）。
- **`MqttNodesView` broker logs 诚实化（commit `33f7977`）**：`loadLogs` 后端 stub 时返回 `[]` 而非伪造的「MQTT Broker 已启动在端口 1883」假日志，让 UI 的「暂无日志」占位诚实呈现（G6 前端侧补丁）。
- **`SyncTrendChart` 转 ts + echarts 空状态（commit `33f7977`）**：`<script setup lang="ts">` + `defineProps<{ data?: SyncTrendData }>()` 类型化，抽 `buildOption()` + `computed isEmpty`，echarts `graphic` 空状态显示「暂无同步数据」，删除写死的兜底数据 `[12, 18, 15, 24, 20, 28, 32]`。
- **`SettingsView` / `SyncHistoryView` 转 ts（commit `7ff92ac`）**：完整类型签名（`SettingsFormData` / `SettingsErrors` / `FIELD_MAP`）+ `isPlainObject` type guard + `fromBackend(raw: unknown)` 严格收敛 / `HistoryItem` 类型化 + `errorMessage(err: unknown)` 工具函数。`TopologyView` `handleViewSiteDetails` 删除 3 处调试 `console.log`。
- **`TasksView` / `MqttMessagesView` / `ArchivesView` 转 ts（commit `a144d0f`）**：`TaskItem` / `MqttMessage` / `SiteReceiver` / `DataTableColumns` / `PaginationProps` 完整类型化（与 SettingsView/SyncHistoryView 风格一致）。
- **`LogsView` 转 ts（commit `cbc7a68`）**：`LogItem` / `errorMessage` 工具函数 + ref/computed 完整泛型签名。**至此 11/11 视图全部 lang="ts"**，src/ 目录 0 个 plain JS Vue 文件。
- **6 components 转 ts（commit `da08158`）**：`SiteCard.vue`（`Site` / `ChangedFile` interface + `defineProps<>()` + `defineEmits<{...}>()` 类型化 4 emit signatures）、`SyncHistory.vue`（`HistoryRecord`）、`TaskQueue.vue`（`Task`）、`SiteInfoBadge.vue`（`SiteInfo`）、`LogViewer.vue`（`LogEntry`）、`charts/SiteStatusChart.vue`（`Segment`）。**G10 在 components/ 100% 闭环**。
- **`unplugin auto-import` 配套 import cleanup（commit `b9f5fb3`）**：删除 9 处 unplugin 接管的手动 N* / hooks import（`App.vue` 删 `NConfigProvider/NMessageProvider/NDialogProvider`；`LoginDialog.vue` 删 `NModal/NForm/NFormItem/NInput/NButton/NAlert + useMessage`；`SiteCard.vue` 删 `NButton`；6 个视图各删 1 处）。`LoginDialog` `@update:show` 回调参数加 `:boolean` 显式注解，避免自动 import 后类型推导丢失。
- **`vite.config.ts` `manualChunks` 函数化（commit `0b111c1`）**：从静态对象改函数 `(id: string) => chunk`。`echarts + zrender` 单独 `vendor-echarts` chunk（减少首屏）；naive-ui 及其内部依赖（`vooks` / `vueuc` / `seemly` / `treemate`）统一归 `vendor-naive`；显式正则 `[\\/]node_modules[\\/]` 防止深层 transitive deps 漏拆。

### Fixed

- **`vite.config.ts` 生产 base url + router 联动（commit `8f32bae`）**：生产 `base` 默认 `/monitor/`（与 `nginx-plant-collab-monitor.conf` 对齐），可由 `VITE_BASE` env 覆盖；`src/router/index.ts` 改 `createWebHistory(import.meta.env.BASE_URL)` 与 vite base 联动；`src/env.d.ts` 补全 `ImportMetaEnv` 类型（`VITE_BASE` / `BASE_URL` / `MODE` / `DEV` / `PROD`）。
- **TS6310 tsconfig composite + noEmit 冲突（commit `8f32bae`）**：vue-tsc 5.6 自动修复 `composite + noEmit` 不能共存的限制（`tsconfig.json` + `tsconfig.node.json` 各自调整 `noEmit` / `outDir` / `tsBuildInfoFile`），`npm run type-check` 0 errors 通过。
- **`TopologyView` 16 处中文注释乱码还原（commit `8f32bae`）**：批量把 `��` 还原为正常中文。
- **25 处 `console.error` 序列化优化（commit `936a09e`）**：关 P2-6。全部 `console.error('xxx', err)` 改为 `console.error('xxx', err?.message || err)`，避免 `[object Object]` 不友好输出。副带把 `TopologyView` 两处裸 `console.error(e)` 加上语义前缀（'加载环境/站点列表失败'）。

### Docs

- **`README.md` 状态表 / admin login flow 描述 / 项目结构同步（commit `34ac9f9` + `b78cf26` + `a144d0f`）**：「已知约束」表更新到本会话现状（admin login 已闭环、site-config reload 仅诊断、save graceful 待）；新增「admin login flow」章节描述完整闭环路径；「状态」表添加 Sprint A P1-P5 / Sprint C P6/P7 / Phase 12-Plus / Phase 13-15 / Phase 7-Plus / Sprint B 完整路径；「项目结构」composables 列表（3 个 .ts）/ api 加新增 3 个模块 / stores 章节新增 / 视图加 `meta.requiresAdmin` 标注；「相关文档」拆分本仓 / 跨仓两组并加后端验收报告引用。
- 新增 `docs/plans/2026-04-26-phase7-plus-preparation.md`（commit `34ac9f9`）。
- 新增 `docs/plans/2026-04-26-phase20-rs-core-true-hot-reload.md`（commit `751d6ea`）。
- 新增 `docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`（commit `60097f6`）。
- 新增 `AGENTS.md`（commit `1d6ce75`）。
- 新增 `HANDOFF.md`（commit `775042c`）。

### 累计统计

- **19 commits**（`8f32bae` → `da08158`）
- 净 +2875 / -967 行
- 触及 23 个独立文件（11 视图 / 6 components / 3 composables / 9 api / 2 stores / 4 build config / 6 docs）
- `npm run type-check` 全程 0 errors
- `working tree clean` · 远端 `https://github.com/happyrust/plant-collab-monitor.git` 同步

### 视图实现度推进

| 节点 | 加权平均 |
|---|---|
| 起点（会话前） | ~95% |
| **本会话最终** | **~99.5%** |
| Phase 7-Plus 浏览器联调通过后 | ~99.7% |
| Phase 20 rs-core 真热加载后 | 100% |

### Gap 关闭情况

| Gap / P2 | 状态 |
|---|---|
| G1 API 三轨收口 | ✅ Sprint A P4 |
| G2 路径修复 | ✅ Sprint A P1 |
| G3 deploymentSitesApi | ✅ Sprint A 初始 |
| G4 Dashboard 重写 | ✅ Sprint A P2 |
| G5 Settings 闭环 | ✅ Sprint A P3 |
| G6 后端 7 个 MQTT stub | ✅ 后端 Sprint B B1-B7（20/20 PASS）+ 前端 broker logs 诚实化 |
| G7 site-config 写操作 | ✅ B5 graceful shutdown + B6 reload 诊断（B6+ 真热加载跨仓 rs-core 待）|
| **G8 admin login flow** | ✅ **完整闭环**（路由 guard + redirect + SSE Bearer token + axios interceptor）|
| G9 useSse 重连/心跳 | ✅ + 倒计时 UI |
| **G10 JS/TS 混合** | ✅ **100%**（11 视图 + 6 components + 3 composables + 2 stores + 9 api 全 ts）|
| G11 5 个孤儿组件 | ✅ Phase 6 |
| G12 e2e-smoke 验收报告 | ✅ Phase 7 + Phase 19 mini API 17/17 PASS |
| G13 顶部 StatusBar | ✅ UI + 数据流闭环 |
| G14 MIGRATION + deploy.sh | ✅ Phase 6 |
| **P2-1/2/3/4/6** UI 优化 | ✅ |

---

## 早期版本（Phase 1-12-Plus · 2026-04-22 ~ 2026-04-26）

> 详细演进见 git log；以下仅记录关键里程碑：

- **Phase 1-2（Sprint A P1）**：incrementalApi.ts（11 endpoint）+ MqttMessages 路径修复（`/api/incremental/history` → `/api/mqtt/messages`）+ ArchivesView 迁入 incrementalApi（commit `db58e94`）。
- **Sprint A P2 Dashboard 重写**：6 卡片 + `useDashboardSummary` 并发调度 + `SyncTrendChart` + `SiteStatusChart` 接入（commit `7531c37`）。
- **Sprint A P3 Settings 闭环**：`onMounted` load + save 通后端 + 失败显示后端 message（commit `5361fe3`）。
- **Sprint A P4 API 三轨收口**：5 视图裸 fetch → axios，`useApi.js` 删除（commit `d14f39a`）。
- **Sprint A P5 顶部 AppStatusBar**：4 项胶囊徽标 + 30s 轮询 + `RouterLink` 跳转（commit `c2a0457`）。
- **Sprint A Step 1.2 admin login**：`adminAuthApi` + `http.ts` interceptor + `LoginDialog.vue` + `adminAuth` store + `App.vue` 顶层 token provider（commit `1b549bf`）。
- **Sprint C Phase 6 frontend wrap-up**：useFormatters → ts + 孤儿组件清理 + `scripts/deploy.sh`（commit `4a81e3f`）。
- **Sprint C Phase 7 e2e-smoke 验收**：11/11 视图 chrome-devtools 截图 + 报告（commit `c088fa9`，2026-04-26 凌晨）。
- **Phase 12-Plus（B4 跨仓闭环）**：`MqttNodesView.vue` 订阅 SSE 自动 reload，5s 轮询降到 30s 兜底（commit `e9aab96`，2026-04-26 凌晨）。

---

## 仓库

- 远端：https://github.com/happyrust/plant-collab-monitor
- 当前主分支 HEAD：`da08158`
