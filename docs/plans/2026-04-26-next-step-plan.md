# plant-collab-monitor · 下一步开发计划（2026-04-26）

> 上游：
> - PRD（异地站点专题，2026-04-26）：`docs/prd/2026-04-26-remote-site-prd.md`
> - PRD（整体能力规范，2026-04-25）：`docs/prd/2026-04-25-collab-monitor-prd.md`
> - Gap 清单：`docs/plans/2026-04-25-collab-monitor-completion-gap.md`
> - Sprint A 执行：`docs/plans/2026-04-25-sprint-a-execution.md`
> - 上一轮 next-step：`docs/plans/2026-04-25-next-step-plan.md`
>
> 本计划承接 2026-04-25 next-step（Step 1.2 admin login 已落地未提交，Step 2.2/2.3 未启动），将 Sprint A 剩余工作拆为可执行的 4 个 Phase。

---

## 0. 当前基线（2026-04-26 摸底）

### 0.1 已落地

| 项 | 文件 | 状态 |
|----|------|------|
| useSse composable | `src/composables/useSse.ts` | ✅ 已 commit |
| deploymentSitesApi.ts | `src/api/deploymentSitesApi.ts` | ✅ 已 commit |
| adminAuthApi + http interceptor | `src/api/adminAuthApi.ts` `http.ts` | ⚠ 已落地未 commit |
| LoginDialog + adminAuth store | `src/components/LoginDialog.vue` `src/stores/adminAuth.ts` | ⚠ 已落地未 commit |
| App.vue 顶层 token provider + 401/403/503 handler | `src/App.vue` | ⚠ 已落地未 commit |
| 异地站点 PRD | `docs/prd/2026-04-26-remote-site-prd.md` | ✅ 本会话产出 |

### 0.2 仍未完成（Sprint A 范畴）

| ID | 任务 | Gap | 估时 |
|----|------|-----|------|
| A1 | 重写 Dashboard | G4 | 1d |
| A2 | Settings 闭环 | G5 | 0.5d |
| A4 | 修 MqttMessages 路径（走 mqttApi） | G2 | 0.3d |
| A5 | Archives 迁入 incrementalApi | G2 | 0.5d |
| A8 | API 三轨收口（5 视图裸 fetch + useApi.js 拆解 + 删除） | G1 | 2d |
| A9 | 顶部 StatusBar | G13 | 1d |

### 0.3 Sprint B/C 暂不在本计划

跨仓 plant-model-gen 的 G6/G7 后端 stub 修复属 Sprint B；e2e-smoke 报告与孤儿组件清理属 Sprint C。

---

## 1. 本计划目标 & 边界

### 1.1 本会话立即执行（Phase 1）

| 顺序 | 动作 | 估时 | 退出条件 |
|------|------|------|---------|
| P1.1 | 新增 `src/api/incrementalApi.ts`（11 endpoint） | 15 min | `import { incrementalApi } from '@/api'` 可用 |
| P1.2 | `src/api/index.ts` 增加 `incrementalApi` 导出 | 2 min | 同上 |
| P1.3 | `MqttMessagesView` 改用 `mqttApi.messages()` | 20 min | grep `useApi`/`/api/incremental` = 0 |
| P1.4 | `ArchivesView` 改用 `incrementalApi.archives()` | 20 min | 同上 |
| P1.5 | `npm run type-check` 验证 | 1 min | 0 errors |
| P1.6 | git commit 两个逻辑提交 | 5 min | 工作区干净，本仓 + 本会话产出全部入库 |

**Phase 1 总估时**：~1h

### 1.2 后续 Phase（不在本会话）

| Phase | 内容 | 估时 | 触发条件 |
|-------|------|------|---------|
| **P2** | A1 Dashboard 重写（6 卡片 + 2 chart） | 1d | Phase 1 入库后 |
| **P3** | A2 Settings 闭环（onMounted load + save + test） | 0.5d | P2 完成 |
| **P4** | A8-1~5 五视图裸 fetch 收口 + useApi.js 删除 | 2d | P3 完成 |
| **P5** | A9 顶部 StatusBar + useStatusPolling | 1d | P4 完成 |

---

## 2. Phase 1 详细方案

### 2.1 incrementalApi.ts 设计

**文件**：`src/api/incrementalApi.ts`

封装 `useApi.js` 中现存的 11 个 `/api/incremental/*` 调用：

| Method | Path | API 名 | 类型 |
|--------|------|--------|------|
| GET | `/api/incremental/status` | `status()` | `unknown` |
| GET | `/api/incremental/history?page&page_size` | `history(page, pageSize)` | `unknown` |
| GET | `/api/incremental/config` | `config()` | `unknown` |
| POST | `/api/incremental/config` | `saveConfig(payload)` | `unknown` |
| GET | `/api/incremental/logs` | `logs()` | `unknown` |
| GET | `/api/incremental/archives` | `archives()` | `IncrementalArchivesResponse` |
| GET | `/api/incremental/stats` | `stats()` | `unknown` |
| POST | `/api/incremental/detect/{siteId}` | `detect(siteId)` | `unknown` |
| POST | `/api/incremental/sync/{siteId}` | `sync(siteId)` | `unknown` |
| POST | `/api/incremental/abort/{siteId}` | `abort(siteId)` | `unknown` |

