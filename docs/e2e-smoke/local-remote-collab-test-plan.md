# 本机异地协同双站点测试计划

> 目标：在一台 Windows 开发机上模拟两个异地协同站点，验证 Site A 能通过 HTTP + MQTT 发现、诊断并激活 Site B。

## 1. 测试分层

本测试不替代真实现场联调，定位是提交前和本地回归。

| 层级 | 目标 | 工具 |
|---|---|---|
| 单后端 API 基线 | 确认单个 `web_server` 的协同 API、MQTT 状态、SSE 可用 | `../plant-model-gen/shells/smoke-collab-api.sh` |
| 双后端本机模拟 | 用两个 `web_server` 模拟主站和从站 | `scripts/local-remote-collab-smoke.ps1` |
| 浏览器 UI 回归 | 验证前端页面能展示拓扑、节点、日志和错误状态 | `npm run smoke:phase7-plus` + 手动页面检查 |

## 2. 本机拓扑

```text
Mosquitto Broker :1883

Site A web_server :4100
  location = local-a
  file_server_host = http://127.0.0.1:4100

Site B web_server :4101
  location = local-b
  file_server_host = http://127.0.0.1:4101

plant-collab-monitor :4000
  VITE_API_TARGET = http://127.0.0.1:4100
```

前端只连接 Site A。Site B 作为 Site A 的远端站点加入协同环境。

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
| `site-a/DbOption.toml` · `site-b/DbOption.toml` | 隔离配置（python `tomllib` 校验通过） |
| `site-a/start.ps1` · `site-b/start.ps1` | 站点启动器：设 `ADMIN_USER/ADMIN_PASS/WEB_SERVER_PORT`，cwd 切到 plant-model-gen，跑 `D:\Rust\target\debug\web_server.exe --config runtime/local-collab/site-x/DbOption`（缺 exe 回落 `cargo run --features web_server,mqtt`） |
| `site-x/output/index.html` · `site-x/output/metadata.json` | 文件服务 fixture：`/files/output` 映射到 `output_root`，让 `envs/{id}/test-http`（GET 要 2xx）与 `sites/{id}/test-http`（取 `<http_host>/metadata.json`）都探得到 |
| `mosquitto.conf` · `start-mosquitto.ps1` | `listener 1883 127.0.0.1` + `allow_anonymous true` |
| `COMMANDS.md` | 下面 §4 的命令清单（含绝对路径） |

每份配置隔离的键：

| 键 | site-a | site-b |
|---|---|---|
| `location` / `[web_server].site_id` / `region` | `local-a` | `local-b` |
| `[web_server].port` / `bind_host` | `4100` / `127.0.0.1` | `4101` / `127.0.0.1` |
| `file_server_host` | `http://127.0.0.1:4100/files/output` | `http://127.0.0.1:4101/files/output` |
| `deployment_sites_sqlite_path` | `runtime/local-collab/site-a/deployment_sites.sqlite` | `…/site-b/…` |
| `output_root` | `runtime/local-collab/site-a/output` | `…/site-b/output` |
| SurrealDB（`auto_start_surreal = true`，各自拉起 `surreal start`） | `127.0.0.1:8021` · `site-a/surreal.db` | `127.0.0.1:8022` · `site-b/surreal.db` |
| `location_dbs` | `[251181]` | `[]` |
| `gen_model / gen_mesh / gen_spatial_tree` | `false`（免启动期 Scene Tree 构建） | 同 |
| `versioned_storage` | `false`（官方 `surreal` 二进制不认识 fork 的 `?versioned=` 参数；用 fork 构建时加 `-VersionedStorage`） | 同 |

为什么必须 `auto_start_surreal`：当前 `web_server.exe` 只编了 SurrealDB `kv-mem`（`plant-model-gen/Cargo.toml` 默认不编 `kv-rocksdb`），嵌入式 `mode = "file"` 起不来；而 `activate` → `start_runtime` 要 `ensure_surreal_init()`，没有 SurrealDB 时 `remote-env-activate` 必失败。

