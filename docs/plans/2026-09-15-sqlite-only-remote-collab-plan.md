# 异地协同部署「只依赖 SQLite」开发方案 v2 · e3d-io 接入版（2026-09-15）

> 状态：**v2 已批准并已全部实施**（2026-09-15 Plannotator `decision: approved`，无批注；v1 同日早前批准，已被本版替代。P0–P4 同日落地，双站点 smoke 24/24，各阶段「执行记录」在正文）
> **2026-09-16 起现行实现在 `plant-web-server/src/relay/`，`plant-model-gen` 侧的中继代码已删**——正文里凡是 `plant-model-gen` 的文件路径 / feature / 开关，描述的都是第一版落地位置，读之前先看下面的「后记」。
> 范围：`plant-model-gen` 后端 + `e3d-io` 落位（跨仓；写方案时后端还不是 git 仓，方案文档因此放在 monitor 仓版本化——2026-09-16 起两个后端都已入 git，见后记）
> 目标读者：接手这项改造的工程师
> 依据：2026-09-15 对 `plant-model-gen` / `rs-core` / `pdms-io-fork` / `e3d-io` 源码的只读排查，所有结论都带 `文件:行号` 证据

### 后记（2026-09-16）：实现搬到了 `plant-web-server`，`plant-model-gen` 那份已删

- **为什么搬**：`sync_relay_mode` 只接在三个会致命的点上（`activate` 的 `ensure_surreal_init`、`watch_incremental` 分叉、`surreal` 自启动），`web_server` 自己的启动序列压根不看它，仍无条件按 `[surrealdb]` 连、重试约 15 s、再报「review 专用数据库初始化失败」（smoke 报告 §3.4 的观察）。根子是中继跟模型库 / 校审挤在同一个二进制里，补丁堵不完，于是把中继整体搬出来。
- **搬到哪**：`plant-web-server/src/relay/{ledger, db_index, mqtt_msg, file_sync, watch}.rs`（约 2800 行，pws 提交 `1959a70`；`478bced` 把 MQTT 订阅改成跟着进程走 + clean session，修掉「重新激活后 `Unsolicited pubrel`、再也收不到消息」——`plant-model-gen` 那份同样有这个缺陷，只是此前每个进程只激活一次碰不到）。代码按原样搬，只改了模块路径与两处与模型库耦合的取值口径（`output_root`、`sync_relay_mode` 直接从 `DB_OPTION_FILE` 的 toml 读）。`plant-web-server/Cargo.toml` 直接 path 依赖 `../e3d-io`（不再有 feature 门控），P0 clone 出来的同级 `D:\work\plant-code\e3d-io` 继续用。`activate` 真起中继运行态（起不来整条失败），`apply` 只落账，`runtime/status` 给 `active / env_id / relay / mqtt_connected`，`runtime/stop` 先停中继；多站必备的 `PLANT_WEB_RUNTIME_DIR` 与 `/assets/archives` 静态路由也是这一步补的。
- **`plant-model-gen` 删了什么**（pmg 提交 `ac46e70`）：`src/version_management/relay_sync.rs`、`relay-sync` feature、`e3d-io` 依赖、`sync_relay_mode` 开关（`options.rs` / `bin/web_server.rs` / `remote_runtime.rs` 三处一并回退）。`activate` 回到「永远 `ensure_surreal_init` + `watch_incremental`」，`runtime/status` 的 `relay` 恒为 `false`（字段保留，监控台按它区分两类站点）。**留着的**：`data_interface/sync_ledger.rs`、`mqtt_file_sync.rs` 的收包校验、`SyncE3dFileMsg.file_sesnos`——完整站点仍要收发 MQTT 源文件并记这本账，线格式必须与 `plant-web-server` 兼容；没有 e3d-io 的构建里收包端只比 hash、sesno 一项记 `skipped`。`cargo check --bin web_server --features web_server,mqtt` 通过。
- **所以正文怎么读**：§2 非目标「不动 `plant-web-server`」已被推翻；P0 的依赖位置、P2 的开关位置与 `remote_runtime.rs` 改造、P3 的 `relay_sync.rs` 路径，都是 `plant-model-gen` 上的第一版落地。**设计本身（台账三张表、SQLite 水位 + 一拍去抖、`AtOrBefore` diff、逐文件广播、§7 九条默认）原样成立，现行代码以 `plant-web-server/src/relay/` 为准**——该模块 `mod.rs` 头部也回指本文。
- **验证与仓状态**：双站点 smoke 换到 pws 后端后在**同一对进程里连跑三次 24/24**（monitor 提交 `cabebd6`，结果 `docs/e2e-smoke/local-remote-collab-smoke-result-pws.json`，报告 §3.5）；`scripts/local-remote-collab-setup.ps1` 默认起 `plant-web-server.exe`。两个后端 2026-09-16 起都是 git 仓：`plant-web-server` 已推 https://github.com/happyrust/plant-web-server（私有）；`plant-model-gen` 本地仓 6 条提交、**故意不建远端**（待废弃）。细节见 monitor `CHANGELOG.md` 2026-09-16 节与 `HANDOFF.md`。
- **P3「顺带发现 2」已在 pws 补上（2026-09-16 晚，pws 提交 `581052a`）**：搬家后的 pws 其实断在两处——`activate` 根本不把 env 的连接参数写进 toml（pmg 的 `write_env_to_runtime_config` 没带过来），而中继的 MQTT 客户端、消息里的 `location` / `file_server_host`、收包端的 `location_dbs` 过滤又全取 `aios_core::get_db_option()` 的进程快照。现在 `activate`（仅 `sync_relay_mode = true`）先按行把 env 的 `mqtt_host / mqtt_port / file_server_host / location / location_dbs` 写进 toml（**env 上缺失 / 空的键不碰**——与 pmg 把缺失的 `location_dbs` 写成 `[]` 不同，那会清空自有库引发回声，smoke 曾为此绕道），再 `relay::start` 从这份 toml 读配置：轮询 + 发布端连接一律按新配置重建，订阅连接只在 `host / port / location / project_code` 变了时重连、没变就沿用并换掉它读的上下文（`relay::context::SharedContext`）。`runtime/status` 多 `relay_location / relay_mqtt_host / relay_mqtt_port` 供核对。验证：单站点有尽头脚本 21/21（换 location → toml 只改那一键、日志「连接参数变了 … 重建订阅」；同 env 再激活 → 「沿用已有订阅」；换到无人监听的端口 → `mqtt_connected` 变 false；换回 → toml 逐字节还原），24 项双站点 smoke 24/24（两站 toml 跑前跑后一致）。**仍开着的**：`hash_mismatch` 只告警不回滚（§7 第 9 条）；pmg 那份完整站点的同名问题未动（pmg 待废弃）。

---

## 0. 结论先行

### 0.1 grill 已定的四条（用户 2026-09-15 15:36 确认）

