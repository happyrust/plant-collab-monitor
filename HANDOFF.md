# HANDOFF · plant-collab-monitor 当前状态（2026-09-16）

> 5 秒钟交接清单。详细背景看 `AGENTS.md` / `README.md` / `docs/plans/`。

---

## 一句话

前端观测面 ~99% · **部署动作面已接入 `/topology`（2026-09-14，含「从 DbOption 导入」）** · 后端 Sprint B 100% · **本机双站点 e2e smoke 已跑通：中继模式下 24/24，站点不再需要 SurrealDB（2026-09-15）** · **四层自动化用例全覆盖，并有一份真浏览器 + 真后端跑出来的操作教程（2026-09-16）**。

---

## 立即可做的事

| 想做什么？ | 起手命令 / 文档 |
|---|---|
| **看异地部署功能的下一步计划（已批准）** | `docs/plans/2026-09-14-remote-deploy-next-step-plan.md` |
| **跑部署动作面自动化用例（无需后端）** | `docs/e2e-smoke/remote-deploy-auto-test-cases.md` → `npm run smoke:topology-deploy`（pmg + pws 各 16 例）；真后端只读 `npm run smoke:topology-deploy:live` |
| **看 / 重出异地部署操作教程（19 张图，每步对应 DA 用例）** | `docs/tutorials/topology-deploy-tutorial.md`；改了 `/topology` 先 `npm run smoke:topology-deploy`，再 `npm run tutorial:topology-deploy` 重出图 + 文；Word 版 `node scripts/generate-remote-collab-docx.mjs docs/tutorials/topology-deploy-tutorial.md` |
| **要一份「真后端实操」的教程 / Word（16 张图，截图里都是真响应）** | 先起本机两站（`COMMANDS.md`），再 `npm run tutorial:topology-deploy:live -- --api http://127.0.0.1:4100 --peer http://127.0.0.1:4101` → `docs/tutorials/topology-deploy-live-tutorial.md`，Word 版 `npm run docx:topology-deploy:live`。它**会真的改后端**（建 env、激活、写 `DbOption.toml`），跑完自动复原，**只对隔离环境跑** |
| **跑本机双站点 smoke（中继模式 · 24 项 · 已 24/24）** | `powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -Force`（生成 site-a/site-b 配置 + 工程副本 + 启动器 + 前置检查；**默认 `-Backend pws`**，要回旧后端加 `-Backend pmg`）→ 按 `../plant-model-gen/runtime/local-collab/COMMANDS.md` 起 Mosquitto / Site A / Site B → `scripts/local-remote-collab-smoke.ps1`；**不需要 `surreal`**。站点后端是 `../plant-web-server`（`cargo build --bin plant-web-server`）。复跑命令与结果见 `docs/e2e-smoke/2026-09-15-sqlite-only-collab-smoke-report.md` §4 / §3.5，细节 `docs/e2e-smoke/local-remote-collab-test-plan.md` |
| 跑一次浏览器 e2e 联调 | 起后端 → `npm run smoke:phase7-plus`（`docs/plans/2026-04-26-phase7-plus-preparation.md`） |
| 看 mini API smoke 实证 | `docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`（17/17 PASS） |
| **看完整变更日志** | [`CHANGELOG.md`](./CHANGELOG.md) |
| 加新视图 / API / SSE | `AGENTS.md` §10 速查表 |

---

## 仓状态

```
git remote: https://github.com/happyrust/plant-collab-monitor.git
上一次推送: 2026-09-16 晚 · docs(plan): SQLite-only 中继方案补「后记」——实现已搬进 plant-web-server、plant-model-gen 那份已删
                 ↑ 同日白天已推的 5 个提交：e36de79 后端建仓 · 3ad5f7b 中继搬进 plant-web-server · cabebd6 smoke 换后端三跑 24/24 · 5a18042 站点后端收敛 · 19e3e60 远端说明
                 ↑ 更早一推把 093ada9 之后积压的 13 个提交一次推完（2026-09-14 部署动作面、2026-09-15 中继模式 24/24、教程、.gitattributes 等）
本地与 origin/main: 一致，工作树无本仓待提交改动
type-check: 0 errors（2026-09-16 `npm run type-check` 实跑，5 s）

站点后端 ../plant-web-server: https://github.com/happyrust/plant-web-server（**私有**），HEAD = origin/main
旧后端 ../plant-model-gen:   2026-09-16 建的本地 git 仓（6 条提交），**故意不建远端**——这个仓待废弃
```

---

## 先看清楚后端是谁

> **2026-09-16 起，异地协同的站点后端是 `../plant-web-server`**（中继实现在它的 `src/relay/`）。`plant-model-gen` 待废弃：它已经没有中继，只剩完整站点那条路径。下面这一段讲的是 `:3100` 上那个历史实例，仍然有效。

- 本机 `:3100` 现在跑的是 **`../plant-web-server`**（`D:\Rust\target\release\plant-web-server.exe`，2026-09-09 起，`--repo-root ../plant-model-gen --config db_options/DbOption-cursor`，`mode: standalone-real`）。它的 remote-sync 数据在 `plant-web-server/runtime/remote_sync/`，已有 4 个 env（2026-05-23/24 smoke 留下的 `Smoke Env` / `Persistence Env`）。
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

---

## 联系入口

- 异地部署计划与决策记录：`docs/plans/2026-09-14-remote-deploy-next-step-plan.md` §0
- 后端路由源码（端点以此为准）：`../plant-model-gen/src/web_server/remote_sync_handlers.rs::create_remote_sync_routes()`、`mod.rs`
- 历史后端文档（`../plant-model-gen/docs/**`）在当前 checkout 不存在，README「跨仓」表仅作历史记录
