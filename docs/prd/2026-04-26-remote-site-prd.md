# plant-collab-monitor · 异地站点功能 PRD

> 文档版本：1.0（2026-04-26）
> 作者：基于当前 `D:\work\plant-code\plant-collab-monitor` 代码实测反推
> 关联文档（互补不重复）：
> - 整体能力规范 → `docs/prd/2026-04-25-collab-monitor-prd.md`
> - 完成度差距 → `docs/plans/2026-04-25-collab-monitor-completion-gap.md`
> - Sprint A 执行 → `docs/plans/2026-04-25-sprint-a-execution.md`
> - 后端契约 → `../plant-model-gen/docs/architecture/异地协同API汇总清单.md`
>
> **本文档定位**：聚焦"异地站点（Remote Site）"这一核心业务实体，沿"站点生命周期"组织需求；不重复整体仪表盘/日志/任务等正交主题。

---

## 0. 一句话定位

**异地站点功能** = 把"分布在 N 个物理位置（北京/上海/工程现场/设计分院）的 PDMS/PML 数据节点"作为可建模、可视化、可联通、可同步、可运维的一等公民，让运维人员在 plant-collab-monitor 里完成站点的**注册 → 配置 → 拓扑组织 → 健康巡检 → 主从切换 → 数据同步 → 故障下线**全生命周期管理。

---

## 1. 背景与术语

### 1.1 三层站点抽象（务必区分）

后端代码与配置文件中存在三个相关但不同的"站点"概念，前端必须一一对应、不能混用：

| 概念 | 来源 | 粒度 | 主键 | 用途 |
|------|------|------|------|------|
| **本站点（Local Site / Self）** | `DbOption.toml::location` | 单实例 | `location` 字符串 | 当前 web_server 进程所代表的物理站点身份 |
| **异地环境（Remote Env）** | `/api/remote-sync/envs` | 1:N 容器 | `env_id` | 一个客户/项目下的"协同环境"，下挂多站点 |
| **异地站点（Remote Site）** | `/api/remote-sync/envs/{env_id}/sites` | env 子节点 | `site_id` | 隶属某 env 的对端节点（含 MQTT/file_server 地址） |
| **部署站点（Deployment Site）** | `/api/deployment-sites` | 扁平列表 | `id` | 由 `DbOption.toml` 一键导入的站点蓝本，可生成 healthcheck/tasks |

> 三个层次共同的"语义键"：**location 字符串**（如 `SJZ` / `BJ` / `SH`）。同一 location 在 DbOption.toml、Remote Site、MQTT Node 中应保持一致；前端在表单层做唯一性校验。

### 1.2 关键名词

| 名词 | 含义 |
|------|------|
| `location` | 站点位置标识（≤ 8 字符大写英文），跨 DbOption / MQTT / Remote Site 唯一 |
| `location_dbs` | 该 location 下的数据库编号数组（`number[]`），决定可见数据范围 |
| `master node` | MQTT 主节点，负责消息路由与订阅汇总；同一 env 内同一时刻只能有 1 个 |
| `client node` | MQTT 从节点，订阅 master 推送的事件 |
| `topology` | 环境-站点-主从关系的图结构（`/api/remote-sync/topology`） |
| `runtime` | 同步引擎运行时（start/stop/pause/resume） |
| `DbOption.toml` | plant-model-gen 进程的本地配置，定义本站点的全部身份与连接参数 |

---

## 2. 目标用户与场景

| 角色 | 站点视角的痛点 | 在本台关心 |
|------|---------------|-----------|
| **现场实施工程师** | 新厂部署时手填配置易错；不知主从角色冲突 | `/site-config` 表单 + 唯一性校验 + `/topology` 一键测连通 |
| **运维工程师** | 多站点离线没人报；MQTT broker 崩了不知道 | `/dashboard` 站点状态聚合 + `/mqtt/nodes` 节点状态 + `/logs` SSE |
| **架构 / 技术负责人** | 想看全网站点拓扑；要做扩容规划 | `/topology` CRUD + `/topology-viz` SVG 可视化 |
| **后端开发** | 改完 `/api/remote-sync/*` 想验证 | `/topology` 表单复测 + `/history` 同步历史回看 |
| **数据安全审计** | 是否有违规站点配置（弱凭据/`0.0.0.0` 监听） | `/site-config` 校验报告 + `/history` 失败记录 |

---

## 3. 异地站点生命周期

