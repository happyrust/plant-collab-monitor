# plant-collab-monitor · 异地部署功能 · 下一步计划（2026-09-14）

> 状态：**已批准**（2026-09-14 Plannotator `decision: approved`；共识登记 `d-406`）。
> 依据：2026-09-14 对 monitor 仓 + `../plant-model-gen` 后端的只读分析（见本文 §1）。
> 关联：`docs/prd/2026-04-26-remote-site-prd.md` §4.2 / §6.2 / US-4、`docs/e2e-smoke/local-remote-collab-test-plan.md`、`docs/remote-collab-management-analysis.md`。

## 0. 决策记录

§6 五个问题在批准时全部按默认选项拍板：

| # | 问题 | 结论 |
|---|---|---|
| 1 | `deploymentSitesApi.ts` | **A** · 收敛为 `list / get`，不整模块删除 |
| 2 | P3 与 P1 的关系 | **并行**（P3 环境准备可先行，联调依赖 P1） |
| 3 | `.cursor/rules/*.mdc` | 个人规则 → 进 `.gitignore`，已跟踪的 `mcp-messenger.mdc` 从索引移除、本地保留 |
| 4 | `docs/tutorials/*.docx` | **不入库**，只保留 md + svg，docx 由 `scripts/generate-remote-collab-docx.mjs` 按需生成 |
| 5 | SSH 远程部署外链 | **不加**；SSH 真·远程部署留在 `plant-model-gen/ui/admin` |

---

## 1. 现状一页纸

| 维度 | 现状 |
|---|---|
| 站点建模 / 观测面（env·site CRUD、探活、拓扑可视化、MQTT 节点、配置热加载） | ≈90%，已有 2026-04-26 三份 smoke 证据 |
| 部署动作面（测连通、apply/activate、DbOption 导入、停止运行时） | 后端 API 100% 已有（`remote_sync_handlers.rs:69-140`）· **前端 0%**：`remoteSyncApi.ts` 未封装、`TopologyView.vue` 无按钮 |
| `deploymentSitesApi.ts` | 9 端点里 **7 个后端不存在**（后端只注册公开只读 `GET list/get`），且无视图引用 |
| 本机双站点 e2e smoke | 2026-05-17 结果 **1 passed / 12 failed / 6 skipped**，全部因 Site A/B/MQTT 未启动；前置 `runtime/local-collab/site-a|b/DbOption.toml` 不存在 |
| 本地可复现性 | 后端 `target/**/web_server.exe` 未编译；monitor `node_modules` 未安装 |
| **实际在跑的后端**（执行期发现） | 本机 `:3100` 是 `../plant-web-server`（standalone-real），不是 `plant-model-gen/web_server`；login 无 `expires_at` → 监控台此前对它**登录必失败**；动作 / 运行时响应形状不同（`success` vs `status`、`running` vs `active/env_id`） |
| 文档 | README/AGENTS 引用的 `../plant-model-gen/docs/**` 在当前后端目录不存在；HANDOFF「已编译 debug」过期；教程截图为 CDP mock |
| 仓库 | 最后提交 `a65acad` 2026-05-18；工作区 15 个未跟踪 / 修改文件 |

---

## 2. 目标与非目标

**目标**

1. monitor 能在 `/topology` 内完成「建 env → 加 site → 测 MQTT / 测文件服务 / 测站点 HTTP → 激活环境 → 看运行时状态 → 停止运行时」完整闭环。
2. 本机双站点 smoke 真正跑通（≥ 18/19），并把结果作为可复现的验收证据归档。
3. 前端 API 层与后端路由一一对应，不再有悬空端点；文档与代码状态对齐。

**非目标**

- SSH 真·远程部署（`/api/admin/sites/{id}/remote-deploy`、`OfflineDeployView`）——属于 `plant-model-gen/ui/admin`，本计划不搬进 monitor，最多在文档里给一个跳转说明。
- 后端 Rust 改动（除非 P3 联调时暴露出阻塞性 bug，届时单独立项）。
- Dashboard / Logs / Tasks 等正交视图的功能增强。

---

## 3. 阶段拆解

### P1 · 部署动作面接入前端（≈ 0.5–1 天）

**改动文件**

- `src/api/remoteSyncApi.ts`
  - 新增：`applyEnv(id)`、`activateEnv(id)`、`testMqttEnv(id)`、`testHttpEnv(id)`、`testHttpSite(id)`、`importEnvFromDbOption()`、`updateSite(id, payload)`、`envConfig(id)`、`activeTasks()`、`failedTasks()`、`retryFailedTask(id)`。
  - 为动作类响应补一个共用类型 `RemoteSyncActionResponse = { status: 'success' | 'failed'; message: string; checked_at?: string; env_id?: string; [k: string]: unknown }`（对齐后端 `action_success / action_failed / ok_diagnostic`）。
