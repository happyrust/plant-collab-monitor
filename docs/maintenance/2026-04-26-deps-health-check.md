# 依赖体检报告 · 2026-04-26

> `npm audit` + `npm outdated` 综合扫描，记录当前依赖现状与升级路径建议。
>
> 仅应用 zero-risk patch 升级，major 版本跨度均列入「待评估」。

---

## 1. 环境

| 项 | 值 |
|---|---|
| 维护基线 | `2993194 docs(changelog): 同步依赖体检记录` |
| Node | ≥ 20.19（本轮验证环境：v22.22.0；Vue Router 5 的构建期依赖要求 ≥20.19） |
| package manager | npm |
| 注册表 | npmmirror（淘宝镜像）→ audit 时切到 `https://registry.npmjs.org/`（淘宝镜像不实现 audit endpoint） |

---

## 2. `npm audit` 漏洞扫描

### 当前漏洞（S3 后）

`npm audit --audit-level=moderate --registry=https://registry.npmjs.org/`：**0 vulnerabilities**。

### 已关闭漏洞

| 包 | 版本范围 | 严重度 | CVE | 位置 |
|---|---|---|---|---|
| `esbuild` | `<= 0.24.2` | moderate | [`GHSA-67mh-4wv8-2f99`](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | `node_modules/esbuild` |
| `vite` | `<= 6.4.1` | moderate（依赖上述）| 同上 | `node_modules/vite` |

### 漏洞内容

esbuild dev server 接受任意网站请求并读响应—— **仅 dev 期暴露**，生产构建产物（`dist/`）不受影响。

### 缓解措施

- **当前**：vite dev server 默认 `host: true` 监听 `0.0.0.0:3200`（见 `vite.config.ts`）。生产部署用 nginx 反代静态产物，esbuild dev server 不起。
- **本地开发**：开发者本地 vite dev 不要面向公网开放；如需共享，改 `host: 'localhost'` 或加防火墙。
- **完整修复**：升级 vite 5.4 → 8.0（含 esbuild 修复版）—— **breaking change**，需独立 sprint 评估。

### 决定

**S3 已修复**：升级 `vite` 5 → 8、`@vitejs/plugin-vue` 5 → 6，官方 registry audit 0 vulnerabilities。

### 验证

- `npm run type-check` PASS。
- `npm run build` PASS（Vite 8.0.10，3487 modules transformed）。
- Vite 8/Rolldown 产物出现 `rolldown-runtime` 小 chunk；`vendor-naive` 从 573.05KB / gzip 159.34KB 增至 633.81KB / gzip 181.80KB，仍低于 `chunkSizeWarningLimit: 1500`。

---

## 3. 依赖升级空间与已应用项

| 包 | 当前 | Wanted | Latest | 升级类型 | 风险 |
|---|---|---|---|---|---|
| `postcss` | 8.5.12 | 8.5.12 | 8.5.12 | **patch** | **0** ✅ 已应用 |
| `@types/node` | 25.6.0 | 25.6.0 | 25.6.0 | major × 3 | 低 ✅ 已应用 |
| `typescript` | 6.0.3 | 6.0.3 | 6.0.3 | major | 中 ✅ 已应用 |
| `vue-tsc` | 3.2.7 | 3.2.7 | 3.2.7 | major | 中 ✅ 已应用 |
| `pinia` | 3.0.4 | 3.0.4 | 3.0.4 | major | 中 ✅ 已应用 |
| `vue-router` | 5.0.6 | 5.0.6 | 5.0.6 | major | 中 ✅ 已应用 |
| `vite` | 8.0.10 | 8.0.10 | 8.0.10 | major × 3 | 高 ✅ 已应用 |
| `@vitejs/plugin-vue` | 6.0.6 | 6.0.6 | 6.0.6 | major | 中 ✅ 已应用 |
| `daisyui` | 4.12.24 | 4.12.24 | 5.5.19 | major | **高**（与 tailwind 4 配套）|
| `tailwindcss` | 3.4.19 | 3.4.19 | 4.2.4 | major | **高**（rewrite，配置格式大改）|

### 已应用 ✅

- **`postcss` 8.5.10 → 8.5.12**：patch 级，无 API 变化。`npm install postcss@latest`，`build` + `type-check` 全绿验证。
- **S1 类型工具链升级完成**：`@types/node` 22 → 25、`typescript` 5 → 6、`vue-tsc` 2 → 3。TS 6 对 `baseUrl` 发出弃用诊断后，同步把 `tsconfig.json` 的 `paths` 迁移为无 `baseUrl` 写法（`@/*` → `./src/*`），`type-check` + `build` 全绿。
- **S2 路由 + 状态升级完成**：`vue-router` 4 → 5、`pinia` 2 → 3。现有 `router.beforeEach` admin guard、RouteMeta 扩展、`adminAuth` / `appStatus` setup store 均无需代码改动；`type-check` + `build` 全绿。
- **S3 Vite 安全修复完成**：`vite` 5 → 8、`@vitejs/plugin-vue` 5 → 6。现有 `base`、proxy、manualChunks、auto-import / components 插件配置无需代码改动；`type-check` + `build` + `npm audit` 全绿。
- **未使用 direct dependency 清理完成**：业务源码与 `vite.config.ts` 均未直接使用 `@vueuse/core`，移除 direct dependency 后仍由 `unplugin-auto-import` 保留传递依赖；`type-check` + `build` + `npm audit` 全绿。

### 暂不升级（待独立 sprint 评估）

按 risk 排序：

#### 高风险 backlog（成套升级）

- **`tailwindcss` 3 → 4 + `daisyui` 4 → 5**：配置格式从 `tailwind.config.js` 改 CSS-first，需要 rewrite 整个样式入口。

---

## 4. 升级 backlog（建议）

```text
Sprint Maintenance · 依赖大版本升级（建议 ~4h）

S1 · 类型升级（已完成）
  - @types/node@^25
  - typescript@^6
  - vue-tsc@^3
  - tsconfig paths 迁移到无 baseUrl 写法
  - npm run type-check + npm run build 全绿

S2 · 路由 + 状态升级（已完成）
  - vue-router@^5（重点 router.beforeEach / RouteMeta 兼容）
  - pinia@^3
  - 所有 admin guard / store 接入路径全验
  - npm run type-check + npm run build 全绿

S3 · vite + esbuild 安全修复（已完成）
  - vite@^8
  - @vitejs/plugin-vue@^6
  - 检查 manualChunks 函数签名 + base url + proxy + auto-import 插件
  - npm run type-check + npm run build + npm audit 全绿

S4 · 样式系统 rewrite（独立 sprint · 评估 ~3-5h）
  - tailwindcss@^4 + daisyui@^5
  - 配置从 JS 改 CSS-first（@tailwind/utilities 改 @import "tailwindcss"）
  - 全视图 hover / focus / class 兼容性回归
```

---

## 5. 决定速查

| 问题 | 答案 |
|---|---|
| 当前是否有 critical / high 漏洞？ | **否**（npm audit 0 vulnerabilities） |
| 生产产物是否受影响？ | **否** |
| 必须立即升级？ | **否**（S3 已关闭 audit 漏洞） |
| 推荐何时升级？ | 剩余 Tailwind/daisyUI 需独立样式 rewrite sprint |
| 本轮是否做了什么？ | postcss 8.5.10 → 8.5.12（zero-risk patch）+ S1 类型工具链升级 + S2 路由/状态升级 + S3 Vite 安全修复 + 未使用 direct dependency 清理完成 |

---

## 6. 链接

- npm 漏洞 advisory：[`GHSA-67mh-4wv8-2f99`](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
- 升级配套测试矩阵：参考 `docs/plans/2026-04-26-phase7-plus-preparation.md` 14 步矩阵
- 项目文档体系：[`README.md`](../../README.md) · [`AGENTS.md`](../../AGENTS.md) · [`HANDOFF.md`](../../HANDOFF.md) · [`CHANGELOG.md`](../../CHANGELOG.md)
