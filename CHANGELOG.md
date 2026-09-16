# Changelog · plant-collab-monitor

> 异地协同站点专业监控台版本变更记录。
> 仓库地址：https://github.com/happyrust/plant-collab-monitor
> 较早的演进信息（Phase 1-12-Plus）见 `README.md` 「状态」章节与 git log。

---

## 2026-09-16

### 中继实现搬进 `plant-web-server`，站点后端换成它（跨仓，记在这里备查）

> 起因是「中继模式为什么还在依赖 SurrealDB」：那个开关只接在 3 个会致命的点上，`web_server` 自己的启动序列压根不看它，无条件按 `[surrealdb]` 连、重试约 15 s。根子是中继跟模型库 / 校审挤在同一个二进制里。换的是路径而不是补丁——把中继搬出来。

- `plant-web-server/src/relay/`（新，约 2800 行）：`ledger`（SQLite 台账）、`db_index`（pdms_io 预扫 sesno + 指纹）、`mqtt_msg`（线格式 `SyncE3dFileMsg`）、`file_sync`（CBA 压缩 / 广播 / clone / 校验）、`watch`（水位 + e3d-io 会话 diff 的轮询）。按原样搬，只重写了两处与模型库耦合的取值口径（`output_root`、`sync_relay_mode` 直接从 `DB_OPTION_FILE` 的 toml 读）。
- 接线：`activate` 真起中继运行态（起不来整条失败），`apply` 只落账；`runtime/status` 增加 `active / env_id / relay / mqtt_connected`，与 `pmg` 形状对齐；`runtime/stop` 先停中继。
- 跑多站必须的两处：`PLANT_WEB_RUNTIME_DIR`（各 service 状态目录此前硬编码在源码树，一台机器两个站会共用同一份）、`/assets/archives` 静态路由（此前没有，对端 clone 必然 404）与 `/files/output` 按配置的 `output_root` 路由。
- **实测**（两站都用 `plant-web-server.exe`）：A 的水位回退到 30 逼它重广播 → A 台账 `outbound ok / diff ok / 30→33`、`e3d_sync_changes` 156 条；B 台账 `inbound ok / sesno_to=33 / sesno_seen=33`；B 那份被故意弄脏的工程副本 clone 之后与 A 逐字节一致。收尾两站 `DbOption.toml` 与开跑前一致，真实工程零写入。
- 还没做：本仓 24 项双站点 smoke 仍对着 `plant-model-gen` 的 `web_server` 跑，没换过来。

### 后端 `plant-model-gen` 建了 git 仓（跨仓，记在这里备查）

> 交接单里连着两版列为「风险最大」的一条：后端一直不在版本管理里，中继模式那批改动只有 `plant-model-gen/runtime/backup-2026-09-15/` 这份手工备份兜着。本仓没有代码改动，这一段只是记录。

- `plant-model-gen` 现在是**本地 git 仓**（898 个文件 / 约 20 MB，`.git` 5.9 MB），3 条提交：
  1. `c110092` 建仓基线 — 树是当前工作区，但备份覆盖的 14 个文件换回备份版本、中继模式新增的两个模块先拿掉。**不是真实存在过的快照，也编不过**，它的用处只有一个：让下一条的 diff 就是那批改动本身。
  2. `14be1ce` 中继模式（SQLite-only）后端改动首次入库 — 15 个文件 `+1904 / −58`，含新模块 `data_interface/sync_ledger.rs`（837 行）与 `version_management/relay_sync.rs`（633 行）。
  3. `7f766ec` `db_index::rebuild_from_config` 改走 `spawn_blocking`（2026-09-16 00:15 另一个会话在工作区里改的，单独一条以便回滚）。
- 沿用后端原有的 `.gitignore`，另补三类：`runtime/local-collab` 只留配置与启动器（工程副本 / sqlite / output 由 `scripts/local-remote-collab-setup.ps1` 重新生成）、`__pycache__/`、`*.pyc`；新增 `.gitattributes`（索引一律 LF，`*.bat`/`*.cmd` 保持 CRLF）。
- **没有配 remote，也没有推送**；建远端要用户点头。工作区文件一字未动（只动索引），`git status` 干净，`git fsck` 无异常。

### 真后端 live 用例补齐（只读 7/7 · 完整闭环 9/9）+ 真浏览器实操版操作教程

> 补上 2026-09-15 交接单里「`topology-deploy-live-smoke`（只读控制面）本轮没跑」这一项。此前这套 L2 用例只对着 `plant-web-server`（shape `pws`）跑过。

#### Added

- `docs/e2e-smoke/topology-deploy-live-readonly-relay-result.json` — `node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100` 打到中继模式 Site A（shape `pmg`）的结果：**7 passed / 0 failed / 0 skipped**，0 次非探测写请求、0 pageerror，连跑三次一致。2026-09-14 那份 pws 的 `topology-deploy-live-readonly-result.json` 未被覆盖。
- `docs/e2e-smoke/2026-09-15-sqlite-only-collab-smoke-report.md` §3.4 — 这一跑的用例逐项记录、复跑命令，以及下面两条观察。

#### Fixed

- `HANDOFF.md` 「仍欠」第 1 条仍写着「缺 Mosquitto 与 `surreal`、最近一次真实结果是 2026-05-17 的 1 passed / 12 failed」——双站点 smoke 2026-09-15 已 24/24，同步更正；第 3 条的「剩 L3 full + L4 双站点」收敛为只剩 L3 full 的 plant-model-gen 路径。

#### Added · 真浏览器 + 真后端的操作教程

> 此前唯一的《异地部署操作教程》是 mock 驱动的：页面是真的，后端数据是假的。这一条补的是另一半——**把操作真的做一遍**，截图里每条提示都是真后端当时的响应。

- `scripts/topology-deploy-live-tutorial.mjs` — Playwright 开真实 Chrome，对着中继模式的 Site A（`:4100`）走完整条部署链：登录 → 从 DbOption 导入 → 新建环境（对端填 Site B）→ 测 MQTT / 测文件服务 → 激活（真写 `DbOption.toml` + 重启 watcher/MQTT）→ 应用 → 站点探测不通 → 改 HTTP 地址 → 再探测可达 → 停止运行时，逐步截图并整篇生成 Markdown。**跑完自动复原**：删掉本次新建的 env / 站点，用第 3 步「从 DbOption 导入」那张快照 `apply` 回去再 `stop`，env 集合与激活态回到开跑前。
- `docs/tutorials/topology-deploy-live-tutorial.md` + `screenshots/topology-deploy-live/`（16 张）— 生成物。Word 版 `npm run docx:topology-deploy:live`。
- `docs/e2e-smoke/topology-deploy-live-tutorial-result.json` — 这一跑的机器记录：每步的真实返回、页面发出的写请求、收尾复原核对。
- `docs/e2e-smoke/topology-deploy-live-full-relay-result.json` — 顺手把 **L3 完整闭环（`--mode full --confirm-writes`）对 plant-model-gen 的路径**也跑了，这是四层用例里最后一块没覆盖的：**LF-00–LF-08 共 9 passed / 0 failed**，6 次写请求，收尾 `envIdsRestored` / `activeRestored` 均为真。
- `package.json` — 新增 `tutorial:topology-deploy:live` 与 `docx:topology-deploy:live`。

#### Changed

- `scripts/generate-remote-collab-docx.mjs` — Markdown 表格改为渲染成**真正的 Word 表格**（表头加粗 + 底纹、细边框、按页宽等分列宽、跨页重复表头）。此前表格是整行原样落成 `| 字段 | 填什么 |` 的文字。三份 docx 已用新渲染重出。

#### 观察（未改代码）

- **自动加入的那个站点指向的是监控台自己**：保存新环境时前端会把本站加为第一个站点，`http_host` 取的是当前页面地址（这一跑是 `vite preview` 的 `http://localhost:4179`），所以站点探测第一次必然 404。要用起来必须手动改成对端地址——教程第 8 节就是照这条真实链路写的。
- **中继站点仍会尝试连 SurrealDB 并失败**：`auto_start_surreal = false` 只管「不自己拉起 `surreal`」，进程照样按 `[surrealdb]` 配的地址连，日志里 `连接尝试 1/2/3 失败` → `SurrealDB 连接失败` → `review 专用数据库连接初始化失败`（`os error 10061`，前后约 15 s）。中继链路与 7 项只读用例都不受影响，`/health` 也仍报 `database: healthy`（该健康检查不覆盖 SurrealDB）。准确的说法是「**中继链路**不需要 SurrealDB」。
- 唯一一条 `consoleError` 是根 `favicon.ico` 404（`dist/` 里没有这个文件，`index.html` 引用的 7 个资源都在），与后端无关。

---

## 2026-09-15

### 异地协同转「只依赖 SQLite」的中继模式 · 本机双站点 smoke 24/24