**类型定义**：仅 `IncrementalArchivesResponse` 与 `IncrementalArchiveFile` 落实，其余先用 `unknown` 占位（与现有 `siteConfigApi` 风格一致）。

### 2.2 MqttMessagesView 改造

**变更点**：

| 原 | 新 |
|----|----|
| `import { useApi } from '@/composables/useApi'` | `import { mqttApi } from '@/api'` |
| `const { loadSyncHistory } = useApi()` | 直接调 `mqttApi.messages()` |
| `loadSyncHistory(page, pageSize)` | `mqttApi.messages()`（后端契约：分页参数后续补） |
| 错误吞 `console.error` | `errorMsg` 显示给用户（与 LogsView/TasksView 风格一致） |

**降级**：
- 后端 `/api/mqtt/messages` 当前不一定支持 `page/pageSize`；前端先全量拉取，本地 slice 分页；待后端补 query params 后改为 server-side。
- 字段适配（`is_full_sync`、`location`、`db_num`、`file_count`、`site_receivers` 等）保持原表格列；后端 mqtt messages payload 字段不一致时，由 Step 2.4-4 与 MqttNodesView 收口一并处理。

### 2.3 ArchivesView 改造

**变更点**：

| 原 | 新 |
|----|----|
| `import { useApi } from '@/composables/useApi'` | `import { incrementalApi } from '@/api'` |
| `const { loadArchives } = useApi()` | 直接调 `incrementalApi.archives()` |
| `loadArchives()` | `incrementalApi.archives()` |
| `await fetch('/api/site-config', ...)` 加载站点配置 | 改用 `siteConfigApi.get()`（同步统一） |

**保留**：
- 文件名 dbnum 提取、location 过滤、formatSize/formatTime 全部保留
- 业务逻辑零变更，仅替换调用层

### 2.4 commit 拆分

**两个逻辑提交**：

**Commit 1**（承接 2026-04-25 next-step §1.3）：

```
feat(collab-monitor): Sprint A Step 1.2 admin login flow

- new src/api/{adminAuthApi,http}.ts with axios + interceptor
- new src/stores/adminAuth.ts (pinia setup, sessionStorage)
- new src/components/LoginDialog.vue (naive Modal + form)
- update src/api/index.ts re-exports
- update src/main.ts to install pinia
- update src/App.vue with token provider + 401/403/503 handler

backend /api/admin/auth/{login,logout,me} verified, type-check 0 errors
```

**Commit 2**（本计划 Phase 1 产出）：

```
feat(collab-monitor): Sprint A Step 2.2/2.3 + remote-site PRD

- new src/api/incrementalApi.ts (11 /api/incremental/* endpoints)
- update src/api/index.ts re-export incrementalApi
- fix(MqttMessagesView): switch from useApi.loadSyncHistory to mqttApi.messages()
- fix(ArchivesView): switch from useApi.loadArchives to incrementalApi.archives()
- docs(prd): add 2026-04-26-remote-site-prd.md (focus on remote-site lifecycle)
- docs(plan): add 2026-04-26-next-step-plan.md (Phase 1-5 roadmap)

closes Gap-G2 (MqttMessages path), partially Gap-G1 (2/5 views off useApi.js)
```

---

## 3. Phase 2 概要（A1 Dashboard 重写）

> 详细方案待 Phase 1 入库后另起 plan，本节仅给出骨架。

**6 卡片**：

| 卡片 | API |
|------|-----|
| 当前站点身份 | `GET /api/site/info` |
| 异地站点汇总 | `GET /api/mqtt/nodes`（取 summary） |
| 同步引擎状态 | `GET /api/sync/status` + `metrics` |
| 队列概览 | `GET /api/sync/queue` |
| 24h 任务量趋势 | `SyncTrendChart` 复用孤儿组件 |
| 站点在线率 | `SiteStatusChart` 复用孤儿组件 |

**最近事件**：`GET /api/sync/history?limit=10` 列表

**重构粒度**：
- `DashboardView.vue` 完全重写（≥ 80% 删除）
- 抽 `useDashboardSummary()` composable 集中并发调度 6 路 fetch
- 1.5s 内首屏 LCP

---

## 4. Phase 3 概要（A2 Settings 闭环）

| 改动 | 文件 |
|------|------|
| `onMounted` 调 `syncApi.config()` 回填表单 | `SettingsView.vue` |
| 保存按钮 → `syncApi.updateConfig(payload)` | 同上 |
| "测试连通"按钮 → `syncApi.test()`（后端待补） | 同上 |
| 失败显示后端 error message | 同上 |
| 删除 `emit('save')` 旧逻辑 | 同上 |

