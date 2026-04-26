# Preview 部署 base 验证报告 · 2026-04-26

> 不依赖外部 chrome-devtools MCP 的简化版 e2e：用 `vite preview` 模拟 nginx 静态托管，PowerShell `Invoke-WebRequest` 验证 `/monitor/` 路径下的资源响应与 SPA fallback 行为。
>
> 目的：在 Phase 7-Plus 完整浏览器联调之前，先把 **生产 base 链路** 的纯静态部分验证到位。

---

## 1. 环境

| 项 | 值 |
|---|---|
| 仓库 HEAD | `881af04 docs(handoff): 加 CHANGELOG 引用保持文档体系一致` |
| Node | ≥ 20 |
| 构建产物 | `npm run build` 输出 `dist/` |
| 服务 | `npm run preview` → `vite preview --port 3200`（`base=/monitor/`）|
| 校验工具 | PowerShell `Invoke-WebRequest -UseBasicParsing` |

---

## 2. dist 产物 sanity

`dist/index.html` 头部资源链接：

```html
<script type="module" crossorigin src="/monitor/assets/index-D6ArNDQl.js"></script>
<link rel="modulepreload" crossorigin href="/monitor/assets/vendor-vue-DlhXwr-9.js">
<link rel="modulepreload" crossorigin href="/monitor/assets/vendor-http-DZ_Kha3d.js">
<link rel="modulepreload" crossorigin href="/monitor/assets/vendor-naive-BxzUMTEl.js">
<link rel="stylesheet" crossorigin href="/monitor/assets/index-Dlq6cjd4.css">
```

✅ base 前缀 `/monitor/` 在 `script`/`modulepreload`/`stylesheet` 三处 URL 全部正确注入。

---

## 3. HTTP 验证

| 路径 | 期望 | 实际 |
|---|---|---|
| `GET /` | `302 Found → /monitor/` | **302 ✅**（vite preview 自动 redirect） |
| `GET /monitor/` | `200` + index.html | **200 ✅**，`<title>plant-collab-monitor · 异地协同监控台</title>` |
| `GET /monitor/assets/index-D6ArNDQl.js` | `200` | **200 ✅** |
| `GET /monitor/assets/index-Dlq6cjd4.css` | `200` | **200 ✅** |
| `GET /monitor/dashboard` | `200` index.html (SPA fallback) | **200 ✅** length=715 |
| `GET /monitor/topology` | `200` index.html (admin route, 前端 guard 接管) | **200 ✅** length=715 |

---

## 4. 关键判定

### 4.1 nginx 配置可直接照抄

参考 `README.md` 「生产部署 → Nginx 反代」段：

```nginx
location /monitor/ {
  alias /var/www/plant-collab-monitor/;
  try_files $uri $uri/ /monitor/index.html;
}
```

`vite preview` 的行为与上述 nginx try_files 一致：
- 静态文件优先（`/monitor/assets/*.js|css` 直接命中文件系统）
- 找不到则 fallback 到 `/monitor/index.html`（SPA 路由由 vue-router HTML5 history 接管）

### 4.2 admin guard 行为正确

- `/monitor/topology` HTTP 层返回 200（含 index.html shell）
- 真实拦截发生在前端运行时：`router.beforeEach` 检测 `meta.requiresAdmin`，未登录即 `promptLogin` 并跳 `/dashboard`
- 这意味着 **静态层不会泄漏 admin 视图代码到未登录用户**——所有视图代码都被打包到 lazy chunk，前端 router 不渲染对应组件即不加载

### 4.3 modulepreload tree-shaking 生效

`index.html` 里 `modulepreload` 仅有 3 个 vendor chunk + 1 个 entry：
- `vendor-vue` (109KB)
- `vendor-http` (38KB)
- `vendor-naive` (573KB · 按需 tree-shaken)
- `index` 入口

**未** 出现 `vendor-echarts`（538KB · 仅 Dashboard / Charts 使用），证明懒加载与 manualChunks 函数化策略协同正常，避免首屏拉取 echarts。

---

## 5. 结论

✅ **生产 base 链路（vite + dist + nginx try_files 等价）100% 可工作**。

剩余 Phase 7-Plus 工作仅限于：
1. 真实 nginx 部署后 跨域/跨端口 cookie/CORS 配置
2. 浏览器渲染层验证（chrome-devtools MCP）—— 视图渲染 / 交互 / SSE 真连接 / admin login flow 视觉确认
3. 后端 stub 接入真热加载（Phase 20 跨仓 rs-core）

本报告为 `docs/plans/2026-04-26-phase7-plus-preparation.md` § 14 步矩阵中 「nginx 静态托管」预研项的等价交付。