| # | 问题 | 结论 |
|---|---|---|
| Q1 | 异地站点要对用户提供什么 | **B · 站点能回答元素 / 属性 / 变更清单级别的查询**（e3d-io 直接读二进制即可覆盖，仍然 SQLite-only；三维 / 校审不在内） |
| Q2 | e3d-io 接到哪一档 | **L2 · 收包后校验 + 接管增量检测**（`diff_sessions` 决定「哪些文件要广播」；L3 站点侧查询 API 下一期） |
| Q3 | e3d-io 怎么引进 | **B · 落到 `D:\work\plant-code\` 同级**，与 `rs-core` / `pdms-io-fork` 一致，再 path 依赖（形式见 P0：**clone 不 move**） |
| Q4 | 后端不是 git 仓怎么回滚 | **B · 只备份要改的文件**到 `runtime/backup-2026-09-15/` |

### 0.2 v1 → v2 变了什么

1. **新发现一处 v1 漏掉的 SurrealDB 硬依赖：增量水位。** `watch_incremental.rs:154-176` 每轮对每个 db 文件先调 `committed_watermark(dbnum)`，它是纯 SurrealQL（`version_commit.rs:1006-1032`，查 `sesno_version_anchor` / `dbnum_info_table`）。没有 SurrealDB 时这一步报错 → `continue`；就算能返回，值是 0 → 「从未全量解析，不做增量」→ `continue`。**v1 的 P2「解闸」+ P3「换广播依据」做完，中继站点的轮询循环仍会在第一步把所有文件跳掉，一个都发不出去。**
2. 因此中继模式**不再复用** `run_watch_incremental`，改为一条独立的中继轮询（新模块 `relay_sync.rs`）：水位存 SQLite，用 e3d-io `diff_sessions` 判定变更并决定广播。这反而让改动更干净——`watch_incremental.rs` / `increment_run.rs` **一行不动**，v1 里「把 `persist_data` 提升为选项」的连带项也不需要了。
3. e3d-io 同时补上收包端一直缺的校验：`exec_delta_clone_remotes`（`mqtt_file_sync.rs:115-154`）拿到 url 就 clone，`file_hashes` 从头到尾没被读过；v2 在 clone 后做 hash 比对 + e3d-io 结构 / 会话校验，结果进台账。
4. 开关位置定了：`plant-model-gen` 自己的 `DbOptionExt` 顶层键 `sync_relay_mode`，**不动 rs-core**（理由见 P2）。

### 0.3 依赖到底在哪（v2 修订版）

控制面（env / site / log / task / 配置六张表）**已经 100% 在 SQLite**：`remote_sync_handlers.rs` 全文件 0 处 SurrealDB 引用。传输面（MQTT 收发 + CBA 压缩 / clone）不碰数据库。真正的 SurrealDB 触点：

| # | 位置 | 性质 | v2 处理 |
|---|---|---|---|
| 1 | `web_server/remote_runtime.rs:34` | `ensure_surreal_init().await?` 硬闸，连不上整个 `activate` 失败 | P2 中继模式跳过 |
| 2 | `version_management/watch_incremental.rs:154`（→ `versioned_db/version_commit.rs:1006`） | 每轮每文件查 SurrealDB 拿 Committed Watermark，拿不到就跳过 | P3 中继轮询自带 SQLite 水位，不走这条循环 |
| 3 | `data_interface/mqtt_file_sync.rs:92-98` | 发布端 `INSERT INTO e3d_sync`，带 `?`，失败即中断发布 | P1 改写 SQLite 台账 |
| 4 | `data_interface/mqtt_file_sync.rs:187-195` | 订阅端同样写 `e3d_sync`（已 `if let Ok` 容错） | P1 改写 SQLite 台账 |
| 5 | `watch_incremental` → `increment_run`（`persist_data: true`，`:212`） | PE / ATT / UDA 落模型库 | **不动**；中继模式根本不进这条路径 |

`e3d_sync` 全仓只写不读（`rg e3d_sync` 仅上述两处；monitor 前端与脚本 0 命中），搬迁零读侧兼容成本。

---

## 1. 现状盘点

### 1.1 三个平面 + 网关

| 平面 | 组件 | 当前存储 | 证据 |
|---|---|---|---|
| **控制面** | env / site / log / task / failed_task / env_config | SQLite `deployment_sites.sqlite` | `remote_sync_handlers.rs:272-415`（DDL），`:419-437`（`open_sqlite`） |
| 控制面 | 协同 schema 对齐 | SQLite 同库 | `collab_migrations.rs:57-128`，启动期由 `web_server/mod.rs:485` 调用 |
| **传输面** | MQTT 发布（压缩 → 发消息） | 无数据库 | `mqtt_file_sync.rs:56-103` |
| 传输面 | MQTT 订阅 → 远端 CBA clone | 无数据库 | `mqtt_file_sync.rs:115-154`、`:163-214` |
| 传输面 | 同步台账 `e3d_sync` | **SurrealDB** | `mqtt_file_sync.rs:94`、`:189` |
| **数据面** | db 文件索引（dbnum / 路径 / `latest_sesno` / 指纹） | SQLite `db_index`（sesno 由 `pdms_io::PdmsIO::get_latest_sesno` 读，`db_index.rs:493-496`） | `db_index.rs:26-35`、`:834`（`rebuild_from_config`） |
| 数据面 | 增量水位 Committed Watermark | **SurrealDB** | `version_commit.rs:1006-1032` |
| 数据面 | PE / ATT / UDA 落库、模型 / 几何生成 | **SurrealDB** | `increment_run.rs:303-360`、`:122` |
| **网关** | `activate` 前置 | **SurrealDB 硬闸** | `remote_runtime.rs:34` |

### 1.2 几个关键事实

- **`AiosDBManager::init_form_config()` 不需要 SurrealDB**（`db_model.rs:150-183` 只做目录收集与 `PdmsWatcher::new`），所以 `remote_runtime.rs:33` 安全，`:34` 才是闸门。
- **web_server 启动期已容忍 SurrealDB 缺席**（`web_server/mod.rs:577-588` 只警告不返回错误），双站点现在就能起来，卡住的只有 `activate`。
- **为什么现在必须有外部 `surreal.exe`**：`Cargo.toml:73-76` surrealdb 只带 `protocol-ws, kv-mem`，`kv-rocksdb` 是可选 feature（`:214-215`，注释「C++ 编译重」）；`rs-core/src/options.rs:73-78` 的 `File` 模式拼 `rocksdb://`，二进制里没有这个引擎，只剩 `Ws`；`bin/web_server.rs:79-126` 的 `auto_start_surreal` 就是把官方 `surreal` 当子进程拉起再回连。
- **`SyncE3dFileMsg` 是 serde_json 线格式**（`mqtt_service/mod.rs:9-29` derive `Serialize, Deserialize, Default`；`:52-69` 用 `serde_json::to_vec` / `from_slice`）。没有 `deny_unknown_fields`，所以**新增 `#[serde(default)]` 字段对旧收发两端都兼容**。
- **`file_hashes` 是源文件的 Blake2b512**：`pdms-io-fork/src/sync/compress.rs:31,54-55,133`（`source_hasher` 吃完整源文件），`execute_compress` 返回它（`:181`）。clone 端 `verify_output: true`（`clone.rs:412-433`）只对着 CBA 自带的 hash 校验，**从未对着 MQTT 消息里的 hash 校验**。
- **`remote_sync_env_config.detect_interval` 目前只存不用**：`remote_sync_handlers.rs:398-402` 建表，`:2766` / `:2835` 读写配置 API，运行时没有任何消费者。

### 1.3 e3d-io 是什么、能干什么

- 位置 `D:\work\plant-code\old\vendor\e3d-io`，独立 git 仓，HEAD `6431ee7`；同级 `e3d-attlib` HEAD `0ee93f6`。**纯二进制只读库，不带任何数据库**；依赖只有 `thiserror 2` / `nom 8` / `serde_json 1` / `sha2 0.10` / `encoding_rs 0.8` + path 依赖 `../e3d-attlib`（`e3d-io/Cargo.toml`）。
- **2026-09-15 实测**：把两仓 HEAD clone 到临时目录，独立 `CARGO_TARGET_DIR` 下 `cargo check --lib` **4.85 s 通过**，拉进来的第三方 crate 共 12 个，全部轻量。
- 用到的 API（全部**不需要** licensed 的 `*vir.dat` / `attlib.dat` schema 包）：
  - `ReadOnlyEngine::open(path)`（`engine.rs:184`）——能打开 = 结构完好；`<stem>_0001` 自动挂同级 `_0002…` 扩展文件（README「Extents」）。
  - `engine.sessions()`（`engine.rs:331`）→ `Vec<SessionInfo>`，`session_id` 即 sesno；底层 `SessionPage`（`session/mod.rs:178-217`）还带 `user` / `comment` / `date`。
  - `engine.diff_sessions(from, to)`（`engine.rs:357-369`）→ `SessionDiff`（`session/diff.rs:56-86`）：`tally()` 给 `inserted / deleted / modified` 计数（`index/diff.rs:154-165`），`is_empty()`，`changed_elements(&diff)` 流式给出每个 `ChangedElement { refno, kind, before, after }`（`session/diff.rs:138-143`），`ChangeKind::{Inserted, Deleted, Modified{relocated_only}}`（`:92-104`）。
  - `SessionSelector::{Latest, Exact(n), AtOrBefore(n)}`（`session/mod.rs:571-581`）。**`AtOrBefore` 是给水位用的**：`MERGE CHANGES` 会从链上删会话，`Exact(水位)` 可能已不存在，`AtOrBefore(水位)` 取不晚于水位的最新保留会话。
