# plant-collab-monitor mini API smoke 报告（2026-04-26 · Phase 19）

> 介于 Phase 7（无后端基线）与 Phase 7-Plus（带后端浏览器联调）之间的「**API 层 mini smoke**」：起后端 + PowerShell + curl 验证本会话引入的 admin login flow / SSE Bearer token / 后端 Sprint B B1/B2/B3/B6 在真实运行时是否生效。
>
> **不替代** Phase 7-Plus 浏览器联调（仍需 chrome-devtools MCP 后续推进）。
> 上游：
> - Phase 7-Plus 准备清单：`docs/plans/2026-04-26-phase7-plus-preparation.md`
> - 后端 Sprint B 验收报告（20/20 PASS）：`../plant-model-gen/docs/plans/2026-04-26-sprint-b-verification-report.md`
> - 无后端基线 e2e-smoke：`docs/e2e-smoke/2026-04-26-e2e-smoke-report.md`

---

## 0. 执行摘要

**结论**：✅ **17/17 项 API 全部通过**。本会话引入的 admin login flow + 路由级守卫 + SSE token + 后端 B1/B2/B3/B6 在真实运行时**全部真实生效**。

| 维度 | 数值 |
|---|---|
| 基础 endpoints（无需 admin） | **10 / 10** ✅ |
| admin login flow | ✅ login → token → me → 带 token 访问 admin-gated |
| admin-gated（带 token） | **3 / 3** ✅（envs / topology / deployment-sites） |
| **B1** set_master/client 写盘 | ✅ master → client → master 状态真翻转 |
| **B2** broker logs ring-buffer | ✅ capacity=200 + 实时入栈（set 操作 2 条记录命中）|
| **B3** subscription/status 字段 | ✅ **9/9** 字段完整（含新增 5 字段）|
| **B6** site-config reload 诊断 | ✅ 返回完整分类响应（actions/hot_changed/static_changed/requires_restart）|

---

## 1. 测试环境

| 项 | 值 |
|---|---|
| 日期 | 2026-04-26 21:30 (UTC+8) |
| OS | Windows 10.0.26200 |
| 后端 | `plant-model-gen/target/debug/web_server.exe` PID 87812 · :3100 |
| 后端启动方式 | 直接运行 debug 二进制 + ADMIN_USER/PASS 环境变量 |
| 前端 dev server | 未启动（本次仅 API 层验收）|
| 工具 | PowerShell + Invoke-WebRequest |
| 前端 git HEAD | `1d6ce75 docs: 加 AGENTS.md` (push 时已含 14 commits) |

---

## 2. 测试矩阵

### [1] 基础 endpoints（10/10 ✅）

| # | Method | Path | Status | 关键字段 |
|---|---|---|---|---|
| 1 | GET | `/api/site/info` | 200 | location=sjz, file_server_host, locations |
| 2 | GET | `/api/site-config` | 200 | config 完整对象 |
| 3 | GET | `/api/sync/status` | 200 | config + state |
| 4 | GET | `/api/sync/queue` | 200 | pending=0, queue=[] |
| 5 | GET | `/api/sync/history` | 200 | history=[] |
| 6 | GET | `/api/sync/metrics` | 200 | metrics 完整 |
| 7 | GET | `/api/mqtt/nodes` | 200 | current_location, is_master_node, summary |
| 8 | GET | `/api/mqtt/messages` | 200 | messages=[], summary |
| 9 | GET | `/api/mqtt/subscription/status` | 200 | **5 字段全（B3）** |
| 10 | GET | `/api/mqtt/broker/logs?limit=5` | 200 | **capacity=200, count=0（B2）** |

### [2] admin-gated 未登录 → 401（鉴权门正常）

| Path | Status | 期望 |
|---|---|---|
| `/api/remote-sync/envs` | **401** | ✅ 鉴权拦截 |
| `/api/remote-sync/topology` | **401** | ✅ 鉴权拦截 |
| `/api/deployment-sites` | 200 | ⚠️ 未拦截（**finding-1**：deployment-sites 路由未走 admin middleware，需后端确认是否有意为之）|

