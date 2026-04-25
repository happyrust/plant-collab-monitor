# plant-collab-monitor 完善 Gap 分析与执行计划（2026-04-25）

> 配套文档：`docs/prd/2026-04-25-collab-monitor-prd.md`
> 上游：`plant-model-gen/docs/plans/2026-04-22-异地协同前端独立与API汇总计划.md`、`plant-model-gen/docs/architecture/异地协同API汇总清单.md`
> 范围：基于 2026-04-25 实测调研，找出当前实现 vs PRD 的 gap，并拆分成可执行的 3 个 Sprint。

---

## 一、当前实现度总览

### 1.1 视图实现度

| # | 视图 | 路由 | API 接入 | UI 完整 | 实现度 |
|---|------|------|----------|---------|--------|
| 1 | DashboardView | `/dashboard` | ⚠ 仅 1 路 fetch | ❌ 仅按钮+`<pre>` | **30%** |
| 2 | TopologyView | `/topology` | ✅ CRUD 多路 | ✅ 模态/操作齐全 | **90%** |
| 3 | TopologyVisualizationView | `/topology-viz` | ✅ 3 路并发 | ✅ SVG+拖拽 | **90%** |
| 4 | TasksView | `/tasks` | ✅ syncApi.queue | ✅ 列表+刷新 | **80%** |
| 5 | SyncHistoryView | `/history` | ✅ syncApi.history | ✅ 时间线+详情 | **80%** |
| 6 | MqttMessagesView | `/mqtt/messages` | ⚠ **走错路径** `/api/incremental/history` | ✅ 表格 | **40%** |
| 7 | MqttNodesView | `/mqtt/nodes` | ✅ 多路裸 fetch | ✅ 主从+broker | **85%** |
| 8 | LogsView | `/logs` | ✅ SSE+轮询双轨 | ✅ LogViewer | **85%** |
| 9 | ArchivesView | `/archives` | ⚠ **走错路径** `/api/incremental/archives` | ✅ 表格+下载 | **50%** |
| 10 | SiteConfigView | `/site-config` | ✅ 多路 fetch | ✅ 大表单 | **80%** |
| 11 | SettingsView | `/settings` | ❌ 仅 emit('save') | ✅ 表单 | **30%** |

**整体平均：68%**（11 个视图加权）。

### 1.2 验证度

| 视图 | 后端 M1 冒烟 | 前端实地（截图） | 报告 |
|------|--------------|------------------|------|
| Dashboard | ✅ | ✅ `01-dashboard.png` | ❌ |
| Topology | ✅ | ✅ `02-topology.png` | ❌ |
| TopologyVisualization | ✅ | ✅ `03-topology-viz.png` | ❌ |
| Tasks | ✅ | ✅ `04-tasks.png` | ❌ |
| SyncHistory | ✅ | ✅ `05-history.png` | ❌ |
| MqttMessages | ⚠ admin-gated 503 | ❌ | ❌ |
| MqttNodes | ✅ | ❌ | ❌ |
| Logs | ✅ | ❌ | ❌ |
| Archives | 未冒烟 | ❌ | ❌ |
| SiteConfig | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |

**截图覆盖**：5/11；**验收报告**：未产出（`docs/e2e-smoke/2026-04-24-e2e-smoke-report.md` 不存在）。

---

## 二、Gap 清单（按优先级）

### G1 - API 调用层"三轨并存"（**P0** 架构债）

**现象**：
- `src/api/*.ts`（4 个模块）封装 axios
- `src/composables/useApi.js`（**.js 不是 .ts**）封装 dashboard / incremental 等
- `src/views/*.vue` 内部直接 `fetch()`（Topology / TopologyViz / SiteConfig / MqttNodes 等大量使用）

**影响**：
- 同一后端端点被以 3 种方式访问，错误处理 / 鉴权 / baseURL 不统一
- 没有 axios interceptor 统一注入 admin token，admin login flow 几乎无法接入
- 未来后端契约变更（path 改名、字段重命名）要改 N 处

**修复**：
- 把 `useApi.js` 的所有 dashboard 相关方法迁入 `src/api/*.ts`
- `useApi.js` 的 `/api/incremental/*` 调用迁入新 `incrementalApi.ts`（或纳入 `archivesApi.ts`）
- 视图内裸 `fetch` 全部改用 `src/api/*.ts`
- `http.ts` 加 admin token interceptor

### G2 - MqttMessages / Archives 走错 API 路径（**P0** 契约错误）

**现象**：
- `MqttMessagesView` → `useApi.loadSyncHistory` → `/api/incremental/history`（应该是 `/api/mqtt/messages`）
- `ArchivesView` → `useApi.loadArchives` → `/api/incremental/archives`（PRD 未明确该领域归属）