- **谁还在依赖它的现址**：`old/vendor/e3d-model*` 6 个 crate 以 `../e3d-io` path 依赖，`old/gen-model*` 16 个 crate 以 `../vendor/e3d-io` path 依赖，合计 **22 个**。所以 Q3=B 的落地形式必须是 **clone / 复制**，不能 move。
- 仓规模：git 跟踪 214 个文件，`src/` 1 MB，`schema/` 57 MB（licensed 二进制包，已入库）；`evidence/` 45 MB、`target-*/` 1 GB+ 都在 `.gitignore` 里。**`git clone` 出来约 60 MB**，没有 target。
- vendor 工作区有未提交改动（`src/db_element.rs` +205 行、`src/schema.rs` +14 行，两个未跟踪测试），属于 e3d-model 那条线的 WIP，与本方案用到的 `engine` / `session` 模块无关。
- 注意别混：`D:\work\plant-code\e3d-io-noun-descriptor` 的包名也叫 `e3d-io`，是 2026-08-27 的探针副本，其 `../e3d-attlib` 依赖目前悬空。`plant-model-gen` 必须指向 `../e3d-io`，不是它。

---

## 2. 目标与非目标

**目标**

1. 在一个站点上，「建 env → 加 site → 测连通 → 激活 → 收发文件 → 看台账 → 停止运行时」全链路**不需要任何 SurrealDB 进程**。
2. 本机双站点 smoke（`scripts/local-remote-collab-smoke.ps1`）在没装 `surreal` 的机器上跑通，目标 ≥ 22/24（原 22 项 + 新增 2 项）。
3. 收包端**校验**：hash 对得上、e3d-io 打得开、sesno 到位；发包端**变更清单**：本次广播覆盖 `sesno_from → sesno_to`，改了哪些 RefNo。两者都进 SQLite 台账，第一次可查。
4. **不破坏**现有「完整站点」形态：`sync_relay_mode` 不开时，行为与今天一字不差。

**非目标**

- 不把 PE / ATT / UDA / 几何数据搬出 SurrealDB（`project_primary_db()` 全仓 507 处 / 79 个文件，那是重写数据层）。
- 不做 L3 站点侧查询 API（`/api/e3d/element/{refno}` 之类），因为属性级解码要把 licensed schema 包分发到每个站点，应单独立项；本方案落的台账与变更表就是 L3 的数据基础。
- 不改 `plant-collab-monitor` 前端（控制面 API 形状不变，`runtime/status` 只多一个字段）。
- 不动 `plant-web-server`（`standalone-real` 那套是另一实现）。
- 不破坏 `SyncE3dFileMsg` 线格式：只加 `#[serde(default)]` 字段，不改、不删既有字段。

---

## 3. 方案：中继模式 + e3d-io

站点级开关 `sync_relay_mode = true` 时，该站点只做**文件分发中继**，不解析入库、不生成几何，因此不需要 SurrealDB；变更检测与校验交给 e3d-io 直接读二进制。

```
【发包侧 · relay_sync 轮询，每 detect_interval 秒】
  db_index::rebuild_from_config      (pdms_io 读 latest_sesno + 指纹 → SQLite db_index)
      │  latest_sesno > relay_sync_watermark.sesno ?
      ▼
  去抖：指纹与上一轮相同才继续（半写文件等一拍）
      ▼
  e3d-io: ReadOnlyEngine::open → sessions() → diff_sessions(AtOrBefore(水位), Latest)
      │  diff 为空 → 只推水位，不广播
      ▼
  CBA 压缩 → MQTT 发布 SyncE3dFileMsg{ …, file_sesnos }   (复用 publish_source_files)
      ▼
  SQLite: e3d_sync_ledger(outbound, tally) + e3d_sync_changes(RefNo 清单) + 推进水位

【收包侧 · poll_sync_e3d_mqtt_events】
  MQTT 收到 → 下载 CBA → clone 到源文件                       (今天已有)
      ▼
  Blake2b512(源文件) == file_hashes[i] ?                      (新增)
  e3d-io: open 成功 ? sessions().last == file_sesnos[i] ?     (新增)
      ▼
  SQLite: e3d_sync_ledger(inbound, verify_status) + 该 dbnum 水位 = 实际 sesno（防回声）

【全程不碰 SurrealDB。sync_relay_mode = false 时：今天的 run_watch_incremental 原样跑】
```

设计依据：异地协同的产品语义本来就是「把源 db 文件同步到各站点」（`mqtt_file_sync.rs:1-4` 模块注释：MQTT 仅承载源 db 文件分发，不参与增量提交）。中继模式只是让「本地落库」这一步在没有模型库的站点上不存在。

---

## 4. 阶段拆解

### P0 · e3d-io 落位 + 接入编译（≈ 0.5 天）

1. **clone 到同级**（Q3=B；不 move，22 个下游 crate 还指着现址）：
   ```powershell
   cd D:\work\plant-code
   git clone D:\work\plant-code\old\vendor\e3d-attlib e3d-attlib
   git clone D:\work\plant-code\old\vendor\e3d-io    e3d-io
   ```
   同级副本的 `origin` 就是 vendor 现址，以后 vendor 有提交就 `git pull`；两边不会各改各的。
2. `plant-model-gen/Cargo.toml`：`[dependencies]` 段（`pdms_io` 那行旁，`:79`）加
   ```toml
   e3d-io = { path = "../e3d-io", optional = true }
   ```
   并在 `[features]` 的 `mqtt`（`:259`）下新增 `relay-sync = ["mqtt", "dep:e3d-io"]`。中继只有配上 MQTT 才有意义，所以让它蕴含 `mqtt`。（同级 path 依赖 `rs-core` / `pdms-io-fork` 走的是 `[patch]` 段 `:330-335`，那是覆盖 git 源；e3d-io 没有 git 源，直接进 `[dependencies]`。）
3. 后端构建命令从 `--features web_server,mqtt` 变为 **`--features web_server,relay-sync`**（P4 同步改 `COMMANDS.md` / 启动器 / 测试计划）。
4. **验收**：`cargo build --bin web_server --features web_server,relay-sync` 通过；`cargo build --bin web_server --features web_server,mqtt`（不带 relay-sync）也仍然通过。

**P0 执行记录（2026-09-15 16:40）**：已完成。

- 备份：`plant-model-gen/runtime/backup-2026-09-15/{Cargo.toml,Cargo.lock}`。
- clone：`D:\work\plant-code\e3d-io`（HEAD `6431ee7`）、`D:\work\plant-code\e3d-attlib`（HEAD `0ee93f6`），`origin` 均指向 `old/vendor/` 现址；工作区 35 MB。
- `Cargo.toml` 两处改动如上；`Cargo.lock` 只新增 `e3d-io` / `e3d-attlib` 两个包，其余版本未动（与备份逐行比对）。
- `cargo build --bin web_server --features web_server,relay-sync`：**通过，1 m 32 s**，`D:\Rust\target\debug\web_server.exe` 149 397 504 bytes；`cargo tree -i e3d-io` 确认只在 `relay-sync` 打开时进图。
- `cargo check --bin web_server --features web_server,mqtt`：**通过，3 m 45 s**（用 check 而非 build，避免覆盖上面那份 exe）。
- 未改任何 `.rs`；两组构建里新增的警告为 0（36 条 `pdms_io` 警告是存量）。

### P1 · 台账搬 SQLite + 收包端校验（≈ 1 天，可独立上线）

**新建** `src/data_interface/sync_ledger.rs`（`#[cfg(feature = "mqtt")]`）：

- 连接复用 `remote_sync_handlers::open_sqlite()`（`:419`），落同一个 `deployment_sites.sqlite`。
- 写失败只 `log::warn!`，**绝不上抛**——台账丢一行不该让文件同步失败。
- DDL 放进 `collab_migrations.rs::ensure_collab_schema()`（`:57`），沿用该文件的约定（`CREATE TABLE IF NOT EXISTS`，失败只 warn，`:9-12`）：

```sql
-- 每个文件一行；同一条 MQTT 消息里的多个文件共用 msg_id
CREATE TABLE IF NOT EXISTS e3d_sync_ledger (
    id             TEXT PRIMARY KEY,          -- uuid
    msg_id         TEXT NOT NULL,             -- 消息分组键：payload 的 blake2b512 前 16 字节 hex
    direction      TEXT NOT NULL,             -- outbound | inbound
    location       TEXT NOT NULL,             -- 消息来源站点
    file_name      TEXT NOT NULL,
    file_hash      TEXT,                      -- 消息携带的源文件 Blake2b512
    sesno_from     INTEGER,                   -- outbound: 广播前水位
    sesno_to       INTEGER,                   -- outbound: 本次 latest；inbound: 消息声明的 file_sesnos[i]
    sesno_seen     INTEGER,                   -- e3d-io 实际读到的 latest sesno
    diff_inserted  INTEGER,
    diff_deleted   INTEGER,
    diff_modified  INTEGER,
    diff_status    TEXT,                      -- ok | empty | unavailable | skipped
    verify_status  TEXT NOT NULL,             -- ok | hash_mismatch | open_failed | sesno_mismatch | sesno_disagree | skipped
    verify_detail  TEXT,
    msg_timestamp  TEXT,                      -- 消息自带时间戳 RFC3339
    created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_e3d_sync_ledger_created ON e3d_sync_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_e3d_sync_ledger_file    ON e3d_sync_ledger(file_name, created_at);

-- 变更清单（Q1=B 的「这一轮改了哪些」就从这儿答）
CREATE TABLE IF NOT EXISTS e3d_sync_changes (
    ledger_id  TEXT NOT NULL,
    refno      TEXT NOT NULL,                 -- "dbno/seq"
    kind       TEXT NOT NULL,                 -- inserted | deleted | modified | relocated
    PRIMARY KEY (ledger_id, refno)
);
```

