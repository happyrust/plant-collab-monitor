# HANDOFF · plant-collab-monitor 当前状态（2026-09-14）

> 5 秒钟交接清单。详细背景看 `AGENTS.md` / `README.md` / `docs/plans/`。

---

## 一句话

前端观测面 ~99% · **部署动作面已接入 `/topology`（2026-09-14）** · 后端 Sprint B 100% · 仍欠：本机双站点 e2e smoke 跑通（P3）+ DbOption 导入按钮。

---

## 立即可做的事

| 想做什么？ | 起手命令 / 文档 |
|---|---|
| **看异地部署功能的下一步计划（已批准）** | `docs/plans/2026-09-14-remote-deploy-next-step-plan.md` |
| 跑本机双站点 smoke（P3） | `docs/e2e-smoke/local-remote-collab-test-plan.md` → `powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1` |
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

## 启动验证（前置说明）

后端 `plant-model-gen` **不是** git 仓，且 `target/` 默认没有编译产物；`Cargo.toml` 的 `[patch]` 依赖同级目录 `../rs-core`、`../pdms-io-fork`（缺则 `git clone --depth 1 --branch dev-3.1 https://github.com/happyrust/pdms-io.git ../pdms-io-fork`）。

```powershell
# 1. 编译后端（必须带 mqtt，否则 activate 的 MQTT 订阅分支为空）
cd D:/work/plant-code/plant-model-gen
cargo build --bin web_server --features web_server,mqtt

# 2. 起后端（在用户自己的终端里，长驻进程）
$env:ADMIN_USER='admin'; $env:ADMIN_PASS='admin'
.\target\debug\web_server.exe          # 默认 :3100，配置取 db_options/DbOption.toml（DB_OPTION_FILE 可覆盖）

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

`G1`-`G14` + `P2-1/2/3/4/6` 全部 ✅；2026-09-14 部署动作面（`remoteSyncApi` apply / activate / test-* / runtime / updateSite + `TopologyView` 按钮）✅；`deploymentSitesApi` 已收敛为 `list / get` ✅。**禁止重新引入** `useApi.js` / 视图裸 `fetch()` / `alert()` / `confirm()` / 写死兜底假数据 / 手动 import 已 auto-import 的 hooks / **后端不存在的 API 方法**。详见 `AGENTS.md` §4.3 / §8。

---

## 仍欠

1. **P3 本机双站点 smoke**：需 Mosquitto（本机未安装）+ `runtime/local-collab/site-a|b/DbOption.toml`（尚未生成）+ 两个 `web_server` 实例；最近一次结果 1 passed / 12 failed（服务未起）。
2. `/topology` 的「从 DbOption 导入」按钮（API `remoteSyncApi.importEnvFromDbOption()` 已有）。
3. **Phase 7-Plus 浏览器联调**回归（部署动作面新按钮尚未进 `scripts/phase7-plus-smoke.mjs`）。

---

## 联系入口

- 异地部署计划与决策记录：`docs/plans/2026-09-14-remote-deploy-next-step-plan.md` §0
- 后端路由源码（端点以此为准）：`../plant-model-gen/src/web_server/remote_sync_handlers.rs::create_remote_sync_routes()`、`mod.rs`
- 历史后端文档（`../plant-model-gen/docs/**`）在当前 checkout 不存在，README「跨仓」表仅作历史记录
