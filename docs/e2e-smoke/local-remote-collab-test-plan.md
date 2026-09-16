# 本机异地协同双站点测试计划

> 目标：在一台 Windows 开发机上模拟两个异地协同站点，验证 Site A 能通过 HTTP + MQTT 发现、诊断并激活 Site B，
> 并且（2026-09-15 起）在**没有任何 SurrealDB** 的机器上，A 的源 db 文件变更能经 MQTT 广播到 B、被 B clone 并校验入账——
> 即 `docs/plans/2026-09-15-sqlite-only-remote-collab-plan.md` 的「SQLite-only 中继模式」端到端。

## 1. 测试分层

本测试不替代真实现场联调，定位是提交前和本地回归。

| 层级 | 目标 | 工具 |
|---|---|---|
| 单后端 API 基线 | 确认单个 `web_server` 的协同 API、MQTT 状态、SSE 可用 | `../plant-model-gen/shells/smoke-collab-api.sh` |
| 双后端本机模拟 | 用两个 `web_server` 模拟主站和从站 | `scripts/local-remote-collab-smoke.ps1` |
| 浏览器 UI 回归 | 验证前端页面能展示拓扑、节点、日志和错误状态 | `npm run smoke:phase7-plus` + 手动页面检查 |

## 2. 本机拓扑

```text
Mosquitto Broker :1883                       （唯一的外部进程；没有 SurrealDB）

Site A web_server :4100   sync_relay_mode = true
  location = local-a · location_dbs = [6000]（自有库 scb6000）
  project_path = runtime/local-collab/site-a/project（SCB 工程副本）
  file_server_host = http://127.0.0.1:4100/assets/archives   ← 别站来这里下载 A 的 .cba

Site B web_server :4101   sync_relay_mode = true
  location = local-b · location_dbs = []
  project_path = runtime/local-collab/site-b/project（另一份 SCB 副本，A 的广播 clone 到这里）
  file_server_host = http://127.0.0.1:4101/assets/archives

plant-collab-monitor :4000
  VITE_API_TARGET = http://127.0.0.1:4100
```

前端只连接 Site A。Site B 作为 Site A 的远端站点加入协同环境；smoke 的 LS-23/24 也会在 Site B 上激活一个 env，让 B 的 MQTT 订阅起来收 A 的广播。
两个 `web_server` 进程 cwd 都是 `plant-model-gen`，共用其下的 `assets/archives/`（CBA 目录）——这就是为什么 A 的 `file_server_host` 指向 A 自己的 `/assets/archives` 时 B 也能下到。

## 3. 配置隔离要求（由生成器落地）

两份配置由 **`scripts/local-remote-collab-setup.ps1`** 从 `../plant-model-gen/db_options/DbOption.toml` 生成（2026-09-14 起，不再手写）：

```powershell
cd D:\work\plant-code\plant-collab-monitor
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1          # 生成 + 前置检查 + 打印命令
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -Force   # 覆盖重生成
```

产物（全部在 `../plant-model-gen/runtime/local-collab/`，后端不是 git 仓，运行期文件放这里不污染源码）：

