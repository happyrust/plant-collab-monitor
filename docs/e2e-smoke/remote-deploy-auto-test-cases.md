# 异地部署功能 · 自动化测试用例（2026-09-14）

> 对象：`/topology` 部署动作面（测 MQTT / 测文件服务 / 应用 / 激活 / 停止运行时 / 站点 test-http / 站点编辑）+ 双站点协同链路。
> 依据：`docs/plans/2026-09-14-remote-deploy-next-step-plan.md`（P1 验收、P3 目标）、`AGENTS.md` §4.3.1 / §4.3.2（两种后端形状）。
> 用例编号在脚本里原样出现（`cases[].id`），结果 JSON 可直接对表。

## 0. 分层与运行方式

| 层 | 编号 | 依赖 | 载体 | 命令 | 产物 |
|---|---|---|---|---|---|
| **L1 契约层**（mock 后端，两种响应形状各跑一遍） | `DA-01`–`DA-16` | 无（脚本自起 `vite preview`，缺 `dist/` 自动 build） | `scripts/topology-deploy-smoke.mjs` | `npm run smoke:topology-deploy`（`-- --shape pmg\|pws`、`-- --build`、`-- --headed`） | `docs/e2e-smoke/topology-deploy-smoke-result.json` + `screenshots/topology-deploy/<shape>/` |
| **L2 真后端只读层**（安全闸拦下一切写请求） | `LR-00`–`LR-06` | 任一在跑的后端（默认 `:3100`） | `scripts/topology-deploy-live-smoke.mjs` | `npm run smoke:topology-deploy:live`（`-- --api http://127.0.0.1:4100`） | `docs/e2e-smoke/topology-deploy-live-readonly-result.json` + `screenshots/topology-deploy-live/readonly/` |
| **L3 真后端完整闭环**（会改运行时状态，结束自动恢复） | `LF-00`–`LF-08` | 同上 + **人工确认** | 同上 | `node scripts/topology-deploy-live-smoke.mjs --mode full --confirm-writes [--api …]` | `docs/e2e-smoke/topology-deploy-live-full-result.json` + `screenshots/topology-deploy-live/full/` |
| **L4 双站点协同 smoke**（P3） | `LS-01`–`LS-22` | Mosquitto + `surreal` + Site A `:4100` + Site B `:4101`（`web_server,mqtt`）；环境由 `scripts/local-remote-collab-setup.ps1` 生成 | `scripts/local-remote-collab-smoke.ps1` | `powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 -FixtureDir <site-b>/output -MosquittoDir "C:\Program Files\mosquitto"` | `docs/e2e-smoke/local-remote-collab-smoke-result.json` |

后端形状约定（脚本自动识别，`runtime/status` 有 boolean `active` = pmg）：

| 记号 | 后端 | 动作响应 | 运行时 |
|---|---|---|---|
| **pmg** | `plant-model-gen/web_server` | `{status:'success'\|'failed', message, addr\|url, code, latency_ms}` | `{active, env_id, mqtt_connected}` |
| **pws** | `plant-web-server`（standalone-real，本机 `:3100`） | `{success, reachable, host, port}` / `{success, item, task}` / `{success, stopped}` | `{running, env_count, active_task_count, mode}`，激活态在 `envs[].active` |

判定口径：UI 成功与否一律看 `isRemoteSyncActionOk()` 的结果（banner 颜色 emerald / rose），不直接比后端字段。

## 1. 覆盖矩阵

