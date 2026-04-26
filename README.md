# plant-collab-monitor

> 异地协同站点管理 · 专业监控台（从 `web-server/frontend` 剥离而来）

独立的 Vue 3 单页应用，承担 **运维级** 异地协同站点监控职责：

- 全局拓扑可视化
- 任务队列 / 同步历史 / 实时进度推送
- MQTT 消息与节点监控
- 站点配置管理（`DbOption.toml` 编辑）
- 归档文件浏览（`.cba`）

## 定位

| 组件 | 角色 | 入口 |
|---|---|---|
| `plant-model-gen` | **唯一后端** · Rust + Axum · 暴露 `/api/*` | `http://127.0.0.1:3100` |
| `plant-model-gen/ui/admin/#/collaboration` | 轻量管理入口（嵌入在 admin） | admin 子路由 |
| **本项目 plant-collab-monitor** | 专业监控台（独立 SPA） | `http://localhost:3200`（dev） |
| `web-server` | **Legacy · 已废弃** · 作为迁移源头保留备份 | — |

## 技术栈

- Vue 3.5 (Composition API · `<script setup lang="ts">`)
- Vite 8.0 · TypeScript 6.0 · vue-tsc strict
- Naive UI 2.40 + Tailwind 3.4 + DaisyUI 4（完全继承自 web-server 旧栈）
- Pinia 3.0 + vue-router 5.0
- axios 1.7
- echarts 6（独立 vendor chunk · 按需 import）
- `unplugin-auto-import` + `unplugin-vue-components`（NaiveUiResolver · 组件 + hooks 自动注册并 tree-shake · vendor-naive 1.36MB → 633.81KB）
- vfonts（Lato + FiraCode）

## 环境要求

- Node ≥ 20.19
- 可访问 `plant-model-gen` 后端（默认 `http://127.0.0.1:3100`）

## 快速开始

```bash
# 1. 启动后端（另一个终端）
cd ../plant-model-gen
cargo run --bin web_server --features web_server

# 2. 启动前端
npm install
npm run dev
# -> http://localhost:3200
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `VITE_API_TARGET` | `http://127.0.0.1:3100` | vite dev 期代理目标（后端地址）|
| `VITE_API_BASE` | 空字符串 | axios `baseURL`，生产部署同源时留空 |
| `VITE_BASE` | 生产 `/monitor/`，开发 `/` | vite 部署 base url，与 nginx `location /monitor/` 对齐 |

`.env.local` 示例：

```env
VITE_API_TARGET=http://staging.example.com:3100
```

## 可用脚本

| 命令 | 功能 |
|---|---|
| `npm run dev` | 启动 vite dev server · port 3200 · HMR |
| `npm run build` | `vue-tsc -b` + `vite build` 生产构建（产出到 `dist/`）|
| `npm run preview` | 预览 dist 产物（port 3200）|
| `npm run type-check` | 仅 TypeScript 严格检查 |

## 项目结构

```
src/
├── main.ts                    # pinia + vue-router 注入（naive-ui 改为按需引入，详见 vite.config.ts）
├── App.vue                    # 侧栏 + 11 route 布局
├── env.d.ts                   # Vite + import.meta.env 类型
├── styles/main.css            # tailwind + 全局样式
├── router/index.ts            # 11 条路由 + afterEach 标题
├── api/                       # axios 层（全类型化）
│   ├── http.ts                # 基础 axios + admin token interceptor
│   ├── adminAuthApi.ts        # /api/admin/auth/* (login/logout/me)
│   ├── syncApi.ts             # /api/sync/*
│   ├── remoteSyncApi.ts       # /api/remote-sync/* (admin-gated)
│   ├── mqttApi.ts             # /api/mqtt/*
│   ├── siteConfigApi.ts       # /api/site-config/*
│   ├── deploymentSitesApi.ts  # /api/deployment-sites/*（9 endpoint）
│   ├── incrementalApi.ts      # /api/incremental/*（11 endpoint）
│   └── index.ts
├── stores/                    # Pinia stores（全 ts）
│   ├── adminAuth.ts           # admin token + LoginDialog 状态
│   └── appStatus.ts           # AppStatusBar 数据源（site/sync/queue + 1min events）
├── composables/               # 全部 .ts，无遗留 .js
│   ├── useDashboardSummary.ts # Dashboard 6 卡片并发调度
│   ├── useFormatters.ts       # formatNumber / formatTime / formatSize 等
│   └── useSse.ts              # SSE 双路径（原生 EventSource / fetch+ReadableStream + Bearer）
├── components/                # 业务组件
│   ├── AppStatusBar.vue       # 顶部固定 4 项徽标
│   ├── LoginDialog.vue        # naive-ui Modal + admin login flow
│   ├── DetailModal.vue
│   ├── IncrementalUpdateMonitor.vue
│   ├── LogViewer.vue
│   ├── SiteCard.vue
│   ├── SiteInfoBadge.vue
│   ├── SyncHistory.vue
│   ├── TaskQueue.vue
│   ├── ViewPlaceholder.vue
│   └── charts/                # 全 ts + 空状态 echarts graphic
│       ├── SiteStatusChart.vue
│       └── SyncTrendChart.vue
└── views/                     # 11 个一级视图（全部接入真 API，无 placeholder 壳）
    ├── DashboardView.vue          # 6 卡片 + 2 chart + 最近事件 · useDashboardSummary
    ├── TopologyView.vue           # 异地拓扑 CRUD · NMessage/NDialog · meta.requiresAdmin
    ├── TopologyVisualizationView.vue  # SVG 节点拓扑可视化 · meta.requiresAdmin
    ├── TasksView.vue              # 任务队列 · syncApi.queue
    ├── SyncHistoryView.vue        # 同步历史时间线 · ts
    ├── LogsView.vue               # SSE /api/sync/events/stream（带 token + 重连倒计时）
    ├── MqttMessagesView.vue       # MQTT 消息表
    ├── MqttNodesView.vue          # MQTT 节点 · SSE 自动 reload · meta.requiresAdmin
    ├── ArchivesView.vue           # CBA 归档 · meta.requiresAdmin
    ├── SiteConfigView.vue         # 站点配置（inline banner + NDialog · meta.requiresAdmin）
    └── SettingsView.vue           # 全局参数 · ts · meta.requiresAdmin
```

