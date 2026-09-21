# HANDOFF · plant-collab-monitor 当前状态（2026-09-21）

> 5 秒钟交接清单。详细背景看 `AGENTS.md` / `README.md` / `docs/plans/`。

---

## 一句话

前端观测面 ~99% · **部署动作面已接入 `/topology`（2026-09-14，含「从 DbOption 导入」）** · 后端 Sprint B 100% · **本机双站点 e2e smoke 已跑通：中继模式下 24/24，站点不再需要 SurrealDB（2026-09-15）** · **四层自动化用例全覆盖，并有一份真浏览器 + 真后端跑出来的操作教程（2026-09-16）** · **中继台账 `/ledger` 视图：点任意一次广播看 RefNo 级变更清单，双站点 smoke 扩到 25/25（2026-09-17）** · **监控台自带「协同配置向导」`/guide`：8 步照着学配异地协同，每步判定对着后端实时算，「去页面操作」在 `/topology` 真实按钮上打聚光灯；开发态默认管理员自动登录（2026-09-21）** · **删环境级联删站点收口：pws 级联 + 启动清孤儿，LF-08 断言无孤儿，对 Site A 9/9（2026-09-21 晚）**。

---

## 立即可做的事

| 想做什么？ | 起手命令 / 文档 |
|---|---|
| **看异地部署功能的下一步计划（已批准）** | `docs/plans/2026-09-14-remote-deploy-next-step-plan.md` |
| **在网页里照着学怎么配异地协同（`/guide`，2026-09-21）** | 起 dev（开发态默认 `admin/admin` 自动登录，不再弹框）→ 侧栏「配置向导」：8 步每步「为什么 / 点哪里 / 填什么 / 完成判定（对着后端 15 s 刷）」，「去页面操作」跳 `/topology?tour=<id>` 在真实按钮上打聚光灯。内容 `src/guide/collabGuide.ts`，约定 `AGENTS.md` §4.7 |
| **跑真后端完整闭环 LF-00–08（会写后端，只对隔离配置）** | 起 Site A（`COMMANDS.md`）→ `node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100 --mode full --confirm-writes --report docs/e2e-smoke/topology-deploy-live-full-pws-relay-result.json`；2026-09-21 起 LF-08 断言后端级联删站点无孤儿（pws ≥ `afff42f`），并把激活写进 `DbOption.toml` 的五个键按开跑前 `site/info` 原值写回（恢复卡激活 + 二次激活核 `changed=false`）、运行态 / 账面标记分别还原；本站 `location_dbs` 为空的站（如 Site B）**拒跑 full**——pws 不写空数组，写不回 `[]`。用了别人正在操作的站点（Site A 走向导时）就别跑，另起隔离实例 |
| **在网页里学 / 改「协同配置向导」（`/guide`，2026-09-21 已落地）** | `npm run dev` → `http://localhost:4000/guide`（开发态默认自动登录，不用再敲 `admin / admin`；生产构建要开需 `VITE_ADMIN_AUTO_LOGIN=1`）。8 步文案与判定口径在 `src/guide/collabGuide.ts`，页面 `src/views/CollabGuideView.vue`，导览 `src/stores/guideTour.ts` + `src/components/GuideTourOverlay.vue`（`AGENTS.md` §4.7）。改 `/topology` 的按钮**别丢 `data-tour`**；回归 `npm run type-check` + `npm run smoke:topology-deploy -- --build`（pmg / pws 各 16 例） |
| **看 / 跑中继台账「变更清单」视图（`/ledger`，2026-09-17 已落地）** | 方案与执行记录 `docs/plans/2026-09-17-relay-ledger-read-api-plan.md` §8；mock 用例 `npm run smoke:relay-ledger`（RL-01–08，缺 dist 自动 build，改了视图加 `-- --build`）；真后端只读 `npm run smoke:relay-ledger:live -- --api http://127.0.0.1:4100`（RL-L0–L3，先按 `COMMANDS.md` 起 Site A）；双站点 smoke 现在 **25 项**（LS-25 核读侧 API 与 sqlite3 一致）。后端要 pws ≥ `b61b7ca`，否则视图显示「该后端不提供台账 API」 |
| **跑部署动作面自动化用例（无需后端）** | `docs/e2e-smoke/remote-deploy-auto-test-cases.md` → `npm run smoke:topology-deploy`（pmg + pws 各 16 例）；真后端只读 `npm run smoke:topology-deploy:live` |
| **看 / 重出异地部署操作教程（19 张图，每步对应 DA 用例）** | `docs/tutorials/topology-deploy-tutorial.md`；改了 `/topology` 先 `npm run smoke:topology-deploy`，再 `npm run tutorial:topology-deploy` 重出图 + 文；Word 版 `node scripts/generate-remote-collab-docx.mjs docs/tutorials/topology-deploy-tutorial.md` |
| **要一份「真后端实操」的教程 / Word（16 张图，截图里都是真响应；2026-09-18 起按 plant-web-server 中继语义写）** | 先起本机两站（`COMMANDS.md`），再 `npm run tutorial:topology-deploy:live -- --api http://127.0.0.1:4100 --peer http://127.0.0.1:4101` → `docs/tutorials/topology-deploy-live-tutorial.md`，Word 版 `npm run docx:topology-deploy:live`。它**会真的改后端**（建 env、激活写 `DbOption.toml` 五个键并起中继），跑完自动复原（env / 运行态 / 账面标记 / 文件写回原值并二次激活核 `changed=false`），**只对隔离环境跑**；后端不是 plant-web-server（`identity.mode = detached` + `runtime/status` 带 `relay`）会直接拒跑 |
| **跑本机双站点 smoke（中继模式 · 25 项 · 已 25/25）** | `powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -Force`（生成 site-a/site-b 配置 + 工程副本 + 启动器 + 前置检查；模板与产物**都在 `../plant-web-server`**：模板 `db_options/DbOption.toml`，产物 `runtime/local-collab/`，2026-09-18 起不再碰 `plant-model-gen`）→ 按 `../plant-web-server/runtime/local-collab/COMMANDS.md` 起 Mosquitto / Site A / Site B → `scripts/local-remote-collab-smoke.ps1`；**不需要 `surreal`**。站点后端是 `../plant-web-server`（`cargo build --bin plant-web-server`）。复跑命令与结果见 `docs/e2e-smoke/2026-09-15-sqlite-only-collab-smoke-report.md` §4 / §3.5–3.6，细节 `docs/e2e-smoke/local-remote-collab-test-plan.md` |
| 跑一次浏览器 e2e 联调 | 起后端 → `npm run smoke:phase7-plus`（`docs/plans/2026-04-26-phase7-plus-preparation.md`） |
| 看 mini API smoke 实证 | `docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`（17/17 PASS） |
| **看完整变更日志** | [`CHANGELOG.md`](./CHANGELOG.md) |
| 加新视图 / API / SSE | `AGENTS.md` §10 速查表 |