> 依据 `docs/plans/2026-09-15-sqlite-only-remote-collab-plan.md`（P0–P4）。中继模式与 e3d-io 变更判定落在后端 `plant-model-gen`（非本仓）；本仓负责双站点环境与验收。结论：一个站点只要 Mosquitto + 一个 `web_server`，**不再需要 SurrealDB**。

#### Added

- `docs/plans/2026-09-15-sqlite-only-remote-collab-plan.md` — 方案 v2（P0 e3d-io 落位 / P1 台账搬 SQLite / P2 开关与解闸 / P3 中继轮询 / P4 双站点验收），含各阶段执行记录。
- `docs/e2e-smoke/2026-09-15-sqlite-only-collab-smoke-report.md` — P4 执行报告：无 broker 20/24 → 装 Mosquitto 后 24/24 → 接手会话复验连跑两次 24/24（§3.3）。
- `scripts/local-remote-collab-smoke.ps1` — 新增 LS-23 `relay-outbound-ledger` / LS-24 `relay-inbound-ledger`：用「回退 A 的水位」模拟新会话（机器上没有 E3D，没法真保存一个 session），跑通 A 判变更 → 广播 → B 下载 CBA → clone → 校验 → 两站台账的完整中继链路。
- `docs/e2e-smoke/local-remote-collab-smoke-result.json` / `local-remote-collab-fixture-result.json` — 结果入库（覆盖 2026-05-17 的失败结果）。

#### Changed

- `scripts/local-remote-collab-setup.ps1` — 生成的两份 `DbOption.toml` 带 `sync_relay_mode = true`、`auto_start_surreal = false`；前置检查去掉 `surreal`，构建命令改 `--features web_server,relay-sync`；每站各一份工程副本（默认只收 `SCB`，避免 B 的 clone 写到 A 正在读的真实工程）；`file_server_host` 指向本站 `/assets/archives`（别站来下载 CBA 的地址）。
- `docs/e2e-smoke/local-remote-collab-test-plan.md` — §3「为什么必须 `auto_start_surreal`」整段重写为中继模式说明，验收点 22 → 24 项。

#### Fixed

- smoke 自身的两个缺陷（复验时暴露，产品侧零改动）：① 中继站点的轮询每周期都会打开那批 db 文件，smoke 紧接着去哈希同一个文件必然抢不到句柄 → 开文件统一走 `Invoke-WithFileRetry`；② Windows PowerShell 5.1 的 `ConvertFrom-Json` 把 JSON 数组当一个对象传下来，台账有多行时 `$rows[0]` 取到的是全部行，`sesno` 比成了 `"33 33"` vs `"33"`。
- LS-24 收紧为「必须是 A 本轮那条 `msg_id`」：broker 上的 retained 消息会让 B 一订阅就把上一轮的广播再收一遍，只看有没有 `inbound/ok` 行会假绿。

---

## 2026-09-14

### 异地部署 · 部署动作面接入 `/topology` + API 层收敛 + 文档校准

> 依据同日只读分析与 Plannotator 批准的计划 `docs/plans/2026-09-14-remote-deploy-next-step-plan.md`（共识 `d-406`）。此前监控台只能建 env / site，无法把环境推到运行时；后端 `remote_sync_handlers.rs` 早已提供 apply / activate / test-* / runtime 端点。

#### Added

- `src/api/remoteSyncApi.ts`：新增 `applyEnv` / `activateEnv` / `testMqttEnv` / `testHttpEnv` / `testHttpSite` / `updateEnv` / `updateSite` / `importEnvFromDbOption` / `envConfig` / `updateEnvConfig` / `activeTasks` / `abortActiveTask` / `failedTasks` / `cleanupFailedTasks` / `retryFailedTask`，以及类型 `RemoteSyncActionResponse` / `RemoteSyncRuntimeStatus` / `RemoteSyncSitePayload`；删除后端不存在的 `getSite`（后端 `sites/{id}` 只有 PUT / DELETE）。
- `src/views/TopologyView.vue`：
  - 头部运行时状态 pill（`GET /api/remote-sync/runtime/status`，30s 轮询）+「停止运行时」；
  - 环境卡片「测 MQTT / 测文件服务 / 应用 / 激活」，诊断结果（addr / url / code / latency_ms）以 inline banner 留在卡片内，当前激活 env 挂「已激活」徽标；
  - 站点行「后端 test-http 诊断」与「编辑」（复用添加站点弹窗，`PUT /api/remote-sync/sites/{id}`）；
  - `apply / activate / stop` 均经 NDialog 二次确认，文案点明会改写后端 `DbOption.toml`。
- `docs/plans/2026-09-14-remote-deploy-next-step-plan.md`：四阶段计划（P1 动作面 / P2 收敛 / P3 双站点 smoke / P4 卫生）+ §0 决策记录。
- 入库教程配图 `docs/tutorials/diagrams/*.png`、`docs/tutorials/screenshots/remote-collab/*.png` 与 `scripts/generate-remote-collab-docx.mjs`。

#### Changed

- `src/api/deploymentSitesApi.ts` 收敛为后端实际注册的公开只读 `list / get`；删除 `importDbOption / create / update / delete / listTasks / healthcheck / exportConfig`（后端 `mod.rs` 无对应路由）。
- README / AGENTS §4.3（新增 §4.3.1 部署动作面表）/ HANDOFF / `docs/remote-collab-management-analysis.md` / 两份 PRD 按后端源码校准端点数量与状态；标注 `../plant-model-gen/docs/**` 在当前 checkout 不存在。
- `.gitignore`：忽略 `.cursor/rules/`（个人会话规则，`mcp-messenger.mdc` 从索引移除、本地保留）、`runtime/`（smoke fixture）、`docs/tutorials/*.docx`。
- 2026-05-06 的 `task_plan.md / findings.md / progress.md` 归档到 `docs/plans/archive/2026-05-06-review-fix/`。

#### Fixed（对本机实际运行的 `plant-web-server` 后端）

- `adminAuthApi.normalizeAdminSession` 不再强制 `expires_at`：plant-web-server 的 login 响应没有该字段，此前监控台对它**登录必失败**（「管理员登录响应缺少会话字段」），所有 admin-gated 视图不可用。
- `remoteSyncApi.isRemoteSyncActionOk()`：动作 / 诊断响应同时兼容 `status:'success'|'failed'`（plant-model-gen）与 `success:boolean` + `reachable`（plant-web-server）；`TopologyView` 的运行时激活态改由 `runtime/status` 的 `active/env_id` **或** `envs[].active` 推导，两种后端下 pill / 已激活徽标 / 激活按钮禁用都正确。
- 新建 env / 站点、编辑站点的成功判定补 `success === false` 分支。

#### Added（自动化测试用例 · 同日下午）

- `docs/e2e-smoke/remote-deploy-auto-test-cases.md`：异地部署功能四层用例目录（L1 mock 契约 `DA-01–15` / L2 真后端只读 `LR-00–06` / L3 真后端闭环 `LF-00–08` / L4 双站点 `LS-01–19` + 建议 `LS-20–22`），含覆盖矩阵与选择器契约。
- `scripts/topology-deploy-smoke.mjs`（`npm run smoke:topology-deploy`）：自起 `vite preview` + Chrome，用 mock 后端把 `/topology` 部署动作面对 plant-model-gen / plant-web-server 两种响应形状各跑 15 例（登录、pill、测连通成功/失败、5xx、激活取消/确定、应用成功/业务失败、站点 test-http 可达/不可达、编辑站点 PUT、停止运行时、动作后刷新、表格布局）。
- `scripts/topology-deploy-live-smoke.mjs`（`npm run smoke:topology-deploy:live`）：对真后端跑只读安全层（脚本层拦下一切非探测写请求），`--mode full --confirm-writes` 跑完整闭环并自动收尾恢复（pmg 且原本无激活 env 时先 `import-from-dboption` 快照、收尾 apply 回去）；后端形状自动识别。

#### Added（P3 环境生成 + 双站点 smoke 扩展 · 同日下午）