```
[NewlyDiscovered]                       由 DbOption 导入或手动新增
       │
       ├── (deployment-sites/import-dboption)         ← 批量导入入口
       └── (remote-sync/envs/{id}/sites POST)         ← 手动新增入口
       ▼
[Configured]                            连接参数齐全（mqtt + file_server）
       │
       ├── (healthcheck OK) ─────────────► [Healthy]
       └── (healthcheck FAIL) ────────────► [Unreachable]
       ▼
[Healthy] ── (set-as-master) ──► [MasterNode]
[Healthy] ── (set-as-client) ──► [ClientNode]
       │
       ▼
[Synchronizing]                        同步任务进行中（runtime running）
       │
       ├── (success) ─► [Synchronized]
       ├── (timeout) ─► [Stale] ───► [Unreachable]（连续 N 次心跳超时）
       └── (error)   ─► [Faulted]   需用户介入
       ▼
[Decommissioned]                       (DELETE site / DELETE mqtt node)
```

**前端 UI 状态颜色编码**：

| 状态 | 颜色 | 视觉 |
|------|------|------|
| Healthy + Online | 绿（emerald-500） | 实心圆点 |
| Master | 紫（purple-600） | 实心方块 + 金色边框 |
| Stale | 黄（amber-500） | 闪烁圆点 |
| Unreachable / Offline | 红（rose-500） | 空心圆点 |
| Faulted | 红 + ⚠ | 实心圆点 + 警告角标 |
| Decommissioned | 灰（slate-400） | 半透明 |

---

## 4. 功能模块（按视图组织 · 含当前实现度）

> 完成度依据：`docs/plans/2026-04-25-collab-monitor-completion-gap.md` §1.1 + 当前代码扫描。

### 4.1 站点配置编辑 · `/site-config`（实现度 80%）

**业务目标**：编辑当前 web_server 进程所代表的"本站点"身份与连接参数。

**字段集**（基于 `src/api/siteConfigApi.ts::SiteConfig`）：

| 分组 | 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|------|
| 项目 | `project_path` | string | ✅ | 非空，`fs.exists` |
|  | `project_name` | string | ✅ | ≤ 64 字符 |
|  | `project_code` | string | ✅ | ≤ 16 字符 |
|  | `module` | string | ✅ | 大写 4 字符（如 `DESI`） |
|  | `included_projects` | string[] | ✅ | 至少 1 项 |
| 位置 | `location` | string | ✅ | ≤ 8 字符 + 大写 + 全网唯一 |
|  | `location_dbs` | number[] | ✅ | 至少 1 项，[1, 999] |
| 数据库 | `ip` `user` `password` `port` | string | ✅ | IP 格式；端口 [1, 65535] |
| MQTT | `mqtt_host` `mqtt_port` | string/number | ✅ | host:port 格式；连通性 ping |
| 文件服务 | `file_server_host` | string | ✅ | URL 格式 |
| 出口 | `server_release_ip` | string | ⚠ | 自动探测按钮 → `GET /api/site-config/server-ip` |
| 生成开关 | `gen_model` `gen_mesh` `gen_spatial_tree` `apply_boolean_operation` | bool | — | toggle |
| 网格 | `mesh_tol_ratio` | number | — | 0.0–1.0 |
| 同步 | `total_sync` `incr_sync` `sync_live` | bool | — | toggle |
|  | `sync_push_db_types` | string[] | — | 多选（pdms/pml/...） |

**用例**：

1. **加载** → `GET /api/site-config` 把 toml 内容回填到表单
2. **校验** → `POST /api/site-config/validate` 后端返回 `{ ok: bool, issues: string[] }`，前端逐字段高亮
3. **保存** → `POST /api/site-config/save` 写盘后**当前需要手动重启**进程（**Gap-G7**：后端 reload/restart 是 stub）
4. **自动探测出口 IP** → `GET /api/site-config/server-ip` 一键填入 `server_release_ip`
5. **二次确认弹窗**：当 `bind_host=0.0.0.0`、密码强度低、`location` 与已存在 Remote Site 冲突时
6. **配置 diff 提示**：保存前对比当前/已加载，列出"将变更字段"避免误操作

**当前差距**：
- ⚠ G7：reload/restart 是 stub，UX 上需明确 banner 提示"已保存，需手动重启"
- ⚠ G1：本视图内仍有大量裸 `fetch()`，需统一收口到 `siteConfigApi`

### 4.2 异地拓扑 CRUD · `/topology`（实现度 90%）

**业务目标**：把多个"异地站点"组织成"环境（Env）"两层结构，对环境与站点做 CRUD。

