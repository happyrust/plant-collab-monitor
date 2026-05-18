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

## 3. 配置隔离要求

两个后端实例必须使用不同配置文件，例如：

```text
../plant-model-gen/runtime/local-collab/site-a/DbOption.toml
../plant-model-gen/runtime/local-collab/site-b/DbOption.toml
```

每份配置至少需要隔离：

- `location`
- `file_server_host`
- `deployment_sites_sqlite_path`
- `[web_server].port`
- `[web_server].surreal_bind`
- SurrealDB 数据目录或连接端口
- 运行时输出目录和文件服务目录

不要让两个站点共用同一个 `deployment_sites.sqlite` 或同一个 SurrealDB RocksDB 目录。

## 4. 启动顺序

### 4.1 启动 MQTT broker

使用本机 Mosquitto 或 Docker 均可，确保 `127.0.0.1:1883` 可连接。

### 4.2 启动 Site A

```powershell
cd D:\work\plant-code\plant-model-gen
$env:ADMIN_USER='admin'
$env:ADMIN_PASS='admin'
$env:WEB_SERVER_PORT='4100'
cargo run --bin web_server --features web_server -- --config runtime/local-collab/site-a/DbOption
```

### 4.3 启动 Site B

```powershell
cd D:\work\plant-code\plant-model-gen
$env:ADMIN_USER='admin'
$env:ADMIN_PASS='admin'
$env:WEB_SERVER_PORT='4101'
cargo run --bin web_server --features web_server -- --config runtime/local-collab/site-b/DbOption
```

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

运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1
```

常用参数：

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

## 6. 验收点

脚本通过时应满足：

- Site A/B 端口可连接。
- MQTT broker 端口可连接。
- Site A/B `/api/site/identity` 均返回成功，且身份不同。
- Site A admin 登录成功。
- Site A 能创建 remote env。
- Site A 能把 Site B 加入 env。
- `test-mqtt` 成功。
- `test-http` 成功。
- env activate 请求成功。
- runtime status 可读取。
- topology 可读取。
- MQTT subscription status 可读取。
- 二进制增量 fixture 追加成功，并产出文件大小与 SHA256。
- remote sync logs 可读取。

## 7. 注意事项

- Site B 后端不要使用 `4000`，该端口是前端默认 dev server。
- MQTT topic 不要硬编码。脚本会优先从 `/api/mqtt/subscription/status` 读取 `subscribed_topics`。
- 如果 Site A/B 的 `location` 相同，拓扑和节点状态会失去区分度。
- 如果两个实例共用 SQLite 或 SurrealDB 数据目录，测试结果不可信。
- fixture 文件只模拟“远端增量文件发生变化”。完整下载链路还依赖 Site B 的 `file_server_host` 是否真正暴露了该文件。
- `phase7-plus` 浏览器 smoke 仍然需要保留，它验证的是前端登录、路由、SSE token 和页面错误，不覆盖双站点真实协同。