- `scripts/local-remote-collab-setup.ps1`：从 `../plant-model-gen/db_options/DbOption.toml` 生成 `runtime/local-collab/site-a|b/DbOption.toml`（隔离 `location / file_server_host / deployment_sites_sqlite_path / output_root / [web_server].port|bind_host|site_id|region|surreal_bind|surreal_data_path / [surrealdb].port|path`，`gen_*` 关掉、`auto_start_surreal = true`、`versioned_storage = false`），外加每站点 `start.ps1`、`output/index.html + metadata.json` 探测 fixture、`mosquitto.conf + start-mosquitto.ps1`、`COMMANDS.md`；有 python 时用 `tomllib` 真解析校验；前置检查（web_server.exe / mosquitto / mosquitto_pub / surreal）缺什么打印安装命令。本机已生成并校验通过。
- `scripts/local-remote-collab-smoke.ps1`：19 → 22 项。新增 `remote-runtime-active-env`（LS-15，激活确实生效，兼容两种后端）、`mqtt-received-after-publish`（LS-20，发布后轮询 `runtime/status.mqtt_connected`）、`runtime-stop-clears-active`（LS-22，stop 后 `active === false`）+ 收尾删 smoke 站点 / env（`-KeepEnv` 关闭）；新参数 `-SiteBFileServerHost / -SiteBHttpHost`（默认 Site B `/files/output`，让 plant-model-gen 的 `test-http` 与 `sites/{id}/test-http` 探得到）、`-MosquittoDir`、`-MqttReceiveTimeoutSec`；末尾按 LS 编号逐项打印。
- `docs/e2e-smoke/local-remote-collab-test-plan.md` §3–§7 按生成器与 22 项重写；`remote-deploy-auto-test-cases.md` §5 同步。

#### 发现（P3 准备阶段，后端侧）

- `web_server.exe` 默认只编 SurrealDB `kv-mem`（`Cargo.toml` 注释明确不编 `kv-rocksdb`），`[surrealdb] mode = "file"` 起不来；`activate` → `start_runtime` 需要 `ensure_surreal_init()`，所以双站点 smoke 必须有 `surreal` 二进制（每站点 `auto_start_surreal`）。本机没有 `surreal`、也没有 Mosquitto。
- `mqtt_service::SyncE3dFileMsg::from(Vec<u8>)` 用 `serde_json::from_slice(..).unwrap()`：一条畸形 MQTT 消息就会让订阅任务 panic 退出，只能重新 activate 恢复。
- `sites/{id}/test-http` 探的是 `<http_host>/metadata.json`，而监控台 UI 的浏览器探活用 `<http_host>/api/health`；plant-model-gen 站点根路径不提供 `metadata.json`，两者对 `http_host` 的期待不一致。smoke 默认把 `http_host` 指到 Site B 的 `/files/output`（生成器放了 `metadata.json`），UI 侧「在线」判断在该配置下会显示离线。
- plant-model-gen 的 MQTT 收包写 SurrealDB `e3d_sync` 并尝试 clone，不写 `remote_sync_logs`；「MQTT → 同步日志」不是可观察链路，LS-20 改看 `mqtt_connected`。

#### Fixed（同日下午）

- `TopologyView.handleActivateEnv`：确认弹窗里「当前已激活的运行态（X）会先被停止」的提示改用 `runtimeActive`（原来读 `runtime.active`，plant-web-server 没有该字段，导致对它永远不提示）。由 DA-05 在 pws 形状下首轮失败暴露。

#### Verification（同日下午）

- `npm run type-check` · 0 errors
- `npm run smoke:topology-deploy` → pmg 15/15 · pws 15/15 · pageErrors 0（`docs/e2e-smoke/topology-deploy-smoke-result.json`）
- `npm run smoke:topology-deploy:live`（本机 plant-web-server `:3100`）→ 7/7，写请求 0（`docs/e2e-smoke/topology-deploy-live-readonly-result.json`）
- `node scripts/topology-deploy-live-smoke.mjs --mode full --confirm-writes`（同一后端，用户确认后）→ 9/9：建 env → 探测 → 激活（后端 `active` 切换）→ 应用 → 站点 test-http + 编辑 → 停止 → 收尾恢复，env 集合 / 激活态与跑前一致、站点无孤儿（`docs/e2e-smoke/topology-deploy-live-full-result.json`）

#### Known gaps

- 本机双站点 e2e smoke 仍未跑通（最近一次 2026-05-17：1 passed / 12 failed，Site A/B/MQTT 未启动）；本机无 Mosquitto，`runtime/local-collab/site-a|b/DbOption.toml` 未生成。`plant-model-gen` `web_server` 已可编译（`cargo build --bin web_server --features web_server,mqtt` → `D:\Rust\target\debug\web_server.exe`，需先 `git clone --depth 1 --branch dev-3.1 https://github.com/happyrust/pdms-io.git ../pdms-io-fork`）。
- ~~`/topology` 尚无「从 DbOption 导入」按钮（API 已封装）~~ → 同日晚已落地（见下方「收口」）。
- ~~部署动作面新按钮尚未纳入 `scripts/phase7-plus-smoke.mjs`~~ → 由 `scripts/topology-deploy-smoke.mjs` / `topology-deploy-live-smoke.mjs` 覆盖（见下方 Added）；L3 full 的 plant-model-gen 路径与 L4 双站点仍等 P3 环境。

#### Verification

- `npm run type-check` · 0 errors
- `npm run build`
- 后端路由对照：`rg -n 'route\(' ../plant-model-gen/src/web_server/remote_sync_handlers.rs`（35 路由）与 `mod.rs:1213-1221`（deployment-sites 仅 GET list / get）
- vite preview + Playwright（mock plant-model-gen 形状）：测 MQTT → 测文件服务 → 激活（确认弹窗）→ 站点 test-http → 编辑保存 → 停止运行时，6 个端点命中、0 console/page error、站点表 1440 宽度无横向溢出
- vite preview 反代到本机 `plant-web-server :3100`（只读 + 安全探测）：admin 登录成功 → pill「已激活 Persistence Env」→ 4 张 env 卡 1 个「已激活」→ 该 env 测 MQTT / 测文件服务（`目标不可达 · 127.0.0.1:3299`，符合预期）→ 站点 test-http；写请求 0 次
- **真后端完整闭环（用户确认后）**：UI 新建 env → 测连通 → 激活（后端 `active` 切换、pill / 徽标跟随）→ 应用 → 站点 test-http → 编辑站点（PUT 落盘）→ 停止运行时；收尾删测试 env / 站点并恢复原激活 env，env 集合与激活态与联调前一致。报告：`docs/e2e-smoke/2026-09-14-live-plant-web-server-topology-smoke.md`（含 7 条后端语义发现）

### 收口 · 「从 DbOption 导入」按钮 + 仓库行尾固定（同日晚）

#### Added

- `src/views/TopologyView.vue`：环境列表头部「从 DbOption 导入」按钮（PRD US-4 最后一步）。NDialog 说明「读取后端当前进程的 DbOption.toml 生成一个环境；不改写配置、不激活运行时；plant-model-gen 每次新建『导入环境 - 时间戳』，plant-web-server 按本站 id 覆盖」→ `remoteSyncApi.importEnvFromDbOption()` → 成功判定走 `isRemoteSyncActionOk()` → 刷新列表并选中新 env（id 兼容 pmg 顶层 `id` 与 pws `item.id / data.id`）；失败 toast 透出后端 message。至此 PRD §4.2 五个用例前端全部闭环。
- `scripts/topology-deploy-smoke.mjs`：DA-16（取消 0 写 → 确定后 `import-from-dboption` 恰 1 次、弹窗关闭、`GET envs` 重拉、「共 N+1 个环境」、新卡带 `border-primary` 选中态）；mock 路由按两种后端形状实现（pmg 不幂等新建、pws 固定 `dboption-local-a` 覆盖）。
- `.gitattributes`：`* text=auto eol=lf`（`*.bat / *.cmd` CRLF，图片 / 字体 / docx 二进制）。索引此前已全部是 LF，本次只是固定；此前 Windows 编辑器把 57 个工作区文件改成 CRLF 后 `package.json`、`*.ps1`、`*.md` 会出现整文件重写的假 diff。

#### Changed

- 下午产出按 4 个 commit 入库：`5d049c1` .gitattributes · `807d340` 四层用例 + mock/live smoke 脚本 + `runtimeActive` 修复 + 3 份通过的结果 JSON · `e67e1c2` 双站点 setup 生成器 + smoke 19→22 · `d2a0056` 文档。两份失败的 `local-remote-collab-*-result.json` 仍不入库，等 P3 跑通后覆盖。
- 文档同步：`remote-deploy-auto-test-cases.md`（§0 / §1 / §2 DA-16 / §6 / §7 选择器契约）、PRD §4.2 用例 3 与 US-4、HANDOFF「仍欠」、README 命令表、`remote-collab-management-analysis.md` §5 / §6、计划 §5.1。

#### Verification

- `npm run type-check` · 0 errors
- `npm run smoke:topology-deploy -- --build` → pmg 16/16 · pws 16/16 · pageErrors 0（`docs/e2e-smoke/topology-deploy-smoke-result.json`）

### 教程 · 《异地部署操作教程》由自动化用例的 mock 驱动真实页面自动生成（同日晚）

#### Added