**布局**：左 2/5 环境列表，右 3/5 选中环境下的站点列表。

**用例**：

1. **环境列表**
   - 列出全部 envs（`GET /api/remote-sync/envs`），显示 file_server_host / mqtt_host:port
   - 新建 env（POST），删除 env（DELETE，含确认）
   - 选中 env → 加载其 sites
2. **站点列表**（在选中 env 下）
   - 列出 sites（`GET /api/remote-sync/envs/{env_id}/sites`），每行显示 location / mqtt / 文件服务 / 健康状态徽标
   - **批量刷新状态**：调 `POST /api/deployment-sites/{id}/healthcheck` 或 `GET /api/remote-sync/sites/{id}/metadata`
   - 新建 site：表单含 `location`（自动校验唯一）、`mqtt_host:port`、`file_server_host`
   - 编辑 / 删除 site
3. **`DbOption.toml` 一键导入**
   - 按钮 "从 DbOption 导入" → `POST /api/deployment-sites/import-dboption`
   - 完成后自动列出新建的 deployment-sites（注意这是**第三层"部署站点"**）
4. **测试连通**
   - HTTP 连通：直接 `fetch(file_server_host + '/healthz')`（前端跨域走代理）
   - MQTT 连通：`POST /api/deployment-sites/{id}/healthcheck`
5. **Apply / Activate Env**（admin-gated）
   - 把选中 env 推送到 runtime → `POST /api/remote-sync/runtime/start`（待后端补）
   - 当前已有 `POST /api/remote-sync/runtime/stop`

**鉴权**：本视图 90% 操作走 `/api/remote-sync/*`（admin-gated）；未登录时由 axios interceptor 弹 `LoginDialog`。

### 4.3 拓扑可视化 · `/topology-viz`（实现度 90%）

**业务目标**：用 SVG 把 envs / sites / 主从关系 / MQTT 订阅流可视化。

**视觉编码**（已在代码中落地）：

| 元素 | 视觉 |
|------|------|
| 主节点 | 紫色实心方块 + 脉动 |
| 从节点（在线） | 绿色圆 + 脉动 |
| 节点（离线） | 红色圆 |
| "已订阅"边 | 绿色实线（emerald-500） |
| "在线未订阅"边 | 蓝色实线（primary） |
| "离线"边 | 灰色虚线 |
| "消息流"动画 | 黄色渐变沿边滑动 |

**交互**：

- 鼠标拖拽节点重新布局
- 滚轮缩放
- Hover 节点 → tooltip 显示 location / 角色 / 最近心跳 / 订阅 topic
- 点击节点 → 右侧抽屉展示 metadata（`/api/remote-sync/sites/{id}/metadata`）
- 默认每 30s 自动刷新（与全局 StatusBar 保持一致）

**性能目标**：≤ 200 节点流畅；> 200 时进入 force-directed 简化模式（暂未实现，记入 Phase 6）。

### 4.4 MQTT 节点监控 · `/mqtt/nodes`（实现度 85%）

**业务目标**：节点级实时监控 + 主从切换 + broker 启停（运维向）。

**列表字段**：

| 列 | 来源 |
|----|------|
| 节点位置（location） | `GET /api/mqtt/nodes` |
| 角色（master/client） | 同上 |
| 在线状态 | 同上 |
| 最后心跳时间 | 同上 |
| 订阅 topics | 同上 |
| 操作 | 设为主/从、踢出、取消订阅 |

**全局开关条**（页面顶部）：

- **节点角色**：当前 location 显示 "主节点" 紫色徽章 / "从节点" 蓝色徽章 + 切换按钮
- **MQTT Broker 状态**（仅主节点显示）：运行中 / 未启动 + 启动 / 停止按钮
- **MQTT 订阅状态**（仅从节点显示）：已订阅 / 未订阅 + 启动订阅 / 停止订阅按钮

**用例**：

1. 切换主/从 → `POST /api/mqtt/node/set-master | set-client`（**Gap-G6**：后端是 stub，仅 warn 不写盘）
2. 启停 broker → `POST /api/sync/mqtt/start | stop`
3. 启停订阅 → `POST /api/mqtt/subscription/start | stop`
4. 清除主节点配置 → `POST /api/mqtt/subscription/clear-master-config`
5. 踢出节点（主节点权限） → `DELETE /api/mqtt/nodes/{location}`，二次确认

