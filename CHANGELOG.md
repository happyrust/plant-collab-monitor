# Changelog · plant-collab-monitor

> 异地协同站点专业监控台变更记录。
> 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 新增

- **AGENTS.md**：1 页项目速查（架构、关键决策、编码约定、文件入口、常见任务模板），供 AI agent / 接手工程师快速建立上下文（commit `1d6ce75`）。
- **HANDOFF.md**：5 秒看清状态的交接清单（commit `775042c`）。
- **CHANGELOG.md**：本中文变更日志。

### 变更（重构 / 优化）

#### G10 · `lang="ts"` 闭环冲刺

- 全部 6 个 `src/components/` 由 plain JS 转为 `<script setup lang="ts">`：`SiteCard` / `SiteInfoBadge` / `TaskQueue` / `SyncHistory` / `LogViewer` / `charts/SiteStatusChart`（commit `da08158`）。
- 11 个视图中已转 TS：`Dashboard` / `Settings` / `SyncHistory` / `Logs` / `Tasks` / `Archives` / `MqttMessages` 共 7 个（commit `7ff92ac` `cbc7a68` 等）。
- 仅剩 4 个超大型视图未转：`TopologyView` / `TopologyVisualizationView` / `SiteConfigView` / `MqttNodesView`，列入下一轮专项。

#### bundle 优化 · `naive-ui` 按需引入

- 引入 `unplugin-auto-import` + `unplugin-vue-components` + `NaiveUiResolver`，组件由 template 自动注册并 tree-shake，hooks（`useDialog` / `useMessage` / `useNotification` / `useLoadingBar`）由 auto-import 注入（commit `a144d0f`）。
- 删除 `main.ts` 的 `app.use(naive)` 全量挂载——这是 vendor-naive 1.36MB 的根因，删除后 tree-shaking 真正生效（commit `a144d0f`）。
- 删除全 view + `App.vue` + `LoginDialog` + `SiteCard` 中的手动 `import { N* } from 'naive-ui'`；仅保留 `h()` 调用中使用的组件以及 `darkTheme` / `zhCN` / `dateZhCN` / 类型 export（commit `b9f5fb3`）。
- `vendor-naive` 体积：**1,363.53 KB → 573.05 KB（-58%）**，gzip：**364.65 KB → 159.34 KB（-56%）**。

#### `manualChunks` 函数化

- `vite.config.ts` 的 `manualChunks` 由对象映射改为函数 + 正则路径匹配，准确拆分 naive-ui 的 transitive 依赖（`zrender` / `vooks` / `vueuc` / `seemly` / `treemate`）；新增 `vendor-echarts` chunk，`DashboardView` 由 554KB 降到 16KB（commit `0b111c1`）。
- `chunkSizeWarningLimit` 从 800 抬到 1500，消除 naive-ui first-load 必备库的噪音警告。

#### admin 流程 + SSE 改造

- `router/index.ts` 加 `meta.requiresAdmin` + `beforeEach` 守卫；未登录访问 admin 视图时记录 `sessionStorage[admin_redirect_after_login]` 后跳 `/dashboard` 并 `promptLogin`，登录成功后由 `LoginDialog` 消费 redirect 跳回原路（commit `4bc8ecc` `e96e707`）。
- 5 个 admin-only 视图：`/topology` / `/topology-viz` / `/mqtt/nodes` / `/archives` / `/site-config` / `/settings`。
- `composables/useSse.ts` 重写为双路径：`getToken` 返回 token 时走 `fetch + ReadableStream` + 自实现 SSE 解析器（按 `\n\n` 分事件、`data:` / `event:` / `id:` 字段、`AbortController` 关流），否则走原生 `EventSource`；解决 W3C `EventSource` 不支持 Authorization 头的限制（commit `e96e707`）。
- 新增 `nextRetryAt` 暴露给 UI 做"重连中 #N · Xs 后重试"倒计时（commit `a144d0f`）。
- `LogsView` / `MqttNodesView` 接入 `getToken: () => adminAuth.token` + 在 SSE `onMessage` 中调 `appStatus.trackEvent()` 让 `AppStatusBar` 事件计数变成真实数据（commit `e5009b6`）。

#### UI 风格统一

