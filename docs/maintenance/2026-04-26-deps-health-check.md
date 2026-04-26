# 依赖体检报告 · 2026-04-26

> `npm audit` + `npm outdated` 综合扫描，记录当前依赖现状与升级路径建议。
>
> 仅应用 zero-risk patch 升级，major 版本跨度均列入「待评估」。

---

## 1. 环境

| 项 | 值 |
|---|---|
| 仓库 HEAD | `4bbee6c docs(changelog): 同步 dual-server smoke 8/8 PASS · Post Wrap-Up 累计到 5 commits` |
| Node | ≥ 20 |
| package manager | npm |
| 注册表 | npmmirror（淘宝镜像）→ audit 时切到 `https://registry.npmjs.org/`（淘宝镜像不实现 audit endpoint） |

---

## 2. `npm audit` 漏洞扫描

### 当前漏洞

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

**本轮不修复**。理由：
1. 生产产物不受影响；
2. vite 5 → 8 跨 3 个 major，配套 `@vitejs/plugin-vue` 5 → 6 也要同步升；
3. 当前所有 build / type-check / e2e smoke 8/8 PASS，零阻塞。

### 推荐时机

下一次 vite 大版本升级 sprint（详见 § 4 升级 backlog）。

---

## 3. `npm outdated` 升级空间

| 包 | 当前 | Wanted | Latest | 升级类型 | 风险 |
|---|---|---|---|---|---|
| `postcss` | 8.5.10 | 8.5.11 | 8.5.11 | **patch** | **0** ✅ 已应用 |
| `@types/node` | 22.19.17 | 22.19.17 | 25.6.0 | major × 3 | 低（类型定义，不影响运行）|
| `@vitejs/plugin-vue` | 5.2.4 | 5.2.4 | 6.0.6 | major | 中（与 vite 配套升）|
| `@vueuse/core` | 11.3.0 | 11.3.0 | 14.2.1 | major × 3 | 低-中（API 兼容性需测试）|
| `daisyui` | 4.12.24 | 4.12.24 | 5.5.19 | major | **高**（与 tailwind 4 配套）|
| `pinia` | 2.3.1 | 2.3.1 | 3.0.4 | major | 中（store 定义可能需调整）|
| `tailwindcss` | 3.4.19 | 3.4.19 | 4.2.4 | major | **高**（rewrite，配置格式大改）|
| `typescript` | 5.9.3 | 5.9.3 | 6.0.3 | major | 中（vue-tsc 兼容性需先验证）|
| `vite` | 5.4.21 | 5.4.21 | 8.0.10 | major × 3 | **高**（配置 + plugin 全套同升）|
| `vue-router` | 4.6.4 | 4.6.4 | 5.0.6 | major | 中（meta + guard 兼容性）|
| `vue-tsc` | 2.2.12 | 2.2.12 | 3.2.7 | major | 中（与 vue/typescript 配套）|

### 已应用 ✅

- **`postcss` 8.5.10 → 8.5.11**：patch 级，无 API 变化。`npm install postcss@8.5.11`，`build` + `type-check` 全绿验证。

### 暂不升级（待独立 sprint 评估）

按 risk 排序：

#### 低风险 backlog（可单独 PR）

- `@types/node` 22 → 25：仅类型，看是否引入新 strict 类型导致 type-check 噪音。
- `@vueuse/core` 11 → 14：检查项目使用了哪些 hook，逐个对照 changelog。

#### 中风险 backlog（需配套测试）

- `vue-router` 4 → 5：meta 类型 / guard 接口可能变化；`router.beforeEach` 写法影响 admin guard。
- `pinia` 2 → 3：setup store 写法主流，但可能影响 SSR 行为（本项目 SPA，影响小）。
- `typescript` 5 → 6：先确认 `vue-tsc` 3 是否完全兼容。

#### 高风险 backlog（成套升级）

- **`vite` 5 → 8 + `@vitejs/plugin-vue` 5 → 6 + `vue-tsc` 2 → 3**：配套升级修复 esbuild 漏洞。需要单独 sprint 跑 build 配置 + manualChunks 函数 + auto-import 插件 + 全套 e2e。
- **`tailwindcss` 3 → 4 + `daisyui` 4 → 5**：配置格式从 `tailwind.config.js` 改 CSS-first，需要 rewrite 整个样式入口。

---

## 4. 升级 backlog（建议）

```text
Sprint Maintenance · 依赖大版本升级（建议 ~4h）

S1 · 类型升级（30 min · 低风险）
  - @types/node@^25
  - typescript@^6（依赖 vue-tsc 3 兼容验证）
  - vue-tsc@^3
  - npm run type-check 全绿

S2 · 路由 + 状态升级（30-60 min · 中风险）
  - vue-router@^5（重点 router.beforeEach / RouteMeta 兼容）
  - pinia@^3
  - 所有 admin guard / store 接入路径全验

S3 · vite + esbuild 安全修复（90-120 min · 高风险）
  - vite@^8
  - @vitejs/plugin-vue@^6
  - 检查 manualChunks 函数签名 + base url + proxy + auto-import 插件
  - dev / build 全跑

S4 · 样式系统 rewrite（独立 sprint · 评估 ~3-5h）
  - tailwindcss@^4 + daisyui@^5
  - 配置从 JS 改 CSS-first（@tailwind/utilities 改 @import "tailwindcss"）
  - 全视图 hover / focus / class 兼容性回归
```

---

## 5. 决定速查

| 问题 | 答案 |
|---|---|
| 当前是否有 critical / high 漏洞？ | **否**（仅 2 项 moderate · esbuild dev-only） |
| 生产产物是否受影响？ | **否** |
| 必须立即升级？ | **否**（开发者本地 dev 不公网暴露即可） |
| 推荐何时升级？ | 下一个 maintenance sprint，按 § 4 backlog 分批 |
| 本轮是否做了什么？ | postcss 8.5.10 → 8.5.11（zero-risk patch） |

---

## 6. 链接

- npm 漏洞 advisory：[`GHSA-67mh-4wv8-2f99`](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
- 升级配套测试矩阵：参考 `docs/plans/2026-04-26-phase7-plus-preparation.md` 14 步矩阵
- 项目文档体系：[`README.md`](../../README.md) · [`AGENTS.md`](../../AGENTS.md) · [`HANDOFF.md`](../../HANDOFF.md) · [`CHANGELOG.md`](../../CHANGELOG.md)