---

## 5. Phase 4 概要（A8 API 三轨收口）

按视图拆 5 个小 PR：

| Step | 视图 | 主要替换 |
|------|------|---------|
| 4-1 | TopologyView | 裸 fetch → `remoteSyncApi` + `deploymentSitesApi` |
| 4-2 | TopologyVisualizationView | 同上 |
| 4-3 | SiteConfigView | 裸 fetch → `siteConfigApi` |
| 4-4 | MqttNodesView | 裸 fetch → `mqttApi` + `syncApi.mqtt*` |
| 4-5 | useApi.js 拆解 → `dashboardApi.ts`（如未由 P2 迁移） + 删除 useApi.js |

**每个 step 退出条件**：
- `grep "fetch(" src/views/{ViewName}.vue` = 0
- `grep "useApi" src/views/{ViewName}.vue` = 0
- `npm run type-check` 0 errors

**Step 4-5 退出条件**：
- `git rm src/composables/useApi.js`
- 全仓 `grep -r "useApi" src/` 仅剩 `useAdminAuth` / `useStatusPolling` 等新 composable

---

## 6. Phase 5 概要（A9 StatusBar）

**新增**：

| 文件 | 用途 |
|------|------|
| `src/components/AppStatusBar.vue` | 固定顶部 4 项胶囊徽标 |
| `src/composables/useStatusPolling.ts` | 30s 轮询 site/info + sync/status + sync/queue |

**集成**：`App.vue` 在 `<RouterView/>` 之上插入 `<AppStatusBar/>`。

**4 项徽标**（详见 PRD §10.1）：

| 徽标 | 数据 | 跳转 |
|------|------|------|
| location + role | `site/info` | `/site-config` |
| runtime status | `sync/status` | `/dashboard` |
| queue + failed | `sync/queue` | `/tasks` |
| 1min events | SSE 累加 | `/logs` |

---

## 7. 全 Phase 总验收（Sprint A 退出条件）

完成 Phase 1-5 后必须满足：

- [ ] `npm run type-check` 0 errors
- [ ] `grep -rE "fetch\(|new EventSource\(" src/views/` = 0
- [ ] `grep -r "useApi" src/` 仅剩新 composable
- [ ] 11 视图浏览器实测无白屏 / 无未捕获红错
- [ ] admin login flow 跑通（503 → 弹框 → 登录 → 可访问）
- [ ] Dashboard 首屏 6 卡片 + 2 图表显示
- [ ] Settings 保存能通到后端
- [ ] StatusBar 4 项徽标正常更新
- [ ] `useApi.js` 已删除

---

## 8. 风险与缓解（仅本会话 Phase 1）

| 风险 | 等级 | 缓解 |
|------|------|------|
| 后端 `/api/mqtt/messages` 返回字段与 `MqttMessagesView` 表格列不一致 | 🟡 中 | 本轮先打通调用层，字段适配在 P4-4 与 MqttNodesView 一并做；视图加 `console.warn` 字段缺失提示 |
| `incrementalApi` 用 `unknown` 占位让模板取属性时报错 | 🟢 低 | `(item as any)?.field` 临时通过 type-check；正式类型在后端契约稳定后细化 |
| ArchivesView 内还有一处 `fetch('/api/site-config')` 加载本站点配置 | 🟢 低 | 顺手改用 `siteConfigApi.get()` |
| 两个 commit 之间 type-check 不一定中间稳定 | 🟢 低 | Commit 1 之前已 type-check 通过；Commit 2 完成全部代码后再 type-check |

---

## 9. 与上游文档关系

| 上游 | 关系 |
|------|------|
| `2026-04-26-remote-site-prd.md` | 本计划 Phase 1-5 的目标对照表 |
| `2026-04-25-collab-monitor-completion-gap.md` | 本计划 Phase 编号 ↔ Gap ID 一一对应 |
| `2026-04-25-sprint-a-execution.md` | 本计划是其细化与续作 |
| `2026-04-25-next-step-plan.md` | 本计划承接其未完成项（Step 1.2 commit / Step 2.2 / 2.3） |

---

## 10. 立即执行（本会话）

```
[Phase 1 开始]
  │
  ├─ 1.1 创建 incrementalApi.ts            [15 min]
  ├─ 1.2 修改 src/api/index.ts             [ 2 min]
  ├─ 1.3 改造 MqttMessagesView.vue         [20 min]
  ├─ 1.4 改造 ArchivesView.vue             [20 min]
  ├─ 1.5 npm run type-check                [ 1 min]
  └─ 1.6 git add + 两个 commit             [ 5 min]
[Phase 1 完成 · ~1h]
```

后续 Phase 由用户确认或下一轮指令推进，本计划不在本会话越界执行。