| 功能点 | L1 mock | L2 只读 | L3 闭环 | L4 双站点 |
|---|---|---|---|---|
| admin 登录（pws 无 `expires_at`） | DA-01 | LR-01 | LF-01 | LS-07 |
| 运行时 pill / 徽标 / 激活按钮禁用 | DA-02, DA-06, DA-12 | LR-01, LR-02 | LF-04, LF-07 | LS-14, LS-15 |
| 环境 test-mqtt / test-http | DA-03, DA-04 | LR-03, LR-04 | LF-03 | LS-10, LS-11 |
| 激活（含确认弹窗、取消 0 写）→ 激活确实生效 | DA-05, DA-06 | — | LF-04 | LS-13, LS-15 |
| 应用（成功 / 业务失败） | DA-07, DA-08 | — | LF-05 | — |
| 站点 test-http（可达 / 不可达） | DA-09, DA-10 | LR-05 | LF-06 | LS-12 |
| 站点编辑（PUT） | DA-11 | — | LF-06 | — |
| 停止运行时（两种后端语义） | DA-12 | — | LF-07 | LS-22 |
| 传输层失败（5xx）不炸页 | DA-13 | LR-06（0 pageerror） | — | — |
| 动作后刷新 runtime / envs | DA-14 | — | — | — |
| 站点表布局（1440 无横向溢出） | DA-15 | — | — | — |
| 新建 env / 自动加入本站 | — | — | LF-02 | LS-08, LS-09 |
| 「从 DbOption 导入」（确认弹窗、取消 0 写、新卡出现并选中） | DA-16 | — | — | — |
| 收尾恢复（不留脏数据） | — | LR-06（安全闸） | LF-08 | LS-22 + `cleanup` |
| MQTT 发布 → Site A 订阅收到 | — | — | — | LS-17, LS-19, LS-20 |

## 2. L1 · mock 契约层 `DA-xx`（`scripts/topology-deploy-smoke.mjs`）

mock 后端在 `scripts/lib/topology-deploy-mock.mjs`，与教程生成器 `scripts/topology-deploy-tutorial.mjs`（`npm run tutorial:topology-deploy`，产出 `docs/tutorials/topology-deploy-tutorial.md` + 19 张截图）共用——改 fixture / 响应字段时两边同时受影响，改完先跑用例再重出教程。

固定 mock 数据：`env-1 华东协同环境`（初始激活，站点 `s-1 site-b-local` 可达、`s-2 site-c-remote` 不可达）、`env-2 备用环境`、`env-3 故障环境`（test-mqtt 回 500）；`env-1` 的 apply 固定业务失败。

