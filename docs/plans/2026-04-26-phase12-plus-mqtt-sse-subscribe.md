# Sprint B · Phase 12-Plus · MqttNodesView 订阅 SSE 自动 reload（2026-04-26）

> 上游：
> - 跨仓 plant-model-gen Sprint B 主计划：`../plant-model-gen/docs/plans/2026-04-26-sprint-b-plan.md`（§1.B4）
> - plant-model-gen 后端 commit `5463e41`：`SyncEvent::MqttSubscriptionStatusChanged` 已在 4 处推送
> - 关联 PRD：`docs/prd/2026-04-26-remote-site-prd.md`

---

## 0. 背景

**plant-model-gen 后端（commit `5463e41`）已落**：
- `SyncEvent` 新增变体 `MqttSubscriptionStatusChanged { is_running, is_master_node, location, timestamp }`
- 在 `set_as_master_node` / `set_as_client_node` / `start_mqtt_subscription_api` / `stop_mqtt_subscription_api` 4 处成功路径推送
- 字段口径与 `GET /api/mqtt/subscription/status` 完全一致，前端无需差量解析

**plant-collab-monitor 前端现状**：
- `LogsView.vue` 已订阅 `/api/sync/events/stream`，会自动 prepend 任何 SyncEvent
- `MqttNodesView.vue` 仍以 5s 轮询 `loadData` 拉状态（`onMounted` setInterval(loadData, 5000)）
- **未订阅 SSE**，节点角色 / 订阅状态切换有最长 5s 延迟

**目标**：MqttNodesView 接入 useSse，收到 `MqttSubscriptionStatusChanged` 立即 `loadData`；轮询频率从 5s 降到 30s 作为兜底。

---

## 1. 改造范围

### 1.1 单文件改动

`src/views/MqttNodesView.vue`：
- 加 `useSse` import
- 加 SSE 订阅（onMounted 时建立、onUnmounted 自动清理）
- onMessage 解析 event.type === 'MqttSubscriptionStatusChanged' → 立即 `loadData()`
- 5s 轮询降到 30s
- 加 SSE 连接状态指示器（参考 LogsView 的 ● 实时 / ● 重连中样式）

### 1.2 不改动

- ❌ `src/api/mqttApi.ts`（已含 subscriptionStatus 等，无需新增）
- ❌ `src/composables/useSse.ts`（通用 composable 已就绪，无需改造）
- ❌ `src/views/LogsView.vue`（已订阅相同流，本次仅复用通道）
- ❌ 后端（plant-model-gen 侧已在 commit `5463e41` 完成）

---

## 2. 实现方案

### 2.1 useSse 接入

```ts
import { useSse } from '@/composables/useSse';

const sse = useSse('/api/sync/events/stream', {
  onMessage(e) {
    try {
      const event = JSON.parse(e.data);
      // B4 SSE: 后端 commit 5463e41 推送的事件类型
      if (event?.type === 'MqttSubscriptionStatusChanged') {
        loadData();
      }
    } catch {
      // ignore non-JSON heartbeat
    }
  },
});
```

### 2.2 轮询频率调整

```ts
// 旧：refreshInterval = setInterval(loadData, 5000);
// 新：兜底 30s（SSE 实时推送是主路径）
refreshInterval = setInterval(loadData, 30000);
```

### 2.3 模板加 SSE 状态指示

参考 LogsView header 样式，在「刷新」按钮旁加：

```vue
<span
  v-if="sse.status.value === 'open'"
  class="text-xs text-emerald-600 mr-2"
  title="SSE 实时通道已连接，订阅 / 主从切换变更将秒级到达"
>● 实时</span>
<span
  v-else-if="sse.status.value === 'connecting'"
  class="text-xs text-amber-600 mr-2"
>● 连接中</span>
<span
  v-else-if="sse.status.value === 'error'"
  class="text-xs text-rose-600 mr-2"
  :title="`重连尝试 #${sse.reconnectAttempt.value}`"
>● 重连中</span>
```

---

## 3. 验收

### 3.1 类型检查与 lint

- `npm run type-check`：plant-collab-monitor 工程整体 0 error（vue-tsc）
- `npm run lint`：MqttNodesView.vue 0 error
- `npm run build`：`vue-tsc -b && vite build` 成功

### 3.2 行为（手动验证）

1. 启动 plant-model-gen `web_server`（端口 3100）
2. 启动 plant-collab-monitor `npm run dev`（端口 5173）
3. 打开 `http://localhost:5173/#/mqtt-nodes`
4. F12 Network → 看到 `/api/sync/events/stream` 200 长连接
5. 在另一个 tab 通过 curl 触发：
   ```bash
   curl -X POST http://localhost:3100/api/mqtt/node/set-master
   ```
6. **MqttNodesView 在 ≤1s 内自动刷新，节点角色由「从节点」翻为「主节点」**
7. 反之 `set-client` 也一样秒级反应
8. 关闭后端 → SSE 状态变 `● 重连中`，前端 onError 触发指数退避

### 3.3 不做（避免发散）

- ❌ 加 toast 通知（保持极简，状态变更本身已经是反馈）
- ❌ MqttNodesView 自身的 logs 面板继续走轮询（已有独立 logsInterval，本次不动）
- ❌ 全局 SSE 通道复用（每个 view 独立 EventSource，浏览器同源 6 连接限制内可接受；future 优化项）

---

## 4. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| EventSource 在 Vite dev proxy 下握手延迟 | 🟢 低 | useSse 已含指数退避重连，状态指示器透出 |
| 后端 SSE 通道被 nginx 缓冲 | 🟡 中 | `shells/deploy/nginx-plant-collab-monitor.conf.example` 已配 SSE 友好（`proxy_buffering off`） |
| 多 tab 同时订阅 → 后端 broadcast cap=1000 写满 | 🟢 低 | broadcast 内 cap 1000 远超日常事件量；onError 自动重连 |
| 5s → 30s 轮询造成 SSE 断时反应迟钝 | 🟡 中 | 状态指示器变 `● 重连中` 后用户可手动点「刷新」，且 useSse 重连成功后立即 onMessage 触发 reload |

---

## 5. 时间线

| 步骤 | 估时 |
|------|------|
| 12P.1 写本计划文件 | 10 min |
| 12P.2 MqttNodesView 加 useSse import + onMessage 处理 | 10 min |
| 12P.3 轮询 5s → 30s + 模板加 SSE 状态指示 | 10 min |
| 12P.4 npm run type-check + lint + build 验证 | 5 min |
| 12P.5 git commit Phase 12-Plus | 5 min |

**Phase 12-Plus 总估时**：~40 min

---

## 6. 后续可选

- Phase 12-Plus-Plus：把 useSse 升级为「单例通道 + pub/sub 分发」，多 view 共享一条 EventSource，降低后端 broadcast 订阅者数量与浏览器连接数
- Phase 12-Plus 在 sprint-bc-plan / collab-monitor-completion-gap 文档同步标注 G6 完全闭环

---

## 7. 不做

- ❌ 后端任何改动（plant-model-gen 侧已 commit `5463e41` 完成）
- ❌ 跨 view 全局事件总线
- ❌ ServiceWorker 离线/后台 SSE
