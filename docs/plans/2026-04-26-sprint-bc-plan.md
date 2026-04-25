# plant-collab-monitor · Sprint B/C 开发计划（2026-04-26）

> 上游：
> - PRD（异地站点专题）：`docs/prd/2026-04-26-remote-site-prd.md`
> - PRD（整体能力规范）：`docs/prd/2026-04-25-collab-monitor-prd.md`
> - Gap 清单：`docs/plans/2026-04-25-collab-monitor-completion-gap.md`
> - 已完成 Sprint A：`docs/plans/2026-04-26-next-step-plan.md` Phase 1-5
>
> 本计划承接 Sprint A（已 5 个 commits 入库），定义 Sprint C 前端收尾 + Sprint B 后端 stub 收口的执行节奏。

---

## 0. Sprint A 完成总结

| Phase | Commit | 关闭 Gap | 体量 |
|-------|--------|---------|------|
| P1 | `db58e94` | G2 | +1335/-38 |
| P2 | `7531c37` | G4 + G11(charts) | +688/-105 |
| P3 | `5361fe3` | G5 | +94/-42 |
| P4 | `d14f39a` | G1 + G11(IncrementalUpdateMonitor) | +202/-754 |
| P5 | `c2a0457` | G13 | +315/-2 |

**累计**：5 commits · 净 +1735 · 关闭 8 个 Gap（G1/G2/G3/G4/G5/G8/G9/G13）+ G11 部分。

---

## 1. 本计划目标 & 边界

### 1.1 Sprint C · 前端收尾（本计划聚焦）

| ID | 任务 | Gap | 估时 |
|----|------|-----|------|
| **P6** | useFormatters.js → useFormatters.ts | G10 | 0.3d |
| **P6** | SiteCard / DetailModal 孤儿组件处置 | G11 | 0.2d |
| **P6** | scripts/deploy.sh 一键部署脚本 | G14 | 0.5d |
| P7 | 起 dev server + chrome-devtools 11/11 视图截图 | G12 | 0.5d |
| P7 | 产出 `docs/e2e-smoke/2026-04-26-e2e-smoke-report.md` | G12 | 0.3d |

**P6 在本会话执行；P7 跨进程依赖（dev server + 后端 + chrome），下一会话推进。**

### 1.2 Sprint B · 后端 stub 收口（跨仓 plant-model-gen，独立排期）

| ID | 任务 | Gap | 估时 | Owner |
|----|------|-----|------|-------|
| B1 | MQTT `set_as_master/client` 真正写 DbOption.toml + SQLite | G6 | 2d | plant-model-gen 后端 |
| B2 | `get_mqtt_broker_logs_api` 接入 sync_control_center | G6 | 1d | 同上 |
| B3 | `get_mqtt_subscription_status` 反映真实运行时 | G6 | 1d | 同上 |
| B4 | `MqttSubscriptionStatusChanged` SSE 事件推送 | G6 | 1d | 同上 |
| B5 | site-config save 自动 graceful restart | G7 | 2d | 同上 |
| B6 | site-config reload 走 config_reload_manager | G7 | 1d | 同上 |
| B7 | 后端冒烟脚本 16 endpoint 自动化 curl | — | 0.5d | 同上 |

**Sprint B 不在 plant-collab-monitor 仓推进，需另起会话 / 工作分支**。

---

## 2. Phase 6（本会话执行）详细方案

### 2.1 useFormatters.js → useFormatters.ts

**原 .js**：5 个 view/component import（ArchivesView / SiteCard / DetailModal / TaskQueue / SyncHistory），导出 9 个函数。

**改造**：
- 新文件 `src/composables/useFormatters.ts`
- 完整类型签名：`(value: number | string | null | undefined) => string`
- 状态/类型枚举抽出为 `as const` 字面量，便于类型推导
- 删除 .js 文件
- import 路径不变（5 个引用方无需改动，TS 自动 resolve `.ts`）

### 2.2 SiteCard / DetailModal 孤儿组件处置

| 组件 | 当前引用方 | 决策 | 理由 |
|------|-----------|------|------|
| `SiteCard.vue` | 0 view | **保留** | PRD §8.1 规定为站点卡片标准；未来 Dashboard / Topology 接入；体积 8KB 可接受 |
| `DetailModal.vue` | 0 view | **删除** | SyncHistoryView 已用 NModal 实现详情；legacy 组件无差异化价值 |

**SiteCard 升级**：仅改 import 路径 `'../composables/useFormatters'` → `'@/composables/useFormatters'`（与新代码风格一致）。

### 2.3 scripts/deploy.sh

**目标**：单条命令完成"构建 → rsync → nginx reload"。

**最小可行版**：

```bash
#!/usr/bin/env bash
# Usage: ./scripts/deploy.sh [user@host] [/var/www/path]
set -euo pipefail

REMOTE="${1:-root@123.57.182.243}"
TARGET="${2:-/var/www/plant-collab-monitor}"

echo "→ type-check"
npm run type-check

echo "→ build"
npm run build

echo "→ rsync to $REMOTE:$TARGET"
rsync -avz --delete dist/ "$REMOTE:$TARGET/"

echo "→ reload nginx (best-effort)"
ssh "$REMOTE" "nginx -t && systemctl reload nginx" || \
  echo "  nginx reload skipped (manual reload may be needed)"

echo "✓ deploy done: $REMOTE:$TARGET"
```