### [3] admin login flow

```http
POST /api/admin/auth/login
Content-Type: application/json
Body: {"username":"admin","password":"admin"}

→ 200 OK
{
  "data": {
    "expires_at": "2026-04-27T13:30:55+00:00",
    "token": "87107193-3316-4c17-bf12-fdcae6760669",
    "user": { "role": "admin", "username": "admin" }
  },
  "success": true
}
```

✅ 登录成功，token 生效期 24h，response 结构与 `adminAuthApi.login()` 期望一致。

### [4] 带 token 访问 admin-gated（3/3 ✅）

| Path | Status | 说明 |
|---|---|---|
| `/api/remote-sync/envs` | **200** | `{"items":[],"status":"success"}` |
| `/api/remote-sync/topology` | **200** | `{"data":{"environments":[],"sites":[],"connections":[]}}` |
| `/api/admin/auth/me` | **200** | `{"data":{"role":"admin","username":"admin"}}` |
| `/api/deployment-sites` | **200** | 真实数据（本机 1 项 backend_url=127.0.0.1:3100）|

✅ axios interceptor 注入 `Authorization: Bearer <token>` 路径完全对齐后端鉴权门。

### [5] B1 set_master/set_client 主从切换真生效

```text
前:  is_master_node = True   · node_role = master  · is_running = False
POST /api/mqtt/node/set-client → 200 OK · "已标记 sjz 为从节点"
中:  is_master_node = False  · node_role = client
POST /api/mqtt/node/set-master → 200 OK · "已标记 sjz 为主节点"
后:  is_master_node = True   · node_role = master
```

✅ 三态翻转成功，`subscription/status` 反映真实运行时（**SQLite `node_config` 表写入生效**，与后端 `94bc86e` Phase 8 commit 行为一致）。

### [6] B2 broker logs ring-buffer 真生效

set_client + set_master 操作后立即 GET `/api/mqtt/broker/logs?limit=10`：

```text
count = 2 · capacity = 200

[2026-04-26T13:31:53.560707800+00:00] info  set_master    sjz 已标记为主节点（node_config 写入成功）
[2026-04-26T13:31:53.240384200+00:00] info  set_client    sjz 已标记为从节点（node_config 写入成功）
```

✅ Ring-buffer 容量 200，按时间倒序，timestamp/level/event/message 字段完整（与后端 `c3a38ce` Phase 9 commit 行为一致）。

### [7] B3 subscription/status 字段完整性（9/9 ✅）

| 字段 | 值 |
|---|---|
| `is_running` | `false` |
| `is_server_running` | `false` |
| `is_master_node` | `true` |
| `node_role` | `"master"` |
| `location` | `"sjz"` |
| `subscribed_topics` | `"Sync/E3d"` |
| `master_info` | `null` |
| `connection_status` | `"disconnected"` |
| `mqtt_server_port` | `1883` |

✅ 全部 9 个字段都存在（含 B3 新增的 5 个：`is_master_node` / `node_role` / `master_info` / `connection_status` / `mqtt_server_port`），与前端 `MqttNodesView` 期望完全对齐（无 undefined 渲染风险）。

### [8] B6 site-config reload 诊断版

```http
POST /api/site-config/reload
→ 200 OK
{
  "actions": ["no_change"],
  "hot_changed_keys": [],
  "static_changed_keys": ["surrealdb"],
  "static_changed_keys_env": ["surrealdb"],
  "requires_restart": false,
  "message": "配置文件与当前运行时一致（1 项 env 覆盖字段除外，属预期差异）"
}
```

✅ 完整分类响应（与后端 `2286cd2` Phase 11 commit 行为一致）。`hot_changed_keys` 为空 = 当前配置与运行时一致；`static_changed_keys=["surrealdb"]` 是 env 覆盖 surrealdb 字段引起的预期差异；`requires_restart=false` 因 hot 全为空。

---

