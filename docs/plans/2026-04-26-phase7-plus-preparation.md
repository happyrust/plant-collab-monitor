# plant-collab-monitor · Phase 7-Plus 浏览器联调准备清单（2026-04-26）

> 上游：
> - 无后端基线 e2e-smoke 报告：`docs/e2e-smoke/2026-04-26-e2e-smoke-report.md`
> - Sprint A/C 完成清单：`docs/plans/2026-04-26-sprint-bc-plan.md`
> - 后端 Sprint B 状态：`../plant-model-gen/docs/plans/2026-04-26-sprint-b-plan.md`
> - **后端 Phase 7-Plus 验收报告（20/20 PASS）**：`../plant-model-gen/docs/plans/2026-04-26-sprint-b-verification-report.md`
>
> 本文件给**下次有 chrome-devtools MCP 或浏览器自动化能力**的会话用，5 分钟内即可跑通带后端的 11 视图 Phase 7-Plus 真实联调，并校验本会话（commit `34ac9f9`）引入的 admin login flow / SSE token / 路由守卫是否在浏览器里真生效。

---

## 0. 后端已就绪（重要前提）

> 后端 plant-model-gen 已完成 Sprint B 全部本仓任务，参见 `2026-04-26-sprint-b-verification-report.md` §3：
>
> - ✅ **B1** set_master/set_client 真写 SQLite `node_config` 表（commit `94bc86e`）
> - ✅ **B2** broker logs ring-buffer + 6 处注入（commit `c3a38ce`）
> - ✅ **B3** subscription/status 5 个新字段（commit `94bc86e`）
> - ✅ **B4** SSE `MqttSubscriptionStatusChanged` 4 处推送（commit `5463e41`）
> - ✅ **B5** graceful shutdown（axum + AppState.shutdown_tx · commit `26ffc5f`）
> - ✅ **B6** reload diff + 分类响应（commit `2286cd2`）
> - ✅ **B7** smoke-collab-api.sh **20/20 PASS**
>
> ⏳ 仅剩 **B6+** 真热加载（跨仓 rs-core OnceCell → RwLock<Arc<DbOption>> 改造，独立会话）—— 不阻塞本次浏览器联调。
>
> **结论**：起后端就能跑。前端不需要做任何"猜测降级"。

---

## 0. 本会话已闭环但 Phase 7（无后端基线）未验证的能力

> 这些是 Phase 7（2026-04-26 00:54 出报告时）后才落的工作，必须 Phase 7-Plus 实测：

| ID | 能力 | 关键 commit | 浏览器验收点 |
|---|---|---|---|
| 1 | 路由级 admin guard | `4bc8ecc` | 未登录访问 `/topology` → 立即弹 LoginDialog（不是等 401） |
| 2 | LoginDialog redirect | `e96e707` | 在 `/topology` 被拦截后登录 → **跳回 `/topology`**（不是停在 dashboard） |
| 3 | SSE Bearer token | `e96e707` | LogsView 网络面板看 `/api/sync/events/stream` 走 fetch 路径 + 带 `Authorization: Bearer ...` 头部 |
| 4 | MqttNodes SSE token + 状态徽标 | `e5009b6` `936a09e` | MqttNodesView header 显「● 实时」绿色徽标；后端断连时变「● 重连中 #N」（N 显式可见） |
| 5 | LogsView appStatus.trackEvent 接通 | `e5009b6` | 顶部 AppStatusBar「事件 N/min」徽标在 SSE 推送来时数字递增 |
| 6 | DashCard NTooltip 显完整 error | `936a09e` | Dashboard 任何 error 状态点 hover → 弹 NTooltip 完整 message（不是原生 title） |
| 7 | TopologyView NMessage/NDialog | `936a09e` | TopologyView 删除环境/站点 → 弹 NDialog 二次确认；删除成功 → 顶部 message.success 反馈 |
| 8 | SiteConfig confirm → NDialog | `0b111c1` | SiteConfigView 保存配置 → 弹 NDialog warning（不是浏览器原生 confirm） |
| 9 | SiteConfig alert → inline banner | `876c023` | SiteConfigView 加载失败 → 顶部 rose banner（非 alert 弹窗） |
| 10 | SyncTrendChart 空状态 | `33f7977` | Dashboard SyncTrendChart 空数据时显「暂无同步数据」（不是写死的假数据 [12,18,15,...]）|
| 11 | MqttNodes broker logs 诚实化 | `33f7977` | MqttNodesView 后端 stub 时 logs 区显「暂无日志」（不是「MQTT Broker 已启动在端口 1883」假行）|

---

## 1. 启动顺序（5 分钟）

### 1.1 后端 plant-model-gen

```powershell
cd D:/work/plant-code/plant-model-gen

# 设 admin 凭证（必须，否则 26 个 admin-gated endpoint 全 503）
$env:ADMIN_USER = 'admin'
$env:ADMIN_PASS = 'admin'

# 启动（首次编译 ~5-10 min，增量 ~30s）
cargo run --bin web_server --features web_server
```

