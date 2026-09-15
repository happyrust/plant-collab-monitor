# 异地部署操作教程 · 真实后端实操版

> 适用对象：要把一个协同环境推上后端运行时、或排查站点连通性的实施 / 运维人员。
> 预计用时：10–15 分钟。
> 生成方式：本文由 `scripts/topology-deploy-live-tutorial.mjs` 于 2026-09-16 自动生成——Playwright 开真实 Chrome，把下面每一步**真的在页面上做了一遍**，后端是真后端（`http://127.0.0.1:4100`，plant-model-gen 中继模式），截图里的每一条提示都是它当时的真实响应。
> 与 `docs/tutorials/topology-deploy-tutorial.md` 的分工：那一份用 mock 喂页面、胜在数据整齐可重复；这一份胜在真实，包括真实的失败提示。
> 收尾：本次新建的环境与站点跑完即删，配置用开跑前的快照 apply 回去，后端恢复原状（核对结果见文末附录）。

## 你将学会

- 从 DbOption 一键导入、或手填新建一个协同环境。
- 用「测 MQTT / 测文件服务 / 站点探测」在动运行时之前确认对端可达。
- 分清「应用」（只写盘）与「激活」（写盘 + 重启运行态），并看懂运行时 pill 与「已激活」徽标。
- 停止运行时、编辑站点，以及动手之前怎么给自己留一条退路。

## 0. 三个词与一条主线

| 词 | 是什么 | 在页面上 |
|---|---|---|
| **环境（Env）** | 一组参与同一次异地协同的站点 + 它们共用的 MQTT / 文件服务地址 | 左侧卡片 |
| **站点（Site）** | 环境下的一个对端节点（`location` + `http_host`） | 右侧表格的一行 |
| **运行时（Runtime）** | 后端此刻按哪个环境在跑 watcher + MQTT 订阅 | 页头 pill + 卡片「已激活」徽标 |

一次完整的部署就是：**建环境 → 测连通 → 激活 → 看 pill 确认 →（需要时）停止**。下面按这个顺序走。

## 0.1 这一跑的现场

| 项 | 值 |
|---|---|
| 后端 | `http://127.0.0.1:4100`（plant-model-gen，形状 `pmg`） |
| 对端（教程里扮演「上海分部」） | `http://127.0.0.1:4101` |
| 开跑前环境数 / 激活环境 | 3 张 / 无 |
| 开跑前运行时 | `active: false`、`relay: false` |
| 生成时间 | 2026/9/16 01:10:56（本机时区） |

> 本机这套两站环境由 `scripts/local-remote-collab-setup.ps1` 生成在 `../plant-model-gen/runtime/local-collab/`，起法见那里的 `COMMANDS.md`。**别把本教程的脚本指向生产后端**——它会真的建环境、真的改配置。

## 1. 登录并进入「异地拓扑」

`/topology` 是管理员页面。未登录直接打开，监控台会记住你要去的地址、弹出「管理员登录」，登录成功后自动回到 `/topology`。账号密码就是后端进程启动时的 `ADMIN_USER` / `ADMIN_PASS` 环境变量（本机两站的启动脚本里写死为 `admin` / `admin`），输入框里的「ADMIN_USER 环境变量值」只是占位提示。

![未登录打开 /topology 弹出的管理员登录框，已填入 admin / admin](./screenshots/topology-deploy-live/01-login.png)

*直接访问 `/topology` 被拦下，填入管理员账号密码后点「登录」。*

## 2. 读懂首屏：运行时 pill 与「已激活」徽标

左边是**环境（Env）**列表，右边是选中环境下的**站点（Site）**。页头右侧那颗胶囊是**运行时 pill**，它每 30 秒读一次 `GET /api/remote-sync/runtime/status`，回答「后端此刻按哪个环境在跑」；鼠标停上去能看到 `env_id`、MQTT 连接状态这些细节。

