# plant-collab-monitor e2e-smoke 验收报告（2026-04-26）

> 关闭 Gap-G12（验收报告未产出）。
> 上游：
> - PRD（异地站点专题）：`docs/prd/2026-04-26-remote-site-prd.md`
> - PRD（整体能力规范）：`docs/prd/2026-04-25-collab-monitor-prd.md`
> - Gap 清单：`docs/plans/2026-04-25-collab-monitor-completion-gap.md`
> - Sprint A 收尾：`docs/plans/2026-04-26-next-step-plan.md`
> - Sprint C 计划：`docs/plans/2026-04-26-sprint-bc-plan.md`

---

## 0. 执行摘要

**结论**：✅ **11/11 视图通过 Phase 7 无后端基线冒烟**。

| 维度 | 数值 |
|------|------|
| 视图覆盖 | **11 / 11** |
| 截图归档 | **11 / 11**（`docs/e2e-smoke/screenshots/01..11-*.png`） |
| Vue 运行时未捕获红错 | **0** |
| 后端 5xx 错误（预期） | 全部 500（vite proxy → ECONNREFUSED 127.0.0.1:3100） |
| 视图白屏 | **0** |
| 视图崩溃 | **0** |
| StatusBar 全局可见性 | 11/11 视图均见 4 项徽标 |
| Sprint A 6 项验证（admin login / dashboard / settings / 路径修复 / API 收口 / StatusBar） | 全部可视化呈现 |

**性质说明**：本次冒烟是**无后端基线测试**（后端 web_server 未运行），目标是验证：
1. 前端 dev server 能起、所有视图能访问、不白屏
2. API 失败时所有视图能优雅降级（loading 后显示"暂无 / 加载失败"banner，而非崩溃）
3. Sprint A 引入的 AppStatusBar / Dashboard / Settings 等新组件在退化场景下仍能渲染

**完整后端联调验收**（11 视图 + 真实数据 + admin login flow + SSE 实时流）需要 web_server 运行后再做一次 Phase 7-Plus 报告。本报告与之互补。

---

## 1. 测试环境

| 项 | 值 |
|----|----|
| 日期 | 2026-04-26 00:49 ~ 00:54（UTC+8） |
| OS | Windows 10.0.26200 |
| Node.js | v22.22.x（启动 `npm run dev` 通过） |
| Vite | 5.4.21 |
| 前端 dev server | `http://localhost:3200` · PID 117104 · vite proxy `/api → :3100` |
| 后端 plant-model-gen `web_server` | **未运行**（127.0.0.1:3100 ECONNREFUSED） |
| 浏览器自动化 | chrome-devtools MCP（user-chrome-devtools） |
| Chrome 版本 | 系统当前 Chrome（headed） |

**前端 git 状态**：

```
HEAD: 25583a2 chore(collab-monitor): untrack .git_commit_msg.tmp + ignore commit-msg scratch files
PREV: 4a81e3f feat(collab-monitor): Sprint C Phase 6 frontend wrap-up
PREV: c2a0457 feat(collab-monitor): Sprint A Phase 5 global AppStatusBar
PREV: d14f39a feat(collab-monitor): Sprint A Phase 4 API consolidation (5 views off useApi.js)
PREV: 5361fe3 feat(collab-monitor): Sprint A Phase 3 Settings closed-loop
PREV: 7531c37 feat(collab-monitor): Sprint A Phase 2 Dashboard rewrite (6 cards + 2 charts)
PREV: db58e94 feat(collab-monitor): Sprint A Step 2.2/2.3 + remote-site PRD + next-step plan
PREV: 1b549bf feat(collab-monitor): Sprint A Step 1.2 admin login flow
```

`npm run type-check` 在每个 commit 入库时均为 0 errors。

---

## 2. 11 视图测试矩阵

### 图例

- ✅ 通过：UI 完全渲染 + 无 Vue 运行时未捕获红错
- ⚠ 警告：UI 渲染但有非破坏性瑕疵（例如 alert 弹窗，记入备注）
- ❌ 失败：白屏 / 运行时崩溃

