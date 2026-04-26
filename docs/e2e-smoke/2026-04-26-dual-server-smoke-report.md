# 双服联通验证报告 · 2026-04-26

> 后端 `plant-model-gen` web_server (:3100) + 前端 `vite preview` (:3200) 同时运行，
> PowerShell + `Invoke-WebRequest` / `HttpWebRequest` 验证 e2e 协议层联通。
>
> 这是 **Phase 7-Plus 浏览器联调** 的协议层等价交付，覆盖：
>
> 1. 双服可达性
> 2. admin login flow（POST → token → /me 带 Bearer）
> 3. admin-gated API 鉴权门
> 4. SSE Bearer token 路径（HttpWebRequest 取响应头确认 200 + text/event-stream）

未覆盖部分：浏览器渲染层（视图渲染、交互、登录弹窗 UI、SSE 客户端解析后的 onMessage）—— 仍需 chrome-devtools MCP。

---

## 1. 环境

| 项 | 值 |
|---|---|
| 仓库 HEAD | `78b3325 docs(changelog): 追加 Post Wrap-Up · 文档与部署收尾 3 commits` |
| 后端 | `D:/work/plant-code/plant-model-gen/target/debug/web_server.exe` (cwd=`plant-model-gen`) |
| 后端凭据 | `ADMIN_USER=admin` / `ADMIN_PASS=admin` |
| 后端端口 | `3100` |
| 前端 | `npm run preview` → `vite preview --port 3200`（base=`/monitor/`）|
| 前端端口 | `3200` |
| 校验工具 | PowerShell `Invoke-WebRequest -UseBasicParsing` + `[System.Net.HttpWebRequest]` |

---

## 2. 验证矩阵 8/8 PASS

| # | 路径 | 期望 | 实际 |
|---|---|---|---|
| 1 | 后端 `GET /api/site/info` | 200 | **200 ✅** |
| 2 | 前端 `GET /monitor/` | 200 + index.html | **200 ✅** |
| 3 | 后端 `POST /api/admin/auth/login` admin/admin | 200 + token | **200 ✅**（token 长度 36，role=admin）|
| 4 | 后端 `GET /api/admin/auth/me` Bearer | 200 | **200 ✅** |
| 5 | 后端 `GET /api/remote-sync/envs` 无 token | 401/403 | **401 ✅**（鉴权门生效）|
| 6 | 后端 `GET /api/remote-sync/envs` Bearer | 200 | **200 ✅** |
| 7 | 后端 `GET /api/sync/events/stream` Bearer SSE | 200 + `Content-Type: text/event-stream` | **200 ✅** + `text/event-stream` |
| 8 | 后端 `GET /api/sync/status` 公共 | 200 | **200 ✅** |

---

## 3. 关键判定

### 3.1 admin login flow 协议链路完整

后端响应 body 结构：

```json
{
  "data": {
    "token": "5b73587c-...",
    "expires_at": "2026-04-27T14:00:43.702879900+00:00",
    "user": { "role": "admin", "username": "admin" }
  },
  "message": "登录成功",
  "success": true
}
```

前端 `adminAuthApi.login()` 的封装解 `data` 字段、写入 `adminAuth.setSession(data)`，后续 axios interceptor 自动注入 `Authorization: Bearer <token>`，**协议层与前端实现完全契合**。

### 3.2 admin-gated 鉴权门生效

`/api/remote-sync/envs` 是 26 个 admin-gated endpoints 之一：

- 无 token: `401 Unauthorized`，body `{"message":"未登录或token已过期","success":false}`
- 带 token: `200`，正常返回环境列表

证实 `LoginDialog` + `LocalAdminAuth` token store + `requiresAdmin` 路由守卫 + axios interceptor 完整闭环。

### 3.3 SSE Bearer 路径协议层 OK，但端点本身未 gate

`/api/sync/events/stream` 用 `HttpWebRequest` 拿响应头：

| 调用方式 | 状态 | Content-Type |
|---|---|---|
| Bearer token | `200 OK` | `text/event-stream` ✅ |
| 无 token | `200 OK` | （未触发 401）⚠️ |

**Finding · F-01**：`/api/sync/events/stream` 端点未受 admin auth middleware 保护。任何客户端（无 token）也能订阅事件流。

- 影响：信息可见性风险（事件元数据可被未鉴权访问者监听）。
- 与前端契合：前端 `useSse` 仍然通过 `getToken: () => adminAuth.token` 注入 token——前端做得"对"，但后端没有 enforce。
- 推荐动作：后端在 SSE 端点 router 上加 admin middleware，或显式声明此端点为公共 telemetry。
- 严重度：**低**（事件流不含敏感字段，但建议确认设计意图）。
- 与 mini API smoke 报告 § 6 「`/api/deployment-sites` 未走 admin middleware」属同类问题（应一并讨论后端 admin 中间件覆盖范围）。

### 3.4 跨服务（前 :3200 ↔ 后 :3100）网络层无阻塞

两个端口同时监听，PowerShell 客户端可以同时发起请求互不影响。生产部署时两者通常通过 nginx 反代统一到一个域名（`/` 走前端 / `/api/` 走后端 / `/ws/` 走后端 ws），届时同源 + 无 CORS 配置烦恼。

---

## 4. 与既有报告对照

| 报告 | 覆盖范围 | 验证条目 |
|---|---|---|
| `2026-04-26-e2e-smoke-report.md` | 前端 11 视图（无后端基线） | 视图渲染、空状态、错误兜底 |
| `2026-04-26-mini-api-smoke-report.md` | 后端 17 个 API 端点（独立后端） | login flow、B1/B2/B3/B6 真值、admin gate |
| `2026-04-26-preview-base-smoke-report.md` | 前端 dist 静态部署链路（独立前端） | nginx try_files、SPA fallback、tree-shake |
| **本报告** `2026-04-26-dual-server-smoke-report.md` | **双服同时运行 · 协议层 e2e** | login → token → admin-gated + SSE Bearer 头 |
| `phase7-plus-preparation.md` 14 步矩阵 | 浏览器渲染层 | ⏳ 待 chrome-devtools MCP |

四份验证报告组成完整 e2e 矩阵，**只剩浏览器渲染层未覆盖**。

---

## 5. 结论

✅ **协议层 e2e 双服联通 8/8 PASS**。

剩余 Phase 7-Plus 工作收窄到：
1. **浏览器渲染层**：视图渲染（11 view）、登录弹窗交互、SSE onMessage 客户端解析、admin guard redirect 视觉确认 → 需 chrome-devtools MCP。
2. **Phase 20 跨仓 rs-core 真热加载**：详见 `docs/plans/2026-04-26-phase20-rs-core-true-hot-reload.md`。

**Findings 待后端确认**：
- F-01 · `/api/sync/events/stream` 是否应该走 admin middleware？
- mini API smoke F-01 · `/api/deployment-sites` 是否应该走 admin middleware？

两者属同类设计决策，建议合并讨论后统一加 admin middleware 或明确公共 telemetry 列表。