**预期**：日志出现 `Listening on 127.0.0.1:3100`。

**也可以直接用已编译产物**：
```powershell
cd D:/work/plant-code/plant-model-gen
.\target\debug\web_server.exe
# 或 release
.\target\release\web_server.exe
```

### 1.2 前端 plant-collab-monitor

新开 PowerShell：
```powershell
cd D:/work/plant-code/plant-collab-monitor
npm run dev
# → http://localhost:3200
```

### 1.3 浏览器（chrome-devtools MCP 自动化）

```text
打开 http://localhost:3200/
```

**默认重定向**：`/` → `/dashboard`（router/index.ts:5 配置）。

---

## 2. 11 视图覆盖矩阵（必须全跑）

| # | 步骤 | URL | 预期 console.error | 截图文件 | 关键观察点 |
|---|---|---|---|---|---|
| 1 | 进入 dashboard | `/dashboard` | 0（admin 未登录时仅业务 banner） | `01-dashboard-plus.png` | 6 卡片正常显示真实数据；2 chart 渲染（非空状态）；最近事件区有数据 |
| 2 | **首次访问 admin 视图** | `/topology` | 0 | `02-login-dialog.png` | **立即弹 LoginDialog**（路由 guard 起作用） |
| 3 | 输入 admin/admin 登录 | (LoginDialog 内) | 0 | `03-login-success.png` | message.success「欢迎，admin」 + **自动跳回 `/topology`** |
| 4 | 看 envs 列表 | `/topology` | 0 | `04-topology.png` | 真实 envs 数据；右侧站点表格 |
| 5 | 删除一个测试 site | (Topology 内点删除) | 0 | `05-delete-confirm.png` | **NDialog 二次确认**（不是 confirm）；删除成功 message.success「已删除站点」 |
| 6 | 拓扑可视化 | `/topology-viz` | 0 | `06-topology-viz.png` | SVG 节点绘制；可拖拽 |
| 7 | 任务队列 | `/tasks` | 0 | `07-tasks.png` | 真实任务（如有）或「暂无」 |
| 8 | 同步历史 | `/history` | 0 | `08-history.png` | 时间线 |
| 9 | MQTT 消息 | `/mqtt/messages` | 0 | `09-mqtt-messages.png` | NDataTable 真数据 |
| 10 | MQTT 节点 + SSE | `/mqtt/nodes` | 0 | `10-mqtt-nodes.png` | header 显「● 实时」绿色徽标；点「设为主节点」立即生效（B4 SSE 推送） |
| 11 | Logs SSE 流 | `/logs` | 0 | `11-logs.png` | header 显「● 实时」；新事件 prepend；StatusBar 顶部「事件 N/min」徽标递增 |
| 12 | 归档 | `/archives` | 0 | `12-archives.png` | 真实 cba 文件列表 |
| 13 | 站点配置 + NDialog | `/site-config` | 0 | `13-site-config.png` | 表单回填真实数据；点保存 → **NDialog warning「确认保存配置」**；validate 通过 → emerald banner |
| 14 | 全局参数 | `/settings` | 0 | `14-settings.png` | 表单回填；保存通后端；emerald 成功 banner |

---

## 3. 关键深入校验

### 3.1 admin login redirect 闭环

```text
预期顺序：
1. 浏览器开 /topology（fresh session 未登录）
2. router.beforeEach 检测 meta.requiresAdmin=true → adminAuth.isLoggedIn=false
3. sessionStorage 写入 admin_redirect_after_login = '/topology'
4. router 跳 /dashboard
5. LoginDialog 弹起（adminAuth.loginVisible=true）
6. 输 admin/admin → POST /api/admin/auth/login → token 存 sessionStorage
7. LoginDialog handleLogin: consumeRedirectAfterLogin() 取出 '/topology'
8. router.push('/topology') → topology 视图加载
```

**可疑路径**：
- 如果 5 没弹起 → 说明 `App.vue` 的 `<LoginDialog />` 没接到 `loginVisible`，检查 `useAdminAuthStore`
- 如果 7 拿到 null → 说明 `consumeRedirectAfterLogin` 没读到（sessionStorage 写错了 key？）
- 如果 8 又被 guard 拦住 → 说明 token 没写进 store，检查 `setSession`

### 3.2 SSE Bearer token 路径

打开 chrome-devtools Network → 过滤 `events/stream`：

| 状态 | 期望 |
|---|---|
| 未登录访问 `/logs` | EventSource 路径（`getToken()` 返回 null） |
| 登录后访问 `/logs` | **fetch 路径** + Request Headers 含 `Authorization: Bearer eyJ...` |

如果登录后还是 EventSource 路径 → `useAdminAuthStore` 的 `token` getter 没拿到值，或 `useSse` getToken 闭包访问的是初始空值。

### 3.3 后端 stub 真值校验