| 文件 | 用途 |
|---|---|
| `site-a/DbOption.toml` · `site-b/DbOption.toml` | 隔离配置（python `tomllib` 校验通过），**两站都是 `sync_relay_mode = true`** |
| `site-x/project/<工程>/` | 工程副本：模板 `project_path` 下的 `-IncludedProjects`（默认 `["SCB"]`，19 个文件 · 3 MB）各复制一份，跳过 `cbas/`；两站各读各的，B 收到广播后 clone 写的是自己那份。`-Force` 重新复制；`-ShareProjectPath` 改为两站直接读真实工程（B 的 clone 就会写到真实工程里，慎用） |
| `site-a/start.ps1` · `site-b/start.ps1` | 站点启动器：设 `ADMIN_USER/ADMIN_PASS/WEB_SERVER_PORT`，cwd 切到 plant-model-gen，跑 `D:\Rust\target\debug\plant-web-server.exe --repo-root <plant-model-gen> --config runtime/local-collab/site-x/DbOption`，并设每站一个的 `PLANT_WEB_RUNTIME_DIR`（缺 exe 回落 `cargo run --bin plant-web-server`） |
| `site-x/output/index.html` · `site-x/output/metadata.json` | 文件服务 fixture：`/files/output` 映射到 `output_root`，让 `sites/{id}/test-http`（取 `<http_host>/metadata.json`）探得到 |
| `../plant-model-gen/assets/archives/index.html` | CBA 目录 fixture：`env.file_server_host` 指向 `<site>/assets/archives`，`envs/{id}/test-http` 对它 GET 要 2xx；ServeDir 对目录请求回这个 index.html |
| `mosquitto.conf` · `start-mosquitto.ps1` | `listener 1883 127.0.0.1` + `allow_anonymous true` |
| `COMMANDS.md` | 下面 §4 的命令清单（含绝对路径，smoke 的 `-SiteASqlite/-SiteBSqlite/-RelayFileA/-RelayFileB` 已填好） |

每份配置隔离的键：

| 键 | site-a | site-b |
|---|---|---|
| **`sync_relay_mode`** | `true` | `true` |
| `location` / `[web_server].site_id` / `region` | `local-a` | `local-b` |
| `[web_server].port` / `bind_host` | `4100` / `127.0.0.1` | `4101` / `127.0.0.1` |
| `project_path` / `included_projects` | `runtime/local-collab/site-a/project` / `["SCB"]` | `…/site-b/project` / `["SCB"]` |
| `location_dbs`（自有库，中继只广播这些） | `[6000]`（`scb6000_0001`；`-SiteALocationDbs` 可改） | `[]` |
| `file_server_host`（别站下载本站 CBA 的地址） | `http://127.0.0.1:4100/assets/archives` | `http://127.0.0.1:4101/assets/archives` |
| `deployment_sites_sqlite_path` | `runtime/local-collab/site-a/deployment_sites.sqlite` | `…/site-b/…` |
| `output_root` | `runtime/local-collab/site-a/output` | `…/site-b/output` |
| `[web_server].auto_start_surreal` | `false`（中继模式不需要 SurrealDB；`bin/web_server.rs` 在 `sync_relay_mode = true` 时也会跳过自启动） | 同 |
| `[surrealdb]` / `surreal_bind`（保留隔离，实际不连） | `127.0.0.1:8021` · `site-a/surreal.db` | `127.0.0.1:8022` · `site-b/surreal.db` |
| `gen_model / gen_mesh / gen_spatial_tree` | `false`（免启动期 Scene Tree 构建） | 同 |
| `versioned_storage` | `false` | 同 |

**为什么不再需要 SurrealDB**（2026-09-15 前这里写的是「为什么必须 `auto_start_surreal`」）：以前 `activate` → `start_runtime` 第一步就是 `ensure_surreal_init()` 硬闸，没有 SurrealDB 时 `remote-env-activate` 必失败，而 `web_server.exe` 只编了 `kv-mem`，只能靠 `auto_start_surreal = true` 拉一个外部 `surreal` 子进程。SQLite-only 方案落地后（P1–P3）：`sync_relay_mode = true` 的站点在 `activate` 时跳过这道闸、不跑 `watch_incremental`，改由 `relay_sync` 轮询用 e3d-io 直接读源 db 文件判变更、MQTT 广播；收包端 clone 后按消息里的 hash / sesno 校验；水位与台账全在 `deployment_sites.sqlite`（`relay_sync_watermark` / `e3d_sync_ledger` / `e3d_sync_changes`）。站点因此**不解析入库、不生成几何**，只做源文件分发——这正是本机双站点 smoke 要验的东西。要跑完整站点（有模型库）仍需 SurrealDB，那是另一套环境，不在本计划内。

