# plant-collab-monitor Next-Step 开发计划（2026-04-25 续）

> 本文档承接 `docs/plans/2026-04-25-sprint-a-execution.md`，作为 Sprint A **Step 1.2 收尾 + Step 2.2/2.3 起步** 的可执行 next-step 计划。
>
> 上下文：
> - Step 1.1 useSse + Step 2.1 deploymentSitesApi 已 commit `5939a9e` 入库
> - Step 1.2 admin login flow 7 文件已落地（`src/api/{adminAuthApi,http,index}.ts`、`src/stores/adminAuth.ts`、`src/components/LoginDialog.vue`、`src/main.ts`、`src/App.vue`），`npm run type-check` 0 errors，**未提交**
> - 后端 `/api/admin/auth/{login,logout,me}` 已实现且字段对应（`AdminSession { token, username, role, expires_at }`）

---

## 0. 本轮目标 & 边界

**完成**（本轮 must-do）：

1. Step 1.2 收尾 commit
2. Step 2.2 MqttMessagesView 路径修复（G2 P0 契约错误）
3. Step 2.3 前置：新增 `src/api/incrementalApi.ts`（Q1=B 决策落地）
4. Step 2.3 ArchivesView 迁入 incrementalApi

**不做**（本轮 won't-do，避免发散）：

- Step 2.4 五个视图三轨收口（A8，~2d）
- Step 3.1 Dashboard 重写（~1d）
- Step 3.2 Settings 闭环（~0.5d）
- Step 4.1 AppStatusBar（~1d）
- Sprint B 后端 stub（跨仓 plant-model-gen，需另起会话）
- Sprint C 验收报告（待 Step 2-4 全部完成后）

**估时**：本轮 ~2h（含 commit + type-check 验证）

---

## 1. Step 1.2 收尾（~10 min）

### 1.1 验收清单

- [x] `src/api/http.ts` 含 `registerAuthTokenProvider` + `registerUnauthorizedHandler`
- [x] `src/api/adminAuthApi.ts` 含 `login` / `logout` / `me`，类型 `AdminSession`/`AdminLoginPayload` 完整
- [x] `src/stores/adminAuth.ts` Pinia setup store，`token` 存 sessionStorage（与 Q2=A 一致）
- [x] `src/components/LoginDialog.vue` Naive Modal + Form，含 `503 → markBackendUnconfigured` 分支
- [x] `src/App.vue` 顶层注册 token provider + 401/403/503 unauthorized handler
- [x] `src/main.ts` 引入 Pinia
- [x] `npm run type-check` 0 errors

### 1.2 已知小尾巴（可不本轮处理）

- `LoginDialog.vue` 内 `store.loginError = errMsg` 是直接赋 ref；推荐改走 `store.promptLogin(errMsg)` action（一致性）。**本轮**先保留，type-check 已通过。
- `App.vue` 中 503 未配置后台时 UI 仅 `markBackendUnconfigured()` 静默；**Step 4.1** 引入 `AppStatusBar` 时再添加全局 banner 提示。

### 1.3 commit

```
feat(collab-monitor): Sprint A Step 1.2 admin login flow

- new src/api/{adminAuthApi,http}.ts with axios + interceptor
- new src/stores/adminAuth.ts (pinia setup, sessionStorage)
- new src/components/LoginDialog.vue (naive Modal + form)
- update src/api/index.ts re-exports
- update src/main.ts to install pinia
- update src/App.vue with token provider + 401/403/503 handler

- backend /api/admin/auth/{login,logout,me} verified
- type-check 0 errors
- pending Step 2.2-4.x per docs/plans/2026-04-25-next-step-plan.md
```

---

## 2. Step 2.2 MqttMessages 路径修复（~30 min）

### 2.1 现状

`src/views/MqttMessagesView.vue` 通过 `useApi.loadSyncHistory()` 调用 `/api/incremental/history`，**走错路径**（应该是 `/api/mqtt/messages`）。Gap 文档定级 P0 契约错误。

### 2.2 改造

| 项 | 操作 |
|---|---|
| 引入 | 删除 `import { useApi } from '@/composables/useApi'`，改为 `import { mqttApi } from '@/api'` |
| 调用 | `loadSyncHistory()` → `mqttApi.messages()` |
| 类型 | 临时 `unknown[]` 占位，等 Step 2.4 收口或后端补 type 时细化 |
| 详情 | 列表点击 → `mqttApi.messageDetail(id)`（如视图已有详情交互） |
| 错误 | 不再吞 throw；交给 axios interceptor 弹 500 提示 |

### 2.3 验收

- `grep "useApi" src/views/MqttMessagesView.vue` = 0
- `grep "/api/incremental" src/views/MqttMessagesView.vue` = 0
- `npm run type-check` 0 errors
- 浏览器实测留给 Step 2.4 收尾期统一冒烟

---

## 3. Step 2.3 前置：incrementalApi.ts（~30 min）

### 3.1 决策依据

`docs/plans/2026-04-25-sprint-a-execution.md` §0 Q1=**B**：保留 `/api/incremental/*` 路径，PRD 显式补"增量归档"一节。

### 3.2 文件 `src/api/incrementalApi.ts`

