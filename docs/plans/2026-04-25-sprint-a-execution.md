# Sprint A 执行计划（2026-04-25）

> 配套文档：
> - PRD：`docs/prd/2026-04-25-collab-monitor-prd.md`
> - Gap：`docs/plans/2026-04-25-collab-monitor-completion-gap.md`

> 范围：Sprint A 9 个 Task（A1–A9），覆盖 Gap G1/G2/G3/G4/G5/G8/G9/G13。
> 估时：7.5 人天 · 1.5 周

---

## 0. 默认决策（可被用户后续覆盖）

| Q | 选择 | 默认理由 |
|---|------|---------|
| Q1 Archives 归属 | **B**：保留 `/api/incremental/*`，PRD 显式补一节 | 改动小，本 Sprint 内立即可达 |
| Q2 admin token 存储 | **A**：sessionStorage | 关 tab 即失效；与 PRD §9.1 一致 |
| Q3 Dashboard 图表 | **C**：先复用 `components/charts/*`，不行再 vue-chartjs | 优先压缩 dist 体积 |
| Q4 StatusBar 刷新 | 30s 轮询起步 | 实现简单；Phase 6+ 可换 SSE |
| Q5 A8 PR 粒度 | 按视图拆 5 个小 PR + 一个删除 PR | 每次 type-check 范围小，回滚成本低 |
| Q6 useApi.js 拆分 | 按领域分到 `dashboardApi.ts` / `incrementalApi.ts` 等 | 与 PRD §5.2 强制规范一致 |

---

## 1. 执行顺序与 Task 拆分

```
Day 1  (Mon)  Step 1.1 useSse + LogsView 改造           (0.5d)
              Step 2.1 deploymentSitesApi.ts            (0.5d)
              ↓ 提交 commit "Sprint A kickoff"

Day 2  (Tue)  Step 1.2 上半 adminAuthApi + Dialog       (0.5d)
              Step 2.2 MqttMessages 路径切换            (0.5d)

Day 3  (Wed)  Step 1.2 下半 http.ts interceptor 收尾    (0.5d)
              Step 2.3 Archives 迁入 incrementalApi     (0.5d)

Day 4  (Thu)  Step 2.4-1 TopologyView 收口              (0.3d)
              Step 2.4-2 TopologyVisualization 收口     (0.3d)
              Step 2.4-3 SiteConfig 收口                (0.4d)

Day 5  (Fri)  Step 2.4-4 MqttNodes 收口                 (0.4d)
              Step 2.4-5 useApi.js 拆解 + 删除          (0.6d)

Day 6  (Mon)  Step 3.1 Dashboard 重写                   (1d)

Day 7  (Tue)  Step 3.2 Settings 闭环                    (0.5d)
              Step 4.1 上半 AppStatusBar 框架           (0.5d)

Day 8  (Wed)  Step 4.1 下半 useStatusPolling + 4 徽标   (0.5d)
              ↓ Sprint A 退出验收
```

---

## 2. Step 1.1 · useSse composable（本会话执行）

**文件**：
- 新增 `src/composables/useSse.ts`
- 改造 `src/views/LogsView.vue`

**useSse API**：
```ts
useSse(url: string, options?: {
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  reconnect?: boolean;          // 默认 true
  initialBackoffMs?: number;    // 默认 1000
  maxBackoffMs?: number;        // 默认 30000
  heartbeatTimeoutMs?: number;  // 默认 60000，N 秒无 event 视为断；0 = 关闭心跳检测
}): {
  status: Ref<'idle' | 'connecting' | 'open' | 'closed' | 'error'>;
  lastEvent: Ref<MessageEvent | null>;
  reconnectAttempt: Ref<number>;
  close: () => void;
  reconnectNow: () => void;
};
```

**实现要点**：
- 指数退避：`backoff = min(maxBackoffMs, initialBackoffMs * 2 ** attempt)`
- 心跳超时：`setTimeout` 监听最近 message 时间，超时主动 close + reconnect
- `onUnmounted` 自动 close（HMR 友好）
- `onError` 不阻止重连（除非用户显式 close）

