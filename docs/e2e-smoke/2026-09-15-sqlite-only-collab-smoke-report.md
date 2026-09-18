# 2026-09-15 · SQLite-only 中继模式双站点 smoke 报告（P4）

> 方案：`docs/plans/2026-09-15-sqlite-only-remote-collab-plan.md`（P0–P3 已落地，本文是 P4 的执行记录）
> 测试计划：`docs/e2e-smoke/local-remote-collab-test-plan.md`（本次同步改为 24 项）
> 状态：**24/24 通过（2026-09-15 22:23，机器上没有 `surreal`，只有 Mosquitto + 两个中继 `web_server`）**——方案 P4 验收（≥ 22/24）达成。
> 同一天早一点的无 broker 一跑是 20/24（§3.1），装上 Mosquitto 后 §3.2 全绿。结果 JSON：`local-remote-collab-smoke-result.json` / `local-remote-collab-fixture-result.json`（覆盖了 2026-05-17 的旧结果）。
> **23:33 由接手会话独立复验：连跑两次 24/24（§3.3），且两站的 SurrealDB 端口都指向无人监听处。复验过程中发现并修掉了 smoke 自己的两个缺陷（与产品无关），LS-24 因此比 22:23 那一跑更严格——现在要求 B 收到的就是 A 本轮那条消息。结果 JSON 是复验这一跑写的。**
> **2026-09-16 00:54 补跑只读控制面 live smoke（`topology-deploy-live-smoke.mjs`）打到中继模式的 Site A：LR-00–LR-06 三跑各 7/7（§3.4）。同时记下一点：中继站点仍会尝试连 SurrealDB 并失败，「不需要 SurrealDB」指的是中继链路，校审等接口在这套环境里不可用。**
> **2026-09-16 站点后端换成 `plant-web-server`，同一对进程连跑三次 24/24（§3.5）。2026-09-17 台账读侧 API（pws `b61b7ca`）上线后用例扩到 25 项（LS-25）：07:11 首跑 25/25，23:20 重编 exe 后复跑 25/25（§3.6）；结果 JSON `local-remote-collab-smoke-result-pws-ledger.json` 是复跑这一份。**

## 1. 这次改了什么

| 文件 | 变更 |
|---|---|
| `scripts/local-remote-collab-setup.ps1` | 生成的两份 `DbOption.toml` 顶层加 `sync_relay_mode = true`，`[web_server].auto_start_surreal = false`，`file_server_host` 改为本站 `/assets/archives`（别站下载 CBA 的真实语义）；新增 `-IncludedProjects`（默认 `SCB`）、`-SiteALocationDbs`（默认 `[6000]`）、`-RelayDbFile`（默认 `scb6000_0001`）、`-ShareProjectPath`；默认把模板工程里的 SCB **各复制一份**到 `<site>/project/`（19 个文件 · 3 MB，跳过 `cbas/`）；前置检查去掉 `surreal`，构建命令改 `--features web_server,relay-sync`，加 `sqlite3 或 python`；多放一个 `assets/archives/index.html` 让 `test-http` 对 CBA 目录 GET 有 200；`COMMANDS.md` 加第 8 步（查两站台账） |
| `runtime/local-collab/{site-a,site-b}/start.ps1`（生成物） | 启动横幅 `relay（无 SurrealDB）`，`cargo run` 回落改 `web_server,relay-sync` |
| `runtime/local-collab/COMMANDS.md`（生成物） | 前置去掉 surreal；smoke 命令带 `-SiteASqlite/-SiteBSqlite/-RelayFileA/-RelayFileB` |
| `scripts/local-remote-collab-smoke.ps1` | 新增 **LS-23 `relay-outbound-ledger`** / **LS-24 `relay-inbound-ledger`**（在 LS-22 stop 之前执行、之后记录，保住 01–22 编号）；Site A 的 env 带上站点当前 `location_dbs`（`runtime/config`）与 `file_server_host = <A>/assets/archives`；两个 smoke env 的 `detect_interval` 经 `PUT envs/{id}/config` 调成 5 s；Site B 也登录 / 建 env / activate 并在收尾 stop + 删；SQLite 访问优先 `sqlite3 -json`、回落 python；新参数见测试计划 §5。**23:33 复验时又修了两处 harness 缺陷**（开文件重试、PS 5.1 的 JSON 数组不展开导致多行台账比错），并把 LS-24 收紧成「必须是 A 本轮那条 `msg_id`」，见 §3.3 |
| `docs/e2e-smoke/local-remote-collab-test-plan.md` | §2 拓扑、§3 隔离键与「为什么不再需要 SurrealDB」、§4.0 前置、§5 参数、§6 24 项验收点与 ≥ 22/24 通过标准、§7 注意事项 |

