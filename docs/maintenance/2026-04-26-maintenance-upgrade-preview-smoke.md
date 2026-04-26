# Maintenance Upgrade Preview Smoke · 2026-04-26

> 针对 S1-S4 依赖维护升级后的生产预览静态验证。

## 范围

- 生产构建：`npm run build`
- 生产预览：`npm run preview -- --host 127.0.0.1`
- 部署 base：`/monitor/`
- 重点：SPA fallback、核心 assets、Tailwind 4 / DaisyUI 5 产物、audit/outdated 状态

## 结果

| 项 | 结果 |
|---|---|
| `npm run type-check` | PASS |
| `npm run build` | PASS |
| `npm audit --registry=https://registry.npmjs.org/` | PASS · 0 vulnerabilities |
| `npm outdated` | PASS · 无剩余输出 |
| DaisyUI 全局类入产物 | PASS |
| 预览路由 smoke | PASS |
| 预览 assets smoke | PASS |

## 路由 Smoke

| 路由 | 状态 | 说明 |
|---|---:|---|
| `/` | 200 | 跟随 redirect 后返回 `index.html` |
| `/monitor/` | 200 | `index.html` · 810 bytes |
| `/monitor/dashboard` | 200 | SPA fallback |
| `/monitor/topology` | 200 | SPA fallback |
| `/monitor/mqtt/nodes` | 200 | SPA fallback |
| `/monitor/site-config` | 200 | SPA fallback |

## Assets Smoke

| Asset | 状态 | Size |
|---|---:|---:|
| `/monitor/assets/index-DAT7Fa7p.js` | 200 | 21,820 bytes |
| `/monitor/assets/vendor-naive-CZZgHBlX.js` | 200 | 633,810 bytes |
| `/monitor/assets/rolldown-runtime-lhHHWwHU.js` | 200 | 158 bytes |
| `/monitor/assets/vendor-http-BI11MufN.js` | 200 | 37,424 bytes |
| `/monitor/assets/vendor-vue-DTQjW4fd.js` | 200 | 30,947 bytes |
| `/monitor/assets/index-DGnDLYpc.css` | 200 | 203,135 bytes |

## CSS 产物检查

`dist/assets/index-DGnDLYpc.css` 命中 DaisyUI / Tailwind 关键类：

- `btn-primary`
- `modal-box`
- `input-bordered`
- `badge-success`
- `stats-horizontal`

## 结论

S1-S4 依赖维护升级后的静态部署链路通过。Tailwind 4 / DaisyUI 5 已进入主 CSS 产物，`/monitor/` base、SPA fallback、核心 JS/CSS assets 均可访问。