| 编号 | 用例 | 步骤 | 期望（pmg / pws 差异单列） |
|---|---|---|---|
| DA-01 | admin 登录并重定向回 `/topology` | 未登录直达 `/topology` → 登录弹窗 → `admin/admin` | `sessionStorage.admin_redirect_after_login === '/topology'`；登录后 URL 回 `/topology`、`admin_token` 存在、`POST login` 恰 1 次。pws 的 login 响应**没有** `expires_at` 也必须成功 |
| DA-02 | 运行时 pill 初始态 | 首屏 | pill = `运行时 · 已激活 华东协同环境`；env-1 卡「已激活」徽标恰 1 个、其「激活」按钮禁用；env-2 无徽标；「停止运行时」可见；pill title 含 `env_id: env-1`（pmg 另含 `MQTT: true`；pws 另含 `mode: standalone-real`、`活动任务: 3`） |
| DA-03 | 环境「测 MQTT」成功 | env-2 点「测 MQTT」 | emerald banner `测 MQTT：…` 含 `10.0.0.9:1883`（pmg 含 `MQTT 连接可达`、`3 ms`；pws 含 `目标可达`）；`POST envs/env-2/test-mqtt` 恰 1 次 |
| DA-04 | 环境「测文件服务」失败 | env-2 点「测文件服务」 | rose banner（pmg 含 `connection refused` + url；pws 含 `目标不可达 · 10.0.0.9:3100`）；无 pageerror |
| DA-13 | 后端 5xx | env-3 点「测 MQTT」（mock 回 HTTP 500 `{message:'internal error'}`） | rose banner `测 MQTT：请求失败 — internal error`；无 pageerror（只允许 `console.error`） |
| DA-05 | 激活 → 取消 | env-2 点「激活」→ NDialog → 「取消」 | 弹窗含 `备用环境`、`DbOption.toml`、`当前已激活的运行态（华东协同环境）会先被停止`；取消后写请求数不变、`activate` 0 次 |
| DA-06 | 激活 → 确定 | 同上 → 「确定」 | `POST envs/env-2/activate` 1 次；pill → `已激活 备用环境`；徽标从 env-1 迁到 env-2；env-2「激活」禁用、env-1 恢复可用；`runtime/status` 与 `envs` 都被重新拉取；emerald banner `激活环境：…` |
| DA-07 | 应用成功 | env-2 点「应用」→ 确定 | 弹窗含 `备用环境` + `DbOption.toml`；emerald banner `应用配置：…`（pmg 含 `已写入配置文件`；pws 含 `成功`）；`apply` 1 次 |
| DA-08 | 应用业务失败（HTTP 200） | env-1 点「应用」→ 确定（pmg `status:'failed'` / pws `success:false`） | rose banner 透出后端 message（`DbOption.toml 不存在` / `locked by another task`）；pill 不变 |
| DA-09 | 站点 test-http 可达 | 点 env-1 卡片标题选中 → 站点表 → `site-b-local` 行听诊器 | 行内 `[data-testid=site-test-http-result]` 摘要以 `可达` 开头、绿色；pmg 摘要含 `12 ms`、title 含 `HTTP 200`；pws title 含 `127.0.0.1:4101`；`sites/s-1/test-http` 1 次 |
| DA-10 | 站点 test-http 不可达 | `site-c-remote` 行听诊器 | 摘要 = `不可达`、红色；title 含原因（pmg `connection refused`；pws `目标不可达 · 10.0.0.12:3100`） |
| DA-11 | 编辑站点 | `site-b-local` 行「编辑」→ 名称预填 → 改备注 → 「保存修改」 | 弹窗标题 `编辑站点`、名称输入框预填 `site-b-local`；`PUT sites/s-1` body 含 `name` 与新 `notes`；弹窗关闭；mock 后端 notes 已更新 |
| DA-15 | 站点表布局 | 1440×1000 视口 | `table.scrollWidth <= 容器宽`；「操作」列头可见 |
| DA-12 | 停止运行时 | 点「停止运行时」→ 确定 | 弹窗点名当前环境；`POST runtime/stop` 1 次。**pmg**：pill → `运行时 · 未激活`、停止按钮消失、env-2 徽标消失、「激活」恢复可用。**pws**：pill 仍 `已激活 备用环境`（后端不清 `active`，见 `AGENTS.md` §4.3.2），title 的活动任务刷新为 0 |
| DA-14 | 动作后刷新 | 全流程结束统计 | `GET runtime/status` ≥ 3 次、`GET envs` ≥ 3 次（首屏 + 激活后 + 停止后） |
| DA-16 | 「从 DbOption 导入」 | 环境列表头部点「从 DbOption 导入」→ NDialog →「取消」；再点 →「确定」 | 弹窗含 `DbOption.toml` 与 `不会改写配置`；取消后 `import-from-dboption` 0 次；确定后弹窗关闭、`POST envs/import-from-dboption` 恰 1 次、`GET envs` 被重新拉取、「共 N+1 个环境」、新卡出现且带选中态 `border-primary`（pmg 新卡名 `导入环境 - 20260914_223001`，顶层 `id`；pws 新卡名 `AvevaMarineSample`，id 固定 `dboption-local-a`、响应在 `item/data`）；按钮恢复可用 |

通过条件：每个形状 16/16 且 `pageErrors.length === 0`；两种形状都通过脚本才 exit 0。

**2026-09-14 结果**：pmg 16/16 · pws 16/16 · pageErrors 0（`topology-deploy-smoke-result.json`）。DA-05 首轮在 pws 下失败，暴露 `handleActivateEnv` 的提示语用 `runtime.active`（pws 没有该字段）而非 `runtimeActive`，已修（`TopologyView.vue`）。DA-16 随「从 DbOption 导入」按钮同日晚补入，首轮两形状即过。