## 4. 启动顺序

每条长驻命令各开一个终端；完整清单见生成的 `COMMANDS.md`。

### 4.0 前置（本机 2026-09-14 实测缺后两项）

```powershell
winget install --id EclipseFoundation.Mosquitto -e      # → C:\Program Files\mosquitto（不进 PATH）
iwr https://windows.surrealdb.com -useb | iex             # 官方 surreal 安装脚本；装完重开终端，或 setup 时 -SurrealBin 指定
cd D:\work\plant-code\plant-model-gen; cargo build --bin web_server --features web_server,mqtt   # 已编：D:\Rust\target\debug\web_server.exe
```

### 4.1 启动 MQTT broker

```powershell
powershell -ExecutionPolicy Bypass -File D:\work\plant-code\plant-model-gen\runtime\local-collab\start-mosquitto.ps1
```

### 4.2 启动 Site A（:4100 · local-a · 自启 SurrealDB :8021）

```powershell
powershell -ExecutionPolicy Bypass -File D:\work\plant-code\plant-model-gen\runtime\local-collab\site-a\start.ps1
```

### 4.3 启动 Site B（:4101 · local-b · 自启 SurrealDB :8022）

```powershell
powershell -ExecutionPolicy Bypass -File D:\work\plant-code\plant-model-gen\runtime\local-collab\site-b\start.ps1
```

验证：`curl http://127.0.0.1:4100/api/site/identity`、`curl http://127.0.0.1:4101/api/site/identity`（`region` 分别是 `local-a` / `local-b`）、`curl http://127.0.0.1:4101/files/output/metadata.json`。

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

运行（推荐：fixture 落到 Site B 的文件服务目录，`mosquitto_pub` 不在 PATH 时给目录）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 `
  -SiteABase http://127.0.0.1:4100 -SiteBBase http://127.0.0.1:4101 `
  -FixtureDir D:\work\plant-code\plant-model-gen\runtime\local-collab\site-b\output `
  -MosquittoDir "C:\Program Files\mosquitto"
```

2026-09-14 新增参数：

| 参数 | 默认 | 说明 |
|---|---|---|
| `-SiteBFileServerHost` | `<SiteBBase>/files/output` | 写进 env 的 `file_server_host`；plant-model-gen 的 `test-http` 对它发 GET 要 2xx（生成器放了 `index.html`） |
| `-SiteBHttpHost` | `<SiteBBase>/files/output` | 写进站点的 `http_host`；后端 `sites/{id}/test-http` 取 `<http_host>/metadata.json`（生成器放了 `metadata.json`）。⚠ 监控台 UI 的浏览器探活用的是 `<http_host>/api/health`，两者对 `http_host` 的期待不一致，属产品层待统一 |
| `-MosquittoDir` | 自动探测 `C:\Program Files\mosquitto` | `mosquitto_pub.exe` 所在目录 |
| `-MqttReceiveTimeoutSec` | `20` | LS-20 等待 `mqtt_connected` 变 true 的上限 |
| `-KeepEnv` | 关 | 不做收尾（不 stop runtime、不删 smoke 建的站点 / env），LS-22 记 skipped |

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

如果要让 Site A 真正通过 HTTP 下载该文件，需要确保 Site B 的 `file_server_host` 指向能访问该 fixture 的文件服务目录。当前脚本负责模拟增量文件变化和 MQTT 通知，不负责重配 Site B 的静态文件服务根目录。

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

## 6. 验收点（22 项，报告 `checks[]` 顺序即 LS 编号）