`e3d_sync_changes` 单次写入上限 20 000 行，超出置 `verify_detail = "changes_truncated:<总数>"`——一次 MERGE 可能改几十万元素，台账不该被撑爆。

**`SyncE3dFileMsg`（`mqtt_service/mod.rs:10-29`）加一个字段**：

```rust
/// 与 file_names 一一对应的 latest sesno；旧发送端没有此字段时为空。
#[serde(default)]
pub file_sesnos: Vec<u32>,
```

线格式向后兼容：旧接收端 `from_slice` 忽略未知字段；新接收端读旧消息得到空 vec，校验降级为 `verify_status = skipped`。`timestamp: SurrealDatetime` 不动（它在线格式里），落库时 `to_rfc3339()`。

**改两个调用点**：

- `mqtt_file_sync.rs:92-98` → `sync_ledger::record_outbound(&payload, &per_file_diffs)`，删掉 `project_primary_db()` 与 `response.check()?`。P1 阶段 `per_file_diffs` 可为空（P3 才有 diff）。
- `mqtt_file_sync.rs:187-195` → 删掉 SurrealDB 写入；改在 `exec_delta_clone_remotes` 内**每个文件 clone 之后**做校验并写一行 inbound：
  1. `Blake2b512` 读一遍 clone 输出，与 `file_hashes[i]` 比；不等 → `hash_mismatch`（继续处理下一个文件，不回滚——源文件已被 clone 覆盖，回滚需要另一套机制，不在本期）。
  2. `spawn_blocking` 内 `ReadOnlyEngine::open(&path)`；失败 → `open_failed`。
  3. `sessions()` 取最大 `session_id` 写 `sesno_seen`；若 `file_sesnos[i]` 存在且不等 → `sesno_mismatch`。
  4. 全过 → `ok`，并 upsert `relay_sync_watermark(dbnum) = sesno_seen`（表见 P3；P1 先建表），防止本站点中继轮询把刚收到的文件再广播出去。

**验收**：`cargo build --features web_server,relay-sync` 通过；起一个没有 SurrealDB 的站点，手工往 `Sync/E3d` 发一条旧格式消息（无 `file_sesnos`）和一条新格式消息，`sqlite3 deployment_sites.sqlite "SELECT direction,file_name,verify_status FROM e3d_sync_ledger"` 各有一行，前者 `skipped`、后者 `ok`；再发一条 hash 故意写错的，得到 `hash_mismatch`。

**P1 执行记录（2026-09-15 19:46）**：代码完成，编译 / 单测 / 真实库交叉校验通过；**MQTT 端到端验收未做**（本机没装 Mosquitto，且 `activate` 仍被 SurrealDB 硬闸挡着，要等 P2 + P4 的环境）。

- 备份：`runtime/backup-2026-09-15/src/{mqtt_service/mod.rs, data_interface/{mod.rs,mqtt_file_sync.rs}, web_server/{collab_migrations.rs,sync_control_handlers.rs}, version_management/watch_incremental.rs}`。
- 新建 `src/data_interface/sync_ledger.rs`（`#[cfg(feature = "mqtt")]`）：三张表 DDL（`e3d_sync_ledger` / `e3d_sync_changes` / `relay_sync_watermark`，P3 的水位表按计划提前建）、`record` / `upsert_watermark`（`spawn_blocking`，失败只 warn）、`msg_id_from_bytes`、`blake2b512_file_hex`、`verify_cloned_file`；DDL 同时由 `collab_migrations::ensure_collab_schema` 在启动期执行一次。
- `SyncE3dFileMsg` 加 `#[serde(default)] file_sesnos: Vec<u32>`，**约定 0 = 该文件未声明**（保持与 `file_names` 对齐），取值走 `declared_sesno(i)` / `declared_hash(i)`。
- `publish_source_files` 参数从 `&[PathBuf]` 改为 `&[PublishSourceFile]`（path + sesno + P3 要带的水位 / diff / 变更清单）；完整站点 `watch_incremental.rs:239-249` 已把 `record.latest_sesno` 填进去，所以 **P1 起完整站点发出的就是新格式消息**。发布字节显式 `serde_json::to_vec` 一次，同一份字节既算 `msg_id` 又发出去。
- 收包端 `exec_delta_clone_remotes(watcher, msg, msg_id)`：逐文件 clone → `Blake2b512` 比对 → e3d-io `open` + `sessions()` → sesno 比对，结论进 `inbound` 行；`sync_control_handlers::trigger_file_download`（手工触发）同步改签名。
- 与本文上面写法的**几处出入**，都是实施时补的口子：
  1. `verify_status` 多两个值：`clone_failed`（CBA clone 本身失败，之前没有任何记录）；被跳过的文件（`unknown_local_file` / `own_location_db`）也落一行 `skipped`，理由写在 `verify_detail`——否则「B 为什么没收到 X」在台账里查不到。
  2. 水位 upsert 除 `ok` 外，**旧格式消息（`skipped` 且 e3d-io 打开成功、hash 未不一致）也推**——文件确实已落盘且能打开，不推的话 P3 会把它当自有变更再广播一次。`hash_mismatch` / `sesno_mismatch` / `open_failed` 不推。
  3. `mqtt` feature 现在蕴含 `sqlite-index`（带进 rusqlite）并加 `dep:uuid`、`dep:blake2`：台账住 SQLite，`console` 这种只开 `mqtt` 不开 `web_server` 的组合也得编得过。`sync_ledger` 自己解析 `deployment_sites_sqlite_path`（与 `collab_migrations.rs` 同一约定），不依赖 `web_server` 模块。
  4. 订阅循环里 `SyncE3dFileMsg::from(payload)` 的 `unwrap` 换成 `serde_json::from_slice` + warn 跳过：手工发一条坏包不该 panic 掉整个订阅任务（验收步骤就是手工发包）。
  5. 没有 `relay-sync` 只有 `mqtt` 的构建，e3d-io 不在，收包端只做 hash 比对，结论 `skipped`（`verify_detail` 注明「e3d-io 未编入本构建」）。
- 验证：
  - `cargo check` / `cargo build --bin web_server --features web_server,relay-sync` 通过（build 85 s，exe 149 757 952 bytes，19:41）；`cargo check --bin web_server --features web_server,mqtt` 通过（87 s）。两组里本仓新增警告 0。
  - `cargo test --lib data_interface::sync_ledger`：两种 feature 组合各 4/4 通过（Blake2b512 官方向量、5 MiB 文件 hash = 字节 hash、内存库建表 / 写行 / 20 000 行截断 / 水位 upsert、非 E3D 文件 → `hash_mismatch` / `open_failed`(relay-sync) 或 `skipped`(mqtt) / `read_failed`）。
  - **pdms_io 与 e3d-io 交叉校验**（临时测试，已删）：`D:\AVEVA\Projects\E3D2.1\AvevaCatalogue\acp000\{acp250704,acp250701,acp7001}_0001` 三个真实库，`PdmsIO::get_latest_sesno` = e3d-io `sessions()` 最大 `session_id`（3 / 14 / 270 全部一致），带正确 hash + sesno → `ok`，无 sesno → `skipped`（`sesno_seen` 有值），sesno 写错 → `sesno_mismatch`；12 MB 库整个校验 290 ms（几乎全是 hash）。
  - 新 exe 用临时配置（`auto_start_surreal = false`，SQLite 指向临时目录，**无任何 SurrealDB**）启动：`[collab-migrate] e3d_sync_ledger / e3d_sync_changes / relay_sync_watermark 就绪`，`sqlite3` 查到 3 表 + 2 索引；再对同一文件库走 `record_blocking` / `upsert_watermark_blocking`，`sqlite3` 查到 `inbound / ok / 270` 一行、变更 1 行、水位 271。临时配置与库已删。
  - 顺带发现：`auto_start_surreal = true` 且 `surreal` 不在 PATH 时 `web_server` **启动即退出**（`bin/web_server.rs` 自启动失败是硬错误，不是 §1.2 说的「只警告」）——P4 的生成器把它置 `false` 就绕开了，但 P2 那条「加 warn」要改成：中继模式下直接跳过自启动。