## 3. L2 · 真后端只读层 `LR-xx`（`scripts/topology-deploy-live-smoke.mjs`，默认模式）

安全闸：`page.route` 把所有非 `GET` 且不是 `test-mqtt / test-http / auth/login / auth/me` 的请求直接 abort 并记录；任何一条被拦下都算 LR-06 失败。

| 编号 | 用例 | 期望 |
|---|---|---|
| LR-00 | 后端可达、直连登录、识别形状 | `/api/health` 有响应；登录拿到 token；由 `runtime/status` 判定 pmg / pws，记录 `envCount`、`activeEnvId`、login 是否带 `expires_at` |
| LR-01 | UI 登录 → `/topology` → pill 有状态 | login 响应 200；pill 文案 ∈ {已激活 X, 运行中 · 未激活环境, 未激活}；title 可读 |
| LR-02 | 卡片 / 徽标与后端一致 | 卡片数 == 后端 env 数；「已激活」徽标 ≤ 1；后端有激活 env 时徽标恰 1 且该卡「激活」禁用，反之 0 |
| LR-03 | 已激活（或第一张）env「测 MQTT」 | banner 出现且不含 `请求失败`（可达 / 不可达都记录、都算通过：探测结果取决于环境） |
| LR-04 | 同卡「测文件服务」 | 同上 |
| LR-05 | 选中 env → 站点表 → 有站点则后端 test-http | 表加载；有行时 `site-test-http-result` 出现且摘要 ≠ `请求失败`；无行记录 `rowCount: 0` |
| LR-06 | 安全闸 + 无红错 | 被拦写请求 0、真实发出的写请求 0、pageerror 0 |

**2026-09-14 结果**（`:3100` plant-web-server，pws）：7/7，`测 MQTT / 测文件服务：目标不可达 · 127.0.0.1:3299`（该后端探测只读 env 的 `host/port`，属已记录的后端语义）。

## 4. L3 · 真后端完整闭环 `LF-xx`（`--mode full --confirm-writes`）

| 编号 | 用例 | 期望 |
|---|---|---|
| LF-00 | 同 LR-00 + 快照 | 记录联调前 `envIds`、`activeEnvId`、活动任务数；**pmg 且当前无激活 env** 时先 `POST envs/import-from-dboption` 生成快照 env（收尾用它 apply 回原 DbOption） |
| LF-01 | UI 登录 | 同 LR-01 |
| LF-02 | 新建测试 env `monitor-e2e-<stamp>` | 卡片出现；后端 `GET envs` 能查到；记录自动加入的本站站点 |
| LF-03 | 测 MQTT / 测文件服务 | 两条 banner 都出现、都不是 `请求失败`（结果按环境如实记录） |
| LF-04 | 激活 → 确定 | pill → `已激活 monitor-e2e-…`；后端激活态（pmg `runtime.env_id` / pws `envs.active.id`）== 测试 env；卡片徽标 + 按钮禁用 |
| LF-05 | 应用 → 确定 | banner 出现、非传输失败 |
| LF-06 | 站点 test-http + 编辑备注 | 结果出现；`PUT sites/{id}` 后后端 notes == 新值；测试 env 下无站点时如实记录并跳过 |
| LF-07 | 停止运行时 → 确定 | **pmg**：`runtime.active === false`、pill 未激活；**pws**：`running` 仍 true（只标任务 Stopped），pill 如实跟随 |
| LF-08 | 收尾恢复 | 删测试站点 / env；原来有激活 env → 重新 activate；pmg 且原来没有 → apply 快照 env + `runtime/stop`，再删快照 env。断言：env 集合与联调前一致、激活态恢复；记录活动任务数前后（pws 的 activate / apply 任务记录不随 env 删除，会 +2，属已知后端行为） |

