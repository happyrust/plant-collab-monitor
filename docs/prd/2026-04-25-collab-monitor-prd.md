# plant-collab-monitor 异地协同管理台 · PRD

> 文档版本：1.0（2026-04-25）
> 状态：Draft（基于已落地的 Phase 1–4 + e2e-smoke 计划反推）
> 上游基线：`plant-model-gen/docs/architecture/异地协同API汇总清单.md`（81 个 endpoint）+ `plant-model-gen/docs/plans/2026-04-22-异地协同前端独立与API汇总计划.md`（拆库父计划）

---

## 0. 一句话定位

**plant-collab-monitor** 是异地协同（multi-site MQTT + LiteFS + remote-sync runtime）业务的**专业监控管理台**：从 web-server 的杂糅前端中剥离出来，作为独立的 Vue 3 SPA，对接 plant-model-gen 提供的 81 个 HTTP/SSE 端点，让运维 / 实施 / 现场工程师能够在浏览器里完成"看清楚 + 调得动"两件事。

---

## 1. 背景

### 1.1 业务来源

设计院 / 工程公司 PDMS 项目通常分布在 N 个站点（北京、上海、设计分公司、工程现场），每个站点有自己的 LiteFS 副本 + MQTT 节点。"异地协同"业务负责：

- **站点配置**（`DbOption.toml` 主从、可见 location 列表、文件服务/MQTT 地址）
- **站点拓扑**（环境 → 站点的两层模型 + 主从结构 + 健康状态）
- **MQTT 通讯**（节点上下线、消息投递、订阅启停、主从切换）
- **同步引擎**（任务队列、增量同步、历史回溯、SSE 实时事件）
- **运维操作**（启停 sync 服务、启停 MQTT broker、健康检查、文件代理）

历史上以上能力散落在 `web-server/frontend` + `plant-model-gen` 多处；2026-04-22 启动的"异地协同前端独立"父计划把它们汇成两半：

| 半 | 仓库 | 角色 |
|----|------|------|
| 后端 | `plant-model-gen` | 81 个 endpoint 的唯一来源 |
| 前端 | `plant-collab-monitor`（本仓） | 独立 SPA，:3200，dev 代理 `/api` → `:3100` |

### 1.2 现状（2026-04-25 测绘）

| 阶段 | 状态 | 证据 |
|------|------|------|
| Phase 1 后端 API 汇入 | ✅ 完成 | `异地协同API汇总清单.md` 81 endpoint 落地 |
| Phase 2 前端脚手架 + 11 视图 + 5 个 API 模块 | ✅ 完成 | `src/views/*` × 11 + `src/api/*.ts` × 5 |
| Phase 3 M1 后端冒烟 | ✅ 完成 | 6/8 绿 + 2 admin-gated 503（`2026-04-22-m1-smoke-test-result.md`） |
| Phase 3 M3 前端实地浏览器冒烟 | ⚠ 5/11 截图 | `docs/e2e-smoke/screenshots/01-05-*.png` |
| Phase 4 文档与部署 | ⚠ 部分 | README/Nginx example 完成；MIGRATION_NOTICE / 部署脚本待确认 |

---

## 2. 目标用户与角色

| 角色 | 痛点 | 在本台关注什么 |
|------|------|----------------|
| **运维工程师** | 节点掉线没人报、客户问"怎么没同步"答不上 | Dashboard 概览 / Logs SSE / MQTT 节点状态 / 同步任务队列 |
| **现场实施** | 配置 DbOption.toml 容易写错 | SiteConfig 表单 + 字段校验 + 测试连通 |
| **架构 / 技术负责人** | 想看全网拓扑、知道主从、规划站点扩容 | Topology / TopologyVisualization 拓扑图 / 环境-站点 CRUD |
| **开发者（plant-model-gen 内部）** | 接口刚改完想验证回归 | History / MqttMessages / 各类 metrics |
| **审计 / 安全** | 是否有违规 0.0.0.0、弱凭据、外部访问 | SiteConfig 校验、同步日志、admin 操作记录 |

> 所有角色公用同一前端（不强制区分），权限通过后端 admin-gated 与未来的 RBAC 控制。

---

## 3. 业务用例（按视图组织）

### 3.1 `/dashboard`

**核心目标**：单屏概览所有关键状态。