- `scripts/topology-deploy-tutorial.mjs`（`npm run tutorial:topology-deploy`）：Playwright 驱动 `vite preview` 真实页面，后端用与 DA 用例**同一份 mock**，按运维操作顺序走 登录 → 首屏 → 从 DbOption 导入 → 手填新建 → 测 MQTT / 测文件服务 → 激活 → 应用（成功 / 业务失败）→ 站点探测 + 编辑 → 停止运行时 → 5xx 表现，每步截一张带红框高亮的 1440×900 视口图（17 张）+ plant-web-server 形状附录 2 张；步骤文案、截图与对应用例编号一起渲染成 `docs/tutorials/topology-deploy-tutorial.md`（含「步骤 ↔ 用例对照」与「如何重出」附录）。截图入库 `docs/tutorials/screenshots/topology-deploy/`（19 张 ≈ 4.4 MB）。
- `scripts/lib/topology-deploy-mock.mjs`：mock 后端从 smoke 脚本抽出为共享模块（smoke 与教程共用一份状态 / 路由），并补 `POST envs`、`POST envs/{id}/sites`、`DELETE envs|sites/{id}`、`GET site-config/server-ip`，让「手填新建 → 自动加入本站」在 mock 上也能走通。
- `scripts/generate-remote-collab-docx.mjs` 接受 `[源 md] [输出 docx]` 参数（默认不变），`node scripts/generate-remote-collab-docx.mjs docs/tutorials/topology-deploy-tutorial.md` 可出 Word 版（docx 仍不入库）。

#### Verification

- `npm run smoke:topology-deploy` 在 mock 抽出后重跑 → pmg 16/16 · pws 16/16（无回归）
- `npm run tutorial:topology-deploy` → 19 张截图 + Markdown；人眼核对 02 / 04 / 06 / 10 / 13：红框可见、无 tooltip 遮挡、无残留 toast
- `node scripts/generate-remote-collab-docx.mjs docs/tutorials/topology-deploy-tutorial.md` → Embedded 19 images；默认参数仍生成原教程 docx

---

## 2026-05-18

### Maintenance · 前端端口与异地协同部署材料

> 将监控台开发端口统一调整为 `4000`，补齐异地协同本地验证和运维教程材料，便于部署前复核。

#### Changed

- Vite dev / preview 默认端口从 `3200` 调整为 `4000`，并同步 README、AGENTS、HANDOFF、PRD 与 smoke 文档。
- `phase7-plus` 浏览器 smoke 默认目标更新为 `http://127.0.0.1:4000`。
- 拓扑、站点配置、MQTT 节点等视图的错误信息格式化改为 `unknown` 安全 narrowing，避免依赖 `instanceof Error`。

#### Added

- 新增本机双站点异地协同 smoke 计划与 PowerShell 脚本。
- 新增异地协同监控台使用教程和架构/操作流程 SVG 图。

#### Verification

- `npm run type-check`
- `npm run build`

---

## 2026-04-27

### Phase 20-26 · 跨仓真热加载 + 监控台增强（~15 commits · `7fde6c9` → `e9e8f80`）

> 本轮完成 rs-core / plant-model-gen / plant-collab-monitor 三仓改造：后端配置真热加载 + 前端全面增强（Dark Mode / 连接健康 / 通知 / 交互优化）。

#### Phase 20 · rs-core 真热加载（跨仓）

- rs-core `lib.rs`：`OnceCell<DbOption>` → `RwLock<Arc<DbOption>>` + 新增 `set_db_option_from_file()`
- plant-model-gen：reload handler 从诊断版升级为真热加载（`hot_reloaded` / `graceful_shutdown_triggered` / `hot_reload_failed`）
- 11 文件 `.clone()` 兼容性修复（`Arc::clone` vs `DbOption::clone` 语义差异）
- Smoke 3/3 PASS：`enable_log true→false → hot_reloaded`，二次 `no_change`，反向 `hot_reloaded`
- SiteConfigView 新增「重载配置」按钮，根据 `actions` 字段显示不同反馈
- plant-model-gen `history.txt` 加入 `.gitignore`（运行时 query artifact）

#### Phase 21 · Dark Mode 全面覆盖（7 commits）

- 新增 `stores/theme.ts`（Pinia + localStorage + 系统偏好检测）
- `main.css`：Tailwind 4 `@variant dark (&:where(.dark, .dark *))` + DaisyUI `data-theme` 联动
- App.vue 侧栏 dark 适配 + ☀/🌙 切换按钮
- 11/11 视图 dark 适配（bg-white / text-gray / border-slate 等 90+ 处 `dark:` 变体）
- AppStatusBar + LogViewer 组件 dark 适配
- SyncTrendChart + SiteStatusChart：echarts tooltip / axis / legend / pie border 跟随主题

#### Phase 22 · 后端连接健康检测

- `appStatus.ts`：`connected` + `consecutiveFailures` 状态追踪，2 次连续失败 → 断连
- AppStatusBar 顶部红色横幅 `后端连接中断 · 连续 N 次失败 · 正在重试…`

#### Phase 23 · 浏览器标签页告警

- 断连时 `document.title = '⚠ 连接中断 · ...'`
- 任务失败时 `document.title = '❌ N 失败 · ...'`
- 正常时恢复原标题

#### Phase 24 · 侧栏可折叠

- 折叠态 64px（仅图标 + tooltip），展开态 256px
- localStorage 持久化，300ms `transition-[width]` 过渡
- 折叠态隐藏分组标题、导航文字、版本号、登录按钮

#### Phase 25 · 键盘快捷键

- `Alt+D`：切换 Dark/Light 主题
- `Alt+B`：折叠/展开侧栏
- 输入框聚焦时自动屏蔽

#### Phase 26 · Desktop 通知

- 浏览器 Notification API，仅页面非聚焦时发送
- 后端掉线 → `连接中断` 通知
- 任务失败增加 → `任务失败` 通知
- 重新连接 → `连接恢复` 通知
- AppStatusBar 右侧 🔔 按钮请求通知权限
- `tag: 'plant-monitor'` 去重避免堆积

#### Phase 27-31 · 生产级加固

- **全局错误处理**（Phase 27）：Vue `errorHandler` + Router `onError` + `unhandledrejection`
- **页面过渡动画**（Phase 28）：RouterView `<Transition name="page" mode="out-in">` 150ms 淡入淡出
- **滚动位置恢复**（Phase 29）：`scrollBehavior` 支持 savedPosition + hash 锚点
- **面包屑条**（Phase 30）：`PLANT · COLLAB › 当前页面`，dark mode 适配
- **Admin 路由锁标记**（Phase 31）：5 个 admin-gated 路由侧栏显示 🔒

#### Phase 33-42 · 监控感知增强

- **动态 Favicon**（Phase 33）：Canvas 生成 AI 图标，蓝色正常 / 红色断连 / 琥珀色任务失败
- **侧栏 queue.failed 角标**（Phase 34）：展开态右侧数字徽标，折叠态右上角红点
- **侧栏离线指示器**（Phase 35）：后端断连时底部红色脉冲 `后端离线`
- **侧栏时钟**（Phase 36）：等宽数字 `HH:MM:SS`，1 秒更新
- **StatusBar pills dark**（Phase 37）：4 个 status pill 5 种状态 dark 适配
- **Dark mode 深度精修**（Phase 38-40）：DashCard 标题 + 事件列表 divider + text-slate-600/700 70+ 处 + SiteConfigView 38 处 + border-slate-200 11 处零残留
- **Dark mode 截图测试**（Phase 41）：smoke 扩展 dark 截图轮，4 张基线截图
- **NTooltip 侧栏**（Phase 42）：折叠态导航从 native title 升级为 NTooltip 秒显
- **移动端响应式**（Phase 43）：`md` 以下隐藏侧栏 + ☰ 汉堡菜单 + overlay 弹出 + 自动关闭
- **StatusBar 移动适配**（Phase 44）：pills 横向滚动 + 隐藏滚动条
- **PWA Manifest**（Phase 45）：`manifest.json` + 安装到桌面支持 + SVG 图标
- **useClipboard**（Phase 46）：复制到剪贴板 composable + 2s 状态反馈
- **useExport**（Phase 47）：`downloadJson` / `downloadCsv`（UTF-8 BOM + 引号转义）
- **useDebounce/useThrottledFn**（Phase 48）：ref 防抖 + 函数防抖/节流
- **composables barrel**（Phase 49）：统一 re-export `@/composables`（7 个 composable）

#### 验证

- `npm run type-check` 全程 0 errors
- `npm run smoke:phase7-plus` 多次 passed（11 路由 + SSE + 登录 + 弹窗确认）
- `npm run build` 成功（总 JS ~1.44MB / gzip ~272KB）

---

## 2026-04-26

### Phase 7-Plus · 真实浏览器联调首轮执行（1 commit · `5286e88`）

> 解除浏览器环境阻塞：发现系统 Chrome 已安装但不在 PATH，新增可复跑 Playwright smoke，并完成首轮带后端浏览器联调。