后端（`plant-model-gen`）本阶段**零改动**：P1–P3 的代码已经够用，本次只是把环境和脚本对上。

## 2. LS-23 / LS-24 怎么验中继链路

E3D 不在机器上，smoke 没法真的「保存一个 session」，所以用**回退水位**模拟 A 侧出现了新会话：

1. 在 Site B 也激活一个 env（B 的 MQTT 订阅随 activate 起）；
2. 等 A 的中继轮询给 `scb6000_0001`（dbnum 6000，A 的自有库）写基线水位（`relay_sync_watermark.sesno = 33`）；
3. 给 **B 的副本** `site-b/project/SCB/scb000/scb6000_0001` 追加 512 字节随机数据；
4. 把 A 的水位 `33 → 32`（指纹不动，免去一拍去抖）；A 下一轮判定 `latest_sesno 33 > 水位 32` → e3d-io `diff_sessions(AtOrBefore(32), Latest)` → CBA 压缩 → MQTT 广播 → 台账 `outbound / ok`（**LS-23**）；
5. B 收到 → 从 `http://127.0.0.1:4100/assets/archives/scb6000_0001.cba` 下载 → clone 到自己的副本 → Blake2b512 与消息一致、e3d-io 打开、`sesno_seen == sesno_to` → 台账 `inbound / ok`；副本 SHA256 回到与 A 的源一致（**LS-24**）。

两站各读各的工程副本，B 的 clone 不会碰到 A 正在读的文件，更不会碰真实的 `D:\AVEVA\Projects\E3D2.1`。

## 3. 本机结果

环境：Windows，`D:\Rust\target\debug\web_server.exe`（`web_server,relay-sync`，2026-09-15 20:43 构建），两站由生成的 `start.ps1` 拉起，机器上**没有 `surreal`、没有任何 SurrealDB 进程监听 8021/8022**。

### 3.2 有 broker（22:23 · Mosquitto 2.1.2 服务 · **24/24 · 7 s**）

`winget install --id EclipseFoundation.Mosquitto -e` 之后服务 `mosquitto` 常驻 `127.0.0.1:1883`（local-only 模式、允许匿名），生成器 `-Force` 重跑前置检查全 OK，两站重启，smoke 用默认报告路径：

```text
  LS-01 … LS-18 passed
  LS-19 passed  mqtt-publish-test               (mosquitto_pub → Sync/E3d)
  LS-20 passed  mqtt-received-after-publish     (1 次探测 mqtt_connected 即 true)
  LS-21 passed  remote-sync-logs
  LS-22 passed  runtime-stop-clears-active
  LS-23 passed  relay-outbound-ledger
  LS-24 passed  relay-inbound-ledger
  passed : 24   failed : 0   skipped: 0         耗时 7 s
```

中继链路的证据（报告 `details` + 两站 SQLite）：

| 项 | 值 |
|---|---|
| A 基线 → 回退 | `6000 / scb6000_0001 / sesno 33` → `32` @ 14:23:54Z |
| A 台账（LS-23） | `outbound / ok / diff ok / 32 → 33 / seen 33 / +10 -0 ~2 / 12 条变更 / msg_id 949eac95…` @ 14:23:58Z |
| B 日志 | `MQTT clone scb6000_0001 updated=true cost=0.312s` → `MQTT 收包校验通过 scb6000_0001: sesno=33` → `relay_sync_watermark dbnum=6000 -> sesno 33` |
| B 台账（LS-24） | `inbound / ok / sesno_to 33 / sesno_seen 33 / 同一个 msg_id 949eac95…` @ 14:23:59Z（A 发出后 0.4 s） |
| B 副本 | 追加后 2 398 720 B → clone 后 2 398 208 B，SHA256 `D9E9385F…` == A 的源文件 |
| B 水位 | dbnum 6000 → 33，指纹 NULL（收包端写法），下一轮 `latest 33 <= 33` 不回声 |