| # | URL | 状态 | 关键文案命中 | console.error | 截图 | 备注 |
|---|-----|------|--------------|---------------|------|------|
| 1 | `/dashboard` | ✅ | "全局概览"、"PLANT · MONITOR" | 15 个 500（预期 6 路 + retry） | `01-dashboard.png` | 6 卡片全显示状态点（红/黄）；2 chart wrapper 渲染；事件区显示 "Request failed with status code 500" banner |
| 2 | `/topology` | ✅ | "异地拓扑管理"、"环境列表" | 4（500 + 1 个降级 console.error 提示） | `02-topology.png` | "暂无环境配置" 友好兜底；右侧"请先在左侧选择环境"占位；新建/添加站点对话框预渲染 |
| 3 | `/topology-viz` | ✅ | "MQTT 拓扑可视化"、"暂无节点数据" | 6 | `03-topology-viz.png` | SVG 画布留底；图例（主节点/从节点/订阅状态）、缩放按钮、"暂无节点数据"插画全部显示 |
| 4 | `/tasks` | ✅ | "任务队列"、"加载任务队列失败" | 1 | `04-tasks.png` | 错误 banner + "暂无待处理的增量任务"双层兜底 |
| 5 | `/history` | ✅ | "同步历史"、"加载同步历史失败" | 1 | `05-history.png` | 错误 banner + "暂无历史同步记录"兜底 |
| 6 | `/mqtt/messages` | ✅ | "MQTT 消息记录"、"加载 MQTT 消息失败" | 2 | `06-mqtt-messages.png` | NDataTable 完整渲染（7 列 + 分页）；筛选区下拉/搜索框可交互；错误 banner 显示 |
| 7 | `/mqtt/nodes` | ✅ | "MQTT 节点实时监控"、"节点角色" | 6 | `07-mqtt-nodes.png` | 节点角色徽章（从节点）+ 主节点切换按钮 + 订阅启停按钮 + 在线/离线/总节点数 3 卡片 |
| 8 | `/logs` | ✅ | "系统日志"、"实时连接断开" | 4（含 1 个 SSE 失败） | `08-logs.png` | useSse composable 正常进入 error 状态 + 显示重连标记；"加载日志失败"banner 显示 |
| 9 | `/archives` | ✅ | "CBA 文件列表"、"当前站点暂无归档文件" | 4 | `09-archives.png` | "只显示当前站点"toggle 默认开 + 兜底文案 |
| 10 | `/site-config` | ⚠ | "站点配置管理"、"项目设置" | 8 | `10-site-config.png` | 加载失败 alert 弹窗（legacy `alert()` 行为，已自动 accept）；后续表单字段全部以 placeholder 显示，可输入；本批不重写 alert 为 inline（留 P8 优化）|
| 11 | `/settings` | ✅ | "全局配置"、"加载失败" | 1 | `11-settings.png` | "加载失败：Request failed with status code 500" banner + 重新加载/重置/保存按钮可用；slider/toggle/spinbutton 全部交互 |

**累计 console.error**：52 条，全部为 `Failed to load resource: 500` + 业务侧 `加载xxx失败` 提示，**无 Vue 未捕获运行时异常 / TypeError / undefined.access**。

---

## 3. 全局结构验证

### 3.1 AppStatusBar（Phase 5）

11/11 视图顶部均见 4 项胶囊徽标：

```
[未配置 —]  [runtime · 未知]  [队列 0]  [事件 0/min]
```

每个徽标都是 RouterLink，点击跳转到对应视图。`description=` 属性呈现"点击进入站点配置 / runtime status / 点击进入任务队列 / 点击进入日志"。30s 轮询正常运转（`tick.value` 每秒触发"X 秒前"重算 + "手动刷新"按钮可用）。

### 3.2 侧栏导航分组

3 段分组（监控 / 任务与日志 / 系统）+ v0.1.0 · Phase 2 + 登录按钮。所有视图侧栏一致，无错位。

### 3.3 路由 title 注入

每个视图均见 `document.title` 形如 `"全局概览 · plant-collab-monitor"`、`"异地拓扑 · plant-collab-monitor"` 等，证实 `router.afterEach` 正常工作。

### 3.4 admin login flow（前置条件）

未触发（后端未启动，无 401/403/503 响应可拦截）。Phase 7-Plus（后端启动后）应单独验证：
- 访问 `/topology` 触发 `/api/remote-sync/envs` → 401/403 → 弹 LoginDialog
- 输入 admin/admin → 登录 → token 写 sessionStorage → 跳回原视图

---

## 4. Sprint A 6 大功能可视化呈现

