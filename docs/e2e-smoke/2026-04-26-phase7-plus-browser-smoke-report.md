# plant-collab-monitor Phase 7-Plus 浏览器联调报告（2026-04-26）

> 上游计划：`docs/plans/2026-04-26-phase7-plus-preparation.md`
> 执行方式：`npm run smoke:phase7-plus`

## 0. 执行摘要

**结论**：✅ 真实浏览器联调已恢复并完成首轮自动化覆盖；核心 admin login redirect、SSE Bearer token 与 `/archives` 归档列表 API 均通过。

| 维度 | 结果 |
|---|---|
| 浏览器 | 系统 Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe` |
| 前端 | Vite dev server：`http://127.0.0.1:3200` |
| 后端 | `plant-model-gen` web_server：`http://127.0.0.1:3100` |
| 登录凭据 | `admin/admin` |
| 路由覆盖 | 11/11 navigation PASS |
| admin guard | PASS：未登录 `/topology` 写入 `admin_redirect_after_login=/topology` |
| 登录回跳 | PASS：登录后回到 `/topology` |
| SSE Bearer token | PASS：2 次 `/api/sync/events/stream` 请求均带 `Authorization` |
| Vue pageerror | 0 |
| HTTP error | 0 |
| Smoke 判定 | PASS |

## 1. 本次修复

- 修复 `adminAuthApi.login()` 对后端 envelope 响应的适配：后端返回 `data.token`、`data.user.username`、`data.user.role`。
- 修复 `adminAuthApi.me()` 的契约：后端 `/me` 只返回用户资料，不返回 token/expires；前端改为只刷新 `username/role`，不再清掉已有 session。
- 新增 `scripts/phase7-plus-smoke.mjs`，支持用系统 Chrome 跑 Phase 7-Plus smoke，不依赖 Playwright Chromium 下载。
- 后端 `plant-model-gen` 补齐 `GET /api/incremental/archives`，`/archives` 不再触发 404。

## 2. 自动化覆盖

| 步骤 | 路由 | 结果 |
|---|---|---|
| 01 | `/dashboard` | PASS |
| 02 | 未登录 `/topology` | PASS：弹 `管理员登录` |
| 03 | 登录后回跳 | PASS：进入 `/topology` |
| 04 | `/topology` | PASS |
| 06 | `/topology-viz` | PASS |
| 07 | `/tasks` | PASS |
| 08 | `/history` | PASS |
| 09 | `/mqtt/messages` | PASS |
| 10 | `/mqtt/nodes` | PASS |
| 11 | `/logs` | PASS |
| 12 | `/archives` | PASS：归档列表接口返回 `{ success: true, files: [] }` |
| 13 | `/site-config` | PASS |
| 14 | `/settings` | PASS |

## 3. 已关闭缺陷

### P1 · `/archives` 归档列表接口缺失

- 前端调用：`GET /api/incremental/archives`
- 修复结果：后端返回 `200` + `{ success: true, files: [] }`
- 当前影响：已关闭；暂无归档文件时展示空态。

## 4. 产物

- 机器可读结果：`docs/e2e-smoke/2026-04-26-phase7-plus-smoke-result.json`
- 本地截图目录：`docs/e2e-smoke/screenshots/2026-04-26-phase7-plus/`（已 gitignore，不入库）

## 5. 下一步

- 若 console/pageerror 清零，再补跑删除确认、SiteConfig 保存确认等带写操作的手动/自动化步骤。
- 后续可将删除确认、SiteConfig 保存确认纳入 Playwright 脚本的非破坏性测试分支。
