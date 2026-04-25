# plant-collab-monitor 端到端联调冒烟开发计划

> 制定日期：2026-04-24
>
> 目标：在本机把 plant-collab-monitor **完整跑起来**，用浏览器自动化（chrome-devtools MCP）逐个验证 11 个视图的可用性，产出验收报告。
>
> 关联文档：
> - 父计划：`../plant-model-gen/docs/plans/2026-04-22-异地协同前端独立与API汇总计划.md`
> - Phase 3/4 清单：`../plant-model-gen/docs/plans/2026-04-22-phase-3-phase-4-execution-checklist.md`
> - M1 冒烟：`../plant-model-gen/docs/plans/2026-04-22-m1-smoke-test-result.md`

## 一、背景 / 当前状态

### 已完成

| Phase | 内容 | 证据 |
|---|---|---|
| P0 | 仓库初始化 + git init | README |
| P1 | plant-model-gen API 汇入（1.1–1.6）| 7 commits |
| P2 | 脚手架 + 11 视图 + 5 API 模块 | `src/views/*` + `src/api/*.ts` |
| P3 M1 | 8 endpoint 冒烟（6/8 绿 · 2 admin-gated 503）| `2026-04-22-m1-smoke-test-result.md` |
| P4 | README + Nginx example + MIGRATION_NOTICE | README |

### 待完成

| 任务 | 说明 |
|---|---|
| P3 M3 前端实地验收 | 11 视图浏览器访问 + console/network 检查 |
| Font Awesome 依赖补齐 | `<i class="fas fa-…"/>` 被多视图使用，但 `package.json` 未声明 |
| SSE 通道联通验证 | `/api/sync/events/stream` EventSource 实测 |
| 验收报告产出 | `docs/2026-04-24-e2e-smoke-report.md` |

### 外部状态

- 后端进程：`web_server.exe` PID 27112 · LISTEN `:3100`（启动时间待核）
- 后端代码：`feat/collab-api-consolidation` 分支已合入 `origin/main` 最新提交（`96664e7` Q POS fallback）· 本地领先 2 commit
- Node 环境：v22.22.0 · npm 11.6.2
- `node_modules/`：150 顶层包已安装
- `dist/`：2026-04-22 旧构建产物（本轮不依赖）

## 二、方案（5 步）

### Step 1 · 基线确认（5 min · 只读）

**目的**：判断当前运行中的 `web_server.exe` 是否需要重启以加载最新 collab 路由。

**操作**：
1. `curl http://127.0.0.1:3100/api/sync/status` → 期望 200 JSON
2. `curl http://127.0.0.1:3100/api/mqtt/nodes` → 期望 200（若 404 = Phase 1.2 路由未注册 → 必须重启）
3. `curl http://127.0.0.1:3100/api/site-config` → 期望 200（若 404 = Phase 1.1 未注册 → 必须重启）
4. `curl http://127.0.0.1:3100/api/site/info` → 期望 200 含 location
5. `curl -X POST http://127.0.0.1:3100/api/admin/login` 观察是否返回 "管理员凭据未配置" → 判断是否需要设 ADMIN_USER/PASS

**判据**：
- 若 1–4 任一 404 → **需重启后端**
- 若 1–4 全绿且 5 提示未配 admin → 按用户选择决定是否为解锁 remote-sync 而重启

### Step 2 · 按需重启后端（0–30 min · 条件）

**触发条件**：Step 1 判定后端过旧 或 需要解锁 admin 鉴权。

**操作**：
```powershell
taskkill /PID 27112 /F
cd D:\work\plant-code\plant-model-gen
$env:ADMIN_USER = 'admin'
$env:ADMIN_PASS = 'admin'
cargo run --bin web_server --features web_server
```

**启动日志命中点**（关键）：
- `🎯 [collab-migrate] 异地协同 schema 对齐完成`
- `🚀 Web UI服务器启动成功！`
- `Listening on 0.0.0.0:3100`

### Step 3 · 前端修补与启动（10 min · 有修改）

**3a 补 Font Awesome 依赖**

方案 A（推荐 · 自托管）：
```powershell
cd D:\work\plant-code\plant-collab-monitor
npm i @fortawesome/fontawesome-free
```
`src/main.ts` 顶部新增：
```typescript
import '@fortawesome/fontawesome-free/css/all.min.css';
```

方案 B（快速 · CDN 兜底）：
`index.html` 头部：
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/css/all.min.css">
```

**3b 启动 dev server**
```powershell
cd D:\work\plant-code\plant-collab-monitor
npm run dev
```
- 等待 `Local: http://localhost:3200/` 输出
- 期望：HMR 就绪、vite 代理 `/api -> :3100` 生效

### Step 4 · chrome-devtools 浏览器冒烟（20 min · 只读）

对 11 个视图每个：
1. `navigate` → 截图到 `docs/e2e-smoke/screenshots/NN-<route>.png`
2. `evaluate` 抓取 `document.title`、`console.error` 数量、`body.innerText.length` 快速判活
3. network 面板 → 记录对应 API 返回码

**覆盖矩阵**：