| LS | check | 验收点 |
|---|---|---|
| 01 / 02 / 03 | `site-a-port` / `site-b-port` / `mqtt-port` | `:4100` / `:4101` / `:1883` TCP 可连 |
| 04 / 05 / 06 | `site-a-identity` / `site-b-identity` / `site-identity-distinct` | 两站 `/api/site/identity` 成功且 `region` 不同 |
| 07 | `site-a-admin-login` | Site A `admin/admin` 登录拿到 token |
| 08 / 09 | `remote-env-create` / `remote-site-create` | Site A 建 env、把 Site B 加为站点 |
| 10 / 11 / 12 | `remote-env-test-mqtt` / `remote-env-test-http` / `remote-site-test-http` | 三种探测请求成功（响应体里的 `status/reachable` 一并记录） |
| 13 | `remote-env-activate` | `activate` 请求成功 |
| 14 | `remote-runtime-status` | 运行时状态可读 |
| **15** | **`remote-runtime-active-env`**（2026-09-14 新增） | plant-model-gen：`runtime/status.active === true && env_id === 新建 env`；plant-web-server：`envs[].active` 指向新建 env |
| 16 / 17 | `remote-topology` / `mqtt-subscription-status` | 拓扑、MQTT 订阅状态可读 |
| 18 | `incremental-fixture-append` | 二进制 fixture 追加成功，产出大小 + SHA256 |
| 19 | `mqtt-publish-test` | `mosquitto_pub` 向订阅 topic 发布 `SyncE3dFileMsg`（找不到 `mosquitto_pub` 记 skipped） |
| **20** | **`mqtt-received-after-publish`**（新增） | 发布后 ≤ 20s 内 `runtime/status.mqtt_connected === true`——Site A 的订阅任务真的收到了消息（后端收到 Publish 才把 `MQTT_CONNECT_STATUS` 置 true）。发布被跳过 / 后端无该字段 → skipped |
| 21 | `remote-sync-logs` | 同步日志可读（注意：plant-model-gen 的 MQTT 收包写的是 SurrealDB `e3d_sync`，不写 `remote_sync_logs`，这里只验证端点） |
| **22** | **`runtime-stop-clears-active`**（新增） | `POST runtime/stop` 后 `runtime/status.active === false`；随后删掉 smoke 建的站点与 env（记录在报告 `cleanup`）。`-KeepEnv` 或后端无 `active` 字段 → skipped |

通过标准：`failed == 0`，即 ≥ 20 passed（LS-19 / LS-20 允许因缺 `mosquitto_pub` 同时 skipped），`passed: true`。

## 7. 注意事项

- Site B 后端不要使用 `4000`，该端口是前端默认 dev server。
- MQTT topic 不要硬编码。脚本会优先从 `/api/mqtt/subscription/status` 读取 `subscribed_topics`。
- 如果 Site A/B 的 `location` 相同，拓扑和节点状态会失去区分度。
- 如果两个实例共用 SQLite 或 SurrealDB 数据目录，测试结果不可信。
- fixture 文件只模拟“远端增量文件发生变化”。完整下载链路还依赖 Site B 的 `file_server_host` 是否真正暴露了该文件；即使用 `-FixtureDir <site-b>/output` 落到文件服务目录，Site A 也只会 clone 它本地 watcher 索引里已知的 db 文件名（`file_name_full_path_map`），smoke 的随机 fixture 会被跳过（warn），LS-20 只证明消息到达。
- 后端用 `serde_json::from_slice(..).unwrap()` 反序列化 MQTT 消息（`mqtt_service::SyncE3dFileMsg`）：字段缺失或类型不对会让订阅任务 panic 退出，之后 LS-20 必失败且要重新 activate 才能恢复。脚本发的字段与结构体一致，自己改消息时留意。
- `phase7-plus` 浏览器 smoke 仍然需要保留，它验证的是前端登录、路由、SSE token 和页面错误，不覆盖双站点真实协同。
- UI 侧复验（计划 P3 第 5 步）改用 `node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100 --mode full --confirm-writes`（LF-00–LF-08），它会改写 `site-a/DbOption.toml` 并重启 Site A 的 watcher + MQTT，只对隔离配置跑。