#### Added

- 新增 `npm run smoke:phase7-plus`，默认使用系统 Chrome 跑浏览器 smoke，不依赖 Playwright Chromium 下载。
- 新增 `scripts/phase7-plus-smoke.mjs`，覆盖 admin guard、登录回跳、11 个核心路由、SSE Bearer token 与 console/page error 采集。
- 新增 `docs/e2e-smoke/2026-04-26-phase7-plus-browser-smoke-report.md` 与 JSON 结果文件。

#### Fixed

- 修复 `adminAuthApi.login()` 与后端 envelope 响应不一致的问题。
- 修复 `/api/admin/auth/me` 只返回用户资料时前端误清 session 的问题，admin 路由刷新后不再掉登录态。

#### Verified

- `admin_redirect_after_login=/topology` 写入成功。
- 登录 `admin/admin` 后自动回跳 `/topology`。
- `/dashboard`、`/topology`、`/topology-viz`、`/tasks`、`/history`、`/mqtt/messages`、`/mqtt/nodes`、`/logs`、`/archives`、`/site-config`、`/settings` 均可进入目标路由。
- `/api/sync/events/stream` 两次请求均带 `Authorization: Bearer ...`。
- Vue `pageerror` 为 0。
- 后端补齐 `/api/incremental/archives` 后，`npm run smoke:phase7-plus` 判定 PASS，HTTP error 为 0。
- SiteConfig 保存确认弹窗非破坏性验证通过：点击取消后未发出写请求。

#### Follow-up

- Topology 删除确认因当前无可删除站点/环境而 skipped；后续需测试 fixture 支持。

---

### Maintenance Browser QA · 真实浏览器联调阻塞记录（本次提交）

> S1-S4 与 preview smoke 完成后尝试进入 Phase 7-Plus 真实浏览器联调，但当前机器缺少可用浏览器环境。

#### Attempted

- 读取 `docs/plans/2026-04-26-phase7-plus-preparation.md`，确认下一步应跑 14 步真实浏览器矩阵。
- 检查本机浏览器命令：`chrome` / `chrome.exe` / `msedge` / `msedge.exe` 均不可用。
- 检查 Playwright CLI：`npx playwright --version` 可用（1.59.1）。
- 尝试 Playwright screenshot：失败，Chromium executable 不存在。
- 尝试 `npx playwright install chromium`：官方源下载失败（`ECONNRESET`）。
- 尝试 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`：镜像路径返回 404 `NoSuchKey`。

#### Result

- 仓库无代码变更。
- Phase 7-Plus 真实浏览器联调暂时阻塞；需要安装 Chrome/Edge，或修复 Playwright Chromium 下载环境后再继续。

---

### Maintenance Memory · 固化依赖升级结论（1 commit · `9e837eb`）

> 将 S1-S4 与 preview smoke 的稳定结论迁移到 `AGENTS.md`，让后续 agent 直接继承最新技术栈与配置禁忌。

#### Docs

- **更新 `AGENTS.md` 技术栈**：Vite 8 / TypeScript 6 / Tailwind 4 / DaisyUI 5 / Pinia 3 / vue-router 5 / Node ≥20.19。
- **新增 Tailwind 4 / DaisyUI 5 配置约定**：PostCSS 必须用 `@tailwindcss/postcss`；DaisyUI v5 用 CSS `@plugin`，不要回到 JS config `require('daisyui')`。
- **同步当前状态**：`npm audit` 0 vulnerabilities、`npm outdated` 无剩余输出、production preview smoke 已通过。

---

### Maintenance Verification · 依赖升级预览 Smoke（1 commit · `01389ea`）

> S1-S4 全部完成后追加生产预览静态验证，确认 `/monitor/` base、SPA fallback、核心 assets 与 Tailwind/DaisyUI 产物正常。

#### Verification

- **新增报告**：`docs/maintenance/2026-04-26-maintenance-upgrade-preview-smoke.md`。
- **路由 smoke 6/6 PASS**：`/`（跟随 redirect 后 200）、`/monitor/`、`/monitor/dashboard`、`/monitor/topology`、`/monitor/mqtt/nodes`、`/monitor/site-config`。
- **assets smoke 6/6 PASS**：entry JS、`vendor-naive`、`rolldown-runtime`、`vendor-http`、`vendor-vue`、主 CSS 均 200。
- **CSS 产物检查 PASS**：主 CSS 命中 `btn-primary` / `modal-box` / `input-bordered` / `badge-success` / `stats-horizontal`。

---

### Maintenance S4 · Tailwind / DaisyUI 样式系统升级（1 commit · `75e27de`）

> 完成最后一组依赖升级：Tailwind 3 → 4、DaisyUI 4 → 5，并迁移到 Tailwind v4 的 PostCSS 与 CSS-first 配置。

#### Dependencies

- **`tailwindcss` 3 → 4**：升级到 `tailwindcss` 4.2.4。
- **`daisyui` 4 → 5**：升级到 `daisyui` 5.5.19。
- **新增 `@tailwindcss/postcss`**：Tailwind v4 PostCSS 插件独立拆包，`postcss.config.js` 改用 `@tailwindcss/postcss`。

#### Config

- **CSS-first 迁移**：`src/styles/main.css` 从 `@tailwind base/components/utilities` 改为 `@import "tailwindcss"`，并通过 `@plugin "daisyui"` 配置 light/dark theme 与关闭 logs。
- **JS config 收窄**：`tailwind.config.js` 保留 content + font theme 扩展，移除 DaisyUI JS plugin 配置。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 8.0.10，3487 modules transformed，built in 1.61s）。
- 产物确认包含 DaisyUI 全局类（如 `btn-primary` / `modal-box` / `input-bordered` / `badge-success` / `stats-horizontal`）。
- `npm audit --registry=https://registry.npmjs.org/` PASS：0 vulnerabilities。
- `npm outdated` 无剩余输出。

---

### Maintenance Cleanup · 移除未使用 VueUse direct dependency（1 commit · `15aade2`）

> 继续处理 S3 后剩余的低风险项：确认业务源码未直接使用 `@vueuse/core` 后，移除 direct dependency，而不是升级未使用 API。

#### Dependencies

- **移除 `@vueuse/core` direct dependency**：全仓精确搜索仅命中文档与 package 元数据；`src/` 与 `vite.config.ts` 无直接 import / auto-import 配置。`unplugin-auto-import` 仍保留其传递依赖，不影响构建工具链。

#### Docs

- **同步技术栈**：`README.md` 更新到 Vite 8 / TypeScript 6 / Pinia 3 / vue-router 5，移除 `@vueuse/core` 直接依赖描述，并把 Node 要求同步为 ≥20.19。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 8.0.10，3487 modules transformed，built in 1.97s）。
- `npm audit --registry=https://registry.npmjs.org/` PASS：0 vulnerabilities。
- `npm outdated` 剩余：`tailwindcss` / `daisyui`。

---

### Maintenance S3 · Vite 安全修复（1 commit · `0deb43d`）

> 按维护 backlog 完成 Vite/esbuild moderate 漏洞闭环：升级 Vite 主链路，保留现有构建配置语义。

#### Dependencies

- **`vite` 5 → 8**：升级到 `vite` 8.0.10，关闭 `esbuild <= 0.24.2` dev server moderate 漏洞链路。
- **`@vitejs/plugin-vue` 5 → 6**：升级到 `@vitejs/plugin-vue` 6.0.6，与 Vite 8 配套。

#### Build

- **配置兼容**：`vite.config.ts` 无需改动；`base`、proxy、manualChunks、auto-import / components 插件配置继续通过。
- **产物变化**：Vite 8/Rolldown 构建新增 `rolldown-runtime` 小 chunk；`vendor-naive` 从 573.05KB / gzip 159.34KB 增至 633.81KB / gzip 181.80KB，仍低于 `chunkSizeWarningLimit: 1500`。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 8.0.10，3487 modules transformed，built in 2.88s）。
- `npm audit --registry=https://registry.npmjs.org/` PASS：0 vulnerabilities。
- `npm outdated` 剩余：`@vueuse/core`、`tailwindcss` / `daisyui`。

---

### Maintenance S2 · 路由与状态依赖升级（1 commit · `4e9fd60`）

> 继续按维护 backlog 推进中风险但局部可控的路由 + 状态升级，先把 Vue Router / Pinia major 版本收口；Vite/esbuild 安全修复仍保留到 S3 独立处理。

#### Dependencies