两站 env 收尾 stop + delete ok；两站进程随后停止。运行期 sqlite（含上面的台账）留在 `runtime/local-collab/site-x/`，可按 `COMMANDS.md` 第 8 步查看。

### 3.3 复验（23:33 · 接手会话 · **连跑两次 24/24 · 各 7 s**）

§3.2 的结论不是照抄记录：接手会话把两站重起了一遍、重跑了 smoke。为了让「不需要 SurrealDB」这句话没有余地，复验前先把 **site-b 的 `[surrealdb].port` 从 8022 挪到无人监听的 8122**——机器上另有一个与本项目无关的 `aios-database` 进程占着 `0.0.0.0:8022`（19:27 起的，早于 §3.2 那一跑），也就是说 22:23 那一跑里 site-b 配置指向的端口其实是有人应答的。复验这一跑两站的 SurrealDB 端口（8021 / 8122）都确认无人监听，启动日志里没有任何一行 SurrealDB 连接成功，`activate` 照样 `success`、`runtime/status` 照样 `relay: true`。跑完已把 site-b 的端口改回生成器写的 8022。

复验中发现的三件事（前两件是 smoke 自己的缺陷，**产品侧没改一行**）：

| # | 现象 | 根因 | 处理 |
|---|---|---|---|
| 1 | smoke 起手 3 s 就崩：`Get-FileHash … being used by another process` | 中继站点每个轮询周期都会打开那一批 db 文件（`db_index` 扫描 + e3d-io）。smoke 在 B `activate` 之后立刻去哈希同一个文件，必然要和轮询抢句柄——B 刚起来、索引还没追平时每轮都在解析，撞上的概率接近 1 | 新增 `Invoke-WithFileRetry`（30 次 × 500 ms），`Get-FileSha256` / 追加垃圾字节 / 截回原长度这三处开文件的地方都走它 |
| 2 | LS-24 failed，但 B 的副本明明和 A 的源文件 SHA256 一致 | Windows PowerShell 5.1 的 `ConvertFrom-Json` 把整个 JSON 数组当**一个**对象往下传，`@(…)` 包不开；B 台账有两行时 `$rows[0]` 拿到的是两行一起，`[string]$row.sesno_to` 成了 `"33 33"`，与 A 的 `"33"` 比当然不等。单行时靠成员枚举碰巧是对的，所以 22:23 那一跑没暴露 | `Invoke-SqliteQuery` 先落变量再展开；**并且**给 `Wait-LedgerRow` 加 `MsgId` 过滤，LS-24 现在只认 A 本轮那条 `msg_id` |
| 3 | B 一订阅就先收到一条**上一轮**的消息（`msg_id 949eac95…`，22:23 那次的），台账多一行 `inbound/ok` | broker 上的 retained 消息。B 重新订阅时被立刻投递、照常 clone + 校验一遍——幂等，不是故障 | 不改产品；LS-24 锁 `msg_id` 之后不再受它干扰（也顺带堵住了「retained 老消息让 LS-24 假绿」这个洞） |

复验这一跑的中继链路证据：A `outbound/ok` `32 → 33` `+10 -0 ~2`、12 条变更、`msg_id 8f450e3b…`；B **同一个 `msg_id`** 的 `inbound/ok`，`sesno_seen = sesno_to = 33`，副本 `2 398 208 B` / SHA256 `D9E9385F…` 与 A 的源一致；两站 env 收尾 stop + delete 全 ok，跑完两站进程已停、真实工程 `D:\AVEVA\Projects\E3D2.1` 三小时内零写入。

### 3.4 只读控制面 live smoke 打到中继站点（2026-09-16 00:54–00:55 · 三跑各 7/7）