**修复**：
- `MqttMessagesView` 改用 `mqttApi.messages()` → `/api/mqtt/messages`
- `ArchivesView`：与产品确认归属
  - 选项 A：纳入异地协同领域，在 plant-model-gen 补 `/api/archives/*` endpoint，弃用 `/api/incremental/archives`
  - 选项 B：保留 `/api/incremental/*` 但在 PRD 与汇总清单显式补一节"增量归档"

### G3 - 缺 `deploymentSitesApi.ts`（**P1** 计划遗漏）

**现象**：父计划设想 5 个 api 模块（含 `deploymentSitesApi`），实际只有 4 个。后端 9 个 `/api/deployment-sites/*` endpoint 没有前端封装。

**修复**：新建 `src/api/deploymentSitesApi.ts`，覆盖 9 个 endpoint。

### G4 - Dashboard 仅是占位（**P0** 用户体验）

**现象**：当前 Dashboard 只有"拉取后端状态"按钮 + JSON `<pre>` 输出。**charts/SyncTrendChart**、**charts/SiteStatusChart**、**IncrementalUpdateMonitor** 三个组件存在但未被任何视图引用。

**修复**：
- 重写 Dashboard 为 4-6 个卡片：当前站点身份 / runtime 状态 / 节点汇总 / 队列概览 / 最近事件 / 24h 指标
- 接入 `SyncTrendChart` 显示 24h 同步任务量趋势
- 接入 `SiteStatusChart` 显示节点在线率饼图
- 1-2s loading 期 + 错误兜底

### G5 - Settings 未闭环（**P0** 功能缺失）

**现象**：`SettingsView` 没有 `onMounted` 拉取 `/api/sync/config`，没有 `PUT /api/sync/config`，仅 `emit('save')`。

**修复**：
- `onMounted` → `syncApi.config()`
- 保存按钮 → `syncApi.updateConfig(payload)`
- "测试连通"按钮 → `syncApi.test()`
- 失败显示后端错误 message

### G6 - 后端 7 个 MQTT handler 是 stub（**P0** 真实功能缺失）

**位置**（plant-model-gen）：
- `sync_control_handlers.rs:932-940` `get_mqtt_broker_logs_api` 返回空
- `sync_control_handlers.rs:1046-1069` `set_as_master_node`/`set_as_client_node` 仅 `warn`
- `sync_control_handlers.rs` 内 `start/stop_mqtt_subscription_api`、`clear_master_config_api`、`get_mqtt_subscription_status` 简化

**影响**：MqttNodesView 主从切换按钮点了无效；broker logs 永远空；订阅状态不可信。

**修复**（plant-model-gen 工作）：
- 接入 `check_is_master_node` / `get_available_master_nodes` / `SYNC_EVENT_TX` / `sse_handlers::SyncEvent::MqttSubscriptionStatusChanged`
- 接入 `sync_control_center::get_mqtt_broker_logs`
- `set_as_master/client` 写入 `DbOption.toml` + SQLite

### G7 - site-config 三个写操作未热生效（**P1** 运维难用）

**位置**（plant-model-gen）：
- `site_config_handlers.rs:352-355` save 后无 shutdown_tx → 仅日志提示
- `site_config_handlers.rs:377-380` restart 未接 graceful shutdown
- `site_config_handlers.rs:390-405` reload 是 stub

**影响**：用户保存配置后必须手动重启 web_server，体验断裂。

**修复**（plant-model-gen 工作）：
- AppState 追加 `shutdown_tx`
- axum 接入 graceful shutdown
- `reload_site_config` 接入 `config_reload_manager` + `sync_control_center::get_location`

### G8 - admin login flow 未实现（**P1** 鉴权缺失）

**现象**：26 个 `/api/remote-sync/*` 全部 admin-gated，未配 ADMIN_USER/PASS 时返回 503。前端没有登录界面、没有 token 管理。

**影响**：Topology / TopologyViz 大量功能（envs CRUD / sites CRUD / runtime / metadata / 文件代理）实际不可用。

**修复**：
- 新增 `LoginDialog.vue`（naive-ui Modal + form）
- `http.ts` interceptor 检测 401/403 弹出 login
- `POST /api/admin/login` → 拿 JWT → sessionStorage
- 后续请求注入 `Authorization: Bearer <token>`
- 导航栏右上角"已登录 admin"标识 + 注销按钮

### G9 - SSE 重连与心跳未规范（**P2** 健壮性）

**现象**：`LogsView` 使用 `EventSource` 直接 new，没有心跳超时检测、没有指数退避重连、HMR 重启时可能重复建连。

**修复**：
- 抽 `useSse(url, options)` composable
- 实现：自动重连（max 30s 退避）、心跳超时检测（30s 无 event 视为断）、`onUnmounted` close
- `LogsView` 改用此 composable