| API | 后端期望 | 浏览器观察 |
|---|---|---|
| `POST /api/mqtt/node/set-master` | 写 node_config 表 | MqttNodesView 节点角色徽章秒变「主节点」 |
| `GET /api/mqtt/subscription/status` | 返回 5 个新字段 | F12 Network 看 response 含 `is_master_node` `node_role` `master_info` `connection_status` `mqtt_server_port` |
| `GET /api/mqtt/broker/logs?limit=10` | 返回 ring-buffer | MqttNodesView logs 区显真实操作日志（不是「Broker 已启动」假行） |
| SSE `MqttSubscriptionStatusChanged` | 4 处推送 | curl `POST set-master` 后，**MqttNodesView 在 ≤1s 内自动 reload** |
| `POST /api/site-config/reload` | 返回 hot_changed_keys + actions | SiteConfigView 提示「字段变更检测」（非「stub 不生效」） |

---

## 4. 验收报告模板（产出位置 `docs/e2e-smoke/2026-04-XX-e2e-smoke-plus-report.md`）

```markdown
# plant-collab-monitor e2e-smoke-plus 验收报告（2026-04-XX）

> 关闭 Phase 7-Plus（带后端真实联调）。
> 上游：`docs/plans/2026-04-26-phase7-plus-preparation.md`
> 前置 commit：`0b111c1` (post-Phase-14)

## 0. 执行摘要
**结论**：✅ N/14 视图通过 Phase 7-Plus 带后端联调（其中 admin-gated 12 视图实测）。

| 维度 | 数值 |
|---|---|
| 视图覆盖 | N/14 |
| admin login redirect 闭环 | ✅/❌ |
| SSE Bearer token 路径 | ✅/❌ |
| MQTT 主从切换秒级生效 | ✅/❌ |
| Vue 运行时未捕获红错 | 0 |

## 1. 测试环境
- 后端 web_server.exe PID xxx · :3100
- 前端 :3200
- ADMIN: admin/admin
- Chrome 版本：xxx

## 2. 14 步测试矩阵
（见本准备清单 §2）

## 3. 关键校验结果
（见 §3）

## 4. 与之前的 e2e-smoke（无后端基线）对比
| 项 | 2026-04-26 无后端 | 2026-04-XX 有后端 |
|---|---|---|
| Vue 运行时红错 | 0 | 0 |
| console.error 类型 | 全是业务 500 banner | （应为 0 或仅业务降级提示）|
| SSE 状态 | error（连不上 :3100） | open |
| StatusBar 数据 | 全部「未配置 / 未知」| 真实数据 |

## 5. 通过判据
- [ ] 14 步全部 ✅
- [ ] admin login flow 完整闭环
- [ ] SSE Bearer token 真生效
- [ ] MQTT 主从切换秒级反馈
- [ ] AppStatusBar「事件 N/min」徽标真递增

## 6. 后续动作
- 若 14/14 ✅：collab-monitor 项目实现度推到 100%
- 若有 P1 缺陷：开 issue + 修复 commit
```

---

## 5. 不在本清单的（独立任务）

| 项 | 触发条件 | Owner |
|---|---|---|
| **B5** site-config save graceful shutdown | 后端独立 Phase 10（main.rs + AppState 重构 2d） | plant-model-gen 团队 |
| **B6+** site-config reload 真热加载 | 跨仓改 rs-core OnceCell → RwLock<Arc<DbOption>>（独立会话） | rs-core + plant-model-gen 团队 |
| **D** useSse 暴露 nextRetryAt 做倒计时 UI | 前端低优先级优化 | 前端 |

---

## 6. 故障排查速查表

| 现象 | 可能原因 | 排查 |
|---|---|---|
| LoginDialog 不弹 | `<LoginDialog />` 未挂在 App.vue | grep `App.vue` 看是否有 `<LoginDialog />` |
| 登录后不跳回 | `consumeRedirectAfterLogin` 路径不对 | F12 Application → sessionStorage → 看 `admin_redirect_after_login` 是否被写入 |
| SSE 连不上 | nginx 缓冲 | 看 `nginx-plant-collab-monitor.conf.example` 是否含 `proxy_buffering off` |
| MQTT 主从切换无反馈 | B4 SSE 推送未到 | F12 Network → 看 `events/stream` 是否有 `MqttSubscriptionStatusChanged` 事件 |
| Dashboard chart 空 | 后端 metrics 字段不一致 | 看 `useDashboardSummary` 期望的字段名（trend.dates / synced / pending） |
| 顶部 StatusBar 不变 | appStatus polling / trackEvent 未挂上 | `appStatus.ts` 看 polling 实现 + LogsView 是否调 trackEvent |

---

## 7. 时间盒

| 步骤 | 估时 |
|---|---|
| 后端编译启动（首次） | 5-10 min |
| 后端编译启动（增量） | 30 s |
| 前端 dev 启动 | 5 s |
| 11 视图截图 + 校验 | 15 min |
| 验收报告产出 | 10 min |
| **总计** | **~30 min**（增量场景）|