**用例**：
1. 进入即可看到当前站点身份（location、是否 master、运行时状态）
2. 看到各异地站点的在线/离线汇总（X 在线 / Y 离线 / Z 总数）
3. 看到 sync 服务总体指标（队列长度、过去 24h 任务量、近期失败数）
4. 看到最近的 N 条同步事件（成功/失败/告警）
5. 一键打开对应专题视图（链接到 Topology/Tasks/History/Logs）

**数据来源**（应当并发拉取）：
- `GET /api/site/identity`（当前站点身份）
- `GET /api/sync/status`（运行时状态）
- `GET /api/mqtt/nodes`（节点汇总，取 `summary` 字段）
- `GET /api/sync/metrics`（指标）
- `GET /api/sync/queue`（队列概览）
- `GET /api/sync/history?limit=10`（最近事件）

**禁止**：仅展示一个 `<pre>{json}</pre>` 的简陋实现。Dashboard 必须有可读的卡片 / 趋势图 / 状态徽标。

### 3.2 `/topology` 与 `/topology-viz`

**核心目标**：管理 + 可视化"环境 → 站点"两层模型与主从关系。

**`/topology` 用例**（运维向，重 CRUD）：
1. 列出所有环境 + 每个环境下的站点
2. 创建/编辑/删除环境
3. 在环境下创建/编辑/删除站点（含 location、MQTT host:port、file_server URL）
4. 一键测试 MQTT 连通 + HTTP 连通
5. 一键 apply / activate 环境到 runtime
6. 从 `DbOption.toml` 一键导入环境

**`/topology-viz` 用例**（架构向，重浏览）：
1. SVG 拓扑图：节点（站点）+ 连边（主从、订阅关系）
2. 节点颜色编码：在线（绿）/ 离线（红）/ 主节点（金色边框）
3. 鼠标 hover 显示节点详情（location、最近心跳时间、订阅 topic）
4. 拖拽节点重新布局，缩放
5. 周期自动刷新（默认 30s，可配置）

**数据来源**：`GET /api/remote-sync/envs`、`/sites`、`/topology`、`/api/mqtt/nodes`

### 3.3 `/tasks`

**核心目标**：查看 + 操作"等待执行 / 正在执行 / 已失败"的同步任务。

**用例**：
1. 显示当前队列（按状态分组：waiting / running / failed）
2. 每个任务可看：来源站点、目标站点、文件类型、大小、创建时间、最近错误
3. 一键取消单个任务
4. 一键清空全部失败任务
5. 一键触发文件下载（按需）
6. 创建新任务（管理员）

**数据**：`GET /api/sync/queue`、`POST /api/sync/task/{id}/cancel`、`POST /api/sync/queue/clear`、`POST /api/sync/task`、`POST /api/sync/trigger-download`

### 3.4 `/history`

**核心目标**：长时间维度回看同步历史。

**用例**：
1. 按日期筛选（默认最近 7 天）
2. 按站点 / 文件类型 / 状态（成功/失败）筛选
3. 时间线展示，单条可展开看完整 metadata
4. 失败条目可一键重试
5. 导出 CSV（管理员）

**数据**：`GET /api/sync/history`、`GET /api/remote-sync/logs`

### 3.5 `/mqtt/messages`

**核心目标**：查看 MQTT 消息投递的全链路。

**用例**：
1. 列表所有 message_id（按时间倒序），含 topic、payload size、目标接收者数、成功/失败比
2. 点开看每条消息的投递明细（哪些 receiver 接到了、哪些超时）
3. 可按 topic、source location、状态筛选

**数据**：`GET /api/mqtt/messages`、`GET /api/mqtt/messages/{message_id}`

> 注意：现有实现把"消息"接到了 `/api/incremental/history`，这是 **PRD-Gap**：MqttMessages 应该走 `/api/mqtt/messages`，`/api/incremental/*` 路径属另一个领域，需要区分清楚。

### 3.6 `/mqtt/nodes`

**核心目标**：实时监控 MQTT 节点状态 + 主从切换 + broker 启停。

**用例**：
1. 列表显示所有可见 location 节点：当前/邻居 / 在线状态 / 最后心跳 / 是否主节点
2. 主节点：可"踢掉"某个客户端节点（DELETE 节点）
3. 子节点：可"取消订阅"
4. 启动/停止 MQTT 订阅（runtime 入口）
5. 启动/停止 MQTT broker（plant-model-gen 内置）
6. 一键切换"我是主节点"/"我是从节点"（带二次确认）