**强制项**：
- 切换主从时弹"风险确认"模态：列出影响（订阅中断、待处理消息丢失风险）
- 当当前 env 已有 master 时再点"设为主节点"应**先解除当前 master**再切换

**当前差距**：
- ⚠ G6：set-master/set-client 后端未真正写 `DbOption.toml` + SQLite
- ⚠ G6：broker logs API 永远返回空数组

### 4.5 同步任务 · `/tasks`（实现度 80%，**站点视角衍生**）

**站点视角用例**：

1. 按"源站点 → 目标站点"分组展示队列
2. 每个任务行显示：来源 location / 目标 location / 文件类型 / 大小 / 状态 / 错误
3. 失败 task 一键重试 / 取消
4. 按 location 过滤队列

**API**：`syncApi.queue()` / `syncApi.history()` / `POST /api/sync/task` / `POST /api/sync/task/{id}/cancel`

### 4.6 同步历史 · `/history`（实现度 80%，**站点视角衍生**）

**站点视角用例**：
- 时间线展示，可按 location 筛选
- 每条记录可展开 metadata（哪些文件、来源/目标 location、耗时、错误堆栈）
- 失败记录支持"重新发送到站点 X"

### 4.7 系统日志 · `/logs`（实现度 85%，**站点视角衍生**）

- SSE：`/api/sync/events/stream` 实时推送（已用 `useSse` composable，含指数退避重连 + 心跳超时）
- 历史：`GET /api/remote-sync/logs?limit=200&location=…`
- **可按 location 过滤实时流**（前端本地筛选）

### 4.8 全局概览 · `/dashboard`（实现度 30%，**待重写**）

**站点视角的 6 卡片**（PRD 1.0 已规定，本 PRD 强化）：

| 卡片 | 数据 |
|------|------|
| 当前站点身份 | `GET /api/site/identity`：location + role + runtime status |
| 异地站点汇总 | `GET /api/mqtt/nodes` 的 summary：在线 X / 离线 Y / 总数 Z |
| 同步引擎状态 | `GET /api/sync/status` + `GET /api/sync/metrics` |
| 24h 任务量趋势 | `SyncTrendChart`（已存在但孤儿） |
| 站点在线率饼图 | `SiteStatusChart`（已存在但孤儿） |
| 最近 10 条事件 | `GET /api/sync/history?limit=10` |

**当前缺口**：仅 1 个按钮 + JSON `<pre>`，需重写。

### 4.9 归档管理 · `/archives`（实现度 50%，**与异地站点弱相关**）

> 本 PRD 不展开，归属决议见 `docs/plans/2026-04-25-collab-monitor-completion-gap.md` §G2。当前路径走 `/api/incremental/archives`。

### 4.10 同步引擎设置 · `/settings`（实现度 30%）

> 与"异地站点"无直接耦合，本 PRD 不展开。

---

## 5. 数据模型

### 5.1 Remote Env

```ts
interface RemoteEnv {
  id: string;                  // UUID 或递增 ID
  name: string;                // 人类可读名（如 "AvevaMarine 客户 A"）
  file_server_host?: string;   // 默认文件服务器（可被 site 覆盖）
  mqtt_host?: string;          // 默认 MQTT host（可被 site 覆盖）
  mqtt_port?: number;
  created_at?: string;         // ISO8601
  updated_at?: string;
}
```

### 5.2 Remote Site

```ts
interface RemoteSite {
  id: string;
  env_id: string;
  location: string;            // 唯一键
  mqtt_host: string;
  mqtt_port: number;
  file_server_host: string;
  is_master?: boolean;
  online?: boolean;
  last_heartbeat_at?: string;
  metadata?: {
    location_dbs?: number[];
    project_code?: string;
    [k: string]: unknown;
  };
}
```

### 5.3 Deployment Site（蓝本）

> 见 `src/api/deploymentSitesApi.ts`：`DeploymentSiteSummary`。

```ts
interface DeploymentSite {
  id: number | string;
  name: string;
  location?: string;
  status?: 'pending' | 'healthy' | 'unreachable' | 'faulted';
  mqtt_host?: string;
  mqtt_port?: number;
  file_server_host?: string;
  created_at?: string | number;
  updated_at?: string | number;
}
```

### 5.4 MQTT Node（运行时实体）

```ts
interface MqttNode {
  location: string;
  role: 'master' | 'client';
  online: boolean;
  last_heartbeat_at: string;
  subscribed_topics?: string[];
  client_id?: string;
}
```

### 5.5 实体关系