- `src/views/TopologyView.vue`
  - 环境卡片操作区：**测 MQTT**、**测文件服务**、**应用到配置**（apply）、**激活**（activate）；
  - 站点行操作区：**测 HTTP**、**编辑**（复用添加站点弹窗 → `updateSite`）；
  - 右侧头部加运行时状态 pill（`runtimeStatus()` 30s 轮询：`running · env_id` / `stopped`）+ **停止运行时** 按钮；
  - activate / stop 走 `confirmDialog`（NDialog），文案明确「将改写后端 `DbOption.toml` 并重启 watcher + MQTT 订阅」；
  - 诊断结果用 inline banner（成功 emerald / 失败 rose）+ `useMessage` toast，禁止 `alert()`。
- `docs/prd/2026-04-26-remote-site-prd.md` §4.2 用例 5：把「待后端补 `runtime/start`」改成实际的 `apply / activate`。

**验收**

- `npm run type-check` 0 errors；`npm run build` 通过。
- 后端在线时：点「激活」→ 响应 `status: success` → 运行时 pill 显示 `env_id`；点「停止运行时」→ pill 变 `stopped`。
- 「测 MQTT / 测文件服务 / 测 HTTP」在后端离线或地址错误时显示 `failed` 原因，不出现未捕获红错。

### P2 · API 层收敛 + 文档校准（≈ 0.5 天）

- `src/api/deploymentSitesApi.ts`：删除 7 个后端不存在的方法（`importDbOption / create / update / delete / listTasks / healthcheck / exportConfig`），只保留 `list / get`；或整模块删除（见 §6 问题 1）。
- 更新 `README.md`（「9 endpoint」表述、相关文档表）、`AGENTS.md` §4.3 表、`docs/remote-collab-management-analysis.md` §4、PRD §6.3。
- `HANDOFF.md`：改掉「已编译 debug 可直接起」，写清实际启动前置（P3 产出的命令）。
- 跨仓引用 `../plant-model-gen/docs/**`：确认文档在别处是否仍存在；不存在则在 README 标注「历史文档，当前 checkout 不含」。

**验收**：`rg deploymentSitesApi src` 只剩 API 层与 `index.ts`；文档中的端点数量与 `rg '/api/deployment-sites' src` 一致。

### P3 · 本机双站点环境搭建 + smoke 跑通（≈ 1 天，外部依赖多）

1. 后端编译：`cargo build --bin web_server --features web_server,mqtt`
   - 注意：`web_server` feature **不包含** `mqtt`（`Cargo.toml:259/278`），只带 `web_server` 时 `activate` 的 MQTT 订阅分支为空，smoke 的「MQTT 发布 → 同步日志」链路不会被真正触发。
2. 生成两份隔离配置 `runtime/local-collab/site-a/DbOption.toml`、`site-b/DbOption.toml`：以 `db_options/DbOption.toml` 为模板，隔离 `location`（local-a / local-b）、`file_server_host`、`deployment_sites_sqlite_path`、`[web_server].port`（4100 / 4101）、`surreal_bind`、SurrealDB 数据目录、输出目录。
3. 启动 Mosquitto（本机或 Docker）→ Site A → Site B → monitor（`VITE_API_TARGET=http://127.0.0.1:4100`）。
4. 执行 `scripts/local-remote-collab-smoke.ps1`；目标 ≥ 18/19（`mqtt-publish-test` 需 `mosquitto_pub`，否则 skipped）。
5. 用 P1 的 UI 路径复做一遍（建 env / 加 Site B / 测连通 / 激活），截图归档到 `docs/e2e-smoke/screenshots/2026-09-xx-local-remote-collab/`。
6. 产出 `docs/e2e-smoke/2026-09-xx-local-remote-collab-smoke-report.md` + 覆盖 `local-remote-collab-smoke-result.json`。

**验收**：结果 JSON `passed: true`；报告里列出每项检查与实际响应片段。

### P4 · 仓库卫生（≈ 0.5 天）