**数据**：`GET /api/mqtt/nodes`、`DELETE /api/mqtt/nodes/{location}`、`POST /api/mqtt/nodes/client-unsubscribed`、`POST /api/mqtt/subscription/start|stop`、`POST /api/mqtt/node/set-master|set-client`、`POST /api/sync/mqtt/start|stop`、`GET /api/sync/mqtt/status`

### 3.7 `/logs`

**核心目标**：实时 + 历史日志双轨观察。

**用例**：
1. SSE 实时流：`EventSource('/api/sync/events/stream')`，新事件追加到顶部
2. 列表/筛选历史日志：`/api/remote-sync/logs`，按时间/level/location 过滤
3. 高亮 ERROR/WARN，可一键复制行
4. 自动滚动开关（默认开），手动滚到顶部时暂停自动滚动
5. 清屏 / 暂停接收

**数据**：`GET (SSE) /api/sync/events/stream`、`GET /api/remote-sync/logs`

### 3.8 `/archives`

**核心目标**：管理增量归档文件。

**用例**：
1. 列出当前站点已归档的文件包（含归档时间、大小、文件数、来源）
2. 下载单个归档包
3. 触发新的归档（管理员）
4. 删除过期归档（管理员）

**数据**：当前对接 `/api/incremental/archives`（待 PRD 确认是否纳入"异地协同"范畴；如纳入需在汇总清单补一节）

### 3.9 `/site-config`

**核心目标**：本站点的 DbOption.toml 配置编辑器。

**用例**：
1. 加载当前 `DbOption.toml` 全字段（project_name / project_code / location / location_dbs[] / mqtt host:port / file_server / server_release_ip / 主从角色等）
2. 字段级校验：路径存在性、IP/端口格式、location_dbs 非空、location 不能与已知站点重复
3. 一键自动探测出口 IP（`GET /api/site-config/server-ip`）
4. "保存" → `POST /api/site-config/save`，提示需要手动重启
5. "校验" → `POST /api/site-config/validate`，返回 ok/issues
6. "热重载"（未来）→ `POST /api/site-config/reload`（当前 stub）
7. "重启服务"（未来）→ `POST /api/site-config/restart`（当前 stub）

**数据**：`GET /api/site-config`、`/site/info`、`POST /api/site-config/{save,validate,reload,restart}`、`GET /api/site-config/server-ip`

### 3.10 `/settings`

**核心目标**：本站点的同步引擎运行参数。

**用例**：
1. 读 `GET /api/sync/config` 显示当前配置
2. 编辑 + 校验 + 提交 `PUT /api/sync/config`
3. 测试连通：`POST /api/sync/test`
4. 高级：直接编辑 JSON / TOML 模式（开发者向）

> 本视图当前只 `emit('save')` 没有真正的 API 闭环，是 **PRD-Gap**。

### 3.11 `/` 重定向到 `/dashboard`

---

## 4. 信息架构 / 路由

### 4.1 路由表

```
/                  →  /dashboard
/dashboard         →  概览仪表盘
/topology          →  环境-站点 CRUD
/topology-viz      →  拓扑可视化
/tasks             →  同步任务队列
/history           →  同步历史
/mqtt/messages     →  MQTT 消息投递
/mqtt/nodes        →  MQTT 节点监控
/logs              →  日志（SSE + 历史）
/archives          →  增量归档
/site-config       →  本站点配置
/settings          →  同步引擎设置
```

### 4.2 主导航分组建议

> 当前侧栏用一长串平铺；PRD 提议分 3 段，提升可寻性：

- **概览**：Dashboard
- **拓扑与任务**：Topology / TopologyVisualization / Tasks / History
- **MQTT**：Messages / Nodes
- **运维**：Logs / Archives
- **配置**：SiteConfig / Settings

### 4.3 顶部 Status Bar（建议 Phase 5+）

固定在所有页面顶部：
- 当前 location 徽标 + master/client 角色
- runtime 状态点（绿/黄/红）
- 队列长度数字 + 失败数（点击跳 Tasks）
- 最近 1min 事件计数

---

## 5. API 契约

### 5.1 总览

后端 81 endpoint 覆盖以下功能域（详见汇总清单）：

| 功能域 | 端点数 | 鉴权 |
|--------|--------|------|
| 站点配置 `/api/site-config/*` + `/api/site/info` | 7 | 公开 |
| MQTT 监控 `/api/mqtt/*`（节点/消息/订阅/主从） | 13 | 公开 |
| 同步服务 `/api/sync/*`（含 SSE） | 23 | 公开 |
| 异地环境与站点 `/api/remote-sync/*` | 26 | **admin-gated** |
| 部署站点管理 `/api/deployment-sites/*` | 9 | 公开 |
| 其他（identity/sync-status/sites）| 3 | 公开 |
| **合计** | **81** | |