| # | URL | 触发 | 判活 | 主 API |
|---|---|---|---|---|
| 1 | `/dashboard` | 点"拉取后端状态"| `<pre>` 出现 JSON | `/api/sync/status` |
| 2 | `/topology` | onMounted | 组件挂载 | `/api/remote-sync/topology` |
| 3 | `/topology-viz` | onMounted | SVG 可见 | `/api/remote-sync/topology` |
| 4 | `/tasks` | onMounted | TaskQueue 空列表 | `/api/sync/queue` |
| 5 | `/history` | onMounted | SyncHistory 挂载 | `/api/sync/history` |
| 6 | `/mqtt/messages` | onMounted | MqttMessageViewer 挂载 | `/api/mqtt/messages` |
| 7 | `/mqtt/nodes` | onMounted | MqttNodeMonitorEnhanced 挂载 | `/api/mqtt/nodes` |
| 8 | `/logs` | onMounted | LogViewer 挂载 + SSE readyState=1 | `/api/sync/events/stream` + `/api/remote-sync/logs` |
| 9 | `/archives` | onMounted | ArchivesManager 挂载 | 若依赖 file 接口需另判 |
| 10 | `/site-config` | onMounted | DbOption 字段映射入表单 | `/api/site-config` |
| 11 | `/settings` | onMounted | SettingsManager 挂载 | 视具体 API |

**失败分级**：
- **P0 阻塞**：白屏 / Vue 运行时异常
- **P1 功能缺失**：主 API 500 或无业务数据
- **P2 UX**：图标缺失（FA 未装）、空态文案、样式错位

### Step 5 · 验收报告（15 min · 有修改）

产出：`docs/e2e-smoke/2026-04-24-e2e-smoke-report.md`

内容：
- 11 视图 · 每个一行 · 状态 ✅/⚠/❌
- Console / Network 错误清单
- 截图索引（相对路径）
- P0/P1 问题附修复建议（不动代码，留给下个冲刺）

## 三、技术决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 浏览器自动化 | `user-chrome-devtools` MCP | 已挂载、原生支持 navigate/screenshot/evaluate/console |
| 后端重启 | 条件性 | 若已含最新路由则复用以减少中断 |
| FA 安装 | 方案 A 自托管 | 离线环境通用，+240KB bundle 可接受 |
| admin 鉴权 | 启用 test 凭据 `admin/admin` | 解锁 2 条 503 endpoint |
| 本轮不跑 `npm run build` | dev server 已证 runtime 可用 | build 留 CI 冲刺 |
| 报告位置 | plant-collab-monitor 仓库内 `docs/` | 与代码同步追溯 |

## 四、验收标准（Exit Criteria）

- [ ] 11 视图 URL 均可加载（HTTP 200）
- [ ] 每视图 Console 无 **红色** uncaught 异常
- [ ] Dashboard 拉取后端状态按钮工作
- [ ] `/api/sync/status` / `/api/mqtt/nodes` / `/api/site-config` / `/api/sync/queue` 返回 200
- [ ] SSE `/api/sync/events/stream` 握手成功（`readyState=1`）
- [ ] 验收报告成稿并含截图索引

## 五、风险与规避

| 风险 | 等级 | 规避 |
|---|---|---|
| 运行中的 web_server 为旧构建 | 🔴 高 | Step 1 路由探测一旦 404 立即重启 |
| cargo rebuild 慢（3–5 min）| 🟡 中 | 拉入 `pdms_transform_api.rs` 改动后是增量编译，可接受 |
| :3200 被占 | 🟡 中 | `strictPort` 直接报错 → `netstat/taskkill` |
| chrome-devtools MCP 需 Chrome 调试端口 | 🟡 中 | 若不可用降级为 `curl` + 静态截图 |
| FA 安装后 `type-check` 报 CSS 类型缺失 | 🟢 低 | `env.d.ts` 加 `declare module '*.css';` |
| SSE 在 Vite HMR 下重复建连 | 🟢 低 | LogsView 已有 `onUnmounted { close() }` |

## 六、本计划不做的事

- 为 `Tasks/SyncHistory/Logs` 的 placeholder 壳实现精修 UX
- 接入登录态流程（login → bearer token）
- 生产构建 + Nginx 反代实操
- 补齐 Phase 1.3b 真实 MQTT 订阅 handler
- 解决已知 stub（`/api/site-config/reload` 等）

## 七、时间线

```
[开始]
  │
  ├─ Step 1 基线确认         [ 5 min]
  ├─ Step 2 后端重启         [ 0–30 min · 按需]
  ├─ Step 3 前端修补 + 启动  [10 min]
  ├─ Step 4 浏览器冒烟 11 ×  [20 min]
  └─ Step 5 验收报告         [15 min]
[结束 · 合计 50–80 min]
```

## 八、附：本计划新增 / 涉及文件

| 类型 | 路径 |
|---|---|
| 新增 | `docs/plans/2026-04-24-collab-monitor-e2e-smoke.md`（本文件）|
| 新增 | `docs/e2e-smoke/screenshots/*.png`（Step 4 截图）|
| 新增 | `docs/e2e-smoke/2026-04-24-e2e-smoke-report.md`（Step 5 报告）|
| 修改 | `package.json` / `package-lock.json`（+@fortawesome/fontawesome-free）|
| 修改 | `src/main.ts`（+1 import）|