为什么默认只收 `SCB`：`db_index` 首轮全量扫描随工程大小线性增长，整套 `E3D2.1` 样例（4 个工程、约 530 个 db、约 2 GB）十几分钟都扫不完，而 SCB 的 7 个库 1 s 内扫完；中继链路验的是机制，与库大小无关。

## 4. 启动顺序

每条长驻命令各开一个终端；完整清单见生成的 `COMMANDS.md`。

### 4.0 前置（本机 2026-09-15 实测只缺 Mosquitto）

```powershell
winget install --id EclipseFoundation.Mosquitto -e      # → C:\Program Files\mosquitto（不进 PATH）
cd D:\work\plant-code\plant-web-server; cargo build --bin plant-web-server   # 站点后端（中继 + e3d-io 都在这儿）；已编：D:\Rust\target\debug\plant-web-server.exe
```

不再需要 `surreal`。`sqlite3.exe`（或 `python`）供 smoke 的 LS-23/24 查两站台账，本机已有。

### 4.1 启动 MQTT broker

`winget` 装的 Mosquitto（2.1.2）会注册服务 `mosquitto`（自动启动）常驻 `127.0.0.1:1883`——默认配置零指令即 local-only 模式，允许匿名，本机 smoke 直接用它就行（`Get-Service mosquitto`）。要用生成的配置自己起一个（stdout 出日志）得先 `Stop-Service mosquitto`，否则 1883 绑不上：

```powershell
powershell -ExecutionPolicy Bypass -File D:\work\plant-code\plant-model-gen\runtime\local-collab\start-mosquitto.ps1
```

### 4.2 启动 Site A（:4100 · local-a · 中继 · 自有库 [6000]）

```powershell
powershell -ExecutionPolicy Bypass -File D:\work\plant-code\plant-model-gen\runtime\local-collab\site-a\start.ps1
```

### 4.3 启动 Site B（:4101 · local-b · 中继 · 自有库 []）

```powershell
powershell -ExecutionPolicy Bypass -File D:\work\plant-code\plant-model-gen\runtime\local-collab\site-b\start.ps1
```

验证：`curl http://127.0.0.1:4100/api/site/identity`、`curl http://127.0.0.1:4101/api/site/identity`（`region` 分别是 `local-a` / `local-b`）、`curl http://127.0.0.1:4101/files/output/metadata.json`、`curl http://127.0.0.1:4100/assets/archives/`（200，CBA 目录）。启动日志应有 `⏭️ 跳过 SurrealDB 自启动（auto_start_surreal = false）` 与 `[collab-migrate] e3d_sync_ledger / e3d_sync_changes / relay_sync_watermark 就绪`；activate 后 `runtime/status` 是 `{"active":true,"relay":true}`。

### 4.4 启动前端

```powershell
cd D:\work\plant-code\plant-collab-monitor
$env:VITE_API_TARGET='http://127.0.0.1:4100'
npm run dev
```

## 5. 自动化 smoke

脚本：

```text
scripts/local-remote-collab-smoke.ps1
```

运行（推荐直接抄生成的 `COMMANDS.md` 第 5 步，路径都已填好）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 `
  -SiteABase http://127.0.0.1:4100 -SiteBBase http://127.0.0.1:4101 `
  -FixtureDir D:\work\plant-code\plant-model-gen\runtime\local-collab\site-b\output `
  -MosquittoDir "C:\Program Files\mosquitto" `
  -SiteASqlite D:\work\plant-code\plant-model-gen\runtime\local-collab\site-a\deployment_sites.sqlite `
  -SiteBSqlite D:\work\plant-code\plant-model-gen\runtime\local-collab\site-b\deployment_sites.sqlite `
  -RelayFileA D:\work\plant-code\plant-model-gen\runtime\local-collab\site-a\project\SCB\scb000\scb6000_0001 `
  -RelayFileB D:\work\plant-code\plant-model-gen\runtime\local-collab\site-b\project\SCB\scb000\scb6000_0001
```

2026-09-15 新增 / 变更参数（中继链路 LS-23/24）：