```
RemoteEnv 1 ─── N RemoteSite ─── 1:1 ─── MqttNode (按 location 关联)
                     │
                     └── 1:1 (可选) ── DeploymentSite (导入产物)

LocalSite (DbOption.toml.location) ─── 1:1 ─── MqttNode (本进程的 mqtt 实体)
                                       │
                                       └── 通过 location 在 RemoteSite 列表中能找到自己
```

---

## 6. API 契约（站点相关 endpoint 子集）

> 全量 81 个见 `../plant-model-gen/docs/architecture/异地协同API汇总清单.md`，本节仅列与"异地站点"业务直接相关的 ≈ 38 个。

### 6.1 本站点配置（`/api/site-config/*` + `/api/site/info`，公开 7 个）

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/site/info` | 当前 location + role + runtime |
| GET | `/api/site-config` | 读 DbOption.toml |
| POST | `/api/site-config/save` | 写盘 |
| POST | `/api/site-config/validate` | 校验 |
| POST | `/api/site-config/reload` | ⚠ stub |
| POST | `/api/site-config/restart` | ⚠ stub |
| GET | `/api/site-config/server-ip` | 自动探测出口 IP |

### 6.2 异地环境与站点（`/api/remote-sync/*`，admin-gated 13 个）

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/remote-sync/envs` | 环境列表 |
| GET | `/api/remote-sync/envs/{id}` | 环境详情 |
| POST | `/api/remote-sync/envs` | 新建环境（待后端确认） |
| DELETE | `/api/remote-sync/envs/{id}` | 删除环境 |
| GET | `/api/remote-sync/envs/{env_id}/sites` | 环境下站点列表 |
| POST | `/api/remote-sync/envs/{env_id}/sites` | 新建站点 |
| GET | `/api/remote-sync/sites/{id}` | 站点详情 |
| DELETE | `/api/remote-sync/sites/{id}` | 删除站点 |
| GET | `/api/remote-sync/sites/{id}/metadata` | 站点 metadata |
| GET | `/api/remote-sync/sites/{id}/files` | 站点文件列表 |
| GET | `/api/remote-sync/topology` | 全局拓扑（envs + sites + relations） |
| GET | `/api/remote-sync/runtime/status` | runtime 状态 |
| POST | `/api/remote-sync/runtime/stop` | 停止 runtime |

### 6.3 部署站点（`/api/deployment-sites/*`，公开 9 个）

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/deployment-sites` | 列表 |
| POST | `/api/deployment-sites` | 新建 |
| GET | `/api/deployment-sites/{id}` | 详情 |
| PUT | `/api/deployment-sites/{id}` | 更新 |
| DELETE | `/api/deployment-sites/{id}` | 删除 |
| POST | `/api/deployment-sites/import-dboption` | 从 DbOption.toml 一键导入 |
| GET | `/api/deployment-sites/{id}/tasks` | 部署任务列表 |
| POST | `/api/deployment-sites/{id}/healthcheck` | 健康检查 |
| GET | `/api/deployment-sites/{id}/export-config` | 导出该站点的配置片段 |

### 6.4 MQTT 节点（`/api/mqtt/*` + `/api/sync/mqtt/*`，公开 ≈ 9 个）

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/mqtt/nodes` | 节点列表（含 summary） |
| GET | `/api/mqtt/nodes/{location}` | 单节点详情 |
| DELETE | `/api/mqtt/nodes/{location}` | 踢出节点 |
| POST | `/api/mqtt/node/set-master` | 设为主节点 |
| POST | `/api/mqtt/node/set-client` | 设为从节点 |
| GET | `/api/mqtt/subscription/status` | 订阅状态 |
| POST | `/api/mqtt/subscription/start` | 启动订阅 |
| POST | `/api/mqtt/subscription/stop` | 停止订阅 |
| POST | `/api/mqtt/subscription/clear-master-config` | 清除主节点配置 |
| POST | `/api/sync/mqtt/start` | 启动 broker |
| POST | `/api/sync/mqtt/stop` | 停止 broker |
| GET | `/api/sync/mqtt/status` | broker 状态 |

### 6.5 鉴权

| Method | Path | 用途 |
|--------|------|------|
| POST | `/api/admin/auth/login` | 登录（payload: `{username, password}`） |
| POST | `/api/admin/auth/logout` | 登出 |
| GET | `/api/admin/auth/me` | 验证当前 session |

> 鉴权流程：`http.ts` interceptor 注入 `Authorization: Bearer <token>`；401/403/503(`管理员凭据未配置`) 时由 `App.vue::registerUnauthorizedHandler` 弹 `LoginDialog`。

---

## 7. 用户故事（站点视角）

### US-1：新厂部署

**作为** 现场实施工程师 **我希望** 在 30 分钟内为新厂房完成站点注册 **以便** 当天就能开始数据同步。

**步骤**：

1. 打开 `/site-config`，导入或手填 DbOption.toml 字段
2. 点"自动探测出口 IP" → 填入 `server_release_ip`
3. 点"验证配置" → 修复所有 issues
4. 点"保存配置" → 出现"已保存，请手动重启 web_server"提示
5. 重启 web_server，刷新页面
6. 切到 `/topology` → 选中目标 env → 点"添加站点"，把新厂的 location/mqtt/file_server 写入
7. 在右上角"管理员"未登录时被引导登录，登录后操作可下发
8. 切到 `/mqtt/nodes` 确认新厂节点已上线（绿色脉动）

**验收**：8 步内完成，无白屏，无未捕获红错。

### US-2：站点离线告警与定位

**作为** 运维工程师 **我希望** 在站点离线 5 分钟内被通知到 **以便** 联系现场排查。

**步骤**：

1. `/dashboard`（重写后）→ 站点在线率饼图标红
2. 点饼图红色扇区 → 跳 `/mqtt/nodes` 自动过滤离线节点
3. 点该节点 → 看到最近心跳时间、最近一条该 location 的日志
4. 切 `/logs` 自动按该 location 过滤实时流
5. 排查结束后，可在 `/topology` 点"踢出节点"清理脏状态

**验收**：≤ 4 次点击定位到根因。

### US-3：主从切换演练

**作为** 架构负责人 **我希望** 在不影响业务的前提下完成 master 切换 **以便** 应对计划性维护。

**步骤**：

1. `/mqtt/nodes` 点当前 master 旁的"设为从节点" → 二次确认弹窗（列出影响）
2. 系统自动选择候选 master（在线率最高的从节点）
3. 二次确认 → 后端执行切换
4. 全网 SSE 收到 `MqttSubscriptionStatusChanged` 事件
5. UI 自动刷新主从徽章

**验收**：切换过程 ≤ 30s 完成；切换后 `/topology-viz` 主节点位置正确更新。

> **当前差距**：步骤 3 的后端切换是 stub（Gap-G6），仅打 warn 日志不真正写盘。

### US-4：DbOption 批量纳管

**作为** 运维工程师 **我希望** 一键把 DbOption.toml 里的所有 `included_projects` 站点拉进异地协同管理 **以便** 减少手填错误。

**步骤**：

1. `/topology` 点"从 DbOption 导入" → `POST /api/deployment-sites/import-dboption`
2. 弹出导入预览：N 条新增 / M 条已存在
3. 确认后写库，列表自动刷新
4. 切到 `/topology-viz` 看到新站点已被布点

---

## 8. UI / UX 规范（站点相关）

### 8.1 站点卡片标准化

任何"展示一个 site"的卡片必须包含：

```
┌──────────────────────────────────────┐
│ ◉ SJZ            主节点 ⭐            │ ← location + 角色徽章
│ ┌─ 192.168.1.10:1883  (MQTT)         │
│ ├─ http://files/SJZ   (文件服务)      │
│ └─ 心跳 12s 前         (健康)         │
│ [刷新] [编辑] [⋯]                     │ ← 操作行
└──────────────────────────────────────┘
```

复用：`components/SiteCard.vue`（当前是孤儿，待接入 `/topology` 与 `/dashboard`）。

### 8.2 站点信息徽标

任何视图右上角必须能显示当前 location（即 `components/SiteInfoBadge.vue`）。

### 8.3 主从切换的二次确认

```
┌────────────────────────────────────────┐
│ ⚠ 风险确认                              │
│                                         │
│ 你正在把 SJZ 设为从节点。这将：           │
│  • 解除当前 SJZ 上的 master 配置        │
│  • 中断 N 个客户端的订阅                 │
│  • 可能丢失 K 条待发消息（最坏情况）     │
│                                         │
│ 候选新 master：BJ（在线率 98%）          │
│                                         │
│ [取消]                       [确认切换]  │
└────────────────────────────────────────┘
```

### 8.4 错误兜底

任何站点列表为空时显示插画 + 中文兜底文案 + "新建" CTA，禁止裸白屏。

---

## 9. 鉴权与安全

### 9.1 admin-gated 范围

26 个 `/api/remote-sync/*` 全部需要 admin token。前端默认行为：

- 未登录访问 → axios interceptor 捕获 401/403 → 弹 `LoginDialog`
- 503 + 错误信息含 "管理员凭据未配置" → 调 `markBackendUnconfigured()`，UI 显示"后端未启用 admin"红条
- token 存 sessionStorage（关 tab 即失效，符合 §9.1 安全规范）
- 登出按钮在左侧栏底部"已登录: {username} ⏎"

### 9.2 站点配置安全强制

| 风险项 | UI 行为 |
|--------|---------|
| `bind_host=0.0.0.0` | 黄色警告 + 必须勾选"我了解风险"才能保存 |
| 数据库密码 < 8 位或为常见弱密码 | 红色提示 + 阻止保存 |
| `mqtt_host` 为公网 IP | 黄色警告 + 提示走 VPN |
| 与已存在 location 冲突 | 红色提示 + 阻止保存 |
| 删除 master 节点 | 必须先转移 master 才能删除 |

### 9.3 审计

所有"写"操作（POST/PUT/DELETE）后端落 `audit_log` 表，前端管理员可在专项页面回看。**当前未实现**，记入 Phase 6+。

---

## 10. 状态可观测性

### 10.1 全局 StatusBar（待实现 Gap-G13）

固定在 `App.vue` 的 `<RouterView/>` 之上，4 项胶囊徽标：

| 徽标 | 数据 | 点击跳转 |
|------|------|---------|
| location + role | `GET /api/site/info` | `/site-config` |
| runtime 状态 | `GET /api/sync/status` | `/dashboard` |
| 队列长度 / 失败数 | `GET /api/sync/queue` | `/tasks` |
| 最近 1min 事件计数 | SSE 本地累加 | `/logs` |

每 30s 轮询一次（由新 composable `useStatusPolling()` 统一调度，避免每个视图独立轮询导致 N×N 请求）。

### 10.2 SSE 事件（站点相关）

| 事件 | 触发 | 前端处理 |
|------|------|---------|
| `MqttNodeOnline` | 节点心跳达 | `/topology-viz` 高亮节点；StatusBar +1 |
| `MqttNodeOffline` | 心跳超时 60s | 同上反向；告警条（Phase 6+） |
| `MqttSubscriptionStatusChanged` | 主从切换完成 | `/mqtt/nodes` 强制刷新 |
| `SyncTaskCreated` / `Done` / `Failed` | 同步任务 | `/tasks` `/history` `/dashboard` 刷新 |
| `SiteConfigSaved` | 配置写盘 | `/site-config` 显示"需重启" banner |

---

## 11. 性能目标

| 指标 | 目标 |
|------|------|
| `/topology` 加载 50 站点 | < 1s |
| `/topology-viz` SVG 渲染 200 节点 | < 1.5s 流畅 60fps |
| 站点状态批量 healthcheck 10 个 | 并发 5 路，5s 内完成 |
| SSE 单视图持续 1h | 内存增量 ≤ 50 MB |
| `/site-config` 大表单首屏 | < 500ms |

---

## 12. 当前差距与执行计划映射

> 完整 14 项 Gap 见 `2026-04-25-collab-monitor-completion-gap.md`。本表只列与"异地站点"直接相关的：

| Gap | 影响视图 | 优先级 | Sprint |
|-----|---------|-------|--------|
| G1 API 三轨并存 | 全部站点视图 | P0 | Sprint A · A8 |
| G3 缺 `deploymentSitesApi.ts` | `/topology` 无法批量导入 | P1 | Sprint A · A3（**已完成**） |
| G4 Dashboard 占位 | `/dashboard` 站点汇总缺失 | P0 | Sprint A · A1 |
| G6 MQTT stub | `/mqtt/nodes` 主从切换无效 | P0 | Sprint B · B1-B4 |
| G7 site-config reload stub | `/site-config` 体验断裂 | P1 | Sprint B · B5-B6 |
| G8 admin login | 26 个 remote-sync endpoint 不可用 | P1 | Sprint A · A7（**已完成**） |
| G11 孤儿组件（SiteCard / SiteStatusChart） | UI 标准化缺失 | P2 | Sprint C · C3 |
| G13 StatusBar | 全局站点可观测性缺失 | P2 | Sprint A · A9 |

---

## 13. 不在范围（Out-of-Scope）

| 项 | 原因 |
|----|------|
| 跨租户站点隔离 | 一个 plant-model-gen 实例 = 一个组织 |
| 站点级 RBAC（不同管理员管不同 env） | 单 admin 角色已够 |
| 站点自动发现（mDNS / Consul） | 网络异构无法假设 |
| 站点云端镜像 / 备份恢复 | 由 LiteFS 自身负责，前端不做 |
| 站点数据可视化（PDMS 模型预览） | `plant3d-web` 才是模型查看器 |
| 移动端 | 桌面 PC 1280×720 起 |

---

## 14. 关键风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 三层站点概念被前端混用导致脏数据 | 🔴 高 | 本 PRD §1.1 强制约定；代码层加 `RemoteSiteId` / `DeploymentSiteId` 类型 brand |
| MQTT 主从切换错误导致全网订阅中断 | 🔴 高 | 二次确认 + 灰度 + 后端 G6 修复后再开放生产 |
| `location` 唯一性破坏（同名 location 重复添加） | 🟡 中 | 前端表单校验 + 后端 unique 索引 |
| admin token 在 sessionStorage 被 XSS 偷取 | 🟡 中 | CSP + httpOnly cookie 选项（Phase 6+ 评估） |
| 200+ 节点 SVG 渲染卡顿 | 🟢 低 | `/topology-viz` 引入 force-directed 简化模式 |
| Gap-G6 未修复时主从切换"看似成功实际无效" | 🟡 中 | UI 在 Sprint A 加"演示模式" toast，明确"后端切换尚未持久化" |

---

## 15. 验收标准

### 15.1 功能完成度

- [ ] `/site-config` 全字段可编辑、校验、保存（含安全强制项）
- [ ] `/topology` env / site CRUD 全通；DbOption 一键导入工作
- [ ] `/topology-viz` 50 节点流畅；主从颜色编码正确
- [ ] `/mqtt/nodes` 节点列表 + 主从切换（待 G6）+ broker 启停正常
- [ ] `/dashboard` 6 卡片 + 2 图表（重写后）
- [ ] `/logs` SSE + location 过滤
- [ ] 全局 StatusBar 4 项徽标正常更新
- [ ] admin login flow 闭环

### 15.2 质量门

- [ ] `npm run type-check` 0 errors
- [ ] `grep -rE "fetch\(|new EventSource\(" src/views/` = 0
- [ ] 11 视图浏览器实测无白屏 / 无未捕获红错
- [ ] 11/11 视图截图归档到 `docs/e2e-smoke/screenshots/`
- [ ] e2e-smoke 验收报告产出

### 15.3 文档

- [ ] 本 PRD 与 `2026-04-25-collab-monitor-prd.md` 双向引用
- [ ] 后端 81 endpoint 清单与本 PRD §6 字段一一对应
- [ ] AGENTS.md 更新"异地站点"概念定义

---

## 16. 后续迭代（Phase 6+）

| 主题 | 描述 |
|------|------|
| 告警体系 | 站点离线 5 min / 失败率 > 10% / 队列堆积 > 100 顶部红条 + desktop notification |
| 站点级 RBAC | 不同 admin 管不同 env |
| 审计日志查看页 | 回看所有写操作 |
| 拓扑历史快照 | 记录拓扑变化时间线，可回滚 |
| 站点性能基准 | 记录每个站点的同步吞吐 / 时延，对比图 |
| 跨站点文件 diff | 选中两个站点对比文件树差异 |
| 国际化 | 仅当海外项目落地时启动 |

---

## 17. 版本

| 版本 | 日期 | 作者 | 变更 |
|------|------|------|------|
| 1.0 | 2026-04-26 | (本次产出) | 首版，基于当前代码实测 |

---

## 附录 A · 当前代码与本 PRD 字段对照速查

| PRD 字段 | 代码位置 |
|---------|---------|
| `SiteConfig` schema | `src/api/siteConfigApi.ts` line 3-28 |
| Remote env/site CRUD | `src/api/remoteSyncApi.ts` |
| Deployment Site | `src/api/deploymentSitesApi.ts` |
| MQTT 节点 + 主从 | `src/api/mqttApi.ts` |
| Admin 鉴权 | `src/api/adminAuthApi.ts` + `src/stores/adminAuth.ts` |
| 401/403/503 拦截 | `src/api/http.ts` line 46-72 + `src/App.vue` line 137-154 |
| SSE composable | `src/composables/useSse.ts` |
| 路由表 | `src/router/index.ts` |
| 三层导航分组 | `src/App.vue` line 176-194 |
| 当前 Gap 清单 | `docs/plans/2026-04-25-collab-monitor-completion-gap.md` |