**2026-09-14 结果**（`:3100` plant-web-server，pws，用户确认后）：9/9。UI 建 `monitor-e2e-20260914-073403`（后端 `env-1789371246`，自动加入本站 `AvevaMarineSample`）→ 探测「目标不可达 · 127.0.0.1」→ 激活后后端 `envs.active.id == env-1789371246` → 应用成功 → 站点 test-http 不可达 + 备注 PUT 落盘 → 停止后 `running` 仍 true（pws 语义）→ 收尾 env 集合 / 激活态恢复、站点无孤儿；活动任务 10 → 12（activate / apply 记录不随 env 删除）。与上午手工闭环（`2026-09-14-live-plant-web-server-topology-smoke.md`）结论一致。

**pmg 路径未实测**，等 P3 的隔离实例（`--api http://127.0.0.1:4100`）——它会真实改写该实例的 `DbOption.toml`，只能对 `runtime/local-collab/site-a` 这类隔离配置跑。

## 5. L4 · 双站点协同 `LS-xx`（`scripts/local-remote-collab-smoke.ps1`）

环境由 `scripts/local-remote-collab-setup.ps1` 生成（两份隔离 `DbOption.toml` + 站点启动器 + Mosquitto 配置 + 文件服务 fixture，详见 `local-remote-collab-test-plan.md` §3–§4）。22 项检查按报告 `checks[]` 顺序编号（脚本末尾也按这个编号打印）：

| 编号 | check | 验收点 |
|---|---|---|
| LS-01 / 02 / 03 | `site-a-port` / `site-b-port` / `mqtt-port` | `:4100` / `:4101` / `:1883` TCP 可连 |
| LS-04 / 05 / 06 | `site-a-identity` / `site-b-identity` / `site-identity-distinct` | 两站 `/api/site/identity` 成功且 `region` 不同（local-a / local-b） |
| LS-07 | `site-a-admin-login` | Site A `admin/admin` 登录成功 |
| LS-08 / 09 | `remote-env-create` / `remote-site-create` | Site A 建 env（`file_server_host` = Site B `/files/output`）、把 Site B 加为站点（`http_host` 同上，见测试计划 §5 的说明） |
| LS-10 / 11 / 12 | `remote-env-test-mqtt` / `remote-env-test-http` / `remote-site-test-http` | 三种探测请求成功（broker 在跑；Site B `/files/output/` 有 `index.html` 与 `metadata.json`） |
| LS-13 | `remote-env-activate` | `activate` 请求成功（pmg：写 `site-a/DbOption.toml` + 起 watcher + MQTT 订阅） |
| LS-14 | `remote-runtime-status` | 运行时状态可读 |
| **LS-15** | **`remote-runtime-active-env`**（2026-09-14 新增） | pmg：`runtime/status.active === true && env_id === 新建 env`；pws：`envs[].active` 指向新建 env。把 LS-14 从「可读」提升为「激活确实生效」 |
| LS-16 / 17 | `remote-topology` / `mqtt-subscription-status` | 拓扑、MQTT 订阅状态可读 |
| LS-18 | `incremental-fixture-append` | 二进制 fixture 追加成功，产出大小 + SHA256 |
| LS-19 | `mqtt-publish-test` | `mosquitto_pub` 发布 `SyncE3dFileMsg`（`location` = Site B，确保 Site A 会处理；找不到 `mosquitto_pub` → skipped） |
| **LS-20** | **`mqtt-received-after-publish`**（新增） | 发布后 ≤ 20s `runtime/status.mqtt_connected === true`：pmg 订阅任务收到 Publish 才置 true，是「MQTT → Site A」链路被触发的直接证据（`web_server,mqtt` feature 生效）。发布跳过 / 后端无该字段 → skipped |
| LS-21 | `remote-sync-logs` | Site A 同步日志端点可读（pmg 的 MQTT 收包写 SurrealDB `e3d_sync`、不写 `remote_sync_logs`，所以不在这里断言内容） |
| **LS-22** | **`runtime-stop-clears-active`**（新增） | `POST runtime/stop` → `runtime/status.active === false`；然后删 smoke 建的站点 / env（报告 `cleanup`）。`-KeepEnv` / 后端无 `active` 字段 → skipped |

