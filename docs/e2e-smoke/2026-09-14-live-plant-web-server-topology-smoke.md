# `/topology` 部署动作面 · 真后端联调报告（plant-web-server :3100）· 2026-09-14

> 结果 JSON：`2026-09-14-live-plant-web-server-topology-smoke-result.json`
> 截图（本地，不入库）：`screenshots/2026-09-14-live-plant-web-server/`
> 计划：`docs/plans/2026-09-14-remote-deploy-next-step-plan.md` P1 验收 · 用户确认后对真实运行时做写操作

## 1. 环境

| 项 | 值 |
|---|---|
| 前端 | `npm run build` 产物 → `vite preview`（`/monitor/`，`:4179`），`/api` 反代到 `http://127.0.0.1:3100` |
| 后端 | 本机常驻 `D:\Rust\target\release\plant-web-server.exe`（`../plant-web-server`，`mode: standalone-real`，2026-09-09 启动，`--repo-root ../plant-model-gen --config db_options/DbOption-cursor`） |
| 驱动 | Playwright + 本机 Chrome，1440×1000；写请求由页面真实发出（未 mock） |
| 凭据 | `admin / admin`（后端返回固定 token `detached-admin-token`，**无 `expires_at`**） |
| 联调前状态 | 4 个 env（`smoke-env`、3 × `Persistence Env`），激活 `persist-env-20260524104836`；活动任务 8 |

## 2. 两轮

### 2.1 只读 + 安全探测（`verify-live-readonly`）

登录 → `/topology` → 运行时 pill「已激活 Persistence Env」（title：`env_id: persist-env-20260524104836 · 活动任务: 8 · mode: standalone-real`）→ 4 张 env 卡、1 个「已激活」徽标、该卡「激活」按钮置灰 → 测 MQTT / 测文件服务 → 选中 env → 站点 `Persistence Site` → 后端 test-http。

写请求 **0 次**（脚本层拦截所有非探测 POST/PUT/DELETE 作为安全闸，实际也没有触发）。

### 2.2 完整闭环（`verify-live-full`，用户确认）

| # | UI 动作 | 命中端点 | 后端返回 | UI 表现 |
|---|---|---|---|---|
| 1 | 新建环境 `monitor-e2e-20260914-034740`（file_server `http://127.0.0.1:4101`、mqtt `127.0.0.1:1883`、location `local-e2e`、dbs `7999`） | `POST envs` → `POST envs/{id}/sites`（自动把本站加为站点） | `success:true, id: env-1789357663` / `site-1789357663` | env 卡出现，env 数 4 → 5 |
| 2 | 测 MQTT / 测文件服务 | `POST envs/{id}/test-mqtt` · `test-http` | `{success:true, reachable:false, host:'127.0.0.1', port:null}` | 卡内 rose banner「目标不可达 · 127.0.0.1」+ 失败 toast |
| 3 | 激活 → NDialog 确定 | `POST envs/{id}/activate` | `{success:true, item.active:true, task}` | pill → 「已激活 monitor-e2e-…」，徽标移到新卡，其「激活」置灰；后端 `envs.active.id === env-1789357663` |
| 4 | 应用 → 确定 | `POST envs/{id}/apply` | `{success:true, task}` | banner「应用配置：成功」 |
| 5 | 选中 env → 站点 test-http | `POST sites/{id}/test-http` | `reachable:false` | 状态列「不可达」，title 含完整信息 |
| 6 | 编辑站点 → 改备注 → 保存修改 | `PUT sites/{id}` | `success:true, item.notes` 已更新 | 弹窗关闭、toast「已更新站点」，后端复查 notes 已落盘 |
| 7 | 停止运行时 → 确定 | `POST runtime/stop` | `{success:true, stopped:true}` | toast 成功；pill **仍**「已激活 monitor-e2e-…」（见 §3 第 3 条） |

收尾（脚本直连 API）：删站点 `site-1789357663` → 删 env `env-1789357663` → 重新激活 `persist-env-20260524104836`。复查：env 集合与联调前一致（4 个）、激活 env 恢复；活动任务 8 → **10**（activate / apply 任务记录不随 env 删除，且 `runtime/stop` 已把原 8 条标成 `Stopped`——这两处是留在真后端上的痕迹）。

`console.error` 0 · `pageerror` 0 · `passed: true`。

## 3. 发现（plant-web-server 侧契约 / 语义）

1. **探测不看 env 字段**：`connection_probe_response` 只读 `host` / `port`（或 `ip` / `db_port` / `web_port`），不读监控台写入的 `mqtt_host` / `mqtt_port` / `file_server_host`，所以监控台建的 env 永远探 `127.0.0.1:null` → 不可达；`test-http` 与 `test-mqtt` 也只是同一个 TCP 探测。要让探测有意义，后端应按 kind 取 `mqtt_host:mqtt_port` / `file_server_host`。
2. **`apply` = `activate` + 一条 `apply` 任务**，不写 DbOption.toml；`activate` 只切 `envs[].active` 标记。监控台的确认文案已改为同时描述两种后端的行为。
3. **`runtime/stop` 不改 `running` 也不清 `active`**，只把活动任务标 `Stopped`，因此停止后 pill 仍显示已激活；`runtime/status` 恒 `running:true`。
4. **`DELETE envs/{id}` 不级联删站点**（sites.json 里留下孤儿），监控台「删除环境」的确认文案「同时删除其下所有站点」对它不成立。
5. **login 无 `expires_at`**（已在前端放宽，提交 `bb60405`）。
6. 带 `content-type: application/json` 但空 body 的 GET 会被 axum `Option<Json>` 拒成 400（axios 不会这么发；写脚本时注意）。
7. **`server-ip` 等 plant-model-gen 专有端点**在 standalone-real 下回 `not_implemented`，监控台已回落到 `127.0.0.1`。

## 4. 结论

`/topology` 的部署动作面（测连通 / 应用 / 激活 / 停止 / 站点探测 / 站点编辑）在**真实运行的 plant-web-server** 上端到端可用，两种后端响应形状均被正确判定；剩余差异全部在后端语义层（§3 1–4），已记入 `AGENTS.md` §4.3.2 供后端修正时对照。

针对 `plant-model-gen/web_server`（真·写 DbOption.toml + 重启 watcher/MQTT）的双站点 smoke 仍待 P3 环境（Mosquitto、SurrealDB 8020、两份隔离 DbOption）。
