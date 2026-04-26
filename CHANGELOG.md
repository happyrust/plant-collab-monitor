# Changelog · plant-collab-monitor

> 异地协同站点专业监控台版本变更记录。
> 仓库地址：https://github.com/happyrust/plant-collab-monitor
> 较早的演进信息（Phase 1-12-Plus）见 `README.md` 「状态」章节与 git log。

---

## 2026-04-26

### Maintenance Cleanup · 移除未使用 VueUse direct dependency（本次提交）

> 继续处理 S3 后剩余的低风险项：确认业务源码未直接使用 `@vueuse/core` 后，移除 direct dependency，而不是升级未使用 API。

#### Dependencies

- **移除 `@vueuse/core` direct dependency**：全仓精确搜索仅命中文档与 package 元数据；`src/` 与 `vite.config.ts` 无直接 import / auto-import 配置。`unplugin-auto-import` 仍保留其传递依赖，不影响构建工具链。

#### Docs

- **同步技术栈**：`README.md` 更新到 Vite 8 / TypeScript 6 / Pinia 3 / vue-router 5，移除 `@vueuse/core` 直接依赖描述，并把 Node 要求同步为 ≥20.19。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 8.0.10，3487 modules transformed，built in 1.97s）。
- `npm audit --registry=https://registry.npmjs.org/` PASS：0 vulnerabilities。
- `npm outdated` 剩余：`tailwindcss` / `daisyui`。

---

### Maintenance S3 · Vite 安全修复（1 commit · `0deb43d`）

> 按维护 backlog 完成 Vite/esbuild moderate 漏洞闭环：升级 Vite 主链路，保留现有构建配置语义。

#### Dependencies

- **`vite` 5 → 8**：升级到 `vite` 8.0.10，关闭 `esbuild <= 0.24.2` dev server moderate 漏洞链路。
- **`@vitejs/plugin-vue` 5 → 6**：升级到 `@vitejs/plugin-vue` 6.0.6，与 Vite 8 配套。

#### Build

- **配置兼容**：`vite.config.ts` 无需改动；`base`、proxy、manualChunks、auto-import / components 插件配置继续通过。
- **产物变化**：Vite 8/Rolldown 构建新增 `rolldown-runtime` 小 chunk；`vendor-naive` 从 573.05KB / gzip 159.34KB 增至 633.81KB / gzip 181.80KB，仍低于 `chunkSizeWarningLimit: 1500`。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 8.0.10，3487 modules transformed，built in 2.88s）。
- `npm audit --registry=https://registry.npmjs.org/` PASS：0 vulnerabilities。
- `npm outdated` 剩余：`@vueuse/core`、`tailwindcss` / `daisyui`。

---

### Maintenance S2 · 路由与状态依赖升级（1 commit · `4e9fd60`）

> 继续按维护 backlog 推进中风险但局部可控的路由 + 状态升级，先把 Vue Router / Pinia major 版本收口；Vite/esbuild 安全修复仍保留到 S3 独立处理。

#### Dependencies

- **`vue-router` 4 → 5**：升级到 `vue-router` 5.0.6，现有 `createRouter` / `createWebHistory` / `router.beforeEach` / `RouteMeta` 扩展类型通过。
- **`pinia` 2 → 3**：升级到 `pinia` 3.0.4，现有 `createPinia()` + `defineStore()` setup store（`adminAuth` / `appStatus`）无需代码改动。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 5.4.21，3486 modules transformed，`vendor-naive` 573.05KB / gzip 159.34KB 保持）。
- `npm outdated` 剩余：`@vueuse/core`、`vite` / `@vitejs/plugin-vue`、`tailwindcss` / `daisyui`。
- `npm audit --registry=https://registry.npmjs.org/` 仍为 2 项 moderate（`esbuild <= 0.24.2` / `vite <= 6.4.1`，需 S3 Vite 大版本处理）。

---

### Maintenance S1 · 类型工具链升级（1 commit · `9818c7e`）

> 按维护 backlog 继续推进 S1：先完成类型工具链升级，并顺手补齐最新 PostCSS patch；高风险 Vite / Tailwind 大版本仍保留为后续独立 sprint。

#### Dependencies

- **类型工具链升级**：`@types/node` 22 → 25、`typescript` 5 → 6、`vue-tsc` 2 → 3，`package.json` / `package-lock.json` 同步更新。
- **`postcss` patch 补齐**：`postcss` 8.5.11 → 8.5.12，保持 zero-risk patch 路径。

#### Config

- **TS 6 配置迁移**：移除 `tsconfig.json` 已弃用的 `baseUrl`，把 `paths` 目标从 `src/*` 改为 `./src/*`，保留 `@/*` 别名语义，同时消除 TS 6 `baseUrl` 弃用诊断。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 5.4.21，3489 modules transformed，`vendor-naive` 573.05KB / gzip 159.34KB 保持）。

---

### Maintenance · 依赖体检与 PostCSS patch（1 commit · `0a14a7c`）

> 在文档与部署收尾之后追加一次依赖健康检查，只应用 patch 级 zero-risk 升级，major 跨版本升级进入 maintenance backlog。

#### Dependencies

- **`postcss` 8.5.10 → 8.5.11（commit `0a14a7c`）**：执行 `npm install postcss@8.5.11`，仅落地 patch 级升级；`package.json` / `package-lock.json` 同步更新，不触碰 vite / vue / tailwind 等 major 跨版本依赖。

#### Maintenance