![登录后的 /topology 首屏：左侧 3 张环境卡片，页头运行时 pill 显示「运行时 · 未激活」](./screenshots/topology-deploy-live/02-overview.png)

*登录后的首屏。红框：运行时 pill 与环境列表。*

这一跑开始时后端的真实状态：pill 是「运行时 · 未激活」，环境卡片 3 张，没有任何环境被激活——也就是 watcher 与 MQTT 订阅都没起。

- 每张卡片下方 4 个动作按钮：**测 MQTT / 测文件服务 / 应用 / 激活**，这就是「部署动作面」。
- 有环境被激活时，它的卡片右上角会挂绿色「已激活」徽标，自己的「激活」按钮置灰（防重复激活），页头同时出现「停止运行时」。
- 任何动作做完，监控台都会立刻重拉 `runtime/status` 与环境列表，不用手动刷新。

## 3. 一键从 DbOption 导入环境（顺便给自己留一份退路）

最省事的建环境方式：点环境列表右上角的「从 DbOption 导入」。后端会读**它自己进程**那份 `DbOption.toml`（`mqtt_host` / `mqtt_port` / `file_server_host` / `location` / `location_dbs`），反向生成一个环境。这一步**不改写配置、也不激活运行时**，只是把「当前配置」登记成一张卡片。

![「确认从 DbOption 导入环境」弹窗，写明将读取后端当前进程的 DbOption.toml 且不改写配置](./screenshots/topology-deploy-live/03-import-confirm.png)

*弹窗写清楚读什么、不会改什么。点「确定」。*

![导入完成：环境数变为 4，新卡片「导入环境 - 20260916_011100」出现并被选中](./screenshots/topology-deploy-live/04-imported.png)

*导入成功：环境计数 +1，新卡片自动被选中（蓝色边框），右侧切到它的站点列表。*

这一跑导入出来的是「**导入环境 - 20260916_011100**」：MQTT `127.0.0.1:1883`、文件服务 `http://127.0.0.1:4100/assets/archives`——正是 Site A 自己 `DbOption.toml` 里的值。

> plant-model-gen **每点一次就新建一个**「导入环境 - 时间戳」，点两次就有两张；plant-web-server 则按本站 id 覆盖同一个。所以按钮前面有一道确认，别手滑连点。

**这一步还有一个实战价值**：它把「动手之前的配置」存成了一张卡片。后面激活别的环境把 `DbOption.toml` 改了，想退回来，对着这张卡点「应用」就行。本教程收尾用的就是它。

## 4. 手填新建一个协同环境

要接的是**别处**的站点（这里用本机的 Site B 扮演「上海分部」），就点「新建」手填。表单会用本站配置预填 MQTT / 文件服务地址，你把它改成对端的。保存后监控台会**自动把本站加为该环境的第一个站点**，右侧表格立刻能看到。

![「添加新环境」表单，已填入 演示环境-上海分部 的名称、文件服务地址、位置标识、数据库编号与 MQTT 地址](./screenshots/topology-deploy-live/05-create-env-form.png)

*把地址改成对端的，然后点「保存环境」。*

![新环境「演示环境-上海分部」出现在列表并被选中，右侧站点列表里已自动加入本站](./screenshots/topology-deploy-live/06-created-env.png)

*保存后：新环境被选中，右侧自动加入了 1 个站点（本站）。*

| 字段 | 填什么 | 这一跑填的 |
|---|---|---|
| 环境名称 | 人能看懂的名字 | `演示环境-上海分部` |
| 文件服务地址 | 对端站点的文件服务根 URL，`envs/{id}/test-http` 会对它发 GET | `http://127.0.0.1:4101/assets/archives` |
| MQTT 主机 / 端口 | 对端 broker，`test-mqtt` 会 TCP 探它 | `127.0.0.1` / `1883` |
| 位置标识（location） | 对端站点的 `location`，全网唯一，会写进 DbOption | `local-b` |
| 数据库编号（location_dbs） | 逗号分隔，决定同步范围 | `6000` |