- **`vue-router` 4 → 5**：升级到 `vue-router` 5.0.6，现有 `createRouter` / `createWebHistory` / `router.beforeEach` / `RouteMeta` 扩展类型通过。
- **`pinia` 2 → 3**：升级到 `pinia` 3.0.4，现有 `createPinia()` + `defineStore()` setup store（`adminAuth` / `appStatus`）无需代码改动。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 5.4.21，3486 modules transformed，`vendor-naive` 573.05KB / gzip 159.34KB 保持）。
- `npm outdated` 剩余：`@vueuse/core`、`vite` / `@vitejs/plugin-vue`、`tailwindcss` / `daisyui`。
- `npm audit --registry=https://registry.npmjs.org/` 仍为 2 项 moderate（`esbuild <= 0.24.2` / `vite <= 6.4.1`，需 S3 Vite 大版本处理）。

---

### Maintenance S1 · 类型工具链升级（1 commit · `9818c7e`）

> 按维护 backlog 继续推进 S1：先完成类型工具链升级，并顺手补齐最新 PostCSS patch；高风险 Vite / Tailwind 大版本仍保留为后续独立 sprint。

#### Dependencies

- **类型工具链升级**：`@types/node` 22 → 25、`typescript` 5 → 6、`vue-tsc` 2 → 3，`package.json` / `package-lock.json` 同步更新。
- **`postcss` patch 补齐**：`postcss` 8.5.11 → 8.5.12，保持 zero-risk patch 路径。

#### Config

- **TS 6 配置迁移**：移除 `tsconfig.json` 已弃用的 `baseUrl`，把 `paths` 目标从 `src/*` 改为 `./src/*`，保留 `@/*` 别名语义，同时消除 TS 6 `baseUrl` 弃用诊断。

#### Verification

- `npm run type-check` PASS。
- `npm run build` PASS（vite 5.4.21，3489 modules transformed，`vendor-naive` 573.05KB / gzip 159.34KB 保持）。

---

### Maintenance · 依赖体检与 PostCSS patch（1 commit · `0a14a7c`）

> 在文档与部署收尾之后追加一次依赖健康检查，只应用 patch 级 zero-risk 升级，major 跨版本升级进入 maintenance backlog。

#### Dependencies

- **`postcss` 8.5.10 → 8.5.11（commit `0a14a7c`）**：执行 `npm install postcss@8.5.11`，仅落地 patch 级升级；`package.json` / `package-lock.json` 同步更新，不触碰 vite / vue / tailwind 等 major 跨版本依赖。

#### Maintenance

- **新增依赖体检报告（commit `0a14a7c`）**：`docs/maintenance/2026-04-26-deps-health-check.md` 汇总 `npm audit` + `npm outdated`。结论：当前仅 2 项 moderate 漏洞（`esbuild <= 0.24.2` 与 `vite <= 6.4.1`，dev server 场景，生产产物不受影响）；完整修复需 `vite` 5 → 8 + `@vitejs/plugin-vue` 配套大版本升级，本轮不做热修，列入独立 maintenance sprint。
- **升级 backlog 分层**：低风险 `@types/node` / `@vueuse/core` 可单独 PR；中风险 `vue-router` / `pinia` / `typescript` / `vue-tsc` 需配套测试；高风险 `vite` / `tailwindcss` / `daisyui` 建议成套 sprint，重点覆盖 `manualChunks`、base url、auto-import 插件与全视图样式回归。

#### Verification

- `npm run build` + `npm run type-check` 全绿，`vendor-naive` 573KB 不变。

---

### Post Wrap-Up · 文档与部署收尾（5 commits · `a7ec92d` → `bd196db`）

> 在 19 commits 大收尾之后追加的文档体系闭环 + 部署链路静态验证。

#### Docs

- **`README.md` 同步 G10 闭环与 unplugin / auto-import 状态（commit `a7ec92d`）**：技术栈段补 `echarts 6 独立 vendor chunk` + `unplugin-auto-import` + `unplugin-vue-components`（NaiveUiResolver · vendor-naive 1.36MB → 573KB）；项目结构 `main.ts` 注释由「naive-ui + pinia + vue-router 注入」更正为「pinia + vue-router 注入（naive-ui 改为按需引入，详见 vite.config.ts）」；环境变量表加 `VITE_BASE`（生产 `/monitor/` · 开发 `/`）；状态表加 Phase 16 / G10 闭环行（7 个 commit 索引）；「相关文档」段引入 `CHANGELOG.md` / `AGENTS.md` / `HANDOFF.md` / Phase 19 mini API smoke 报告 / Phase 20 计划。
- **`HANDOFF.md` 加 CHANGELOG 引用保持文档体系一致（commit `881af04`）**：「立即可做的事」表格补一行 `CHANGELOG.md` 索引，与 `README.md` 「相关文档」段保持引用一致。

#### Verification

- **Preview base 部署链路验证报告 6/6 PASS（commit `da3819f`）**：`docs/e2e-smoke/2026-04-26-preview-base-smoke-report.md`（94 行）。不依赖 chrome-devtools MCP 的简化版 e2e：用 `vite preview` 模拟 nginx 静态托管 + PowerShell `Invoke-WebRequest` 验证。**6/6 PASS**：`GET /` → 302 redirect 到 `/monitor/`；`GET /monitor/` → 200 + 正确 title；`/monitor/assets/index-*.js` 与 `*.css` → 200；`/monitor/dashboard` 与 `/monitor/topology`（admin route）SPA fallback → 200 (715 bytes index.html)。**关键判定**：(1) vite preview 行为与 nginx `try_files $uri $uri/ /monitor/index.html;` 等价；(2) admin guard 静态层不泄漏（admin 视图代码懒加载 + 前端 `router.beforeEach` 拦截）；(3) `index.html` modulepreload 仅 `vendor-vue` (109KB) + `vendor-http` (38KB) + `vendor-naive` (573KB) + entry，**不含 `vendor-echarts` (538KB)**——证实 manualChunks + 懒加载协同生效。本报告等价于 `docs/plans/2026-04-26-phase7-plus-preparation.md` 14 步矩阵中 「nginx 静态托管」预研项的交付。
- **Dual-server 协议层 e2e 验证报告 8/8 PASS · 1 finding（commit `bd196db`）**：`docs/e2e-smoke/2026-04-26-dual-server-smoke-report.md`（124 行）。同时启 plant-model-gen web_server `:3100` + vite preview `:3200`，PowerShell + `[System.Net.HttpWebRequest]` 验证完整 e2e 协议链路。**8/8 PASS**：双服可达性 + admin login flow（admin/admin → token → `/me` Bearer）+ admin-gated `/api/remote-sync/envs` 鉴权门（无 token `401` / 带 token `200`）+ SSE Bearer 路径头部确认（`200 OK` + `Content-Type: text/event-stream`）+ 公共 `/api/sync/status` `200`。**Finding F-01（低）**：`/api/sync/events/stream` 端点未受 admin middleware 保护，无 token 也返回 `200 + text/event-stream`；与 mini API smoke F-01（`/api/deployment-sites`）属同类问题，建议后端确认设计意图。**四份 e2e 报告组成完整矩阵**（视图渲染 / 后端 API / 前端静态部署 / 双服协议层），仅剩浏览器渲染层（chrome MCP）未覆盖。

#### Post Wrap-Up 累计

- 5 commits（`a7ec92d` → `bd196db`）
- 触及 4 个文件（README.md / HANDOFF.md / docs/e2e-smoke/2026-04-26-preview-base-smoke-report.md / docs/e2e-smoke/2026-04-26-dual-server-smoke-report.md）
- `npm run type-check` 全程 0 errors
- `working tree clean` · 远端 `origin/main` 同步

剩余 Phase 7-Plus 工作收窄到：浏览器渲染层（chrome-devtools MCP）+ SSE 真连接 + admin login 视觉确认 + Phase 20 跨仓 rs-core 真热加载。前端代码 / 部署静态层 / 文档体系层面零阻塞。

---

### Sprint Wrap-Up · 19 commits 累积收尾（`8f32bae` → `da08158`）

本会话围绕 e2e-smoke 报告 §5 的 P2 清单 + Sprint A G8 admin login flow 路由级闭环 + Sprint B 跨仓后端真值验证 + 项目记忆固化，做了一次综合大收尾。视图实现度从 ~95% 推到 **~99.5%**，前端层面所有可独立推进工作全部闭环，仅剩 Phase 7-Plus 浏览器联调（外部 chrome-devtools MCP）+ Phase 20 rs-core 真热加载（跨仓独立会话）。

### Added