**功能**：
- 部署前 type-check 守门
- 默认目标 = `AGENTS.md` 中规定的部署服务器 `123.57.182.243`
- 可覆盖 user@host 与目标路径
- nginx reload 失败不阻断（部分场景 nginx 由不同进程管理）

---

## 3. Phase 7（下一会话执行）详细方案

### 3.1 准备

1. 后端 plant-model-gen `web_server.exe` 在 `:3100` 运行
2. 设 `ADMIN_USER=admin / ADMIN_PASS=admin` 解锁 admin-gated
3. plant-collab-monitor `npm run dev` 在 `:3200`

### 3.2 11 视图截图覆盖矩阵

| # | URL | 截图触发 | 主 API |
|---|-----|---------|--------|
| 1 | `/dashboard` | onMounted 6 卡片渲染 + 2 chart 出现 | site/info + sync/status + sync/queue + mqtt/nodes + sync/metrics + sync/history |
| 2 | `/topology` | onMounted envs 列表展开 | remote-sync/envs |
| 3 | `/topology-viz` | onMounted SVG 节点出现 | mqtt/nodes + mqtt/messages + remote-sync/topology |
| 4 | `/tasks` | onMounted 队列空态/有数据 | sync/queue |
| 5 | `/history` | onMounted 时间线 | sync/history |
| 6 | `/mqtt/messages` | onMounted 表格 | mqtt/messages |
| 7 | `/mqtt/nodes` | onMounted 节点列表 + 主从徽章 | mqtt/nodes + mqtt/subscription/status + mqtt/messages |
| 8 | `/logs` | onMounted SSE 实时点 | SSE /api/sync/events/stream + remote-sync/logs |
| 9 | `/archives` | onMounted 表格 | incremental/archives + site-config |
| 10 | `/site-config` | onMounted 表单回填 | site-config + site/info |
| 11 | `/settings` | onMounted 表单 + status pill | sync/config |

### 3.3 验收报告模板

```markdown
# plant-collab-monitor e2e-smoke 验收报告（2026-04-XX）

## 环境
- 后端 web_server.exe PID xxxx · :3100
- 前端 dev server :3200
- ADMIN: admin/admin
- Chrome 版本：xxx

## 11 视图测试矩阵

| # | URL | 状态 | console.error | network 4xx/5xx | 截图 | 备注 |
|---|-----|------|--------------|-----------------|------|------|
| ... | ... | ✅ | 0 | 0 | screenshots/01-dashboard.png | ... |

## 累计 P0 / P1 / P2 问题
...
```

---

## 4. Sprint A 后整体里程碑（更新）

| 指标 | Sprint A 前 | Sprint A 后（now） | Phase 6 后 | Phase 7 后 | Sprint B 后 |
|------|-------------|-------------------|-----------|-----------|------------|
| 视图实现度（加权平均） | 68% | **92%** | 92% | 95% | 100% |
| 截图覆盖率 | 5/11 | 5/11 | 5/11 | **11/11** | 11/11 |
| API 调用层 | 3 轨 | **1 轨** | 1 轨 | 1 轨 | 1 轨 |
| 后端 stub 数 | 10 | 10 | 10 | 10 | **0** |
| admin-gated 可用度 | 0/26 | **26/26** | 26/26 | 26/26 | 26/26 |
| 验收报告 | 无 | 无 | 无 | **有** | 有 |
| 类型化 .ts/.js 占比（src/） | 高低混合 | 较高 | **接近全 .ts** | 全 .ts | 全 .ts |

---

## 5. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| useFormatters 转 ts 后 5 个引用方类型不兼容 | 🟢 低 | 类型签名宽松（`unknown` / `string \| null` 兜底） |
| 删除 DetailModal 影响 future 功能 | 🟢 低 | git history 保留；未来需要时复活 1 个 commit 即可 |
| deploy.sh 在 Windows / WSL / Linux 之间行为不一致 | 🟡 中 | 默认 bash 写法 + 文档注明用 WSL/Linux 执行 |
| Phase 7 chrome-devtools MCP 不可用 | 🟡 中 | 降级为手动截图 + curl + console.log 抓取 |
| Sprint B 跨仓提交协调成本高 | 🟡 中 | 主控派发 worker；按 B1-B7 单独 PR；每个 PR 独立 cargo check |

---

## 6. 与上游 plan 的关系

| 上游 plan | 关系 |
|----------|------|
| `2026-04-26-next-step-plan.md` Phase 5 退出 | 本计划是其 next-phase |
| `2026-04-25-collab-monitor-completion-gap.md` Sprint B/C | 本计划细化执行 |
| `2026-04-26-remote-site-prd.md` §12 Gap mapping | 本计划与之一一对应 |

---

## 7. 立即执行（本会话 Phase 6）

```
[Phase 6 开始]
  │
  ├─ 6.1 useFormatters.js → useFormatters.ts        [10 min]
  ├─ 6.2 删除 DetailModal.vue                        [ 2 min]
  ├─ 6.3 SiteCard 升级 import 路径                   [ 3 min]
  ├─ 6.4 scripts/deploy.sh                           [10 min]
  ├─ 6.5 npm run type-check                          [ 1 min]
  └─ 6.6 git commit Phase 6 收尾                     [ 5 min]
[Phase 6 完成 · ~30 min]
```

Phase 7 / Sprint B 由用户确认后另起会话推进。