### 5.2 前端 API 模块对应（强制规范）

PRD 规定前端按以下结构封装，**禁止视图内部裸 fetch**（除非是 SSE）：

```
src/api/
├── http.ts                 # axios 实例 + interceptor
├── index.ts                # 集中导出
├── syncApi.ts              # 23 + 1(SSE) 个 sync 端点
├── remoteSyncApi.ts        # 26 个 admin-gated remote-sync 端点
├── mqttApi.ts              # 13 个 mqtt 端点
├── siteConfigApi.ts        # 7 个 site-config 端点
└── deploymentSitesApi.ts   # 9 个 deployment-sites 端点（待补）
```

> 当前缺 `deploymentSitesApi.ts`，是 **PRD-Gap**。

### 5.3 SSE 处理规范

- 入口：`useSse(url, options)` composable
- 必须实现：自动重连（指数退避，max 30s）/ 心跳超时检测 / 路由切换 close / HMR 友好（onUnmounted close）
- 入口路径：`/api/sync/events/stream`、`/api/sync/events/test`

### 5.4 鉴权流程（admin-gated 26 个 endpoint）

1. 启动期：检查 sessionStorage 是否有 admin token
2. 若无 token，访问任何 `/api/remote-sync/*` 时 axios interceptor 拦截 → 弹出登录框
3. `POST /api/admin/login` 拿到 JWT → 写 sessionStorage
4. 后续请求 axios interceptor 注入 `Authorization: Bearer <token>`
5. 401/403 → 清 token + 重新弹登录
6. 注销按钮：清 token + 跳 `/dashboard`

> 当前实现为"未配 ADMIN_USER/PASS 时返回 503"，前端没有 admin login flow，是 **PRD-Gap**。

---

## 6. 状态机与生命周期

### 6.1 站点状态机（同步语义）

```
[NewlyCreated] -- 用户保存配置 --> [ConfigSaved]
[ConfigSaved] -- 重启服务 --> [Running]
[Running] -- pause --> [Paused] -- resume --> [Running]
[Running] -- stop --> [Stopped] -- start --> [Running]
[Running] -- error --> [Faulted] -- 用户介入 --> [Stopped|Running]
```

### 6.2 MQTT 节点状态机

```
[Discovered] -- 心跳达 --> [Online]
[Online] -- 心跳超时 30s --> [Stale]
[Stale] -- 心跳超时 60s --> [Offline]
[Offline] -- 心跳达 --> [Online]
[Online|Stale|Offline] -- 显式 DELETE --> [Removed]
```

UI 颜色：Online 绿 / Stale 黄 / Offline 红 / Removed 灰 / Master 金色边框

### 6.3 同步任务状态机

```
[Pending] -- 调度 --> [Running]
[Running] -- 完成 --> [Done]
[Running] -- 错误 --> [Failed]
[Failed] -- 重试 --> [Running]
[Pending|Failed] -- 手动取消 --> [Cancelled]
```

---

## 7. 鉴权与配置

### 7.1 后端配置依赖

| 环境变量 | 默认 | 说明 |
|---------|------|------|
| `ADMIN_USER` | (空) | 启用 admin login 必填 |
| `ADMIN_PASS` | (空) | 同上 |
| `AIOS_VIEWER_BASE_URL` | (空) | 不影响本台 |
| 数据库 | `DbOption.toml::server_release_ip` | 默认 `:3100` |

### 7.2 前端配置

| 配置项 | 来源 | 用途 |
|--------|------|------|
| 后端基地址 | `import.meta.env.VITE_BACKEND_URL` | 默认走 vite proxy `/api → :3100`；生产走相对路径 |
| 监控刷新周期 | sessionStorage | Dashboard / Topology 自动刷新间隔（默认 30s） |
| 主题 | sessionStorage | naive-ui dark/light |
| 折叠侧栏 | sessionStorage | UI 状态 |

### 7.3 部署形态

```
[Nginx :80/:443]
       │
       ├── /            →  plant-collab-monitor 静态构建（dist/）
       └── /api/*       →  http://127.0.0.1:3100 (plant-model-gen web_server)
                              │
                              ├── SQLite (LiteFS replicated)
                              ├── MQTT broker (rumqttd 内置)
                              └── 文件目录（/files/output/...）
```