封装来自 `useApi.js` 的 11 个 `/api/incremental/*` 调用：

| Method | Path | API 名 |
|---|---|---|
| GET | `/api/incremental/status` | `status()` |
| GET | `/api/incremental/history?page&page_size` | `history(page, pageSize)` |
| GET | `/api/incremental/config` | `config()` |
| POST | `/api/incremental/config` | `saveConfig(payload)` |
| GET | `/api/incremental/logs` | `logs()` |
| GET | `/api/incremental/archives` | `archives()` |
| GET | `/api/incremental/stats` | `stats()` |
| POST | `/api/incremental/detect/{siteId}` | `detect(siteId)` |
| POST | `/api/incremental/sync/{siteId}` | `sync(siteId)` |
| POST | `/api/incremental/abort/{siteId}` | `abort(siteId)` |

类型先用 `unknown` 占位，与 `siteConfigApi` 风格一致。

### 3.3 `src/api/index.ts` 增加导出

```ts
export { incrementalApi } from './incrementalApi';
```

### 3.4 验收

- `import { incrementalApi } from '@/api'` 可用
- 11 方法签名齐全
- `npm run type-check` 0 errors

---

## 4. Step 2.3 主体：ArchivesView 迁入 incrementalApi（~30 min）

### 4.1 现状

`src/views/ArchivesView.vue` 通过 `useApi.loadArchives()` 调用 `/api/incremental/archives`。Gap G2 P0：路径无误（Q1=B），但调用路径需走 ts api 层而非 useApi.js（统一）。

### 4.2 改造

| 项 | 操作 |
|---|---|
| 引入 | 删 `useApi`，改为 `import { incrementalApi } from '@/api'` |
| 调用 | `loadArchives()` → `incrementalApi.archives()` |
| 类型 | 临时 `unknown[]`，行级取属性时用可选链 `(item as any)?.field` 或局部 interface 注解 |
| 错误 | 同 Step 2.2，交给 interceptor |

### 4.3 验收

- `grep "useApi" src/views/ArchivesView.vue` = 0
- `npm run type-check` 0 errors

---

## 5. 本轮总验收

- [ ] Step 1.2 commit 入库
- [ ] `src/api/incrementalApi.ts` 11 endpoint 封装
- [ ] `src/views/MqttMessagesView.vue` 改用 `mqttApi.messages()`
- [ ] `src/views/ArchivesView.vue` 改用 `incrementalApi.archives()`
- [ ] `npm run type-check` 0 errors
- [ ] 上述变更 commit `feat(collab-monitor): Sprint A Step 2.2-2.3 mqtt messages path fix + incrementalApi`

---

## 6. 后续会话路线图（不在本轮）

| 顺序 | Task | 估时 | 关键依赖 |
|---|---|---|---|
| 6.1 | Step 2.4-1 TopologyView 三轨收口 | 0.3d | deploymentSitesApi / remoteSyncApi |
| 6.2 | Step 2.4-2 TopologyVisualizationView 收口 | 0.3d | 同上 |
| 6.3 | Step 2.4-3 SiteConfigView 收口 | 0.4d | siteConfigApi |
| 6.4 | Step 2.4-4 MqttNodesView 收口 | 0.4d | mqttApi |
| 6.5 | Step 2.4-5 useApi.js 拆解迁出 dashboard 部分 + 删除 | 0.6d | 新建 dashboardApi.ts |
| 6.6 | Step 3.1 Dashboard 重写（6 卡片 + 2 图表） | 1d | dashboardApi + charts/SyncTrendChart/SiteStatusChart |
| 6.7 | Step 3.2 Settings 闭环 | 0.5d | syncApi.config/updateConfig |
| 6.8 | Step 4.1 AppStatusBar + useStatusPolling | 1d | useStatusPolling composable + dashboardApi |
| 6.9 | Sprint B 后端 7 stub + site-config graceful shutdown | 跨仓 plant-model-gen，另起会话 |
| 6.10 | Sprint C 6 视图截图 + 验收报告 + deploy.sh | 1 周 | 全部前后端工作完成 |

---

## 7. 风险与缓解（仅本轮范围）

| 风险 | 等级 | 缓解 |
|---|---|---|
| MqttMessagesView 改路径后字段不匹配前端表格 | 🟡 中 | 本轮先打通调用，字段适配在 Step 2.4-4 与 MqttNodesView 一并做 |
| ArchivesView 改用 incrementalApi 后类型 unknown 让模板 v-for 报错 | 🟢 低 | 局部 interface 标注 + 可选链；type-check 守门 |
| useApi.js 仍被 Step 2.4 + Step 3.1 引用，本轮不删 | 🟢 低 | Step 2.4-5 收口期才删 useApi.js，本轮只新增 incrementalApi.ts |
| Step 1.2 LoginDialog 直接赋 ref 风格不统一 | 🟢 低 | 已记入 §1.2 小尾巴，Step 4.1 一起整理 |

---

## 8. 与 Cursor MCP 协作（执行体方）

本轮在 my-mcp-12 通道内独立完成，预计调用 `report_task(working)` 1 次（Step 1.2 commit 后），`report_task(done)` 1 次（本轮总验收完成后）。

不派发 worker（任务量小，主控直接执行）。
