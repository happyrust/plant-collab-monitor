# HANDOFF · plant-collab-monitor 当前状态（2026-09-14）

> 5 秒钟交接清单。详细背景看 `AGENTS.md` / `README.md` / `docs/plans/`。

---

## 一句话

前端观测面 ~99% · **部署动作面已接入 `/topology`（2026-09-14，含「从 DbOption 导入」）** · 后端 Sprint B 100% · 仍欠：本机双站点 e2e smoke 跑通（P3）。

---

## 立即可做的事

| 想做什么？ | 起手命令 / 文档 |
|---|---|
| **看异地部署功能的下一步计划（已批准）** | `docs/plans/2026-09-14-remote-deploy-next-step-plan.md` |
| **跑部署动作面自动化用例（无需后端）** | `docs/e2e-smoke/remote-deploy-auto-test-cases.md` → `npm run smoke:topology-deploy`（pmg + pws 各 16 例）；真后端只读 `npm run smoke:topology-deploy:live` |
| 跑本机双站点 smoke（P3） | `powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1`（生成 site-a/site-b 配置 + 启动器 + 前置检查）→ 按 `../plant-model-gen/runtime/local-collab/COMMANDS.md` 起 Mosquitto / Site A / Site B → `scripts/local-remote-collab-smoke.ps1`（22 项）；细节 `docs/e2e-smoke/local-remote-collab-test-plan.md` |
| 跑一次浏览器 e2e 联调 | 起后端 → `npm run smoke:phase7-plus`（`docs/plans/2026-04-26-phase7-plus-preparation.md`） |
| 看 mini API smoke 实证 | `docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`（17/17 PASS） |
| **看完整变更日志** | [`CHANGELOG.md`](./CHANGELOG.md) |
| 加新视图 / API / SSE | `AGENTS.md` §10 速查表 |

---

## 仓状态

```
git remote: https://github.com/happyrust/plant-collab-monitor.git
上一次推送: a65acad chore(collab): align monitor port and local smoke docs（2026-05-18）
2026-09-14 本地: 部署动作面 + API 收敛 + 文档校准（见 CHANGELOG 2026-09-14）
type-check: 0 errors
```

---

## 先看清楚后端是谁

- 本机 `:3100` 现在跑的是 **`../plant-web-server`**（`D:\Rust\target\release\plant-web-server.exe`，2026-09-09 起，`--repo-root ../plant-model-gen --config db_options/DbOption-cursor`，`mode: standalone-real`）。它的 remote-sync 数据在 `plant-web-server/runtime/remote_sync/`，已有 4 个 env（2026-05-23/24 smoke 留下的 `Smoke Env` / `Persistence Env`）。
- `plant-model-gen/web_server` 与它路由相同、**响应形状不同**，见 `AGENTS.md` §4.3.2；监控台已两边兼容。
- 对着 `:3100` 点「激活 / 应用 / 停止运行时」会改真后端的状态，联调前先确认这是不是你要的实例。

## 启动验证（前置说明）

后端 `plant-model-gen` **不是** git 仓；`cargo` 的 target 在 `D:\Rust\target`（`CARGO_TARGET_DIR`），2026-09-14 已编出 `D:\Rust\target\debug\web_server.exe`（`web_server,mqtt`，142 MB）。`Cargo.toml` 的 `[patch]` 依赖同级目录 `../rs-core`、`../pdms-io-fork`（缺则 `git clone --depth 1 --branch dev-3.1 https://github.com/happyrust/pdms-io.git ../pdms-io-fork`）。

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

1. **P3 本机双站点 smoke**：配置 / 启动器 / fixture 已由 `scripts/local-remote-collab-setup.ps1` 生成到 `../plant-model-gen/runtime/local-collab/`（tomllib 校验通过）；smoke 脚本已扩到 22 项（新增 LS-15 激活生效、LS-20 MQTT 收包、LS-22 stop 清 active + 收尾）。**仍缺两个外部二进制**：Mosquitto（`winget install --id EclipseFoundation.Mosquitto -e`）与 `surreal`（`iwr https://windows.surrealdb.com -useb | iex`；`web_server.exe` 只编了 kv-mem，站点靠 `auto_start_surreal` 各自拉 SurrealDB :8021/:8022）。装好后三个长驻进程要在用户自己的终端里起（见 `COMMANDS.md`），再跑 smoke；最近一次真实结果仍是 2026-05-17 的 1 passed / 12 failed。
2. ~~`/topology` 的「从 DbOption 导入」按钮~~ → 2026-09-14 晚已落地（确认弹窗 → `importEnvFromDbOption()` → 刷新并选中；mock 用例 DA-16）。
3. ~~部署动作面新按钮尚未进浏览器 smoke~~ → 已由 `scripts/topology-deploy-smoke.mjs`（mock，DA-01–16）+ `scripts/topology-deploy-live-smoke.mjs`（真后端 LR/LF）覆盖；`phase7-plus-smoke.mjs` 仍只管 11 视图 + login + SSE。剩：L3 full 的 plant-model-gen 路径与 L4 双站点等 P3 环境。
4. 工作区 57 个文件在 Windows 上是 CRLF（索引一律 LF，`.gitattributes` 已固定）；git 视为干净，不必处理；想让工作区也统一成 LF，在**没有未提交改动**时跑 `git rm -r --cached . ; git reset --hard`。

---

## 联系入口

- 异地部署计划与决策记录：`docs/plans/2026-09-14-remote-deploy-next-step-plan.md` §0
- 后端路由源码（端点以此为准）：`../plant-model-gen/src/web_server/remote_sync_handlers.rs::create_remote_sync_routes()`、`mod.rs`
- 历史后端文档（`../plant-model-gen/docs/**`）在当前 checkout 不存在，README「跨仓」表仅作历史记录