**LogsView 改造**：
- 删除 `let sseSource = null` + onMounted/onUnmounted 的 EventSource 手写
- 改用 `useSse('/api/sync/events/stream', { onMessage: handler })`
- `status === 'error'` 时显示重连倒计时

**验收**：
- `npm run type-check` 0 errors（仅本文件 + LogsView 影响范围）
- 浏览器手动断网 30s 后自动重连成功
- HMR 重启不重复建连
- LogsView 在没有后端时不抛红错（静默降级到轮询）

## 3. Step 2.1 · deploymentSitesApi.ts（本会话执行）

**文件**：
- 新增 `src/api/deploymentSitesApi.ts`
- 改造 `src/api/index.ts` 添加导出

**封装 9 个 endpoint**（来自 `异地协同API汇总清单.md` §5）：
- POST `/api/deployment-sites/import-dboption` → `importDbOption()`
- GET `/api/deployment-sites` → `list()`
- POST `/api/deployment-sites` → `create(payload)`
- GET `/api/deployment-sites/{id}` → `get(id)`
- PUT `/api/deployment-sites/{id}` → `update(id, payload)`
- DELETE `/api/deployment-sites/{id}` → `delete(id)`
- GET `/api/deployment-sites/{id}/tasks` → `listTasks(id)`
- POST `/api/deployment-sites/{id}/healthcheck` → `healthcheck(id)`
- GET `/api/deployment-sites/{id}/export-config` → `exportConfig(id)`

**类型定义**：基于后端 `handlers::DeploymentSite` 推断（最小 schema：id / name / location / created_at / status / 等）。本批用 `any` 占位，等接入视图时再细化。

**验收**：
- `npm run type-check` 0 errors
- `import { deploymentSitesApi } from '@/api'` 可用
- 9 个方法签名齐全

## 4. Step 1.2-2.4 / 3.x / 4.x 详细方案

**省略**：详见 `docs/plans/2026-04-25-collab-monitor-completion-gap.md` § Sprint A 与上一轮 Plan 输出。本会话先做 Step 1.1 + 2.1 验证基础设施可用，后续 Step 由用户确认或下一轮指令推进。

---

## 5. Sprint A 退出验收清单

- [ ] `npm run type-check` 0 errors
- [ ] `grep -rE "fetch\(|new EventSource\(" src/views/` = 0
- [ ] `grep -r "useApi" src/` 仅剩 useAdminAuth/useStatusPolling 等新 composable
- [ ] 11 视图浏览器实测无白屏 / 无未捕获红错
- [ ] admin login flow 跑通（503 → 弹框 → 登录 → 可访问）
- [ ] Dashboard 首屏 6 卡片 + 2 图表显示
- [ ] Settings 保存能通到后端
- [ ] StatusBar 4 项徽标正常更新

---

## 6. 本会话产出（2026-04-25）

| 文件 | 类型 | 行数 |
|------|------|------|
| `docs/plans/2026-04-25-sprint-a-execution.md` | 新增（本文件） | ~120 |
| `src/composables/useSse.ts` | 新增 | ~80 |
| `src/views/LogsView.vue` | 改造 | ~10 |
| `src/api/deploymentSitesApi.ts` | 新增 | ~50 |
| `src/api/index.ts` | 改造 | +1 |

预计 commit："`feat(collab-monitor): Sprint A kickoff (useSse composable + deploymentSitesApi)`"

---

## 7. 风险（仅本会话范围）

| 风险 | 等级 | 缓解 |
|------|------|------|
| LogsView 改造引入回归（SSE 接收异常） | 🟡 中 | 改动后先看 type-check；浏览器实测留给下个会话 |
| useSse 心跳逻辑误重连 | 🟢 低 | 默认 60s 阈值偏宽松；用户可后续调整 |
| deploymentSitesApi 类型用 any 占位被 lint 抱怨 | 🟢 低 | 本批用 unknown 替代 any；类型细化在视图接入时 |