| 参数 | 默认 | 说明 |
|---|---|---|
| `-SiteAArchivesHost` | `<SiteABase>/assets/archives` | 写进 Site A env 的 `file_server_host`。**它的真实语义是「别的站点来我这下载 CBA 的地址」**（A 广播的 `SyncE3dFileMsg.file_server_host` 就是它，B 从 `<它>/<file>.cba` 下载），不是 Site B 的文件服务；`test-http` 对它 GET 要 2xx（生成器放了 `assets/archives/index.html`）。旧参数 `-SiteBFileServerHost` 仍接受，视为它的别名 |
| `-SiteBArchivesHost` | `<SiteBBase>/assets/archives` | 同上，写进 Site B env |
| `-SiteASqlite` / `-SiteBSqlite` | `../plant-model-gen/runtime/local-collab/site-x/deployment_sites.sqlite` | 两站的 SQLite；LS-23 在 A 的 `relay_sync_watermark` 回退水位、查 A 的 `e3d_sync_ledger`；LS-24 查 B 的台账 |
| `-RelayFileA` / `-RelayFileB` | `<site-x>/project/SCB/scb000/scb6000_0001` | 演练文件：A 的源与 B 的副本。文件名（stem）决定回退哪个库；B 的副本会先被追加垃圾字节、clone 后应与 A 的源 SHA256 一致 |
| `-RelayRewindSessions` | `1` | A 水位回退几个会话（回到会话链上不存在的会话时，e3d-io 用 `AtOrBefore` 取更早的保留会话、全量重报，仍算 ok） |
| `-RelayDetectIntervalSec` | `5` | 通过 `PUT envs/{id}/config` 把两个 smoke env 的 `detect_interval` 调成这个值（中继轮询周期），免得等 30 s 一轮 |
| `-RelayTimeoutSec` | `90` | LS-23 / LS-24 各自最多等多久 |
| `-SqliteExe` | 自动探测 PATH 上的 `sqlite3`，再回落 `python` | 都没有时 LS-23/24 记 skipped |
| `-SkipRelay` | 关 | LS-23/24 记 skipped |
| `-SiteBHttpHost` | `<SiteBBase>/files/output` | 写进站点的 `http_host`；后端 `sites/{id}/test-http` 取 `<http_host>/metadata.json`（生成器放了 `metadata.json`）。⚠ 监控台 UI 的浏览器探活用的是 `<http_host>/api/health`，两者对 `http_host` 的期待不一致，属产品层待统一 |
| `-MosquittoDir` | 自动探测 `C:\Program Files\mosquitto` | `mosquitto_pub.exe` 所在目录 |
| `-MqttReceiveTimeoutSec` | `20` | LS-20 等待 `mqtt_connected` 变 true 的上限 |
| `-KeepEnv` | 关 | 不做收尾（不 stop 两站 runtime、不删 smoke 建的站点 / env），LS-22 记 skipped |

env 的 `location_dbs` 不再传 `null`：smoke 先读 `runtime/config` 拿到站点当前的 `location_dbs` 原样写进 env——`activate` 会把 env 的值写回 toml，传 `null` 会把 A 的自有库清成 `[]`，中继就会把收到的别家文件也当自有库再广播出去。

其它参数：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 `
  -SiteABase http://127.0.0.1:4100 `
  -SiteBBase http://127.0.0.1:4101 `
  -MqttHost 127.0.0.1 `
  -MqttPort 1883
```

如果本机没有 `mosquitto_pub`，可以先跳过 MQTT 发布验证：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 -SkipMqttPublish
```

脚本默认会在本仓生成并追加一个二进制 fixture，用它模拟 Site B 产生的增量文件：

```text
runtime/local-remote-collab/site-b-files/local-smoke-increment.e3d
```

每次运行默认追加 `512` 字节随机二进制数据，随后计算该文件的 SHA256，并把文件名与 hash 放入 MQTT `SyncE3dFileMsg`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 `
  -FixtureDir runtime/local-remote-collab/site-b-files `
  -FixtureFileName local-smoke-increment.e3d `
  -AppendBytes 1024