通过标准：`failed == 0`（≥ 20 passed，LS-19/20 可因缺 `mosquitto_pub` 同时 skipped）。状态：脚本 22 项在无服务环境下 dry-run 全部落到 failed / skipped、无异常退出（2026-09-14）；**真实双站点尚未跑通**——本机缺 Mosquitto 与 `surreal` 二进制（setup 脚本会打印安装命令），装好后按 `COMMANDS.md` 起三个进程即可。

UI 复验：Site A 起来后跑 `node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:4100 --mode full --confirm-writes`（LF-xx），即计划 P3 第 5 步「用 P1 的 UI 路径复做一遍」的自动化版本。

## 6. 未自动化 / 人工检查

| 项 | 原因 | 建议 |
|---|---|---|
| 动作返回 401/403 → 自动弹登录 | 依赖 `App.vue` 的 unauthorized handler，与 `/topology` 不同层 | 归到 admin login 流的用例（Phase 7-Plus） |
| 30s 运行时轮询 | 等待成本高 | DA-14 只验证「动作后立即刷新」；轮询用 `setInterval` 已在 `onMounted` |
| 「从 DbOption 导入」对真后端的实际产物 | DA-16 只验 mock 契约；pmg 每次导入新建一个 env（不幂等），pws 覆盖同一个 `dboption-<site_id>` | 真后端上人工点一次看卡片字段（pws 的 mqtt / 文件服务在 `config` 里，卡片会显示「未配置」，属后端形状） |
| 删除 env 级联删站点 | pws 不级联（后端待修） | 后端修复后在 LF-08 加断言「测试 env 删除后 sites 无孤儿」 |
| Dark mode 视觉 | 只截图不断言 | 人工看 `10-topology-dark.png` |

## 7. 维护约定（选择器契约）

脚本依赖以下 UI 契约，改文案 / 结构时同步改脚本与本表：

| 类别 | 值 |
|---|---|
| `data-testid` | `remote-runtime-status`（pill 容器）、`site-test-http-result`（站点行诊断结果，完整信息在 `title`） |
| `data-tip` | `由后端探测该站点 HTTP 可达性`、`编辑站点`、`删除站点` |
| 按钮文案 | `测 MQTT`、`测文件服务`、`应用`、`激活`、`停止运行时`、`新建`、`从 DbOption 导入`、`保存环境`、`保存修改`、`登录` |
| NDialog 标题 | `确认激活环境`、`确认应用环境配置`、`确认停止运行时`、`确认从 DbOption 导入环境`、`确认删除环境`、`确认删除站点`（定位用 `.n-dialog`，不要用 `getByRole('dialog')`：DaisyUI 的 `<dialog class="modal">` 打开过一次后留在 DOM 里会撞名） |
| pill 文案 | `运行时 · 已激活 {name}` / `运行时 · 运行中 · 未激活环境` / `运行时 · 未激活` / `运行时 · 未知` |
| 环境卡 banner | 卡片内 `.rounded-lg.border.px-3`，文案前缀 `测 MQTT：` / `测文件服务：` / `应用配置：` / `激活环境：`；成功 `bg-emerald-50`，失败 `bg-rose-50` |
| 表单占位符 | 环境：`例如: 北京总部、上海分部`、`http://192.168.1.10:3000`、`如: 上海园区`、`7999,8001,8002`、`192.168.1.10`、`1883`；站点名：`例如: 1号服务器、备份节点` |
| 登录弹窗 | 标题 `管理员登录`，占位符 `ADMIN_USER 环境变量值` / `ADMIN_PASS 环境变量值` |

产物路径：结果 JSON 入库（通过的才提交），截图目录已在 `.gitignore`（`docs/e2e-smoke/screenshots/`）。