---

## 仓状态

```
git remote: https://github.com/happyrust/plant-collab-monitor.git
上一次推送: 2026-09-21 晚 · fix(guide) 向导实跑（Site A / B 全程 3 → 8 步）后三处修正——探测结果记 sessionStorage 且 /topology 上测的也算（src/guide/probeMemory.ts）、「新建」预填补回 /assets/archives、第 6 步文案补 dev 下 200 误报（本条 HANDOFF 在这一提交里）
                 ↑ 同日稍早已推：4395a43 live smoke 形状识别先认 pws + LF-08 写回 DbOption.toml · 214a7ad 删环境级联删站点收口——LF-08 改「直接删 env → 回查无孤儿」断言 + AGENTS §4.3.2 / CHANGELOG / 用例文档 / 教程附录对齐（配 pws afff42f，已推）
                 ↑ 同日更早已推：cce1e92 仓状态 · 4ccb8d5 feat(guide) 新视图 /guide「协同配置向导」+ 页面内高亮导览 · fca8a27 feat(auth) 开发态管理员默认自动登录
                 ↑ 2026-09-18 早已推：43cfcf5 docx 生成器排版五处修正（Word 版实操教程重出并逐页检查；usage-guide.docx 从此打得开）
                 ↑ 同日更早已推：a789940 弹窗文案按现行语义 · d8a8349 真后端实操教程改按 pws 中继语义重出（16 图） · 061e3df / 6de2f3d 文档对齐 + 仓状态（配 pws 7997ddd 探测真探）
                 ↑ 同日更早已推：c1c6424 双站点环境不再依赖 plant-model-gen（配 pws d7da7b3） · 6e2d04e / 279edd4 仓状态与旧环境已删
                 ↑ 同日更早已推：0f594bf feat /ledger 视图 + relayLedgerApi · 24c8617 test RL-01–08 / RL-L0–L3 + LS-25（25/25） · a892b6e docs 方案执行记录 / CHANGELOG / 报告 §3.6 · 182cce5 仓状态
                 ↑ 2026-09-17 早已推：f1475de 台账读侧方案 P0 执行记录（pws b61b7ca）+ CHANGELOG
                 ↑ 2026-09-16 晚已推：1a9eb39 方案「后记」 · 0b2a1ee activate 应用 env（pws 581052a） · 0560f58 relay 单测 19/19（pws d8a9ca4） · dd0cd5d 台账读侧方案草案
                 ↑ 同日白天已推的 5 个提交：e36de79 后端建仓 · 3ad5f7b 中继搬进 plant-web-server · cabebd6 smoke 换后端三跑 24/24 · 5a18042 站点后端收敛 · 19e3e60 远端说明
                 ↑ 更早一推把 093ada9 之后积压的 13 个提交一次推完（2026-09-14 部署动作面、2026-09-15 中继模式 24/24、教程、.gitattributes 等）
本地与 origin/main: 一致，工作树无待提交改动
type-check: 0 errors（2026-09-21 晚 `npm run type-check` 实跑，5.7 s）；mock smoke `npm run smoke:topology-deploy -- --build` pmg 16/16 · pws 16/16

站点后端 ../plant-web-server: https://github.com/happyrust/plant-web-server（**私有**），HEAD = origin/main = afff42f（2026-09-21 DELETE envs/{id} 级联删站点 + 启动清孤儿），再前 7997ddd（2026-09-18 探测端点真探 + generated_id 不撞号；同日 d7da7b3 自带 db_options/DbOption.toml、--repo-root 缺省为自身；再前 b61b7ca 台账读侧 API）。**编译要钉 `cargo +nightly-2026-07-21`**：默认 nightly 2026-09-18 编 `diskann-wide 0.54.0`（surrealdb 传递依赖）报 E0283 ×6；两站进程占着 `D:\Rust\target\debug\plant-web-server.exe` 时 `build` 会在最后替换 exe 那步报「拒绝访问」，改 `check` 或先停两站
旧后端 ../plant-model-gen:   2026-09-16 建的本地 git 仓，HEAD 76b39f6（2026-09-18 删掉本机双站点环境），**故意不建远端**——这个仓待废弃；工作树里只剩 sqlite_spatial_api.rs 那份与本线无关的 WIP
```