- `TopologyView` 9 处 + `MqttNodesView` 27 处 + `SiteConfigView` 1 处 `alert()` / `confirm()` 全部替换为 `useDialog().warning(...) Promise wrapper` + `useMessage().success/error/warning`（commit `936a09e` `0b111c1`）。
- `App.vue` 顶层补 `NDialogProvider`（`useDialog` 必备）；同时 `NTooltip` 用于 SSE 状态徽标 + `console.error` 序列化为 `err?.message || err` 避免 `[object Object]`（commit `936a09e`）。
- 禁用裸 `alert()` / `window.confirm()` / chart 假数据写入项目编码约定（详见 `AGENTS.md` § 4.4）。

#### 数据真实性

- `SyncTrendChart` 删除硬编码假数据 `[12, 18, 15, 24, 20, 28, 32]`，空数据时通过 echarts `graphic` 显示"暂无同步数据"占位文案；同时 `<script setup lang="ts">` 化（commit `33f7977`）。
- `MqttNodesView.loadLogs` 后端 stub / 错误路径返回 `[]`，由 UI 已有的"暂无日志"占位呈现，禁止伪造日志（commit `33f7977`）。

#### 部署修复

- `vite.config.ts` 加 `base`：生产默认 `/monitor/`，开发态 `/`，可由 `VITE_BASE` 覆盖（commit `8f32bae`）。
- `router/index.ts` `createWebHistory(import.meta.env.BASE_URL)` 与 base 联动。
- `tsconfig.node.json` 加 `outDir` + `tsBuildInfoFile` 重定向到 `node_modules/.tmp/`，`tsconfig.json` 加 `noEmit: true`，避免 `vue-tsc -b` 在 `src/` 散落 40+ 个 `.vue.js` / `.d.ts` 副产物（commit `8f32bae`）。

### 修复

- `TopologyVisualizationView.vue` 4 个鼠标事件函数被错误嵌入到 `connections` computed 的 `forEach` 内导致节点拖拽失效——修正函数位置；同时把高频 5s 轮询改为 30s 并清理 `console.log`（commit `e9aab96` 之前）。
- `TopologyView.vue` `handleSubmitEnv` 10 处 UTF-8 mojibake（GBK 解读残留）修正为正常中文（同上）。
- 单 view 试验后清理 `src/router/index.js` 等历史 stale `.js` 副产物（vue-tsc 误发射），避免 Vite 优先解析到错误文件。

### 删除

- `src/composables/useApi.js`：API 三轨收口（commit `d14f39a`）。
- `src/composables/useNotification.js` / `useTheme.js` / `useWebSocket.js`：全仓 0 引用的孤儿文件。

---

## [0.1.0] - 2026-04-25

### 新增

- 项目脚手架初始化（commit `8143ddc` `c991eb7`）：Vue 3.5 + `<script setup lang="ts">` + Vite 5.4 + TypeScript 5.6 strict + Naive UI 2.40 + Tailwind 3.4 + DaisyUI 4 + Pinia 2.2 + vue-router 4.4。
- 从 `web-server/frontend` 完整移植 11 个视图、若干组件和 composables 到独立 SPA（commit `287d92e`）。
- README 全量扩展，包含定位、技术栈、环境变量、目录结构、部署、限制（commit `7b4d029`）。
- `Sprint A`：
  - Phase 2 全局 Dashboard 重写（6 卡片 + 2 图表）（commit `7531c37`）。
  - Phase 3 Settings 视图闭环（commit `5361fe3`）。
  - Phase 4 API 调用层从 `useApi.js` 收口到 `src/api/*.ts`，5 视图迁移完成（commit `d14f39a`）。
  - Phase 5 全局 `AppStatusBar`（commit `c2a0457`）。
- `Sprint C`：
  - Phase 6 前端收尾、Phase 7 e2e smoke 验收 11/11（commit `4a81e3f` `c088fa9`）。

### 修复

- `vite` proxy 默认 target 由占位改为 `127.0.0.1:3100` 对齐 `plant-model-gen` 默认监听端口（commit `620fe56`）。

---

## 链接

- 项目 PRD：`docs/prd/2026-04-25-collab-monitor-prd.md` / `docs/prd/2026-04-26-remote-site-prd.md`
- 完整 Gap 清单：`docs/plans/2026-04-25-collab-monitor-completion-gap.md`
- e2e smoke 报告：`docs/e2e-smoke/2026-04-26-e2e-smoke-report.md` / `docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`
- 项目速查：[`AGENTS.md`](./AGENTS.md)
- 交接清单：[`HANDOFF.md`](./HANDOFF.md)