## 5. 先测连通，再动运行时

激活之前先在卡片上点两下探测：**测 MQTT** 让后端 TCP 探 `mqtt_host:mqtt_port`，**测文件服务** 让后端对 `file_server_host` 发一次 GET。结果以横条留在卡片里（绿 = 通，红 = 不通），右上角同时弹 toast。注意探测**由后端发起**，探的是「后端到对端」的网络，不是你浏览器到对端的。

![「演示环境-上海分部」卡片内出现结果条：测 MQTT：MQTT 连接可达 · 127.0.0.1:1883 · 0 ms 01:11:05](./screenshots/topology-deploy-live/07-test-mqtt.png)

*「测 MQTT」的真实结果：测 MQTT：MQTT 连接可达 · 127.0.0.1:1883 · 0 ms 01:11:05*

![「演示环境-上海分部」卡片内出现结果条：测文件服务：文件服务可达 · http://127.0.0.1:4101/assets/archives · HTTP 200 · 4 ms 01:11:06](./screenshots/topology-deploy-live/08-test-http.png)

*「测文件服务」的真实结果：测文件服务：文件服务可达 · http://127.0.0.1:4101/assets/archives · HTTP 200 · 4 ms 01:11:06*

这一跑拿到的两条真实结果：

- 测 MQTT：`测 MQTT：MQTT 连接可达 · 127.0.0.1:1883 · 0 ms 01:11:05`
- 测文件服务：`测文件服务：文件服务可达 · http://127.0.0.1:4101/assets/archives · HTTP 200 · 4 ms 01:11:06`

> 红条里会透出后端原话（`connection refused`、目标 URL、HTTP code、耗时），排网络问题直接照着看。红条只说明对端不通，不代表页面出错。

## 6. 激活环境（这一步会真的改后端配置）

**激活** = 让后端从此按这个环境跑：plant-model-gen 会把环境写进它的 `DbOption.toml`，并在进程内重启 watcher 与 MQTT 订阅，立即生效。这是整页最重的动作，所以有确认弹窗，弹窗还会点名当前已激活的环境「会先被停止」。

![「确认激活环境」弹窗，说明激活会写入 DbOption 并重启 watcher 与 MQTT 订阅](./screenshots/topology-deploy-live/09-activate-confirm.png)

*确认弹窗把后果说清楚了再点「确定」。*

![激活成功：pill 变为「运行时 · 已激活 演示环境-上海分部」，该卡片挂上「已激活」徽标，「激活」按钮置灰](./screenshots/topology-deploy-live/10-activated.png)

*激活后三处同时变：pill、绿色「已激活」徽标、卡片里的结果条。*

这一跑激活后从后端直接查到的事实（不是只看页面）：

- `GET /api/remote-sync/runtime/status` → `active: true`、`relay: true`、`mqtt_connected: true`
- 后端记录的激活环境 id 与页面上被点的这张卡**一致**（`363418e6-8c07-4048-84bf-051f21d04ff6`）
- 卡片里的结果条：`激活环境：已写入配置文件并启动 watcher + MQTT 订阅。 01:11:07`

> `relay: true` 是中继模式（`sync_relay_mode = true`）的标志：这台后端不连 SurrealDB，靠 SQLite 台账 + MQTT 广播与对端协同。

> 对着真实后端点「激活」是真的改它的配置文件。联调前先确认端口后面是哪台实例（见 `HANDOFF.md`「先看清楚后端是谁」）。

## 7. 「应用」和「激活」差在哪

**应用（apply）** 只把环境写进配置文件，不碰当前跑着的 watcher / MQTT；**激活（activate）** 是写盘 + 重启运行态。日常改了环境参数想落盘、又不想打断正在跑的同步，用「应用」；要真正切换运行时，用「激活」。

![「应用」完成，卡片内结果条：应用配置：已写入配置文件。部分运行期组件需重启或重新加载配置后生效。 01:11:09](./screenshots/topology-deploy-live/11-apply.png)

*「应用」的真实返回：应用配置：已写入配置文件。部分运行期组件需重启或重新加载配置后生效。 01:11:09*

## 8. 站点这一侧：探测不通 → 改地址 → 再探测

右侧表格是选中环境下的站点。每行末尾两个动作：**探测**（让后端对这个站点的 `http_host` 拼上 `/metadata.json` 发一次 GET）和**编辑站点**（改名称 / 位置 / 负责 dbnums / HTTP 服务地址 / 备注）。探测同样由后端发起。下面故意把这条链走完整：先探一次不通的，再把地址改对，再探一次。

![站点行末尾的探测结果：不可达](./screenshots/topology-deploy-live/12-site-test-http-failed.png)

*第一次探测：后端探测：metadata.json 返回异常状态: 404 Not Found · http://localhost:4179/metadata.json · HTTP 404 · 2 ms*

![「编辑站点」弹窗，HTTP 服务地址改成了 http://127.0.0.1:4101/files/output，备注写明了改动原因](./screenshots/topology-deploy-live/13-site-edit.png)

*把「HTTP 服务地址」改成对端真实可达的地址，点「保存修改」。*

![改完地址再探测：可达 · 4 ms](./screenshots/topology-deploy-live/14-site-test-http-ok.png)

*第二次探测：后端探测：metadata.json 可达 · http://127.0.0.1:4101/files/output/metadata.json · HTTP 200 · 4 ms*

这一跑站点表有 1 行，唯一那行是保存环境时**自动加入的本站**，它的 HTTP 服务地址被填成了打开页面的那个地址（`http://localhost:4179`，也就是监控台自己）——所以第一次探测必然不通：

- 改之前：`后端探测：metadata.json 返回异常状态: 404 Not Found · http://localhost:4179/metadata.json · HTTP 404 · 2 ms`
- 改成对端 `http://127.0.0.1:4101/files/output` 之后：`后端探测：metadata.json 可达 · http://127.0.0.1:4101/files/output/metadata.json · HTTP 200 · 4 ms`

保存后回查后端 `GET envs/{id}/sites`，`http_host` 与 `notes` **都已更新**——页面上的成功提示不等于后端真写了，这一步是回查过的。

> 记住这条：**自动加进来的那个站点指向的是你自己**，真要用起来必须手动改成对端地址。

## 9. 停止运行时

页头「停止运行时」会让后端停掉 watcher 与 MQTT 订阅。对 plant-model-gen 来说停完 `runtime.active` 变 `false`、pill 回到「未激活」；配置文件里的内容不会被回滚——停的是运行态，不是配置。

![「确认停止运行时」弹窗](./screenshots/topology-deploy-live/15-stop-confirm.png)

*确认后后端停掉 watcher 与 MQTT 订阅。*

![停止后：pill 回到「运行时 · 未激活」](./screenshots/topology-deploy-live/16-stopped.png)

*停止后的真实状态：pill「运行时 · 未激活」，后端 `runtime.active = false`。*

停完后端 `runtime.active = false`，页面 pill 同步回到「运行时 · 未激活」。要再跑起来，对着想用的环境卡再点一次「激活」。

## 附录 A · 这一跑真实发生了什么

教程里每张图都对应一次真实请求。下面是同一跑的机器记录，`docs/e2e-smoke/topology-deploy-live-tutorial-result.json` 里有完整版。

| 步骤 | 结果 |
|---|---|
| `first-screen` | pill: `运行时 · 未激活`，pillTitle: `后端 watcher + MQTT 订阅未启动；在环境卡片上点「激活」可启动`，envCards: `3` |
| `import-from-dboption` | id: `27c6e433-23d9-45b9-acd2-dc53d4238e67`，envName: `导入环境 - 20260916_011100`，mqtt: `127.0.0.1:1883`，file_server_host: `http://127.0.0.1:4100/assets/archives` |
| `create-env` | id: `363418e6-8c07-4048-84bf-051f21d04ff6`，autoSites: `[{"id":"0b494ed5-4ba5-4f49-8f97-a120bc5b6e54","name":"AvevaMarineSample","http_host":"http://localhost:4179"}]` |
| `probe` | mqtt: `测 MQTT：MQTT 连接可达 · 127.0.0.1:1883 · 0 ms 01:11:05`，http: `测文件服务：文件服务可达 · http://127.0.0.1:4101/assets/archives · HTTP 200 · 4 ms 01:11:06` |
| `activate` | backendActive: `363418e6-8c07-4048-84bf-051f21d04ff6`，matchesDemoEnv: `true`，runtime: `{"active":true,"env_id":"363418e6-8c07-4048-84bf-051f21d04ff6","mqtt_connected":true,"relay":true,"status":"success"}`，banner: `激活环境：已写入配置文件并启动 watcher + MQTT 订阅。 01:11:07` |
| `apply` | banner: `应用配置：已写入配置文件。部分运行期组件需重启或重新加载配置后生效。 01:11:09` |
| `site-actions` | rowCount: `1`，autoHost: `http://localhost:4179`，probeBefore: `{"summary":"不可达","title":"后端探测：metadata.json 返回异常状态: 404 Not Found · http://localhost:4179/metadata.json · HTTP 404 · 2 ms"}`，newHost: `http://127.0.0.1:4101/files/output`，savedToBackend: `true`，probeAfter: `{"summary":"可达 · 4 ms","title":"后端探测：metadata.json 可达 · http://127.0.0.1:4101/files/output/metadata.json · HTTP 200 · 4 ms"}` |
| `stop-runtime` | pill: `运行时 · 未激活`，runtime: `{"active":false,"env_id":null,"mqtt_connected":true,"relay":false,"status":"success"}` |

页面在这一跑里发出的写请求（`GET` 不计）：

- `POST /api/admin/auth/login → 200`
- `POST /api/remote-sync/envs/import-from-dboption → 200`
- `POST /api/remote-sync/envs → 200`
- `POST /api/remote-sync/envs/{id}/sites → 200`
- `POST /api/remote-sync/envs/{id}/test-mqtt → 200`
- `POST /api/remote-sync/envs/{id}/test-http → 200`
- `POST /api/remote-sync/envs/{id}/activate → 200`
- `POST /api/remote-sync/envs/{id}/apply → 200`
- `POST /api/remote-sync/sites/{id}/test-http → 200 ×2`
- `PUT /api/remote-sync/sites/{id} → 200`
- `POST /api/remote-sync/runtime/stop → 200`

## 附录 B · 收尾把后端恢复成什么样

教程会真的改后端，所以脚本跑完必须能还原，否则这份教程就是在给环境留垃圾。核对方式是拿收尾后的 env 集合与激活态跟开跑前逐一对比：

| 核对项 | 结果 |
|---|---|
| env 集合与开跑前一致 | 是 |
| 激活态与开跑前一致 | 是 |
| 残留的 env | 无 |
| 收尾后 `runtime.active` | `false` |
| 页面 JS 报错（pageerror） | 0 条 |

收尾动作依次是：

- `delete-site` · id `0b494ed5-4ba5-4f49-8f97-a120bc5b6e54` → HTTP 200
- `delete-demo-env` · id `363418e6-8c07-4048-84bf-051f21d04ff6` → HTTP 200
- `apply-dboption-snapshot` · id `27c6e433-23d9-45b9-acd2-dc53d4238e67` → HTTP 200
- `stop-runtime` → HTTP 200
- `delete-snapshot-env` · id `27c6e433-23d9-45b9-acd2-dc53d4238e67` → HTTP 200

> 「用快照 apply 回去」靠的就是第 3 节那张「从 DbOption 导入」的卡片。自己手动操作真实环境时，这一招同样管用：**动配置之前先导入一张，出事就对着它点「应用」**。