---

## 先看清楚后端是谁

> **2026-09-16 起，异地协同的站点后端是 `../plant-web-server`**（中继实现在它的 `src/relay/`）。`plant-model-gen` 待废弃：它已经没有中继，只剩完整站点那条路径。下面这一段讲的是 `:3100` 上那个历史实例，仍然有效。

- 本机 `:3100` 现在跑的是 **`../plant-web-server`**（`D:\Rust\target\release\plant-web-server.exe`，2026-09-09 起，`--repo-root ../plant-model-gen --config db_options/DbOption-cursor`，`mode: standalone-real`）。它的 remote-sync 数据在 `plant-web-server/runtime/remote_sync/`，已有 4 个 env（2026-05-23/24 smoke 留下的 `Smoke Env` / `Persistence Env`）。**2026-09-18 起 `--repo-root` 缺省就是 `plant-web-server` 自己**、配置模板随仓自带（`db_options/DbOption.toml`），下次重起这个实例不必再指向 `plant-model-gen`（它那份 `DbOption-cursor` 是模型库全量配置，不是站点后端要的）。
- `plant-model-gen/web_server` 与它路由相同、**响应形状不同**，见 `AGENTS.md` §4.3.2；监控台已两边兼容。
- 对着 `:3100` 点「激活 / 应用 / 停止运行时」会改真后端的状态，联调前先确认这是不是你要的实例。