交接单上「monitor 的 `topology-deploy-live-smoke`（只读控制面）本轮没跑」的补跑。这套 L2 只读用例此前只对着 `plant-web-server`（shape `pws`，2026-09-14 @ :3100）跑过；这次让它对着**中继模式的 Site A**（`plant-model-gen`，shape `pmg`，:4100）跑，问的是「控制面 UI 在 `sync_relay_mode = true` / 不起 SurrealDB 的后端上还能不能用」。

```powershell
node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100 --build   # 默认 readonly；脚本层安全闸拦下一切非探测写请求
```

**LR-00…LR-06 全 passed（7 / 0 / 0，约 10 s），连跑三次结果一致**；第三跑 Site B 也起着，入库的就是这一跑。

| 用例 | 这一跑看到的 |
|---|---|
| LR-00 | 形状识别为 `pmg`；`/health` `status ok` / `database healthy`（LiteFS disabled）；`envCount 3`、`activeEnvId null`、`runtime { active: false, relay: false, status: success }` |
| LR-01 | UI admin 登录 → 重定向回 `/topology`，运行时 pill = `运行时 · 未激活` |
| LR-02 | 3 张 env 卡、0 个「已激活」徽标，与 `activeEnvId null` 自洽 |
| LR-03 | 测 MQTT → `MQTT 连接可达 · 127.0.0.1:1883 · 0 ms` |
| LR-04 | 测文件服务 → `文件服务可达 · http://127.0.0.1:4100/assets/archives · HTTP 200 · 4 ms` |
| LR-05 | 站点表 1 行；Site B 没起的前两跑后端如实报「不可达」，起了之后 `metadata.json 可达 · HTTP 200 · 3 ms` |
| LR-06 | 14 次 API 调用全在探测白名单内，**0 次非探测写请求、0 pageerror** |

结果 JSON：`docs/e2e-smoke/topology-deploy-live-readonly-relay-result.json`；截图 3 张在 `docs/e2e-smoke/screenshots/topology-deploy-live/readonly-relay/`（目录 `.gitignore`，JSON 里的 `screenshots` 已从跑时的 `%TEMP%` 改指到这里，其余字段原样）。2026-09-14 那份 pws 的 `topology-deploy-live-readonly-result.json` **没有被覆盖**。

两件顺带的事：

- 唯一一条 `consoleError` 是 `404`：`dist/` 里没有 `favicon.ico`（`index.html` 引用的 7 个资源都在），Chrome 自动请根 favicon 的结果，与后端无关。Site B 没起的那两跑各 2 条，多出来的一条是 `ERR_CONNECTION_REFUSED`。
- **中继站点照样会去连 SurrealDB**：`auto_start_surreal = false` 只管「不自己拉起 `surreal`」，进程仍按 `[surrealdb]` 配的地址连。site-a 日志里 `⚠️ 数据库基础连接失败，后续将继续后台重试` → `❌ 连接尝试 1/2/3 失败` → `❌ SurrealDB 连接失败` → `⚠️ review 专用数据库连接初始化失败，后续校审接口可能不可用`，前后约 15 s（`os error 10061`）。中继链路和本节 7 项只读用例都不受影响，`/health` 也仍报 `database: healthy`——也就是说这个健康检查并不覆盖 SurrealDB。准确的说法是「**中继链路**不需要 SurrealDB」，而不是「这套环境里所有接口都不需要」：校审等依赖 SurrealDB 的接口在这里是不可用的。

### 3.5 站点后端换成 `plant-web-server`（2026-09-16 09:54–09:56 · 连跑三次 24/24 · 各 31–32 s）