## 生产部署

### 1. 构建产物

```bash
npm run build
# dist/ 目录产出（index.html + assets/）
```

### 2. Nginx 反代

参考：`../plant-model-gen/shells/deploy/nginx-plant-collab-monitor.conf.example`

核心片段：

```nginx
location /monitor/ {
  alias /var/www/plant-collab-monitor/;
  try_files $uri $uri/ /monitor/index.html;
}
location /api/ {
  proxy_pass http://127.0.0.1:3100/api/;
  proxy_buffering off;   # SSE 友好
}
location /ws/ {
  proxy_pass http://127.0.0.1:3100/ws/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

### 3. 部署脚本集成

推荐把 `npm run build` 追加到 plant-model-gen 的 `shells/deploy/deploy_all_with_frontend.sh`，随后端一起部署。

## 已知约束

| 项 | 说明 |
|---|---|
| ~~`/api/remote-sync/*` 503~~ | ✅ **已闭环** — `LoginDialog` + 路由级 `requiresAdmin` guard + `LocalAdminAuth` token store + SSE Bearer token 路径（`useSse` `getToken` 选项 + fetch + ReadableStream） |
| `/api/site-config/reload` 仅诊断 | 后端 Phase 11 已落 diff + 分类响应；真热加载需 rs-core `OnceCell` → `RwLock<Arc<DbOption>>` 改造（跨仓 Phase 11-Plus 待） |
| `/api/site-config/save` 后无 graceful restart | 后端 Phase 10 待（B5 main.rs + AppState 重构 2d）|
| MBD `layout_result` 为 null | 后端未开启 `mbd-iso` feature（依赖 rs-core 未发布的 API）|

**所有 11 视图均已实装真 API 调用，无 placeholder 壳。** Sprint A Phase 1-5 + Sprint C Phase 6/7 + Phase 12-Plus + Phase 13/14/15 累计 17 个 commits 收口。

## admin login flow（G8 完整闭环）

进入需要管理员的视图（`/topology` `/mqtt/nodes` `/archives` `/site-config` `/settings`）时：

```
未登录访问 admin 视图
  → router.beforeEach 检测 meta.requiresAdmin
  → sessionStorage 写 admin_redirect_after_login = '/topology'
  → adminAuth.promptLogin('该页面需要管理员登录')
  → router 跳 /dashboard
  → LoginDialog 弹起
  → 输 admin/admin → POST /api/admin/auth/login → token 入 store
  → handleLogin: consumeRedirectAfterLogin() 取出 '/topology'
  → router.push('/topology') → 视图加载 + axios interceptor 自动注入 Bearer token + SSE 流也带 token
```

后端 `ADMIN_USER` / `ADMIN_PASS` 通过环境变量配置（默认 `admin` / `admin`）。

## 状态

| Phase | 内容 | 状态 |
|---|---|---|
| P0 | 仓库初始化 | ✅ |
| P1 | plant-model-gen API 汇入 | ✅（1.1–1.6 代码就位）|
| P2 | 本项目脚手架 + 11 视图移植 | ✅ M2 完成 |
| P3 | 端到端联通验证 | ✅ M1 冒烟 6/8 通过，2 admin-gated 503 |
| P4 | 文档 + 部署脚本 | ✅（本 README + nginx example + MIGRATION_NOTICE）|
| Sprint A · P1-P5 | API 三轨收口 + Dashboard + Settings + admin login + StatusBar | ✅ 5 commits |
| Sprint C · P6 | useFormatters → ts + 孤儿组件清理 + deploy.sh | ✅ |
| Sprint C · P7 | e2e-smoke 验收报告（11/11 视图，无后端基线） | ✅ `docs/e2e-smoke/2026-04-26-e2e-smoke-report.md` |
| Phase 12-Plus | MqttNodesView 订阅 SSE 自动 reload（B4 跨仓闭环） | ✅ `e9aab96` |
| Phase 13 (本会话) | base url + tsconfig fix + topology cleanup + SiteConfig P2-1 + SyncTrendChart ts + admin route guard + SSE token + LoginDialog redirect + appStatus.trackEvent | ✅ 6 commits |
| Phase 14 (本会话) | NTooltip + SSE 状态徽标 + console.error 序列化 + Topology NMessage/NDialog | ✅ `936a09e` |
| Phase 15 (本会话) | manualChunks 函数化 + SiteConfig confirm → NDialog + Phase 7-Plus 准备文档 + README 更新 | ✅ `0b111c1` + 后续 commit |
| Phase 16 / G10 闭环 | naive-ui 按需引入 + AGENTS.md/HANDOFF.md + 11 视图 ts + 6 components ts + Phase 19 mini API smoke 17/17 + Phase 20 rs-core 真热加载计划 + CHANGELOG | ✅ `a144d0f` `1d6ce75` `cbc7a68` `da08158` `60097f6` `751d6ea` `f53586b` |
| Phase 7-Plus | 带后端真实联调（admin login flow + SSE token + 11 视图）| ⏳ 待外部 chrome-devtools，参见 `docs/plans/2026-04-26-phase7-plus-preparation.md` |
| 后端 Sprint B | B1/B2/B3/B4/**B5**/B6/B7 ✅（20/20 PASS）；B6+ 真热加载 ⏳跨仓 rs-core | 参见 `../plant-model-gen/docs/plans/2026-04-26-sprint-b-verification-report.md` |