## 启动验证（前置说明）

后端 `plant-model-gen` **2026-09-16 起是 git 仓了**（本地仓，6 条提交，**没有配 remote、没有推送**——故意不建远端，见「仍欠」第 5 条）。此前它一直不在版本管理里，中继模式那批改动只有 `runtime/backup-2026-09-15/` 兜底；现在 `git log` 里第 2 条就是那批改动的完整 diff，第 3 条是 `db_index` 的 `spawn_blocking`，最后一条 `ac46e70` 又把这边的中继实现删掉了（搬去 `plant-web-server`）。`cargo` 的 target 在 `D:\Rust\target`（`CARGO_TARGET_DIR`），2026-09-14 已编出 `D:\Rust\target\debug\web_server.exe`（`web_server,mqtt`，142 MB）。`Cargo.toml` 的 `[patch]` 依赖同级目录 `../rs-core`、`../pdms-io-fork`（缺则 `git clone --depth 1 --branch dev-3.1 https://github.com/happyrust/pdms-io.git ../pdms-io-fork`）。

```powershell
# 1. 编译后端（必须带 mqtt，否则 activate 的 MQTT 订阅分支为空）
cd D:/work/plant-code/plant-model-gen
cargo build --bin web_server --features web_server,mqtt

# 2. 起后端（在用户自己的终端里，长驻进程；:3100 已被 plant-web-server 占用时换端口）
$env:ADMIN_USER='admin'; $env:ADMIN_PASS='admin'; $env:WEB_SERVER_PORT='3101'
D:\Rust\target\debug\web_server.exe    # 配置取 db_options/DbOption.toml（DB_OPTION_FILE 可覆盖）

# 3. 前端
cd D:/work/plant-code/plant-collab-monitor
npm ci
npm run dev   # → http://localhost:4000

# 4. 验证
curl http://localhost:3100/api/site/info
curl -X POST http://localhost:3100/api/admin/auth/login -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"admin\"}'
```

---

## 已闭环（不要重做）

`G1`-`G14` + `P2-1/2/3/4/6` 全部 ✅；2026-09-14 部署动作面（`remoteSyncApi` apply / activate / test-* / runtime / updateSite / importEnvFromDbOption + `TopologyView` 按钮，含「从 DbOption 导入」）✅；`deploymentSitesApi` 已收敛为 `list / get` ✅。**禁止重新引入** `useApi.js` / 视图裸 `fetch()` / `alert()` / `confirm()` / 写死兜底假数据 / 手动 import 已 auto-import 的 hooks / **后端不存在的 API 方法**。详见 `AGENTS.md` §4.3 / §8。

---

## 仍欠