| 文件 | 处置建议 |
|---|---|
| `docs/tutorials/**`（md / svg / png / docx）、`scripts/generate-remote-collab-docx.mjs` | 提交（docx 是否入库见 §6 问题 4） |
| `docs/e2e-smoke/local-remote-collab-*.json` | P3 跑通后用新结果覆盖再提交；不要提交 12 failed 的旧结果 |
| `runtime/` | 加入 `.gitignore`（运行期 fixture） |
| `.cursor/rules/agent-memory.mdc`、`best-mcp.mdc`、`mcp-messenger.mdc` 改动 | 个人会话规则 → 建议 `.gitignore` 或还原（见 §6 问题 3） |
| `task_plan.md`、`findings.md`、`progress.md` | 2026-05-06 planning 残留，已完成 → 删除或移到 `docs/plans/archive/` |
| `CHANGELOG.md` | 追加 2026-09 条目 |

---

## 4. 执行顺序与依赖

```
P2（收敛 API + 文档）─┐
                      ├─→ P1（前端动作面）─→ P3（双站点联调，用 P1 的 UI 复验）─→ P4（卫生 + 提交）
后端编译 + 配置生成 ──┘        （P3 步骤 1-3 可与 P1 并行准备）
```

- P2 与 P1 同一批提交，避免 README 与代码再次错位。
- P3 的环境准备（编译、配置、broker）可与 P1 并行；联调本身依赖 P1。
- 每阶段结束跑 `npm run type-check`，P1/P3 结束跑 `npm run smoke:phase7-plus` 回归。

---

## 5. 风险

| 风险 | 缓解 |
|---|---|
| `activate` 会**改写后端进程的 `DbOption.toml`**（`write_env_to_runtime_config`），误点即污染配置 | UI 二次确认 + 文案点明影响；联调只在 `runtime/local-collab/*` 隔离配置上操作 |
| `web_server` 不带 `mqtt` feature 时 MQTT 链路静默失效 | P3 步骤 1 显式加 `mqtt`；smoke 报告记录编译 feature |
| Windows 上编译 `web_server`（含 `ssh2`、`rusqlite` 等）耗时长 / 缺依赖 | 先起编译再做 P1；失败则退回 GitHub artifact 二进制 |
| 跨站点直连 `fetch` 受 CORS 限制 | 本机双端口同源策略下会触发；确认后端 CORS 中间件覆盖 `/api/health`、`/api/site/info`、`/api/site-config` |
| 后端目录不是 git 仓，无法核对 Sprint B 20/20 等历史结论 | 以当前源码 `rg` 为准，文档里标注「按 2026-09 源码核对」 |

---

## 5.1 执行记录（2026-09-14）

| 阶段 | 状态 | 说明 |
|---|---|---|
| P1 部署动作面 | ✅ 提交 `2825b93` + 后续兼容提交 | `remoteSyncApi` 补齐；`TopologyView` 运行时 pill / 停止运行时 / 环境卡片 4 按钮 / 站点 test-http + 编辑；mock 与真后端（plant-web-server）两轮 Playwright 走通 |
| P2 API 收敛 + 文档 | ✅ 同上 | `deploymentSitesApi` → `list / get`；README / AGENTS（新增 §4.3.1、§4.3.2）/ HANDOFF / 分析文档 / 两份 PRD 校准 |
| P3 双站点环境 | ◐ 部分 | ✅ `web_server` 已编出（`D:\Rust\target\debug\web_server.exe`，`web_server,mqtt`；补 clone 了 `../pdms-io-fork`）。❌ 本机无 Mosquitto、`runtime/local-collab/site-a\|b/DbOption.toml` 未生成、两实例未启动（长驻进程须用户自己起）；smoke 仍未跑 |
| P4 仓库卫生 | ✅ | `.gitignore` / 归档 / 入库 PNG；两份失败的 smoke JSON 仍未跟踪，等 P3 跑通后覆盖 |
| 计划外 | ✅ | 兼容 plant-web-server：login `expires_at` 可缺、`isRemoteSyncActionOk()`、激活态从 `envs[].active` 推导；用户确认后对本机 plant-web-server 做了完整闭环联调并恢复状态（`docs/e2e-smoke/2026-09-14-live-plant-web-server-topology-smoke.md`） |

## 6. 需要拍板的问题

1. `deploymentSitesApi.ts`：**A.** 收敛为 `list / get` 两个方法 · **B.** 整模块删除（当前无任何视图引用）。
2. P3 是否作为 P1 的**前置**（先有可运行环境再写 UI）还是**并行**（默认并行）。
3. `.cursor/rules/*.mdc`：个人规则（加 `.gitignore`）还是团队规则（提交）？
4. `docs/tutorials/*.docx`（二进制）是否入库，或只保留 md + svg 并由脚本按需生成。
5. 是否需要在 monitor 侧栏加一个到 `plant-model-gen/ui/admin/#/offline-deploy`（SSH 远程部署）的外链说明。