- **新增依赖体检报告（commit `0a14a7c`）**：`docs/maintenance/2026-04-26-deps-health-check.md` 汇总 `npm audit` + `npm outdated`。结论：当前仅 2 项 moderate 漏洞（`esbuild <= 0.24.2` 与 `vite <= 6.4.1`，dev server 场景，生产产物不受影响）；完整修复需 `vite` 5 → 8 + `@vitejs/plugin-vue` 配套大版本升级，本轮不做热修，列入独立 maintenance sprint。
- **升级 backlog 分层**：低风险 `@types/node` / `@vueuse/core` 可单独 PR；中风险 `vue-router` / `pinia` / `typescript` / `vue-tsc` 需配套测试；高风险 `vite` / `tailwindcss` / `daisyui` 建议成套 sprint，重点覆盖 `manualChunks`、base url、auto-import 插件与全视图样式回归。

#### Verification

- `npm run build` + `npm run type-check` 全绿，`vendor-naive` 573KB 不变。

---

### Post Wrap-Up · 文档与部署收尾（5 commits · `a7ec92d` → `bd196db`）

> 在 19 commits 大收尾之后追加的文档体系闭环 + 部署链路静态验证。

#### Docs

- **`README.md` 同步 G10 闭环与 unplugin / auto-import 状态（commit `a7ec92d`）**：技术栈段补 `echarts 6 独立 vendor chunk` + `unplugin-auto-import` + `unplugin-vue-components`（NaiveUiResolver · vendor-naive 1.36MB → 573KB）；项目结构 `main.ts` 注释由「naive-ui + pinia + vue-router 注入」更正为「pinia + vue-router 注入（naive-ui 改为按需引入，详见 vite.config.ts）」；环境变量表加 `VITE_BASE`（生产 `/monitor/` · 开发 `/`）；状态表加 Phase 16 / G10 闭环行（7 个 commit 索引）；「相关文档」段引入 `CHANGELOG.md` / `AGENTS.md` / `HANDOFF.md` / Phase 19 mini API smoke 报告 / Phase 20 计划。
- **`HANDOFF.md` 加 CHANGELOG 引用保持文档体系一致（commit `881af04`）**：「立即可做的事」表格补一行 `CHANGELOG.md` 索引，与 `README.md` 「相关文档」段保持引用一致。

#### Verification

- **Preview base 部署链路验证报告 6/6 PASS（commit `da3819f`）**：`docs/e2e-smoke/2026-04-26-preview-base-smoke-report.md`（94 行）。不依赖 chrome-devtools MCP 的简化版 e2e：用 `vite preview` 模拟 nginx 静态托管 + PowerShell `Invoke-WebRequest` 验证。**6/6 PASS**：`GET /` → 302 redirect 到 `/monitor/`；`GET /monitor/` → 200 + 正确 title；`/monitor/assets/index-*.js` 与 `*.css` → 200；`/monitor/dashboard` 与 `/monitor/topology`（admin route）SPA fallback → 200 (715 bytes index.html)。**关键判定**：(1) vite preview 行为与 nginx `try_files $uri $uri/ /monitor/index.html;` 等价；(2) admin guard 静态层不泄漏（admin 视图代码懒加载 + 前端 `router.beforeEach` 拦截）；(3) `index.html` modulepreload 仅 `vendor-vue` (109KB) + `vendor-http` (38KB) + `vendor-naive` (573KB) + entry，**不含 `vendor-echarts` (538KB)**——证实 manualChunks + 懒加载协同生效。本报告等价于 `docs/plans/2026-04-26-phase7-plus-preparation.md` 14 步矩阵中 「nginx 静态托管」预研项的交付。
- **Dual-server 协议层 e2e 验证报告 8/8 PASS · 1 finding（commit `bd196db`）**：`docs/e2e-smoke/2026-04-26-dual-server-smoke-report.md`（124 行）。同时启 plant-model-gen web_server `:3100` + vite preview `:3200`，PowerShell + `[System.Net.HttpWebRequest]` 验证完整 e2e 协议链路。**8/8 PASS**：双服可达性 + admin login flow（admin/admin → token → `/me` Bearer）+ admin-gated `/api/remote-sync/envs` 鉴权门（无 token `401` / 带 token `200`）+ SSE Bearer 路径头部确认（`200 OK` + `Content-Type: text/event-stream`）+ 公共 `/api/sync/status` `200`。**Finding F-01（低）**：`/api/sync/events/stream` 端点未受 admin middleware 保护，无 token 也返回 `200 + text/event-stream`；与 mini API smoke F-01（`/api/deployment-sites`）属同类问题，建议后端确认设计意图。**四份 e2e 报告组成完整矩阵**（视图渲染 / 后端 API / 前端静态部署 / 双服协议层），仅剩浏览器渲染层（chrome MCP）未覆盖。

#### Post Wrap-Up 累计

- 5 commits（`a7ec92d` → `bd196db`）
- 触及 4 个文件（README.md / HANDOFF.md / docs/e2e-smoke/2026-04-26-preview-base-smoke-report.md / docs/e2e-smoke/2026-04-26-dual-server-smoke-report.md）
- `npm run type-check` 全程 0 errors
- `working tree clean` · 远端 `origin/main` 同步

剩余 Phase 7-Plus 工作收窄到：浏览器渲染层（chrome-devtools MCP）+ SSE 真连接 + admin login 视觉确认 + Phase 20 跨仓 rs-core 真热加载。前端代码 / 部署静态层 / 文档体系层面零阻塞。

---

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
- 最新记录到：Maintenance Cleanup 移除未使用 VueUse direct dependency（提交见 git log）
