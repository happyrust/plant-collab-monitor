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

- Vue 3.5 (Composition API · `<script setup>`)
- Vite 5.4 · TypeScript 5.6 · vue-tsc strict
- Naive UI 2.40 + Tailwind 3.4 + DaisyUI 4（完全继承自 web-server 旧栈）
- Pinia 2.2 + vue-router 4.4
- axios 1.7 · @vueuse/core 11
- vfonts（Lato + FiraCode）

## 环境要求

- Node ≥ 20
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
├── main.ts                    # naive-ui + pinia + vue-router 注入
├── App.vue                    # 侧栏 + 11 route 布局
├── env.d.ts                   # Vite + import.meta.env 类型
├── styles/main.css            # tailwind + 全局样式
├── router/index.ts            # 11 条路由 + afterEach 标题
├── api/                       # axios 层（全类型化）
│   ├── http.ts                # 基础 axios + 统一错误格式
│   ├── syncApi.ts             # /api/sync/*
│   ├── remoteSyncApi.ts       # /api/remote-sync/* (admin-gated)
│   ├── mqttApi.ts             # /api/mqtt/*
│   ├── siteConfigApi.ts       # /api/site-config/*
│   └── index.ts
├── composables/               # 5 个沿用 web-server 的 composable
│   ├── useApi.js
│   ├── useFormatters.js
│   ├── useNotification.js
│   ├── useTheme.js
│   └── useWebSocket.js
├── components/                # 7 核心 + 2 charts + 1 ViewPlaceholder
│   ├── DetailModal.vue
│   ├── IncrementalUpdateMonitor.vue
│   ├── LogViewer.vue
│   ├── SiteCard.vue
│   ├── SiteInfoBadge.vue
│   ├── SyncHistory.vue
│   ├── TaskQueue.vue
│   ├── ViewPlaceholder.vue
│   └── charts/
│       ├── SiteStatusChart.vue
│       └── SyncTrendChart.vue
└── views/                     # 11 个一级视图
    ├── DashboardView.vue       (health demo + API playground)
    ├── TopologyView.vue        (原 TopologyManager 实体移植)
    ├── TopologyVisualizationView.vue
    ├── TasksView.vue           (壳 · 包装 TaskQueue + syncApi.queue)
    ├── SyncHistoryView.vue     (壳 · 包装 SyncHistory + syncApi.history)
    ├── LogsView.vue            (壳 · 包装 LogViewer + SSE /api/sync/events/stream)
    ├── MqttMessagesView.vue    (原 MqttMessageViewer)
    ├── MqttNodesView.vue       (原 MqttNodeMonitorEnhanced)
    ├── ArchivesView.vue        (原 ArchivesManager)
    ├── SiteConfigView.vue      (原 SiteConfig)
    └── SettingsView.vue        (原 SettingsManager)
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
| `/api/remote-sync/*` 503 | 后端 admin 鉴权保护，需先登录拿 JWT。前端登录流程待后续迭代补齐 |
| `/api/site-config/reload` 不生效 | 后端 stub，保存配置后需手动重启 web_server |
| MBD `layout_result` 为 null | 后端未开启 `mbd-iso` feature（依赖 rs-core 未发布的 API）|
| 部分 view（Tasks/SyncHistory/Logs）用 placeholder 壳 | 后续接 SSE/WebSocket 后接入完整 UX |

## 状态

| Phase | 内容 | 状态 |
|---|---|---|
| P0 | 仓库初始化 | ✅ |
| P1 | plant-model-gen API 汇入 | ✅（1.1–1.6 代码就位）|
| P2 | 本项目脚手架 + 11 视图移植 | ✅ M2 完成 |
| P3 | 端到端联通验证 | ✅ M1 冒烟 6/8 通过，2 admin-gated 503 |
| P4 | 文档 + 部署脚本 | ✅（本 README + nginx example + MIGRATION_NOTICE）|

## 相关文档

| 文档 | 位置 |
|---|---|
| 异地协同 API 汇总清单（81 端点）| `../plant-model-gen/docs/architecture/异地协同API汇总清单.md` |
| 父计划（14h · 5 阶段）| `../plant-model-gen/docs/plans/2026-04-22-异地协同前端独立与API汇总计划.md` |
| Phase 1 精细执行清单 | `../plant-model-gen/docs/plans/2026-04-22-phase-1-execution-checklist.md` |
| Phase 3/4 精细执行清单 | `../plant-model-gen/docs/plans/2026-04-22-phase-3-phase-4-execution-checklist.md` |
| M1 冒烟结果 | `../plant-model-gen/docs/plans/2026-04-22-m1-smoke-test-result.md` |
| 架构图（4 张 HTML）| `../plant-model-gen/design/collab-consolidation/` |
| web-server 迁移公告 | `../web-server/MIGRATION_NOTICE.md` |