中继实现搬进 `plant-web-server` 之后，两站都改用 `D:\Rust\target\debug\plant-web-server.exe` 起，**同一套 24 项用例原样跑**（`scripts/local-remote-collab-smoke.ps1` 只改了一处判定，见下）。**三跑都是 24 / 0 / 0**，而且**三跑在同一对进程里**——这点是故意的，因为重新激活正是下面那个订阅缺陷的触发条件。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -Force   # 站点后端只有 plant-web-server 一种
# 按 ../plant-web-server/runtime/local-collab/COMMANDS.md 起 Mosquitto / Site A / Site B（2026-09-18 前这套环境在 ../plant-model-gen/runtime/local-collab/）
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 -SiteABase http://127.0.0.1:4100 -SiteBBase http://127.0.0.1:4101 ...
```

结果 JSON：`docs/e2e-smoke/local-remote-collab-smoke-result-pws.json`（第三跑）。`plant-model-gen` 那份 `local-remote-collab-smoke-result.json` 没有被覆盖。

换后端时括出来的三件事，都已修掉：

| 现象 | 根因 | 改在哪 |
|---|---|---|
| 首跑 LS-24 `Site B runtime not active`，但 LS-23 明明记着 B `active: true` | 判定写死了 `activate.response.status == "success"`（plant-model-gen 的形状）；plant-web-server 给的是 `success: true`，它的 `status` 在 `item` 里、是 env 的状态不是调用结果 | `local-remote-collab-smoke.ps1` 该判定改为两种形状都认 |
| 次跑 LS-24 B 一条 inbound 都没有；B 日志刷 `Unsolicited pubrel packet: 20` → `MQTT 文件订阅连接异常`，重连后又是同一条 | 重新激活会把 MQTT 订阅拆了重建。上一条 QoS 2 事务断在半程，broker 替这个 client id 记着；新 client 一连上就收到 PUBREL，被判成 unsolicited ack。**这个缺陷 `plant-model-gen` 里那份同样有**，只是此前每个进程只激活一次，碰不到 | 订阅改为**跟着进程走**（重新激活只换轮询，订阅原样留着），并且订阅端用 clean session——它补课靠的是 retain 消息 + 中继水位，不靠 broker 的会话存储 |
| B clone 全部 `clone_failed: Failed to read archive at .../assets/archives/...` | `plant-web-server` 根本没有 `/assets/archives` 路由，对端下载 CBA 必然 404；`/files/output` 也固定指 `<repo_root>/output`，两站会指到同一个目录 | 补 `/assets/archives` 静态路由；`/files/output` 改为按配置的 `output_root` |

顺带一提，`plant-web-server` 启动时也会碰一下 SurrealDB（`MbdService`），但它**失败即返回、不重试**，只打一行 `MBD V2 data source unavailable at startup`——不是 §3.4 里那 15 s。

### 3.6 台账读侧 API 上线后的 25 项（2026-09-17 · 07:11 首跑 25/25 · 23:20 重编后复跑 25/25 · 各 32 s）

`plant-web-server` `b61b7ca` 加了 `/api/remote-sync/ledger/*` 五个只读端点（方案 `docs/plans/2026-09-17-relay-ledger-read-api-plan.md`），smoke 随之加 **LS-25 `relay-ledger-api`**：拿 LS-23 那条广播的 `msg_id`，核 A 的 `GET ledger?direction=outbound&msg_id=…` 恰 1 行 `ok` 且 `changes_count` / `rows/{id}/changes.total` 与 `sqlite3` 数出的 `e3d_sync_changes` 行数一致，再核 B 的 `GET ledger?direction=inbound&msg_id=…` 恰 1 行 `ok`、`sesno_seen == sesno_to`（后端没这组端点 → skipped）。通过线 ≥ 23/25。

两跑都是 **25 / 0 / 0**，两站都是 `b61b7ca` 的 `plant-web-server.exe`，broker 是 Mosquitto 服务：

| 跑 | 时间 | 说明 |
|---|---|---|
| 首跑 | 2026-09-17 07:10:56–07:11:28 | P1 / P2 落地那一轮；同一会话里 mock RL-01–08 8/8、live RL-L0–L3 4/4（`relay-ledger-smoke-result.json` / `relay-ledger-live-result.json`） |
| 复跑 | 2026-09-17 23:20:09–23:20:41 | 接手会话核查进度时发现 `D:\Rust\target\debug\plant-web-server.exe` 已不在（debug 目录 19:43 有过改动），`cargo build --bin plant-web-server` 重编（161 s，无 error、本仓无新增 warning）后用有尽头脚本起两站 → 跑 smoke → 停两站；`npm run type-check` 同轮重跑 0 errors |

复跑的 LS-23 / 24 / 25 证据（报告 `details`）：

| 项 | 值 |
|---|---|
| A 广播 | 日志 `relay-sync 已广播 dbnum=6000 scb6000_0001: sesno 32 -> 33 diff=ok (+10 -0 ~2) changes=12`；台账 `outbound / ok / msg_id b3bf6063…`，`e3d_sync_changes` 12 行（首条 `22384/33238`） |
| B 收包 | `MQTT 收包校验通过 scb6000_0001: sesno=33`；台账 `inbound / ok / sesno_to 33 = sesno_seen 33 / 同一 msg_id`（A 发出后 1 s 内）；B 副本从 2 398 720 B 还原到 2 398 208 B，SHA256 与 A 的源一致 |
| LS-25 | A `GET ledger` total 1 · `verify_status ok` · `changes_count 12` == sqlite3 12；`rows/{id}/changes` total 12；B `GET ledger` total 1 · ok · `sesno_seen 33 == sesno_to 33` |
| 收尾 | 两 env stop + delete ok；两站进程已停、4100 / 4101 空闲；两站 `DbOption.toml` 跑前跑后 SHA256 一致 |

结果 JSON：`docs/e2e-smoke/local-remote-collab-smoke-result-pws-ledger.json`（**复跑这一份**，覆盖了 07:11 首跑写的同名文件；`-pws.json` 与 `-result.json` 两份没动）。

顺带：B 一订阅就先把 broker 的 retained 消息收了一遍（`f5855c17…`，07:11 那一跑的广播），再收本轮那条——§5 记过的既有行为，LS-24 / LS-25 都按 `msg_id` 判，不受影响。B 台账里 2 行 `clone_failed` 是 2026-09-16 01:09 `plant-model-gen` 时期的旧行（那时 pws 还没有 `/assets/archives` 路由，见 §3.5 那张表），与这两跑无关。

### 3.1 无 broker（21:48 · 20/24，仅作对照）

```text
  LS-01 passed  site-a-port
  LS-02 passed  site-b-port
  LS-03 failed  mqtt-port                       ← 没装 Mosquitto
  LS-04 passed  site-a-identity
  LS-05 passed  site-b-identity
  LS-06 passed  site-identity-distinct
  LS-07 passed  site-a-admin-login
  LS-08 passed  remote-env-create               (location_dbs "6000", file_server_host http://127.0.0.1:4100/assets/archives)
  LS-09 passed  remote-site-create
  LS-10 passed  remote-env-test-mqtt
  LS-11 passed  remote-env-test-http            (诊断 code 200「文件服务可达」，GET /assets/archives → index.html)
  LS-12 passed  remote-site-test-http
  LS-13 passed  remote-env-activate             ← 无 SurrealDB 也 success（P2 之前必失败）
  LS-14 passed  remote-runtime-status
  LS-15 passed  remote-runtime-active-env       (active true · relay true · env_id 一致)
  LS-16 passed  remote-topology
  LS-17 passed  mqtt-subscription-status
  LS-18 passed  incremental-fixture-append
  LS-19 skipped mqtt-publish-test - mosquitto_pub not found
  LS-20 skipped mqtt-received-after-publish - mqtt publish not performed
  LS-21 passed  remote-sync-logs
  LS-22 passed  runtime-stop-clears-active
  LS-23 passed  relay-outbound-ledger
  LS-24 failed  relay-inbound-ledger            ← B 没收到（无 broker，A 的 publish 在 rumqttc 里排队）
  passed : 20   failed : 2   skipped: 2         耗时 52 s
```

LS-23 的证据（报告 `details`）：

| 项 | 值 |
|---|---|
| Site B | login ok · env ok · `detect_interval` ok · activate `success` · `runtime = {active: true, relay: true}` |
| A 基线 | `dbnum 6000 · scb6000_0001 · sesno 33 · fingerprint 1655368834000000000:2398208` |
| 回退 | `33 → 32` @ 13:49:13Z |
| A 台账 | `outbound / ok / diff ok / sesno 32 → 33 / seen 33 / +10 -0 ~2 / e3d_sync_changes 12 行 / msg_id 7ae59043…` @ 13:49:18Z（回退后 5 s，一轮） |
| A 水位表 | 只有 dbnum 6000（`location_dbs = [6000]` 过滤生效，B 的水位表则是 SCB 全部 7 个库） |
| B 副本 | 追加后 2 398 720 B（原 2 398 208 B）；因未收到广播未被还原，smoke 已截回原长度 |

两个 smoke env 收尾都 stop + delete 成功（`cleanup.stop.ok` / `cleanup.site_b.stop.ok`）。

## 4. 复跑步骤

```powershell
winget install --id EclipseFoundation.Mosquitto -e          # 一次性；装到 C:\Program Files\mosquitto，服务 mosquitto 常驻 127.0.0.1:1883
cd D:\work\plant-code\plant-collab-monitor
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -Force   # 重生成（前置检查应全 OK；-Force 也把工程副本复位）
# 2026-09-18 起产物在 ../plant-web-server/runtime/local-collab/（模板 ../plant-web-server/db_options/DbOption.toml，两站 --repo-root 也是 plant-web-server；不再碰 plant-model-gen）
# 服务在跑就不用再起 start-mosquitto.ps1（1883 会绑不上）；两个终端分别跑 COMMANDS.md 第 2/3 步（Site A、Site B），然后：
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 `
  -SiteABase http://127.0.0.1:4100 -SiteBBase http://127.0.0.1:4101 `
  -FixtureDir D:\work\plant-code\plant-web-server\runtime\local-collab\site-b\output -MosquittoDir "C:\Program Files\mosquitto" `
  -SiteASqlite D:\work\plant-code\plant-web-server\runtime\local-collab\site-a\deployment_sites.sqlite `
  -SiteBSqlite D:\work\plant-code\plant-web-server\runtime\local-collab\site-b\deployment_sites.sqlite `
  -RelayFileA D:\work\plant-code\plant-web-server\runtime\local-collab\site-a\project\SCB\scb000\scb6000_0001 `
  -RelayFileB D:\work\plant-code\plant-web-server\runtime\local-collab\site-b\project\SCB\scb000\scb6000_0001
```

预期 **24/24，`passed: true`**（通过线是 ≥ 22/24：LS-19/20 允许因缺 `mosquitto_pub` skipped）。报告默认写到 `docs/e2e-smoke/local-remote-collab-smoke-result.json`；`-FixtureOnly -FixtureDir $env:TEMP\remote-collab-fixture -ReportPath docs/e2e-smoke/local-remote-collab-fixture-result.json` 刷新另一份。两份 2026-05-17 的旧结果（1/19 失败）已被本次覆盖。

§3.4 的只读控制面那一跑（两站起着就能跑，别覆盖 pws 那份结果）：

```powershell
node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100 `
  --report docs/e2e-smoke/topology-deploy-live-readonly-relay-result.json `
  --shots docs/e2e-smoke/screenshots/topology-deploy-live/readonly-relay
```

## 5. 顺带记录

- 报告 JSON 里后端返回的中文（如 `"message": "已写入配置文件并启动…"`）被 Windows PowerShell 5.1 的 `Invoke-RestMethod` 按 Latin-1 解码成乱码，2026-05-17 的旧报告同样如此；只影响可读性，不影响判定。想干净可用 PowerShell 7 跑 smoke。
- **广播用的是 retained 消息**：任何一个站点重新订阅，broker 都会立刻把最后一条 `Sync/E3d` 投给它，于是它会把上一次广播的文件再 clone + 校验一遍（幂等，台账多一行 `inbound/ok`）。好处是新站点上线就能追平最后一次变更，代价是「B 收到了」这件事不能只看有没有 `inbound/ok` 行——要对 `msg_id`，LS-24 现在就是这么判的。
- `activate` 只改写 toml 不热加载 `aios_core::get_db_option()`：发布 / 订阅客户端的 `mqtt_host`、消息里的 `location` 取自进程启动时的配置。生成器先写 toml 再起进程，本流程不受影响。
- LS-23 里回退 1 个会话正好落在会话链上还保留的会话（SCB 样例的链没被 MERGE），diff 是精确的 `32 → 33`；对被 `MERGE CHANGES` 折过的库（如 `acp7001_0001` 只保留 1 与 270），`AtOrBefore` 会从更早的保留会话起算、全量重报，`verify_detail` 记 `diff_from_resolved=<n>`，仍算 `ok`。