### G10 - JS/TS 混合（**P2** 代码统一）

**现象**：`composables/useApi.js`、`composables/useFormatters.js` 是 `.js` 而非 `.ts`，与 `src/api/*.ts` 风格不一致；`tsconfig` 配置可能未覆盖。

**修复**：
- `useApi.js` 重构进 G1 的 api 层后即可删除
- `useFormatters.js` → `useFormatters.ts`，加完整类型签名

### G11 - 5 个孤儿组件（**P2** 代码债）

**现象**：以下组件已存在但**未被任何视图引用**：
- `components/charts/SyncTrendChart.vue`
- `components/charts/SiteStatusChart.vue`
- `components/IncrementalUpdateMonitor.vue`
- `components/SiteCard.vue`（未在 router 视图中被 import）
- `components/DetailModal.vue`（同上）

**修复**：
- 前两个：纳入 G4 Dashboard 重做时使用
- 后三个：与产品确认是否要在某视图接入；不接则 `git rm`

### G12 - e2e-smoke 验收报告未产出（**P0** 流程闭环）

**现象**：截图 5/11，没有 `2026-04-24-e2e-smoke-report.md`。

**修复**：
- 补完 6 个剩余视图的 chrome-devtools 浏览器冒烟（mqtt/messages、mqtt/nodes、logs、archives、site-config、settings）
- 整理截图 + console errors + network 4xx/5xx 清单
- 落盘 `docs/e2e-smoke/2026-04-25-e2e-smoke-report.md`（日期改成实际执行日）

### G13 - 缺顶部 Status Bar（**P2** 信息架构）

**现象**：当前所有视图都没有"当前 location / runtime 状态 / 队列长度"的顶部栏，用户必须切到 Dashboard 才知道。

**修复**：
- 新增 `components/AppStatusBar.vue`，固定在 `App.vue` `<RouterView/>` 之上
- 内部用 `useStatusPolling()` composable 每 30s 拉一次轻量数据
- 4 个胶囊徽标：location / runtime / queue / events-1min

### G14 - MIGRATION_NOTICE / 部署脚本待落实（**P1** Phase 4 收尾）

**位置**：父计划要求 `web-server/MIGRATION_NOTICE`、`deploy_all_with_frontend.sh`、`nginx.example.conf`。

**修复**：
- 确认 `web-server` 已在另一个仓写 `MIGRATION_NOTICE.md` 指向 plant-collab-monitor
- 写 `scripts/deploy.sh`：build + rsync + reload nginx 一键流程
- `nginx.example.conf` 已落地，确认 SSE 段配置正确（`proxy_buffering off`）

---

## 三、Sprint 拆分

### Sprint A · 前端契约与 UI 闭环（1.5 周）

**目标**：把前端从"可点开"升级到"日常可用"。

| Task | Gap | 估时 | Owner | 验收 |
|------|-----|------|-------|------|
| A1 重写 Dashboard | G4 | 1d | 前端 | 6 卡片 + 2 图表，1.5s 内首屏 |
| A2 Settings 闭环 | G5 | 0.5d | 前端 | onMounted 拉 + save 通 + test 通 |
| A3 补 deploymentSitesApi | G3 | 0.5d | 前端 | 9 endpoint 全封装，类型完整 |
| A4 修 MqttMessages 路径 | G2 | 0.5d | 前端 | 改用 `mqttApi.messages()` |
| A5 Archives 归属裁定 | G2 | 0.5d | 产品 | 决定纳入 collab 还是 incremental |
| A6 抽 useSse | G9 | 0.5d | 前端 | composable + LogsView 改造 |
| A7 admin login 前端 | G8 | 1d | 前端 | LoginDialog + interceptor + token 管理 |
| A8 API 三轨收口 | G1 | 2d | 前端 | useApi.js 拆解 + 视图裸 fetch 替换 |
| A9 顶部 StatusBar | G13 | 1d | 前端 | 全局徽标 + 30s 轮询 |

**Sprint A 退出条件**：
- `npm run type-check` 0 errors
- 11 视图浏览器实测无白屏 / 无未捕获红错
- API 三轨收口完成（grep `fetch(` 在视图中 = 0）

### Sprint B · 后端 stub 收口（2 周）

**目标**：把异地协同后端的 7 个 MQTT stub + 3 个 site-config 写操作做实。