### P2 · 开关 + 解闸 + 运行时状态（≈ 0.5 天）

**开关放哪（本版结论）**：`plant-model-gen/src/options.rs` 的 `DbOptionExt` 顶层新增

```rust
/// 中继模式：只做源 db 文件分发（检测 / 广播 / 接收 / 校验），不解析、不落模型库，因此不需要 SurrealDB。
#[serde(default)]
pub sync_relay_mode: bool,
```

解析处按 `:1056-1059`（`use_surrealdb`）同款写法从 `toml_value` 取值。`DbOption.toml` 顶层：

```toml
# 中继模式：站点只分发文件，不需要 SurrealDB
sync_relay_mode = true
```

否决的两条备选：
- `[web_server] sync_relay_mode`：`WebServerConfig` 在 rs-core（`rs-core/src/options.rs:95-117`），要跨仓改、两仓一起发版，而这个开关只有 `plant-model-gen` 消费。
- 复用已有 `use_surrealdb = false`：它是「旧配置」（`options.rs:548-550`，注释「不再表达模型生成输入后端」；`:1055` 「只控制 SurrealDB 进程 / 副本可用性」），还被 `validate_generation_read_features`（`:792-798`）拿去 bail，语义已经含混，再挂一个新含义只会更乱。

**`remote_runtime.rs:31-87` 改造**：

```rust
let relay = crate::options::get_db_option_ext().inner_ext().sync_relay_mode;   // 取法按实际 accessor
let mgr = Arc::new(AiosDBManager::init_form_config().await?);
if !relay {
    crate::fast_model::utils::ensure_surreal_init().await?;                    // 非中继：原样硬闸
}
let watcher_handle = if relay {
    #[cfg(feature = "relay-sync")]
    { tokio::spawn(relay_sync::run_relay_watch(env_id.clone(), mgr.clone(), requested_dbnums)) }
    #[cfg(not(feature = "relay-sync"))]
    { anyhow::bail!("sync_relay_mode=true 需要以 --features relay-sync 构建") }
} else {
    tokio::spawn(/* 今天的 run_watch_incremental 调用，原样 */)
};
```

`RuntimeState` 加 `pub relay: bool`；`runtime_status()`（`remote_sync_handlers.rs:1401-1417`）响应多一个 `"relay": bool`。这是**唯一影响前端的改动**，多一个字段，前端不读不会坏。

`activate_env`（`:1060-1082`）不改：成功 / 失败文案沿用。中继模式下若 `[web_server].auto_start_surreal` 仍为 `true`，启动期会白白去拉 `surreal` 子进程；P2 在 `bin/web_server.rs:79` 附近加一条 `warn!`（不阻断），P4 的生成器直接把它置 `false`。

**验收**：`sync_relay_mode = true` + 机器上无任何 SurrealDB → `POST /api/remote-sync/envs/{id}/activate` 返回成功；`GET runtime/status` 为 `active: true, relay: true`；`sync_relay_mode = false`（或不写）时日志里仍出现 `ensure_surreal_init`，行为与今天一致。

**P2 执行记录（2026-09-15 19:58）**：已完成，验收两条都过。

- 备份：`runtime/backup-2026-09-15/src/{options.rs, bin/web_server.rs, web_server/{remote_runtime.rs, remote_sync_handlers.rs}}`。
- `options.rs`：`DbOptionExt` 加 `#[serde(default)] pub sync_relay_mode: bool`（`From<DbOption>` 置 false，`get_db_option_ext_from_path` 从 toml 取，配置打印多一行）；新增 `sync_relay_mode_from_toml(&toml::Value)` 与 `current_sync_relay_mode()`——后者从 `DB_OPTION_FILE` 直接读，语义同 `current_versioned_params`（文件不存在 = false，存在但解析失败 = 报错）。**为什么不用 `get_db_option_ext()`**：它是 `DbOptionExt::from(DbOption)`，扩展键一律取默认值，读不到 toml 里的开关。
- `remote_runtime.rs`：`start_runtime` 先读开关；中继模式跳过 `ensure_surreal_init`、不 spawn `run_watch_incremental`（`watcher_handle = None`，留了 P3 接 `relay_sync::run_relay_watch` 的位置）；没编 `relay-sync` feature 的二进制在中继模式下 `bail!`，文案直接写出正确的构建命令。`RuntimeState` 加 `relay: bool`。
- `remote_sync_handlers.rs` `runtime_status()`：响应多一个 `"relay": bool`（未激活时 false）。
- `bin/web_server.rs`：**中继模式直接跳过 SurrealDB 自启动**（不是原文写的「加 warn」）——P1 记录里发现自启动失败是硬退出，`surreal` 不在 PATH 的中继站点会起不来；从同一份 toml 取开关，与 `versioned_storage` 同一处。
- 没动 `DbOption.toml` 模板：站点配置由 P4 的生成器写 `sync_relay_mode = true`。
- 验证（临时配置 = site-a 的 DbOption 副本，SQLite 指向 %TEMP%，机器上无任何 SurrealDB、`surreal` 不在 PATH；跑完已删）：
  - `cargo build --bin web_server --features web_server,relay-sync` 通过（83 s，exe 149 767 680 bytes，19:54）；`cargo check --bin web_server --features web_server,mqtt` 通过（20 s）；本仓新增警告 0。
  - **中继**（`sync_relay_mode = true`，故意保留 `auto_start_surreal = true`）：启动日志 `⏭️ 中继模式：跳过 SurrealDB 自启动`；登录 → 建 env → `activate` **4 s 返回 success**；`runtime/status` = `{"active":true,"relay":true,...}`；`runtime/stop` 后 `{"active":false,"relay":false}`；日志里有 `跳过 SurrealDB 初始化与 watch-incremental` 与 `relay_sync 尚未接入（方案 P3）`；activate 改写后的 toml 仍保留 `sync_relay_mode = true`（`write_env_to_runtime_config` 只改 5 个键）。MQTT 订阅照常起（无 broker，报连接拒绝后退避，符合预期）。
  - **完整站点**（不写开关，`auto_start_surreal = false`）：`activate` 返回 `failed: 启动运行态失败: WebSocket error ... 10061`——SurrealDB 硬闸原样在；`runtime/status` = `{"active":false,"relay":false}`。
  - monitor `node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100`（readonly，报告 / 截图重定向到 %TEMP%）：**7/7 通过**，形状识别仍是 `pmg`，pageErrors 0——多出来的 `relay` 字段没影响前端。

### P3 · 中继轮询 `relay_sync.rs`（≈ 1 天，本方案核心）

**新建** `src/version_management/relay_sync.rs`（`#[cfg(feature = "relay-sync")]`，与 `watch_incremental.rs` 并列，后者不改）。

**水位表**（DDL 与 P1 一起进 `ensure_collab_schema`）：

```sql
CREATE TABLE IF NOT EXISTS relay_sync_watermark (
    dbnum                  INTEGER PRIMARY KEY,
    file_name              TEXT NOT NULL,
    sesno                  INTEGER NOT NULL,  -- 已广播（或已接收 / 基线）的 latest sesno
    last_seen_fingerprint  TEXT,              -- 去抖：上一轮看到的 "{mtime_nanos}:{size}"
    updated_at             TEXT NOT NULL
);
```

**每轮**（周期 = `remote_sync_env_config.detect_interval`，读不到用 30 s；这个字段今天只存不用，中继轮询成为它第一个消费者）：

