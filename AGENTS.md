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
npm run dev          # → http://localhost:3200
npm run type-check   # vue-tsc -b · 必须 0 errors
npm run build        # 产物 dist/ · base 默认 /monitor/
```

环境要求：Node **≥ 20.19**（Vite 8 / Tailwind 4 toolchain）。

环境变量：
- `VITE_API_TARGET`：dev 期 vite proxy 目标（默认 `http://127.0.0.1:3100`）
- `VITE_API_BASE`：axios baseURL（生产同源时留空）
- `VITE_BASE`：vite 部署 base（生产默认 `/monitor/`）

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

**5 个守卫视图**：`/topology` `/topology-viz` `/mqtt/nodes` `/archives` `/site-config` `/settings`（详见 `router/index.ts` `meta.requiresAdmin`）。

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
| `remoteSyncApi` | `/api/remote-sync/*`（26 endpoint） | **是** |
| `deploymentSitesApi` | `/api/deployment-sites/*`（9 endpoint） | 是 |

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

**剩余**：B6+ rs-core 真热加载（跨仓独立会话）。

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