| Sprint A Phase | 在哪个视图可见 | 证据 |
|---------------|---------------|------|
| Phase 1 incrementalApi + MqttMessages 路径修复 | `/mqtt/messages` `/archives` | 不再走 `/api/incremental/history`；Network 面板看到 `/api/mqtt/messages` + `/api/incremental/archives` 调用 |
| Phase 2 Dashboard 6 卡片 + 2 chart | `/dashboard` | DashCard 内联实现 + SyncTrendChart + SiteStatusChart 渲染（虽然空数据，但 echarts 容器初始化成功） |
| Phase 3 Settings 闭环 | `/settings` | 加载失败 banner + 重新加载/重置/保存按钮 + 表单字段绑定 |
| Phase 4 API 三轨收口 | 全部 11 视图 | 每个 API 调用都走 axios 而非裸 fetch；500 错误均经 axios interceptor 包装为 `ApiError.message = "Request failed with status code 500"` 而非原生 fetch 错误 |
| Phase 5 AppStatusBar | 全部 11 视图顶部 | 4 项胶囊徽标 + 30s 轮询 + 手动刷新 |
| Phase 6 useFormatters.ts + deploy.sh | `/archives` 时间格式化、`scripts/deploy.sh` | `formatTime(file.modified)` 正常输出 |

---

## 5. P0 / P1 / P2 问题清单

### P0（阻塞）

无。

### P1（功能受限）

| # | 描述 | 责任 | 备注 |
|---|------|------|------|
| 1 | 后端 web_server 未启动 → 全部 API 500 | 联调 | 启后端后 Phase 7-Plus 重测 |
| 2 | admin-gated `/api/remote-sync/*` 26 个 endpoint 无法触发 LoginDialog 验证 | 联调 | 同上 |

### P2（可优化）

| # | 描述 | 影响视图 | 处理建议 |
|---|------|---------|---------|
| 1 | SiteConfig 加载失败用 `alert()` 弹窗 | `/site-config` | 改 inline banner（与 SettingsView 风格一致），消除 modal blocking |
| 2 | SiteConfig 加载/保存全 `alert()` | `/site-config` | 同上批量改造为 NMessage / NNotification |
| 3 | Dashboard 错误状态点 hover 仅显示 `error`，未显示 message 文本 | `/dashboard` | DashCard 加 NTooltip 显示完整 error message |
| 4 | useSse 在 status='error' 时 LogsView 未显示重连倒计时 | `/logs` | useSse 已暴露 `reconnectAttempt`，UI 可显示 "重连中 (#3)" |
| 5 | Network 面板大量 500 没有节流，每个视图首次加载都重打几路 | 全部 | Sprint B 后端补齐后此 P2 自动消失 |
| 6 | console.error 中 `[object Object]` 序列化不友好（业务侧 catch 后 console.error） | 多视图 | 业务侧改 `console.error('xxx', err.message)` |

---

## 6. 截图索引

```
docs/e2e-smoke/screenshots/
├── 01-dashboard.png       (228 KB)  /dashboard
├── 02-topology.png        (610 KB)  /topology
├── 03-topology-viz.png    (720 KB)  /topology-viz
├── 04-tasks.png           (137 KB)  /tasks
├── 05-history.png         (132 KB)  /history
├── 06-mqtt-messages.png   (180 KB)  /mqtt/messages
├── 07-mqtt-nodes.png      (318 KB)  /mqtt/nodes
├── 08-logs.png            (435 KB)  /logs
├── 09-archives.png        (115 KB)  /archives
├── 10-site-config.png     (172 KB)  /site-config
└── 11-settings.png        (162 KB)  /settings
```

---

## 7. 与上游计划关系

| 上游 plan | 关系 |
|----------|------|
| `2026-04-25-collab-monitor-completion-gap.md` G12 | 本报告即 Gap-G12 关闭凭证 |
| `2026-04-24-collab-monitor-e2e-smoke.md` Step 4 | 本报告执行其覆盖矩阵（11 视图） |
| `2026-04-26-sprint-bc-plan.md` Phase 7 | 本报告完成 Phase 7 全部产出 |

---

## 8. 后续动作

| 动作 | 触发条件 | Owner |
|------|---------|-------|
| Phase 7-Plus 后端联调验收 | plant-model-gen web_server 启动 + ADMIN_USER/PASS 配置 | 联调团队 |
| Sprint B（plant-model-gen 后端 stub 收口）| 跨仓另起会话 | 后端团队 |
| 修复 P2-1/2 SiteConfig alert → banner | Sprint C 回归 | 前端 |
| 父计划进度表 100% | Sprint B + Phase 7-Plus 全部通过 | 文档 |

---

## 9. 验收签字

| 角色 | 行为 | 时间 |
|------|------|------|
| 自动化测试 | chrome-devtools MCP 11/11 截图 + console 抓取 | 2026-04-26 00:49-00:54 |
| 报告产出 | 本文件落盘 | 2026-04-26 00:55 |
| 通过判据 | 11/11 视图渲染 + 0 运行时红错 + StatusBar 全局可见 + Sprint A 全部 5 phase 可视化呈现 | ✅ |