参考 `nginx.example.conf`（已落地）。

---

## 8. 监控/告警/可观测性

### 8.1 前端可观测

- 每个视图必须打 `console.error` 仅用于真实异常
- 开发模式下 `axios` interceptor 把错误请求 + responseBody 打到 console
- 生产模式下保留 `Network 4xx/5xx` 计数（角落徽标）

### 8.2 后端可观测（前端拉取）

- `/api/sync/metrics` 应返回：QPS、p50/p95 时延、当前队列、错误率
- `/api/sync/metrics/history` 应返回：过去 N 小时的时序
- `/api/remote-sync/stats/daily` / `flows`：日维度 + 流向统计

> 当前 Dashboard 未消费 metrics，**PRD-Gap**。

### 8.3 告警（Phase 6+）

- 站点离线 > 5 min 顶部红条
- 队列堆积 > 100 顶部黄条
- 同步失败率 > 10%（5 min 滑窗）顶部黄条
- 浏览器 desktop notification（用户授权）

---

## 9. 安全与合规

### 9.1 强制项

- 任何配置编辑 / 启停 / 主从切换 → 二次确认弹窗
- 显示弱密码警告（与后端 P2 一致：root/root 等被拦在 400）
- `bind_host=0.0.0.0` 必须显式确认风险（与后端 P2 一致）
- admin token 存 sessionStorage 而非 localStorage（关闭 tab 即失效）
- 禁止把任何明文密码写入 console / network 请求 query

### 9.2 审计（Phase 6+）

所有写操作（POST/PUT/DELETE）后端记录到 `audit_log` 表，前端管理员可在专项页面回看。

---

## 10. 性能与容量目标

| 指标 | 目标 |
|------|------|
| 首屏 LCP | < 1.5s（局域网） |
| Dashboard 首屏 fetch 并发 | ≤ 6 路 |
| Topology SVG 节点数 | ≤ 200 节点流畅 |
| Logs SSE 吞吐 | ≤ 100 事件/s 不卡 |
| dist 体积 | ≤ 3 MB（含 Naive UI + FontAwesome） |
| Memory 持续占用 | ≤ 300 MB（一小时不刷新） |

---

## 11. 部署与运维

### 11.1 构建

```powershell
npm install
npm run type-check     # vue-tsc -b（应保持 0 errors）
npm run build          # 产物 dist/
```

### 11.2 反代

参考 `nginx.example.conf`：
- `/` → `dist/`
- `/api/*` → `proxy_pass http://127.0.0.1:3100`
- `/api/sync/events/*` → 必须带 `proxy_buffering off; proxy_read_timeout 1d;`（SSE）

### 11.3 健康检查

- 单机部署：`curl http://127.0.0.1:3100/api/sync/status` 200 = 健康
- Nginx：`/healthz` 静态返回 200

### 11.4 升级流程

1. `npm run build` 在构建机
2. rsync `dist/` 到 Nginx root
3. 后端无关停（前端纯静态）
4. 客户端浏览器自动 cache-bust（vite hash）

---

## 12. 不在范围（Out-of-Scope）

PRD 明确**不做**的事，避免范围蔓延：

- 用户管理 / RBAC / 团队（admin/admin 单角色足够）
- 移动端响应式（桌面 PC 1280×720 起）
- 国际化（仅中文）
- 多租户隔离（一个站点 = 一个部署）
- 对接 Grafana / Prometheus / OpenTelemetry（指标自闭环）
- 业务数据可视化（plant3d-web 才是模型查看器）
- AI / LLM 辅助分析

---

## 13. 与上游计划的关系

| 父计划 | 关系 |
|--------|------|
| `2026-04-22-异地协同前端独立与API汇总计划.md` | 本 PRD 的来源；PRD 把"完全移植"扩展为带产品视角的能力规范 |
| `2026-04-22-phase-3-phase-4-execution-checklist.md` | 本 PRD 的"已完成 Phase 3/4"是它的 checkbox 落地 |
| `2026-04-24-collab-monitor-e2e-smoke.md` | 本 PRD 的"P3 M3 实地验收"是它的执行指引 |
| `2026-04-25-collab-monitor-completion-gap.md`（同日产出） | 本 PRD 与当前实现的 Gap 清单与 Sprint 拆分 |

---

## 14. 版本与维护

- 重大功能加入时升 minor
- API 契约变更需同步 `异地协同API汇总清单.md`
- 维护者：plant-model-gen 团队 + plant-collab-monitor 团队