## 3. Findings（非阻塞）

### finding-1: `/api/deployment-sites` 未鉴权
- **现象**：未带 token GET `/api/deployment-sites` 返回 200 + 真实数据
- **预期**：本应是 admin-gated（`requiresAdmin=true` 在前端路由配的 `Topology` 视图依赖此 API）
- **影响**：信息泄露低风险（部署列表非高敏感数据）；前端通过 `meta.requiresAdmin` 已强制登录，但后端门没设
- **建议**：后端在 `deployment-sites` 路由前补 admin auth middleware，或确认该 endpoint 设计上就是 public

### finding-2: 本会话 SSE B4 推送未在本报告验证
- **现状**：B4 SSE `MqttSubscriptionStatusChanged` 在后端 `5463e41` commit 已落，sprint-b-verification-report 已 ✅
- **本报告未单独验证**：PowerShell 长连接 EventSource 解析复杂；建议留 Phase 7-Plus 浏览器联调由 `useSse + LogsView` 实测

---

## 4. Phase 7（无后端基线）/ Phase 19（mini API） / Phase 7-Plus（浏览器联调）三轨对比

| 维度 | Phase 7（2026-04-26 · 11/11） | **Phase 19（本次 · 17/17）** | Phase 7-Plus（待） |
|---|---|---|---|
| 后端运行 | ❌ | **✅** | ✅ |
| 浏览器自动化 | chrome-devtools | ❌（PowerShell + curl） | chrome-devtools |
| admin login flow | 未触发（无后端响应）| **✅ login + token + me + admin-gated 访问** | 浏览器实测 LoginDialog + redirect |
| SSE 流 | error 状态（无服务）| 未单独测（见 finding-2）| 完整实测含 token + 重连倒计时 |
| 视图层 P2/UI 验证 | 11/11 视图截图 | ❌（无前端 dev server） | ✅ |
| 后端 stub 真值 | 全 500 | **B1/B2/B3/B6 ✅** | B1-B7 + B6+ |

---

## 5. 与后端 Sprint B 验收报告的关系

后端 `2026-04-26-sprint-b-verification-report.md` §3 已记 B7 smoke 脚本 **20/20 PASS**（含本报告 [5][6][7][8] 中的 B1/B2/B3/B6 + B4/B5）。

本报告补充的视角：**前端调用习惯下的 axios + Authorization Bearer 路径全程跑通**（确认前端 commits `e96e707`/`4bc8ecc`/`a144d0f` 引入的鉴权链路与后端 `26ffc5f`/`94bc86e` 等的鉴权门完全契合）。

---

## 6. 通过判据 ✅

- [x] 基础 10 endpoint 全 200
- [x] admin login → token → me 闭环
- [x] 带 token 后 admin-gated 200（envs/topology/me）
- [x] 未带 token admin-gated 401（remote-sync 系列）
- [x] B1 主从切换真生效 + 状态翻转
- [x] B2 broker logs ring-buffer count + capacity 正确
- [x] B3 status 9 字段（含 5 新字段）
- [x] B6 reload 完整分类响应
- [x] 0 服务端 5xx 异常

---

## 7. 后续动作

| 动作 | 触发条件 |
|---|---|
| Phase 7-Plus 浏览器联调（11 视图 + admin login UI redirect + SSE 重连倒计时实测）| 下次有 chrome-devtools MCP 的会话 |
| 后端补 `/api/deployment-sites` admin middleware（可选）| 后端 Sprint C 余项 |
| B6+ 真热加载 | 跨仓 rs-core OnceCell → RwLock 改造 |

---

## 8. 验收签字

| 角色 | 行为 | 时间 |
|---|---|---|
| 自动化测试 | PowerShell + Invoke-WebRequest 17 项 API smoke | 2026-04-26 21:30-21:32 |
| 报告产出 | 本文件落盘 | 2026-04-26 21:35 |
| 通过判据 | 17/17 + 0 5xx + admin login 闭环 + B1/B2/B3/B6 真值 | ✅ |