```

这条随机 fixture 不是 Site A 索引里的 db 文件，A 收到后在 `e3d_sync_ledger` 落一行 `inbound / skipped`（`unknown_local_file`），不会 clone——它只证明「消息到达」（LS-20）。真正的下载 + clone + 校验链路由 LS-23/24 用真实 db 文件覆盖（见 §6）。

也可以只验证二进制追加逻辑，不访问任何后端：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 `
  -FixtureOnly `
  -FixtureDir $env:TEMP\remote-collab-fixture `
  -ReportPath $env:TEMP\remote-collab-fixture-report.json
```

默认报告输出：

```text
docs/e2e-smoke/local-remote-collab-smoke-result.json
```

## 6. 验收点（24 项，报告 `checks[]` 顺序即 LS 编号）

| LS | check | 验收点 |
|---|---|---|
| 01 / 02 / 03 | `site-a-port` / `site-b-port` / `mqtt-port` | `:4100` / `:4101` / `:1883` TCP 可连 |
| 04 / 05 / 06 | `site-a-identity` / `site-b-identity` / `site-identity-distinct` | 两站 `/api/site/identity` 成功且 `region` 不同 |
| 07 | `site-a-admin-login` | Site A `admin/admin` 登录拿到 token |
| 08 / 09 | `remote-env-create` / `remote-site-create` | Site A 建 env、把 Site B 加为站点 |
| 10 / 11 / 12 | `remote-env-test-mqtt` / `remote-env-test-http` / `remote-site-test-http` | 三种探测请求成功（响应体里的 `status/reachable` 一并记录） |
| 13 | `remote-env-activate` | `activate` 请求成功——**中继模式下不需要 SurrealDB 也真成功**（2026-09-15 前这一项在没有 SurrealDB 的机器上必失败） |
| 14 | `remote-runtime-status` | 运行时状态可读（多了 `relay: true`） |
| **15** | **`remote-runtime-active-env`**（2026-09-14 新增） | plant-model-gen：`runtime/status.active === true && env_id === 新建 env`；plant-web-server：`envs[].active` 指向新建 env |
| 16 / 17 | `remote-topology` / `mqtt-subscription-status` | 拓扑、MQTT 订阅状态可读 |
| 18 | `incremental-fixture-append` | 二进制 fixture 追加成功，产出大小 + SHA256 |
| 19 | `mqtt-publish-test` | `mosquitto_pub` 向订阅 topic 发布 `SyncE3dFileMsg`（找不到 `mosquitto_pub` 记 skipped） |
| **20** | **`mqtt-received-after-publish`**（新增） | 发布后 ≤ 20s 内 `runtime/status.mqtt_connected === true`——Site A 的订阅任务真的收到了消息（后端收到 Publish 才把 `MQTT_CONNECT_STATUS` 置 true）。发布被跳过 / 后端无该字段 → skipped |
| 21 | `remote-sync-logs` | 同步日志可读（注意：plant-model-gen 的 MQTT 收发台账写的是 SQLite `e3d_sync_ledger`，不写 `remote_sync_logs`，这里只验证端点） |
| **22** | **`runtime-stop-clears-active`**（新增） | `POST runtime/stop` 后 `runtime/status.active === false`；随后删掉 smoke 建的站点与 env（记录在报告 `cleanup`）。`-KeepEnv` 或后端无 `active` 字段 → skipped |
| **23** | **`relay-outbound-ledger`**（2026-09-15 新增，中继链路发包侧） | 步骤（都记在 `details`）：① 在 Site B 登录、建 env（`file_server_host` = B 的 `/assets/archives`）、`detect_interval` 调小、`activate`（`details.site_b.runtime.relay === true`）；② 等 A 的 `relay_sync_watermark` 出现 `-RelayFileB` 对应库的基线行；③ 给 B 的副本追加 `-AppendBytes` 随机字节；④ 把 A 的该库水位回退 `-RelayRewindSessions`（指纹不动，免去一拍去抖）；⑤ ≤ `-RelayTimeoutSec` 内 A 的 `e3d_sync_ledger` 出现该文件的 **`outbound / ok`** 行（`details.ledger` 带 `sesno_from → sesno_to`、`diff_*` 计数、`e3d_sync_changes` 行数）。没 sqlite 工具 / A 未激活 → skipped |
| **24** | **`relay-inbound-ledger`**（2026-09-15 新增，收包侧） | LS-23 之后 ≤ `-RelayTimeoutSec` 内 B 的 `e3d_sync_ledger` 出现同一文件、**`msg_id` 与 A 本轮那条广播相同**的 **`inbound / ok`** 行（broker 上的 retained 消息会让 B 一订阅就先把上一轮的文件收一遍，不锁 `msg_id` 就会拿那一行冒充本轮），且 **`sesno_seen === sesno_to`**（= A 广播时的 `sesno_to`）；B 的副本 SHA256 == `-RelayFileA`（垃圾字节被 A 的 CBA 还原）。LS-23 没过 → skipped；B 没 active → failed。副本没被还原时 smoke 会把它截回原长度，别越叠越脏 |

通过标准：`failed == 0`，即 **≥ 22 passed**（LS-19 / LS-20 允许因缺 `mosquitto_pub` 同时 skipped），`passed: true`。LS-23 / LS-24 是方案 P4 的验收点：两个中继站点、机器上没有 `surreal`，只起 Mosquitto + 两个 `web_server`。

## 7. 注意事项

- Site B 后端不要使用 `4000`，该端口是前端默认 dev server。
- MQTT topic 不要硬编码。脚本会优先从 `/api/mqtt/subscription/status` 读取 `subscribed_topics`。
- 如果 Site A/B 的 `location` 相同，拓扑和节点状态会失去区分度。
- 如果两个实例共用 SQLite 数据文件或工程目录，测试结果不可信：两站必须各自一份 `deployment_sites.sqlite` 与工程副本（生成器默认就是），否则 B 的 clone 会写到 A 正在读的同一个文件上。`assets/archives/`（CBA）两站共用是有意的（A 写、B 从 A 的 URL 下，落到同一目录无害）。
- fixture 文件只模拟“远端增量文件发生变化”。Site A 只会 clone 它本地 watcher 索引里已知的 db 文件名（`file_name_full_path_map`），smoke 的随机 fixture 会落一行 `inbound / skipped`，LS-20 只证明消息到达；真实 clone 链路看 LS-23/24。
- 后端对 MQTT 消息（`mqtt_service::SyncE3dFileMsg`）的反序列化自 2026-09-15 起是 `from_slice` + warn 跳过，坏包不再 panic 掉订阅任务；新字段 `file_sesnos` 是 `#[serde(default)]`，旧格式消息照收（校验降级为 `skipped`）。
- 两站的中继台账都在各自 `deployment_sites.sqlite`：`sqlite3 <db> "SELECT direction, file_name, verify_status, diff_status, sesno_from, sesno_to, sesno_seen FROM e3d_sync_ledger ORDER BY created_at DESC LIMIT 10"`，变更清单在 `e3d_sync_changes`，水位在 `relay_sync_watermark`（`COMMANDS.md` 第 8 步）。
- `activate` 只改写 toml、不热加载：发布 / 订阅客户端的 `mqtt_host` 与消息里的 `location` 用的是进程启动时那份配置。生成器先写好 toml 再起进程就没问题；在 UI 里改了 env 的 broker 再 activate 是不会生效的（既有问题）。
- `phase7-plus` 浏览器 smoke 仍然需要保留，它验证的是前端登录、路由、SSE token 和页面错误，不覆盖双站点真实协同。
- UI 侧复验（计划 P3 第 5 步）改用 `node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100 --mode full --confirm-writes`（LF-00–LF-08），它会改写 `site-a/DbOption.toml` 并重启 Site A 的 watcher + MQTT，只对隔离配置跑。