1. `db_index::rebuild_from_config(false)`（`db_index.rs:834`，pdms_io 读 sesno，SQLite 落地，已经不碰 SurrealDB）→ `DbIndexStore::open(index_path).all_db_files()`。
2. 过滤：`requested_dbnums`（`manual_db_nums`）非空则只看它们；**`location_dbs` 非空则只广播自有库**——今天完整站点会把收到的别家文件再发一遍（`exec_delta_clone_remotes` 靠 `location_dbs` 挡覆盖，`:136-143`，但发布端没有对称过滤），中继模式把这个回声在源头掐掉。
3. 对每个 record：
   - 水位表无此 dbnum → **写基线** `sesno = latest_sesno`，不广播（对端靠首次全量拷贝拿到的文件，不该在激活那一刻被历史全量轰一遍）。
   - `latest_sesno <= sesno` → 跳过。
   - `fingerprint != last_seen_fingerprint` → 更新 `last_seen_fingerprint`，本轮跳过（**一拍去抖**：文件在上一轮到这一轮之间还在变，等它停下来；代价是最多一个周期的延迟）。
   - 否则进入 e3d-io，全部放 `spawn_blocking`（e3d-io 是同步 IO）：
     - `ReadOnlyEngine::open(&file_path)`；失败 → 台账一行 `outbound / open_failed`，本轮跳过（下轮重试）。
     - `sessions()` 最大 `session_id` 记为 `seen`；若 `seen != latest_sesno`（pdms_io 与 e3d-io 不一致）→ `sesno_disagree`，跳过。这是个便宜的交叉校验，两个独立实现读同一个头。
     - `diff_sessions(SessionSelector::AtOrBefore(水位), SessionSelector::Latest)`；`Err` → `diff_status = unavailable`，**仍然广播**（判不了变更不等于没变更）；`is_empty()` → 只推水位不广播，`diff_status = empty`。
     - `changed_elements(&diff)` 收集 RefNo + kind（上限 20 000）。
4. 广播：调 `MqttFilePublisher::publish_source_files`（`mqtt_file_sync.rs:56-103`，签名扩一个 `&[(PathBuf, u32)]` 或并列的 sesno 切片，填进 `file_sesnos`）。发布成功 → 台账 `outbound / ok` + `e3d_sync_changes` + 水位推到 `seen`；失败 → 只记日志，水位不动，下轮重试（CBA 已写到 `assets/archives/`，无害）。
5. 任何一步的错误都不能让循环退出：与 `watch_incremental.rs:109-124` 的常驻语义一致，记录后 `sleep` 下一轮。

**验收**：两个中继站点（都无 SurrealDB）：A 改一个自有 db 文件（保存一个 session）→ 一到两个周期内 B 的 `assets/archives/` 出现 `.cba`、源文件被 clone；A 侧台账 `outbound / ok` 且 `diff_*` 计数 > 0、`e3d_sync_changes` 有行；B 侧台账 `inbound / ok` 且 `sesno_seen == sesno_to`；A 再保存一次但不改元素 → A 只推水位，`diff_status = empty`，不广播。

**P3 执行记录（2026-09-15 21:05）**：代码完成，编译 / 单测 / 真实库交叉校验 / 单站点运行态全部分支验过；**双站点收发验收未做**（本机没有 broker，要等 P4 环境）。

- 备份：`runtime/backup-2026-09-15/src/version_management/mod.rs`（本阶段新增；其余触到的文件 P1 / P2 已备份）。
- 新建 `src/version_management/relay_sync.rs`（`#[cfg(feature = "relay-sync")]`）：`run_relay_watch(RelaySyncOptions{env_id, requested_dbnums, interval_secs, once})` 常驻轮询；纯判定 `decide(latest_sesno, fingerprint, watermark) -> Baseline | Unchanged | Debounce | Inspect`；`inspect_blocking(path, watermark, latest)` 做 e3d-io 打开 → `sessions()` 交叉校验 → `diff_sessions(AtOrBefore(水位), Latest)` → `changed_elements` 收 RefNo 清单。`remote_runtime.rs` 中继分支现在 `tokio::spawn` 它，顶替 `run_watch_incremental` 的位置。
- `sync_ledger.rs` 加 `Watermark` 与 `load_watermarks_blocking` / `set_watermark_blocking(dbnum, file_name, sesno, fingerprint)` / `touch_watermark_fingerprint_blocking`（各带 `_in(&Connection)` 版本供单测）；P1 的 `upsert_watermark_blocking` 改为委托 `set_watermark_in(…, None)`。`mqtt_file_sync::PublishSourceFile` 加 `verify_detail: Option<String>` 透传进台账。
- 与本文上面写法的**几处出入**：
  1. **逐文件广播**（一个文件一条 MQTT 消息），不是一轮攒一条：发布端 `execute_compress` 的 `?` 与收包端 `clone_and_verify_files` 的「首个 clone 失败即返回」都会让一条多文件消息里一个坏文件拖死其余文件；逐文件后各自推水位、各自重试。
  2. **不广播的结局也落台账**（P1 记录里同一条理由：「B 为什么没收到 X」得查得到）：`open_failed` / `sesno_disagree` 各一行；diff 为空一行 `skipped`（`diff_status = empty`，`verify_detail = empty_diff: …`）；发布失败一行 `skipped`（`verify_detail = publish_failed: …`，**连本轮算出的 tally / 清单一起记**，水位不动）。这些行的 `msg_id` 是 `relay:<dbnum>:<水位>-><latest>`。基线只记日志不落行。
  3. **同一 dbnum 连续几轮同一个问题只落一行**（内存签名去重：`open_failed:<latest>` / `sesno_disagree:<latest>:<seen>` / `publish_failed:<seen>`），恢复或签名变化才再记；否则 30 s 一行会把表撑爆。
  4. 配置**每轮从 `DB_OPTION_FILE` 重新读**（`db_index::load_db_option_from_env`）：`activate` 改写 `location` / `location_dbs` 后 `aios_core::get_db_option()` 仍是进程启动时的快照。
  5. `detect_interval` 每轮重读（改配置即时生效），下限 1 s，读不到 30 s。首轮 `rebuild_from_config(force = 索引文件不存在)`。
  6. RefNo 清单用 `.take(20 000)` 截断（多出的记录**不读**），`verify_detail` 记 `changes_truncated:<总数>`；`AtOrBefore(水位)` 落到更早的保留会话时记 `diff_from_resolved=<n>`（样例库的会话链大多被 MERGE 过：`acp7001` 只保留 1 与 270，水位 260 起算就是全量重报——方案 §6 已写明这是有意的「重报而不漏」）。
- 验证：
  - `cargo build --bin web_server --features web_server,relay-sync` 通过（79 s，exe 150 080 000 bytes，20:43）；`cargo check --bin web_server --features web_server,mqtt` 通过（27 s）。两组本仓新增警告 0。
  - `cargo test --lib --features web_server,relay-sync -- version_management::relay_sync data_interface::sync_ledger`：**9/9**（`decide` 四种结局的先后次序、非 E3D 文件 / 不存在文件 → `open_failed`、内存库里水位 load / set / touch、P1 原有 4 条）。
  - **真实库交叉校验**（临时测试，已删）：`acp7001_0001` 260→270：`Ready/ok`，tally +32373 -0 ~0，清单截到 20 000（`changes_truncated:32373`），`diff_from_resolved=1`，121 ms；1→270 同 tally 107 ms；db_index 说 5、e3d-io 读到 270 → `Disagree{seen:270}`；270→270 → `empty`；`acp250701_0001` 10→14：`diff_from_resolved=2`，+13787 ~1，13788 条清单。
  - **单站点运行态**（site-a 配置副本：`sync_relay_mode = true`、`included_projects = ["SCB"]`、SQLite / db_index / output 指向 %TEMP%；无 SurrealDB、无 broker；`remote_sync_env_config.detect_interval = 5`；跑完已删）：`activate` 0 s success；首轮 db_index 扫 7 个库 → **7 条基线**（带指纹），下一轮 `unchanged=7`、索引 `skipped=7`；把 dbnum 6000 水位改成 20 + 指纹作废 → 第 1 轮 `去抖 … 20 -> 33，指纹刚变，等下一轮`，第 2 轮 `已广播 20 -> 33 diff=ok (+149 -17 ~4) changes=170` → 台账 `outbound / ok / ok / 20 / 33 / 33 / 149,17,4`，`e3d_sync_changes` 170 行（inserted / deleted / modified 三种），水位 33 + 真实指纹，`assets/archives/scb6000_0001.cba` 重写；把 6002 的索引 `latest_sesno` 改成 5、水位 3（e3d-io 实读 18）→ **一行** `sesno_disagree`，之后 4 轮只有 debug「仍未恢复」、不再落行；把 6000 水位设成 0 → e3d-io `no session 0 …` → 照常广播，`diff_status = unavailable`，原文进 `verify_detail`；`runtime/stop` 后 12 s 内轮询日志不再增长。
  - **未验证**：消息真正到达对端（rumqttc 在 broker 不在时把 publish 排队、重连后再发，`publish_source_files` 返回 Ok——所以台账里 `outbound / ok` 的语义是「已交给 MQTT 客户端」，不是「对端已收到」，与今天完整站点一致）；两个中继站点的完整验收（P4）。
