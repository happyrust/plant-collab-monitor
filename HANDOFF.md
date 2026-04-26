# HANDOFF · plant-collab-monitor 当前状态（2026-04-26）

> 5 秒钟交接清单。详细背景看 `AGENTS.md` / `README.md` / `docs/plans/`。

---

## 一句话

前端 ~99.5% · 后端 Sprint B 100%（B1-B7 ✅ 20/20 PASS）· 仅剩 chrome-devtools 浏览器联调 + rs-core 真热加载（独立会话）。

---

## 立即可做的事

| 想做什么？ | 起手命令 / 文档 |
|---|---|
| 跑一次浏览器 e2e 联调 | 起后端 → 看 `docs/plans/2026-04-26-phase7-plus-preparation.md` 14 步矩阵 |
| 实施 rs-core 真热加载 | 看 `docs/plans/2026-04-26-phase20-rs-core-true-hot-reload.md`（含 Rust 代码模板 + 测试） |
| 看 mini API smoke 实证 | `docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md`（17/17 PASS） |
| 加新视图 / API / SSE | `AGENTS.md` §10 速查表 |

---

## 仓状态

```
git remote: https://github.com/happyrust/plant-collab-monitor.git
last commit: 751d6ea docs(plans): Phase 20 · rs-core 真热加载精细计划
working tree: clean
type-check: 0 errors
本会话累计: 17 commits 已 push origin/main
```

---

## 启动验证（30 秒）

```powershell
# 1. 后端（已编译 debug，可直接起）
$env:ADMIN_USER='admin'; $env:ADMIN_PASS='admin'
D:/work/plant-code/plant-model-gen/target/debug/web_server.exe

# 2. 前端
cd D:/work/plant-code/plant-collab-monitor
npm run dev   # → http://localhost:3200

# 3. 验证
curl http://localhost:3100/api/site/info       # → 200
curl -X POST http://localhost:3100/api/admin/auth/login -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"admin\"}'   # → 200 + token
```

---

## 已闭环 Gap（不要重做）

`G1`-`G14` + `P2-1/2/3/4/6` 全部 ✅。**禁止重新引入** `useApi.js` / 视图裸 `fetch()` / `alert()` / `confirm()` / 写死兜底假数据 / 手动 import 已 auto-import 的 hooks。详见 `AGENTS.md` §8 hot rules。

---

## 仅剩 2 项

1. **Phase 7-Plus 浏览器联调**（外部 chrome-devtools MCP 依赖）
2. **Phase 20 rs-core 真热加载**（跨仓独立会话 · ~2.5h）

---

## 联系入口

- 本会话所有产出 17 commits 在 `git log --oneline e9aab96..HEAD`
- 后端 Sprint B 验收报告：`../plant-model-gen/docs/plans/2026-04-26-sprint-b-verification-report.md`
- 异地协同 81 endpoint 全表：`../plant-model-gen/docs/architecture/异地协同API汇总清单.md`