## 相关文档

### 本仓
| 文档 | 位置 |
|---|---|
| **变更日志（中文）** | [`CHANGELOG.md`](./CHANGELOG.md) |
| **AI agent / 接手工程师速查** | [`AGENTS.md`](./AGENTS.md) |
| **5 秒交接清单** | [`HANDOFF.md`](./HANDOFF.md) |
| 异地站点 PRD | `docs/prd/2026-04-26-remote-site-prd.md` |
| 整体能力规范 PRD | `docs/prd/2026-04-25-collab-monitor-prd.md` |
| Gap 清单 | `docs/plans/2026-04-25-collab-monitor-completion-gap.md` |
| 无后端基线 e2e-smoke 报告 | `docs/e2e-smoke/2026-04-26-e2e-smoke-report.md` |
| mini API smoke 17/17 报告 | `docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md` |
| **Phase 7-Plus 浏览器联调准备清单** | `docs/plans/2026-04-26-phase7-plus-preparation.md` |
| **Phase 20 rs-core 真热加载精细计划** | `docs/plans/2026-04-26-phase20-rs-core-true-hot-reload.md` |
| Sprint A/C 计划 | `docs/plans/2026-04-26-next-step-plan.md` `docs/plans/2026-04-26-sprint-bc-plan.md` |
| Phase 12-Plus（MqttNodes SSE 订阅）| `docs/plans/2026-04-26-phase12-plus-mqtt-sse-subscribe.md` |

### 跨仓
| 文档 | 位置 |
|---|---|
| 异地协同 API 汇总清单（81 端点）| `../plant-model-gen/docs/architecture/异地协同API汇总清单.md` |
| 父计划（14h · 5 阶段）| `../plant-model-gen/docs/plans/2026-04-22-异地协同前端独立与API汇总计划.md` |
| Sprint B 后端计划（B1-B7）| `../plant-model-gen/docs/plans/2026-04-26-sprint-b-plan.md` |
| **Sprint B 后端验收报告（20/20 PASS）** | `../plant-model-gen/docs/plans/2026-04-26-sprint-b-verification-report.md` |
| Phase 1 精细执行清单 | `../plant-model-gen/docs/plans/2026-04-22-phase-1-execution-checklist.md` |
| Phase 3/4 精细执行清单 | `../plant-model-gen/docs/plans/2026-04-22-phase-3-phase-4-execution-checklist.md` |
| M1 冒烟结果 | `../plant-model-gen/docs/plans/2026-04-22-m1-smoke-test-result.md` |
| 架构图（4 张 HTML）| `../plant-model-gen/design/collab-consolidation/` |
| web-server 迁移公告 | `../web-server/MIGRATION_NOTICE.md` |