- 顺带发现（都不阻塞，P4 时留意）：
  1. **首轮 `db_index` 全量扫描很慢**：整套 `E3D2.1` 样例（4 个工程、约 530 个 db 文件、约 2 GB，`ams7351_0001` 一个就 1.2 GB）跑了 10 分钟还没扫完 `AvevaMarineSample`；这是 `rebuild_from_config` 的既有成本（完整站点的 `watch_incremental` 首轮一样），而且它是 `async fn` 里的同步阶段，**会占住一个 tokio worker 线程**。P4 的双站点环境要么用小工程，要么 `included_projects` 收窄；长期看该把扫描挪进 `spawn_blocking`（既有设计，不在本期）。
     **已做（2026-09-16 00:15，P4 之后的后续项）**：`db_index::rebuild_from_config` 整体改为 `spawn_blocking` 跑同步实现 `rebuild_from_config_blocking`；Phase 2 的 `collect_design_outbound*` 虽是 `async fn`，函数体是 std 文件读 + 纯 CPU 解析（`parse_pdms_db::parse_file` 没有真正的挂起点），在阻塞线程上用 `Handle::block_on` 驱动。调用方（`relay_sync` / `watch_incremental` / `increment_run` / `cata_closure` / CLI）签名不变、一行不动，完整站点同样受益。备份 `runtime/backup-2026-09-15/src/data_interface/db_index.rs`。
     验证：临时探针（单 worker 运行时 + 10 ms 心跳任务 + `tokio::spawn(rebuild_from_config(true))`，验完已删）——改前 SCB（7 库，0.65 s）/ ZDJ（46 库，15.5 s）扫描期间心跳 **0 次**（worker 被占满整轮，不只 Phase 1）；改后 SCB 40–43 次、ZDJ 942–1088 次，最大间隔 19–29 ms（与空载一致）。`cargo build --features web_server,relay-sync`（126 s，exe 150 111 232 B）与 `cargo check --features web_server,mqtt`（189 s）通过，本仓新增警告 0；`relay_sync` / `sync_ledger` 单测 8/8。新 exe 起两站（无 SurrealDB，Mosquitto 服务）**连跑两次 smoke 24/24**（各 7 s）：LS-23 A `outbound/ok 32→33 (+10 -0 ~2) 12 条变更`，LS-24 B 同一 `msg_id` 的 `inbound/ok sesno_seen=33`，B 副本 SHA256 与 A 一致。结果 JSON 写在 %TEMP%，未覆盖仓内两份。
     顺带：`db_index::tests::test_store_roundtrip` 在改动前后都失败（`UNIQUE constraint failed: ref0_owner.ref0`——schema 有 `unique_ref0_owner_ref0 ON ref0_owner(ref0)`，而 `replace_ref0_owners` 用裸 `INSERT`，用例却传了重复的 ref0 `[…, 100, 100]`），与本项无关、未动。
  2. `activate` 只改写 toml、不调 `aios_core::set_db_option_from_file()`：发布 / 订阅客户端的 `mqtt_host` 与消息里的 `location` 用的是进程启动时那份配置。P4 的生成器先写好 toml 再起进程就不会碰到；但 UI 里改了 env 再 activate 是不会生效的（既有问题）。

### P4 · 双站点环境改造 + smoke 跑通（≈ 0.5 天）

- `scripts/local-remote-collab-setup.ps1`：生成的两份 `DbOption.toml` 顶层加 `sync_relay_mode = true`，`[web_server].auto_start_surreal = false`；`[surrealdb]` 段保留但不再要求可连；前置检查去掉 `surreal`（`:88-96`），只剩 Mosquitto。
- `runtime/local-collab/COMMANDS.md` 与 `site-*/start.ps1`：构建 / 启动命令改为 `--features web_server,relay-sync`，删掉 surreal 前置。
- `scripts/local-remote-collab-smoke.ps1`：LS-13（activate）/ LS-15（激活生效）应当真通过；新增 **LS-23** 查 A 侧 `e3d_sync_ledger` 有 `outbound/ok` 行、**LS-24** 查 B 侧有 `inbound/ok` 行且 `sesno_seen = sesno_to`。
- `docs/e2e-smoke/local-remote-collab-test-plan.md` §3「为什么必须 `auto_start_surreal`」整段重写为中继模式说明。
- 产出 `docs/e2e-smoke/2026-09-xx-sqlite-only-collab-smoke-report.md`，并用新结果覆盖那两个 2026-05-17 的失败结果 JSON 后提交。

**验收**：一台**没装 `surreal`** 的机器，只起 Mosquitto + 两个 `web_server`，smoke ≥ 22/24。

**P4 执行记录（2026-09-15 22:25）**：**完成，验收达成——机器上没有 `surreal`，只有 Mosquitto + 两个中继 `web_server`，smoke 24/24（通过线 ≥ 22/24），7 s。** 详见 `docs/e2e-smoke/2026-09-15-sqlite-only-collab-smoke-report.md`。后端零改动。先在无 broker 下跑出 20/24（只差 LS-03 / LS-24），用户批准后 `winget install --id EclipseFoundation.Mosquitto -e`（2.1.2，服务常驻 127.0.0.1:1883 local-only 模式）再跑即全绿；两份 2026-05-17 的结果 JSON 已覆盖。

- `scripts/local-remote-collab-setup.ps1`：生成的两份 toml 顶层 `sync_relay_mode = true`、`[web_server].auto_start_surreal = false`、`[surrealdb]` 段保留不再要求可连；前置检查去掉 `surreal`，构建命令改 `--features web_server,relay-sync`，加 `sqlite3 或 python`（LS-23/24 查台账）。
- **与本文上面写法的几处出入**（都是为了让 LS-23/24 真能跑）：
  1. **`file_server_host` 改为本站 `/assets/archives`**（原来两站都写 `<site>/files/output`）。它的真实语义是「别站来我这下载 CBA 的地址」——A 广播的 `SyncE3dFileMsg.file_server_host` 就是它，B 从 `<它>/<file>.cba` 下载；`web_server` 把 `assets/archives` 挂在 `/assets/archives`。为让 `test-http` 的 GET 有 200，生成器多放一个 `assets/archives/index.html`。smoke 的 `-SiteBFileServerHost` 改名 `-SiteAArchivesHost`（旧名仍接受）。
  2. **每站一份工程副本**：默认把模板工程里的 `-IncludedProjects`（默认 `["SCB"]`，19 个文件 · 3 MB）复制到 `<site>/project/`，`project_path` 指向副本。否则 B 的 clone 会写到 A 正在读的同一个文件（也就是真实的 `D:\AVEVA\Projects\E3D2.1`），既危险也验不出东西；同时也解决了 P3 记录里「首轮 db_index 全量扫描十几分钟」的问题（SCB 的 7 个库 1 s 扫完）。`-ShareProjectPath` 可退回共读真实工程。
  3. site-a 自有库 `location_dbs` 从 `[251181]`（AvevaMarineSample 里的库）改为 `[6000]`（`scb6000_0001`），与只收 SCB 一致；`-SiteALocationDbs` 可改。
  4. smoke 给 A 建 env 时不再传 `location_dbs = null`，而是先读 `runtime/config` 把站点当前的 `location_dbs` 原样带上——`activate` 会把 env 的值写回 toml，传 `null` 会把自有库清成 `[]`，中继就会把收到的别家文件当自有库再广播。
  5. LS-23/24 的「A 改一个自有 db 文件」用**回退水位**模拟（`relay_sync_watermark.sesno -= N`，指纹不动）：机器上没有 E3D，没法真保存一个 session；回退后 A 的中继轮询判定 `latest_sesno > 水位` → diff → 广播，与真实新会话走的是同一条路。LS-23 之前 smoke 还会在 **Site B 也激活一个 env**（B 的订阅随 activate 起），并把两个 smoke env 的 `detect_interval` 经 `PUT envs/{id}/config` 调成 5 s；B 的副本先被追加 512 字节垃圾，LS-24 要求 clone 后与 A 的源 SHA256 一致（没被还原时 smoke 截回原长度）。
  6. LS-23/24 在 LS-22 `stop` **之前**执行、之后记录，保住 LS-01–22 的编号；收尾同时 stop + 删 B 的 env。