| Task | Gap | 估时 | Owner | 验收 |
|------|-----|------|-------|------|
| B1 MQTT 主从切换写盘 | G6 | 2d | 后端 | `set_as_master/client` 真正写 DbOption.toml + SQLite |
| B2 MQTT broker logs | G6 | 1d | 后端 | `get_mqtt_broker_logs_api` 接入 sync_control_center |
| B3 MQTT 订阅状态真值 | G6 | 1d | 后端 | `get_mqtt_subscription_status` 反映真实运行时 |
| B4 SyncEvent 推送 | G6 | 1d | 后端 | `MqttSubscriptionStatusChanged` 事件经 SSE 到前端 |
| B5 site-config save graceful shutdown | G7 | 2d | 后端 | save 后自动 graceful restart 而非提示手动 |
| B6 site-config reload 真实现 | G7 | 1d | 后端 | reload 走 config_reload_manager |
| B7 后端冒烟脚本 | - | 0.5d | 后端 | 9 + 7 个 endpoint 自动化 curl |

**Sprint B 退出条件**：
- 上面 7 项的对应 endpoint 在浏览器实测有效（前端按钮点了真生效）
- M1 冒烟从 6/8 升到 8/8（admin-gated 经过 admin login 后访问通过）

### Sprint C · 验收 + 部署 + 收尾（1 周）

| Task | Gap | 估时 | Owner | 验收 |
|------|-----|------|-------|------|
| C1 补完 6 视图 chrome-devtools 截图 | G12 | 0.5d | 联调 | 截图 11/11 |
| C2 e2e-smoke 验收报告产出 | G12 | 0.5d | 联调 | `docs/e2e-smoke/2026-04-XX-e2e-smoke-report.md` |
| C3 孤儿组件清理 / 收编 | G11 | 0.5d | 前端 | charts 接入 Dashboard，其余 git rm 或确认保留 |
| C4 useApi.js / useFormatters.js → ts | G10 | 0.5d | 前端 | 全仓 0 个 .js |
| C5 部署脚本 deploy.sh | G14 | 0.5d | 运维 | dry-run 通过 |
| C6 web-server MIGRATION_NOTICE 确认 | G14 | 0.5d | 运维 | 跨仓文档对齐 |
| C7 PRD / 本 Gap 文档归档 | - | 0.5d | 文档 | 主 plan 进度表更新到 100% |

**Sprint C 退出条件**：
- 11/11 视图截图 + 验收报告
- `npm run build` 体积 ≤ 3 MB
- 部署脚本 dry-run 通过
- 文档归档

---

## 四、不在三个 Sprint 内的（Phase 6+ 提议）

- 告警体系（站点离线 / 队列堆积 / 失败率超阈值）
- desktop notification
- 审计日志查看页（admin 操作回看）
- 主题切换 dark/light（Naive UI 已支持，包一层 store）
- 国际化（仅当上线海外项目时再做）

---

## 五、风险与依赖

| 风险 | 等级 | 缓解 |
|------|------|------|
| Sprint B 涉及 plant-model-gen，跨仓提交节奏 | 🟡 中 | A、C 在前端独立推进；B 单独排期 |
| MQTT 主从切换涉及生产数据 | 🔴 高 | B1 在测试环境完整跑通 + 二次确认弹窗 + 灰度 1 个月 |
| useApi.js 收口可能误改 incremental 业务 | 🟡 中 | A8 拆成 N 个小 PR，按视图收口 + 每次 type-check |
| admin login 后 token 处理不当导致 XSS | 🟡 中 | sessionStorage 而非 localStorage + httpOnly cookie 选项（待评估） |
| Dashboard 重做 SVG/chart 导致 dist 暴增 | 🟢 低 | 用轻量库（如已有的 vue-chartjs）+ 按需 import |

---

## 六、与上游 plan 的关系

| 上游 plan | 关系 |
|-----------|------|
| `2026-04-22-异地协同前端独立与API汇总计划.md` | 本 Gap 文档是其 Phase 3/4 的"实地审计"补充 |
| `2026-04-22-phase-3-phase-4-execution-checklist.md` | C1/C2 是其 M3 / Phase 4 收尾 |
| `2026-04-24-collab-monitor-e2e-smoke.md` | C1/C2 直接执行其 Step 4/5 |
| `2026-04-25-collab-monitor-prd.md`（同日） | 本文档基于 PRD 反推 gap，与 PRD 双向引用 |

---

## 七、当前数字 / 里程碑

| 指标 | 当前 | Sprint A 后 | Sprint B 后 | Sprint C 后 |
|------|------|-------------|-------------|-------------|
| 视图实现度（加权平均） | 68% | 92% | 95% | **100%** |
| 截图覆盖率 | 5/11 | 5/11 | 5/11 | **11/11** |
| API 调用层一致性 | 3 轨 | 1 轨 | 1 轨 | 1 轨 |
| 后端 stub 数 | 10 | 10 | **0** | 0 |
| admin-gated 可用度 | 0/26 | 26/26 | 26/26 | 26/26 |
| 验收报告 | 无 | 无 | 无 | **有** |