1. ~~**P3 本机双站点 smoke**~~ → 2026-09-15 已跑通：转中继模式（`sync_relay_mode = true`）后**不再需要 `surreal`**，只要 Mosquitto（`winget install --id EclipseFoundation.Mosquitto -e`，装完是常驻服务）+ 两个 `web_server`；smoke 扩到 24 项，22:23 首绿、23:33 复验连跑两次 **24/24**。两个长驻站点进程仍要在你自己的终端里起（见 `COMMANDS.md`），复跑命令见 `docs/e2e-smoke/2026-09-15-sqlite-only-collab-smoke-report.md` §4。**注意**：`auto_start_surreal = false` 只是不自己拉起 surreal，进程照样会连 `[surrealdb]` 配的地址并失败（约 15 s 重试，随后「review 专用数据库…可能不可用」）——中继链路不受影响，但依赖 SurrealDB 的接口在这套环境里用不了。
2. ~~`/topology` 的「从 DbOption 导入」按钮~~ → 2026-09-14 晚已落地（确认弹窗 → `importEnvFromDbOption()` → 刷新并选中；mock 用例 DA-16）。
3. ~~部署动作面新按钮尚未进浏览器 smoke~~ → 已由 `scripts/topology-deploy-smoke.mjs`（mock，DA-01–16）+ `scripts/topology-deploy-live-smoke.mjs`（真后端 LR/LF）覆盖；`phase7-plus-smoke.mjs` 仍只管 11 视图 + login + SSE。**四层用例 2026-09-16 已全部覆盖**：L1 mock（DA-01–16）、L2 只读（LR-00–06，对中继 pmg 三跑各 7/7）、**L3 完整闭环（LF-00–08，对中继 pmg 9/9，`docs/e2e-smoke/topology-deploy-live-full-relay-result.json`）**、L4 双站点（24/24）。L3 会真改 `DbOption.toml` 并重启 watcher + MQTT，**只在 `runtime/local-collab` 这类隔离配置上跑**，命令要带 `--mode full --confirm-writes`，报告路径也要另给（别覆盖 2026-09-14 那份 pws 的）。
4. 工作区 57 个文件在 Windows 上是 CRLF（索引一律 LF，`.gitattributes` 已固定）；git 视为干净，不必处理；想让工作区也统一成 LF，在**没有未提交改动**时跑 `git rm -r --cached . ; git reset --hard`。
5. ~~**`plant-model-gen` 不在版本管理里**~~ → 2026-09-16 已建本地 git 仓（6 条提交）。`plant-web-server` 同日也补了首次提交（此前有 `.git` 但**一条提交都没有**，13000 多行全 untracked），并已推到 https://github.com/happyrust/plant-web-server（**私有**——要转公开 `gh repo edit happyrust/plant-web-server --visibility public`）。`plant-model-gen` **故意没有远端**：这个仓待废弃，盘坏了就没了，心里有数。
6. ~~**中继模式下站点仍会去连 SurrealDB 并失败**~~ → 2026-09-16 换了根治路径：**中继实现已搬进 `plant-web-server`**（`src/relay/`，约 2800 行），站点后端改用它，不再拖着模型库 / 校审那半个产品，那 15 s 重试与「review 专用数据库初始化失败」随之消失。
7. ~~**本机双站点 24 项 smoke 还没换到新后端**~~ → 2026-09-16 已换：`local-remote-collab-setup.ps1` 默认 `-Backend pws`，两站都用 `plant-web-server.exe`，**同一对进程里连跑三次 24/24**（见报告 §3.5，结果 JSON `docs/e2e-smoke/local-remote-collab-smoke-result-pws.json`）。换的过程括出并修掉三个缺陷，其中「重新激活会把 MQTT 订阅弄死（`Unsolicited pubrel`）」那条 **`plant-model-gen` 里那份同样有**。
8. ~~**`plant-model-gen` 里那份中继实现还留着**~~ → 2026-09-16 已删：`relay_sync.rs`、`relay-sync` feature、`e3d-io` 依赖、`sync_relay_mode` 开关全部移除，`activate` 回到「永远 `ensure_surreal_init` + `watch_incremental`」。`sync_ledger` / `mqtt_file_sync` / `SyncE3dFileMsg`（含 `file_sesnos`）留着——完整站点仍要收发 MQTT 源文件并记这本账，线格式也要跟 `plant-web-server` 保持兼容。`cargo check --bin web_server --features web_server,mqtt` 通过（2 m 45 s）。
9. ~~**中继台账读侧只做了后端（P0，pws `b61b7ca`）**~~ → 2026-09-17 同日 P1 / P2 也落地：`/ledger`「中继台账」视图 + `relayLedgerApi` + mock RL-01–08 / live RL-L0–L3 / 双站点 LS-25（25/25）。方案 §6 的后续建议（台账保留策略、导出、Dashboard 卡、元素级查询、服务端鉴权）仍未立项。
10. ~~**双站点环境仍借着 `plant-model-gen`**（模板、`runtime/local-collab/`、两站 `--repo-root`、CBA 目录）~~ → 2026-09-18 全搬到 `../plant-web-server`：它自带模板 `db_options/DbOption.toml`、`--repo-root` 缺省为自身；setup / smoke 脚本与文档对齐，重生成后 25/25。老环境 `plant-model-gen/runtime/local-collab/`（含 09-15 起的台账）**同日已删**（pmg 本地提交 `76b39f6`：连 `.gitignore` 里为它开的例外、`assets/archives` 里的 fixture 与 `scb6000_0001.cba` 一起清掉；`runtime/backup-2026-09-15/` 与 06-09 的真实 CBA 不动）。监控台对 pmg 响应形状的兼容代码、mock 的 pmg 变体没动——那是兼容，不是依赖。
11. ~~**真后端实操教程只认 plant-model-gen**（`topology-deploy-live-tutorial.mjs` 的闸 + 全篇 pmg 语义）~~ → 2026-09-18 重写为 plant-web-server 中继语义并实跑重出（16 图）：环境 = 本站身份 + 共用 broker；导入卡不带连接参数；激活 = 写五键 + 起中继（响应 `runtime_config.changed` 作证）；应用只落账；停止不回滚配置也不清账面标记；收尾用开跑前 `/api/site/info` 五键建临时卡激活写回、二次激活核 `changed=false`。顺手修了两处 pws：**探测真探**（`test-mqtt` TCP `mqtt_host:mqtt_port`、`test-http` GET `file_server_host`、站点 GET `<http_host>/metadata.json`；此前监控台建的 env 恒「不可达」，09-14 报告第 1 条）与 **`generated_id` 同秒撞号**（同一秒建两个站点第二个悄悄替换第一个）。监控台三处确认弹窗文案（导入 / 应用 / 激活）也改成两种后端的现行语义。
12. ~~**「删环境级联删站点」WIP 未收口**~~ → 2026-09-21 晚已收口：pws `afff42f`（`DELETE envs/{id}` 级联删该 env 的站点，响应带 `deleted_sites / deleted_site_count`；启动时清掉父 env 已不存在的孤儿站点，无 `env_id` 的行不动）+ 本仓同日 fix(topology-deploy) 提交（LF-08 改「直接删 env → 回查 `envs/{id}/sites` 为 0」断言 `noOrphanSites`；AGENTS §4.3.2 / CHANGELOG / 用例文档 §4 §6 / 09-14 报告第 4 条 / 教程附录 A 对齐）。对 Site A 实跑 LF-00–08 **9/9**（`docs/e2e-smoke/topology-deploy-live-full-pws-relay-result.json`），启动清孤儿另起 `:4199` 临时实例验证（4 行 → 2 行）。这一跑暴露的两条**同晚已改**（见 CHANGELOG 2026-09-21「Changed · live smoke」）：① 形状识别先认 pws 记号（`mode / running / relay`），不再把带 boolean `active` 的 pws 认成 `pmg`；② 教程脚本那套「临时恢复卡激活写回 + 二次激活 `changed=false`」搬进 LF-08，运行态 / 账面标记分别还原，`location_dbs` 为空的站拒跑 full。对隔离临时实例 `:4199` 复跑 9/9、`DbOption.toml` SHA 跑前跑后一致（Site A 当时有人在走向导，没去碰）；Site A 空下来后再跑一次 **9/9**，`site-a/DbOption.toml` 自己写回、SHA 与跑前一致，活动任务 24 → 27（结果 JSON 就是这一跑）。两仓当晚都已推。

---

## 联系入口

- 异地部署计划与决策记录：`docs/plans/2026-09-14-remote-deploy-next-step-plan.md` §0
- 后端路由源码（端点以此为准）：`../plant-web-server/src/standalone_runtime.rs` 的 `.route(...)` + `standalone_services.rs::RemoteSyncService::handle`（旧 `plant-model-gen/src/web_server/remote_sync_handlers.rs` 仅作形状参考）
- 历史后端文档（`../plant-model-gen/docs/**`）在当前 checkout 不存在，README「跨仓」表仅作历史记录