- `docs/e2e-smoke/local-remote-collab-test-plan.md`：§2 拓扑、§3「为什么不再需要 SurrealDB」（整段重写）与隔离键表、§4.0 前置、§5 参数、§6 24 项 + ≥ 22/24 通过标准、§7 注意事项。新增 `docs/e2e-smoke/2026-09-15-sqlite-only-collab-smoke-report.md`；两份 2026-05-17 的结果 JSON 已用本次结果覆盖（smoke 默认报告路径 + `-FixtureOnly`）。
- 验证（本机，无 `surreal`、无 SurrealDB 监听 8021/8022）：
  - 生成器 `-Force`：两站配置 python `tomllib` 校验 ok（`relay: true, auto_start: false, project_path: runtime/local-collab/site-x/project, included_projects: ["SCB"]`），SCB 各复制 19 个文件 2.97 MB；装 Mosquitto 前前置只报 mosquitto / mosquitto_pub 缺失，装后全 OK。
  - 用生成的 `start.ps1` 起两站：`⏭️ 跳过 SurrealDB 自启动（auto_start_surreal = false）`，`[collab-migrate] … relay_sync_watermark 就绪`，`/api/site/identity` 与 `/assets/archives`（index.html）均 200。
  - **无 broker 一跑**（`-RelayTimeoutSec 40`）：20 passed / 2 failed / 2 skipped，52 s——LS-13 activate 无 SurrealDB 也 success，LS-15 `active: true, relay: true`，**LS-23 passed**（A 基线 `6000 / 33` → 回退 32 → 5 s 后 `outbound / ok / 32 → 33 / +10 -0 ~2 / 12 条变更`；A 水位表只有 6000，自有库过滤生效）；LS-03 / LS-24 failed 只因 1883 无人监听、B 收不到；LS-19/20 skipped 无 `mosquitto_pub`。
  - **有 broker 一跑**（Mosquitto 2.1.2 服务）：**24 passed / 0 failed / 0 skipped，7 s**。LS-23 同上（`msg_id 949eac95…`）；**LS-24**：B 日志 `MQTT clone scb6000_0001 updated=true cost=0.312s` → `收包校验通过 sesno=33` → 台账 `inbound / ok / sesno_to 33 / sesno_seen 33 / 同一 msg_id`（A 发出后 0.4 s），B 水位 6000 → 33（指纹 NULL），B 的副本从被追加 512 字节的 2 398 720 B 还原到 2 398 208 B，SHA256 与 A 的源一致；LS-20 一次探测即 `mqtt_connected: true`。两站 env 收尾 stop + delete 均 ok。
  - 跑完已停两站进程；真实工程 `D:\AVEVA\Projects\E3D2.1` 未被写过。运行期 sqlite 留在 `runtime/local-collab/site-x/`（台账可查）。
- **复验（23:33，接手会话，产品侧零改动）**：两站重起后**连跑两次 24/24**（各 7 s），且先把 site-b 的 `[surrealdb].port` 从 8022 挪到无人监听的 8122——机器上另有一个无关的 `aios-database` 占着 8022，22:23 那一跑里 site-b 指向的端口其实有人应答；复验这一跑两站的 SurrealDB 端口都确认无人监听，`activate` 照样成功、`relay: true`。复验顺手修掉 smoke 自己的两个缺陷：① 中继轮询周期性持有 db 文件句柄，smoke 开文件要重试（`Invoke-WithFileRetry`）；② PS 5.1 的 `ConvertFrom-Json` 不展开 JSON 数组，B 台账有两行时 `$rows[0]` 拿到的是两行一起、`sesno` 比成 `"33 33"` vs `"33"`。第二件事的诱因是 **broker 的 retained 消息**：B 一订阅就会把上一轮的广播再收一遍（幂等），因此 LS-24 收紧为「必须是 A 本轮那条 `msg_id`」——比 22:23 那一跑更严。两份结果 JSON 由复验这一跑写出。详见报告 §3.3。

---

## 5. 执行顺序与依赖

```
P0（e3d-io 落位 + 编译）
   ├──→ P1（台账 + 收包校验）──┐
   └──→ P2（开关 + 解闸）──────┼──→ P3（中继轮询）──→ P4（双站点验证）
```

- P1 与 P2 互不依赖，可并行；P3 同时要 P1 的台账函数与 P2 的 `relay` 分支。
- 每阶段收尾跑 `cargo build --bin web_server --features web_server,relay-sync` **和** `--features web_server,mqtt`（两个都要过，后者证明没 relay-sync 时一切照旧）。
- P2 之后跑一次 monitor 的 `npm run smoke:topology-deploy:live --api http://127.0.0.1:4100`（只读），确认控制面没被改坏。

**动手前的备份（Q4=B）**：`Copy-Item` 到 `plant-model-gen/runtime/backup-2026-09-15/`，保留相对路径：
`Cargo.toml`、`src/options.rs`、`src/mqtt_service/mod.rs`、`src/data_interface/mqtt_file_sync.rs`、`src/data_interface/mod.rs`、`src/version_management/mod.rs`、`src/web_server/remote_runtime.rs`、`src/web_server/remote_sync_handlers.rs`、`src/web_server/collab_migrations.rs`、`src/bin/web_server.rs`。新建文件（`sync_ledger.rs`、`relay_sync.rs`）不需要备份。

---

## 6. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 中继站点的模型库永远不更新 | 站点只能回答 e3d-io 级别的问题（元素 / 属性 / 变更清单），三维 / 校审要另起完整站点 | Q1=B 已确认这正是需求；源文件都在盘上，哪天要升级为完整站点，起 SurrealDB 做一次全量入库即可 |
| 广播依据从「已提交进库」变为「源文件 sesno 前进且 diff 非空」 | 可能广播半写状态 | 一拍去抖（指纹稳定一个周期）+ e3d-io 打不开就不发 + pdms_io / e3d-io 双读交叉校验 |
| 首次激活只写基线不广播 | 若对端从未拿过该文件，永远收不到 | 首次全量拷贝是部署流程既有的一步（测试计划里 site-b 的 fixture 就是这么来的）；后续可加「手动全量推送」按钮，不在本期 |
| `diff_sessions` 在 `MERGE CHANGES` 后拿不到水位对应的会话 | 判不了变更 | `AtOrBefore(水位)` 兜第一层；再失败标 `unavailable` 并照常广播，不因判不了而漏发 |
| `SyncE3dFileMsg` 加字段 | 新旧站点混跑 | `#[serde(default)]` + serde_json 忽略未知字段，两个方向都兼容；旧发送端的消息在新接收端只是校验降级为 `skipped` |
| e3d-io 边界情况（大库、多扩展文件、非 E3D 2.1/3.1 版本） | `open` / `diff` 报错 | 全部按「记台账、跳过、下轮重试」处理，从不让循环退出，从不阻断 clone |
| hash 不一致时源文件已被 clone 覆盖 | 无法自动回滚 | 本期只记 `hash_mismatch` 并告警；回滚需要 clone 前快照，列为后续项 |
| 22 个 old/ 下 crate 依赖 vendor 现址 | move 会全断 | 用 clone 而非 move；同级副本 `origin` = vendor，`git pull` 同步 |
| 后端不是 git 仓 | 改坏难恢复 | §5 备份清单；新建文件不影响回滚 |
| 构建命令变化（`mqtt` → `relay-sync`） | 老命令编出来的二进制 `sync_relay_mode=true` 会在 activate 时 bail | P2 那条 bail 文案直接写出正确的 feature 名；P4 同步改所有文档与脚本 |

---

## 7. 已定与本版默认

**已定（grill 2026-09-15）**：Q1=B、Q2=L2、Q3=B（clone 形式）、Q4=B。

**本版默认——不同意就在 Plannotator 里批注，哪条改哪条**：

1. 开关是 `DbOptionExt` 顶层 `sync_relay_mode`，不动 rs-core、不复用 `use_surrealdb`。
2. e3d-io 用 feature `relay-sync = ["mqtt", "dep:e3d-io"]` 门控，构建命令随之改为 `--features web_server,relay-sync`。
3. `SyncE3dFileMsg` 新增可选字段 `file_sesnos`（线格式向后兼容）。
4. 台账按**每文件一行**建模，附 `e3d_sync_changes` 变更清单表（上限 20 000 行 / 次）；**P1 只建表不给 API**，读侧 API 与 L3 一起下一期。
5. 首次见到某 dbnum 只写基线、不广播。
6. 一拍去抖（指纹稳定一个 `detect_interval` 才处理）。
7. `location_dbs` 非空时中继只广播自有库；为空则全部广播（与今天一致）。
8. 中继轮询周期取 `remote_sync_env_config.detect_interval`，读不到用 30 s。
9. `hash_mismatch` 只记录告警，不回滚。