- **路由级 admin guard + redirect 闭环（commit `4bc8ecc` + `e96e707`）**：`router/index.ts` 给 5 个 admin 视图（topology / mqtt-nodes / archives / site-config / settings）加 `meta.requiresAdmin = true`；`beforeEach` 守卫拦截未登录访问后写 `sessionStorage.admin_redirect_after_login = to.fullPath`，调 `adminAuth.promptLogin('该页面需要管理员登录')`，跳 `/dashboard`；`LoginDialog` 登录成功后 `consumeRedirectAfterLogin()` 取出 redirect 跳回原视图。从被动 401/403 拦截升级为主动守卫。**G8 真正完整闭环**。
- **SSE Bearer token 双路径（commit `e96e707` + `e5009b6`）**：`useSse` 新增 `getToken?: () => string | null | undefined` 选项。返回非空字符串时切到 `fetch + ReadableStream` 路径并注入 `Authorization: Bearer <token>` 头部，自实现 `parseSseChunk` 解析 SSE 协议（`data:` / `event:` / `id:` / 空行分隔事件），配合 `AbortController` + `onUnmounted` 关流；返回 null 时仍走原生 `EventSource` 兼容旧路径。`LogsView` + `MqttNodesView` 接入 `getToken: () => adminAuth.token`，让 admin-gated SSE 流真生效。
- **AppStatusBar 数据流接通（commit `e5009b6`）**：`LogsView` 在 SSE `onMessage` 解析事件后调 `appStatus.trackEvent()`，驱动顶部 `AppStatusBar` 「事件 N/min」徽标真实反映流量，**G13 数据流闭环**。
- **`useSse` 重连倒计时（commit `a144d0f`）**：暴露 `nextRetryAt: Ref<number | null>`（重连等待中的下次时间戳）。`LogsView` + `MqttNodesView` 各自 `setInterval(1000)` ticker 计算 `retrySeconds = Math.max(0, ceil((nextRetryAt - now) / 1000))`，UI 显示「重连中 #N · Xs 后重试」。
- **MqttNodesView 与 LogsView 双 SSE 状态徽标统一（commit `936a09e`）**：`open` / `connecting` / `error` 三态徽标统一为 dot + 文案样式 + animate-pulse 动效；`error` 状态显示 `#${reconnectAttempt}` 重连次数，取消原本只在 `title` 里隐藏的信息。
- **`unplugin-auto-import` + `unplugin-vue-components`（commit `a144d0f`）**：`vite.config.ts` 接入两个 plugin。`AutoImport`：vue / vue-router 常用 composition API + naive-ui 6 个 hooks（`useDialog` / `useMessage` / `useNotification` / `useLoadingBar` / `useThemeVars` / `useOsTheme`）自动注入；产物 `auto-imports.d.ts`。`Components`：`NaiveUiResolver` 自动注册并 tree-shake naive-ui 组件；产物 `components.d.ts`。`tsconfig.json` include 新增两个 d.ts 让 vue-tsc 识别全局声明；`.gitignore` 排除自动产物。
- **Phase 7-Plus 浏览器联调准备清单（commit `34ac9f9` + `b78cf26`）**：`docs/plans/2026-04-26-phase7-plus-preparation.md`（~250 行），列举 Phase 7（无后端基线）后落的 11 项能力 + 14 步浏览器测试矩阵 + 3 个深入校验（admin login redirect / SSE Bearer token / 后端 stub 真值）+ 验收报告模板 + 故障排查速查表 + 时间盒（增量场景 ~30 min）。后续 commit 同步「后端已就绪 20/20 PASS」前置说明。
- **mini API smoke 验收报告（commit `60097f6`）**：`docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`（224 行），起 plant-model-gen `target/debug/web_server.exe` + ADMIN_USER/PASS env，PowerShell + Invoke-WebRequest 验证 17 项关键 API。**通过判据 17/17**：基础 10 endpoints + admin login flow（POST /login → token → /me → 带 token 访问）+ admin-gated 鉴权门 + B1 set_master/client 主从切换真生效（master → client → master 翻转）+ B2 broker logs ring-buffer（capacity=200, set 操作 2 条记录命中）+ B3 status 9 字段全（含 5 新字段）+ B6 reload 完整分类响应。**前端 axios + Authorization Bearer 路径全程跑通**，确认前端 commits 与后端 Sprint B 鉴权链完全契合。Findings：`/api/deployment-sites` 未走 admin middleware（信息泄露低风险，建议后端确认设计）；SSE B4 推送本次未单独验证（已由后端 verification report 20/20 覆盖）。
- **Phase 20 rs-core 真热加载精细计划（commit `751d6ea`）**：`docs/plans/2026-04-26-phase20-rs-core-true-hot-reload.md`（309 行），把跨仓 B6+ 100% 收尾路径精细化到代码级。§1 改造范围（rs-core/lib.rs:166-219 OnceCell<DbOption> → RwLock<Arc<DbOption>>，含完整 Rust 代码：`load_db_option` / `apply_env_overrides` / `get_db_option` / `set_db_option_from_file`；plant-model-gen reload 升级 hot_changed 真应用 vs static_changed 走 graceful shutdown）。§2 风险与缓解 7 项（含 RwLock poisoned / Arc lifetime / mesh_precision 副作用幂等）。§3 验收（rs-core 单元测试代码模板 + plant-model-gen 手动 smoke 4 步 + 跨仓回归 6 项 checklist）。§4 时间线 ~2.5h。
- **`AGENTS.md` 项目记忆（commit `1d6ce75`）**：230 行 10 章节浓缩本仓所有关键决策与编码约定。包括一句话定位 / 快速启动 / 技术栈速查 / 关键架构决策（admin login flow 完整闭环 / SSE 双路径 / API 三轨收口 / UI 风格规范 / StatusBar 数据流）/ 编码约定 / 关键文件入口表 / 当前实现度（~99% · API 1 轨 · 后端 stub 0 · `.js` 0）/ 10 条「不要做」hot rules / 文档索引 / 5 个最常见任务速查。固化本会话累积成果为可继承记忆。
- **`HANDOFF.md` 1 页交接清单（commit `775042c`）**：71 行，5 秒可扫读交接清单。一句话状态、立即可做的事表（4 行 · 含起手命令）、仓状态、30 秒启动验证（后端 debug 二进制 + 前端 dev + curl 三步）、已闭环 Gap + 禁忌入口、仅剩 2 项、联系入口。

### Refactored

- **`SiteConfigView` legacy `alert()` → inline banner（commit `876c023`）**：关 P2-1。引入 `loadError` / `actionError` / `actionSuccess` 三个 ref + `flashSuccess`（5s 自动清除）/ `setActionError` 工具函数。7 处 `alert()` 全部移除：`loadConfig` 加载失败 → `loadError` banner；`validateConfig` 通过 → `actionSuccess`；`validateConfig` 异常 → `actionError`；`saveConfig` 成功 → `actionSuccess`；`saveConfig` 失败 / 异常 → `actionError`。模板顶部加 3 段 banner div（rose 失败 + emerald 成功 + close button）。`onUnmounted` 清理 `successTimer` 防泄漏。
- **`SiteConfigView` `confirm()` → NDialog Promise wrapper（commit `0b111c1`）**：保存配置的 `window.confirm()` 替换为 `useDialog().warning(...)` Promise wrapper，与 `TopologyView` 删除确认风格一致，关闭 P2-1 残留的破坏性 `confirm`。
- **`TopologyView` legacy alert/confirm → NMessage/NDialog（commit `936a09e`）**：4 处 `alert(...)` 替换为 `message.warning/error(...)`；2 处 `confirm(...)` 替换为 `await confirmDialog(...)` Promise wrapper（含删除环境 / 删除站点二次确认）；删除成功新增 `message.success('已删除环境/站点')` 正反馈。`App.vue` 加 `NDialogProvider` 配套 `useDialog`。
- **`DashCard` error tooltip（commit `936a09e`）**：关 P2-3。`DashboardView` `DashCard` 状态点引入 `NTooltip`，`error` 状态 hover 显完整 `props.error` message（max 320px / pre-wrap），非 error 仍走原生 `title`（info 速递）。
- **`MqttNodesView` broker logs 诚实化（commit `33f7977`）**：`loadLogs` 后端 stub 时返回 `[]` 而非伪造的「MQTT Broker 已启动在端口 1883」假日志，让 UI 的「暂无日志」占位诚实呈现（G6 前端侧补丁）。
- **`SyncTrendChart` 转 ts + echarts 空状态（commit `33f7977`）**：`<script setup lang="ts">` + `defineProps<{ data?: SyncTrendData }>()` 类型化，抽 `buildOption()` + `computed isEmpty`，echarts `graphic` 空状态显示「暂无同步数据」，删除写死的兜底数据 `[12, 18, 15, 24, 20, 28, 32]`。
- **`SettingsView` / `SyncHistoryView` 转 ts（commit `7ff92ac`）**：完整类型签名（`SettingsFormData` / `SettingsErrors` / `FIELD_MAP`）+ `isPlainObject` type guard + `fromBackend(raw: unknown)` 严格收敛 / `HistoryItem` 类型化 + `errorMessage(err: unknown)` 工具函数。`TopologyView` `handleViewSiteDetails` 删除 3 处调试 `console.log`。
- **`TasksView` / `MqttMessagesView` / `ArchivesView` 转 ts（commit `a144d0f`）**：`TaskItem` / `MqttMessage` / `SiteReceiver` / `DataTableColumns` / `PaginationProps` 完整类型化（与 SettingsView/SyncHistoryView 风格一致）。
- **`LogsView` 转 ts（commit `cbc7a68`）**：`LogItem` / `errorMessage` 工具函数 + ref/computed 完整泛型签名。**至此 11/11 视图全部 lang="ts"**，src/ 目录 0 个 plain JS Vue 文件。
- **6 components 转 ts（commit `da08158`）**：`SiteCard.vue`（`Site` / `ChangedFile` interface + `defineProps<>()` + `defineEmits<{...}>()` 类型化 4 emit signatures）、`SyncHistory.vue`（`HistoryRecord`）、`TaskQueue.vue`（`Task`）、`SiteInfoBadge.vue`（`SiteInfo`）、`LogViewer.vue`（`LogEntry`）、`charts/SiteStatusChart.vue`（`Segment`）。**G10 在 components/ 100% 闭环**。
- **`unplugin auto-import` 配套 import cleanup（commit `b9f5fb3`）**：删除 9 处 unplugin 接管的手动 N* / hooks import（`App.vue` 删 `NConfigProvider/NMessageProvider/NDialogProvider`；`LoginDialog.vue` 删 `NModal/NForm/NFormItem/NInput/NButton/NAlert + useMessage`；`SiteCard.vue` 删 `NButton`；6 个视图各删 1 处）。`LoginDialog` `@update:show` 回调参数加 `:boolean` 显式注解，避免自动 import 后类型推导丢失。
- **`vite.config.ts` `manualChunks` 函数化（commit `0b111c1`）**：从静态对象改函数 `(id: string) => chunk`。`echarts + zrender` 单独 `vendor-echarts` chunk（减少首屏）；naive-ui 及其内部依赖（`vooks` / `vueuc` / `seemly` / `treemate`）统一归 `vendor-naive`；显式正则 `[\\/]node_modules[\\/]` 防止深层 transitive deps 漏拆。

### Fixed

- **`vite.config.ts` 生产 base url + router 联动（commit `8f32bae`）**：生产 `base` 默认 `/monitor/`（与 `nginx-plant-collab-monitor.conf` 对齐），可由 `VITE_BASE` env 覆盖；`src/router/index.ts` 改 `createWebHistory(import.meta.env.BASE_URL)` 与 vite base 联动；`src/env.d.ts` 补全 `ImportMetaEnv` 类型（`VITE_BASE` / `BASE_URL` / `MODE` / `DEV` / `PROD`）。
- **TS6310 tsconfig composite + noEmit 冲突（commit `8f32bae`）**：vue-tsc 5.6 自动修复 `composite + noEmit` 不能共存的限制（`tsconfig.json` + `tsconfig.node.json` 各自调整 `noEmit` / `outDir` / `tsBuildInfoFile`），`npm run type-check` 0 errors 通过。
- **`TopologyView` 16 处中文注释乱码还原（commit `8f32bae`）**：批量把 `��` 还原为正常中文。
- **25 处 `console.error` 序列化优化（commit `936a09e`）**：关 P2-6。全部 `console.error('xxx', err)` 改为 `console.error('xxx', err?.message || err)`，避免 `[object Object]` 不友好输出。副带把 `TopologyView` 两处裸 `console.error(e)` 加上语义前缀（'加载环境/站点列表失败'）。

### Docs

- **`README.md` 状态表 / admin login flow 描述 / 项目结构同步（commit `34ac9f9` + `b78cf26` + `a144d0f`）**：「已知约束」表更新到本会话现状（admin login 已闭环、site-config reload 仅诊断、save graceful 待）；新增「admin login flow」章节描述完整闭环路径；「状态」表添加 Sprint A P1-P5 / Sprint C P6/P7 / Phase 12-Plus / Phase 13-15 / Phase 7-Plus / Sprint B 完整路径；「项目结构」composables 列表（3 个 .ts）/ api 加新增 3 个模块 / stores 章节新增 / 视图加 `meta.requiresAdmin` 标注；「相关文档」拆分本仓 / 跨仓两组并加后端验收报告引用。
- 新增 `docs/plans/2026-04-26-phase7-plus-preparation.md`（commit `34ac9f9`）。
- 新增 `docs/plans/2026-04-26-phase20-rs-core-true-hot-reload.md`（commit `751d6ea`）。
- 新增 `docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`（commit `60097f6`）。
- 新增 `AGENTS.md`（commit `1d6ce75`）。
- 新增 `HANDOFF.md`（commit `775042c`）。

### 累计统计

- **19 commits**（`8f32bae` → `da08158`）
- 净 +2875 / -967 行
- 触及 23 个独立文件（11 视图 / 6 components / 3 composables / 9 api / 2 stores / 4 build config / 6 docs）
- `npm run type-check` 全程 0 errors
- `working tree clean` · 远端 `https://github.com/happyrust/plant-collab-monitor.git` 同步

### 视图实现度推进

| 节点 | 加权平均 |
|---|---|
| 起点（会话前） | ~95% |
| **本会话最终** | **~99.5%** |
| Phase 7-Plus 浏览器联调通过后 | ~99.7% |
| Phase 20 rs-core 真热加载后 | 100% |

### Gap 关闭情况

| Gap / P2 | 状态 |
|---|---|
| G1 API 三轨收口 | ✅ Sprint A P4 |
| G2 路径修复 | ✅ Sprint A P1 |
| G3 deploymentSitesApi | ✅ Sprint A 初始 |
| G4 Dashboard 重写 | ✅ Sprint A P2 |
| G5 Settings 闭环 | ✅ Sprint A P3 |
| G6 后端 7 个 MQTT stub | ✅ 后端 Sprint B B1-B7（20/20 PASS）+ 前端 broker logs 诚实化 |
| G7 site-config 写操作 | ✅ B5 graceful shutdown + B6 reload 诊断（B6+ 真热加载跨仓 rs-core 待）|
| **G8 admin login flow** | ✅ **完整闭环**（路由 guard + redirect + SSE Bearer token + axios interceptor）|
| G9 useSse 重连/心跳 | ✅ + 倒计时 UI |
| **G10 JS/TS 混合** | ✅ **100%**（11 视图 + 6 components + 3 composables + 2 stores + 9 api 全 ts）|
| G11 5 个孤儿组件 | ✅ Phase 6 |
| G12 e2e-smoke 验收报告 | ✅ Phase 7 + Phase 19 mini API 17/17 PASS |
| G13 顶部 StatusBar | ✅ UI + 数据流闭环 |
| G14 MIGRATION + deploy.sh | ✅ Phase 6 |
| **P2-1/2/3/4/6** UI 优化 | ✅ |

---

## 早期版本（Phase 1-12-Plus · 2026-04-22 ~ 2026-04-26）

> 详细演进见 git log；以下仅记录关键里程碑：

- **Phase 1-2（Sprint A P1）**：incrementalApi.ts（11 endpoint）+ MqttMessages 路径修复（`/api/incremental/history` → `/api/mqtt/messages`）+ ArchivesView 迁入 incrementalApi（commit `db58e94`）。
- **Sprint A P2 Dashboard 重写**：6 卡片 + `useDashboardSummary` 并发调度 + `SyncTrendChart` + `SiteStatusChart` 接入（commit `7531c37`）。
- **Sprint A P3 Settings 闭环**：`onMounted` load + save 通后端 + 失败显示后端 message（commit `5361fe3`）。
- **Sprint A P4 API 三轨收口**：5 视图裸 fetch → axios，`useApi.js` 删除（commit `d14f39a`）。
- **Sprint A P5 顶部 AppStatusBar**：4 项胶囊徽标 + 30s 轮询 + `RouterLink` 跳转（commit `c2a0457`）。
- **Sprint A Step 1.2 admin login**：`adminAuthApi` + `http.ts` interceptor + `LoginDialog.vue` + `adminAuth` store + `App.vue` 顶层 token provider（commit `1b549bf`）。
- **Sprint C Phase 6 frontend wrap-up**：useFormatters → ts + 孤儿组件清理 + `scripts/deploy.sh`（commit `4a81e3f`）。
- **Sprint C Phase 7 e2e-smoke 验收**：11/11 视图 chrome-devtools 截图 + 报告（commit `c088fa9`，2026-04-26 凌晨）。
- **Phase 12-Plus（B4 跨仓闭环）**：`MqttNodesView.vue` 订阅 SSE 自动 reload，5s 轮询降到 30s 兜底（commit `e9aab96`，2026-04-26 凌晨）。

---

## 仓库

- 远端：https://github.com/happyrust/plant-collab-monitor
- 最新记录到：`5286e88`（Phase 7-Plus 真实浏览器联调首轮执行）
