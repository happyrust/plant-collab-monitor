# 中继台账读侧 API + 监控台「变更清单」开发方案（2026-09-17）

> 状态：**已批准（2026-09-17 00:17，§7 八条默认全部接受）· P0 后端读侧已实施（pws `b61b7ca`，见 §8）· P1 前端 / P2 用例待做**
> （草案由 fable-5-1-28 于 2026-09-17 00:20 写出；P0 由 fable-5-1-36 于同日 06:46 落地）
> 范围：`plant-web-server`（站点后端，读侧 API）+ `plant-collab-monitor`（新视图 + API 模块 + 用例）；`plant-model-gen` **不做**（待废弃）
> 目标读者：接手这项改造的工程师
> 上游：`docs/plans/2026-09-15-sqlite-only-remote-collab-plan.md` §2 目标 3 与 §7 第 4 条——「P1 只建表不给 API，读侧 API 与 L3 一起下一期」；本方案就是那个「下一期」里不需要 licensed schema 的那一半
> 依据：2026-09-17 对 `plant-web-server/src/relay/ledger.rs`、`standalone_services.rs`、`standalone_runtime.rs` 与 monitor `src/api` / `src/views` / `AGENTS.md` 的只读排查，结论都带 `文件:行号`

---

## 0. 结论先行

- 台账**已经在写、从未被读**：`e3d_sync_ledger` / `e3d_sync_changes` / `relay_sync_watermark` 三张表由中继两端写进站点的 `deployment_sites.sqlite`（`relay/ledger.rs:30-70`），今天只能用 `sqlite3` 命令行看（`COMMANDS.md` 第 8 步、smoke LS-23/24 也是这么查的）。监控台 `/history`「同步历史」读的是 `/api/sync/history`——pws 那边是任务历史 JSON（`standalone_services.rs:353-366`），与台账无关。
- 本方案给 pws 加 **5 个只读端点**（`/api/remote-sync/ledger/*`），给监控台加 **1 个视图**「中继台账」（列表 → 抽屉看该次广播 / 接收的详情与 RefNo 级变更清单）+ 水位面板，并把用例补进现有四层（mock / 只读 live / 双站点 LS-25）。
- Q1=B（2026-09-15 grill）里「站点能回答变更清单级别的查询」到这一步闭环；「元素 / 属性级」仍需把 licensed schema 包分发到站点，**不在本方案内**（§2 非目标）。
- 估时 ≈ 2 天：P0 后端 0.5 · P1 前端 1 · P2 用例 + 文档 0.5。

---

## 1. 现状盘点（都是查实的）

### 1.1 数据在哪、长什么样

`plant-web-server/src/relay/ledger.rs:30-70`（`SCHEMA_SQL`，与 pmg `sync_ledger.rs` 同一份 DDL）：

| 表 | 粒度 | 关键列 | 索引 |
|---|---|---|---|
| `e3d_sync_ledger` | 每条 MQTT 消息里的每个文件一行 | `id`(uuid) `msg_id` `direction`(outbound/inbound) `location` `file_name` `file_hash` `sesno_from/to/seen` `diff_inserted/deleted/modified` `diff_status` `verify_status` `verify_detail` `msg_timestamp` `created_at` | `created_at`；`(file_name, created_at)` |
| `e3d_sync_changes` | 一次 outbound 广播改了哪些 RefNo | `ledger_id` `refno`("dbno/seq") `kind`(inserted/deleted/modified/relocated) | PK `(ledger_id, refno)`——按 `ledger_id` 查走索引 |
| `relay_sync_watermark` | 每 dbnum 一行 | `dbnum` `file_name` `sesno` `last_seen_fingerprint` `updated_at` | PK `dbnum` |

- `e3d_sync_changes` 单行上限 20 000（`MAX_CHANGES_PER_ROW`，`:73`），超出在 `verify_detail` 标 `changes_truncated:<总数>`。`verify_detail` 还会带 `diff_from_resolved=<n>`、`empty_diff: …`、`publish_failed: …`、`clone reported updated=false` 等自由文本（`watch.rs` / `file_sync.rs`）。
- `verify_status` 取值：`ok | hash_mismatch | open_failed | sesno_mismatch | sesno_disagree | clone_failed | skipped`；`diff_status`：`ok | empty | unavailable | skipped`（`ledger.rs:136-186`）。
- **建表时机**：pws 里只在**首次写入**时 `ensure_schema`（`ledger.rs:101-114` 的 `open()`）；没有 pmg 那种启动期 `collab_migrations`。所以一个刚激活、还没收发过任何消息的站点**可能没有这三张表**，读侧必须把「文件不存在 / no such table」当空结果，而不是报错。
- 库路径：`ledger::resolve_db_path()`（`:78-92`）= `DB_OPTION_FILE` 指向 toml 的 `deployment_sites_sqlite_path`，缺省 `deployment_sites.sqlite`，与控制面同库。
- 样本量（本机 site-a，跑过十几轮 smoke）：台账 16 行（outbound/ok 15、inbound/skipped 1）、变更 324 行（inserted 288 / modified 36）、水位 1 行。真实工程里一次 MERGE 可到几十万元素 → 变更清单**必须服务端分页**。

### 1.2 pws 控制面怎么加端点

- 所有 `/api/remote-sync/*` 都由 `remote_sync_route`（`standalone_runtime.rs:1366-1380`）转给 `RemoteSyncService::handle(method, path, payload, runtime)`（`standalone_services.rs:1528-1641`），后者按 `path_segments` 模式匹配分派，没匹配上的进 `explicit_not_implemented`（`:5233`，HTTP 200 + `success:false, status:"not_implemented"`）。
- axum 路由要**逐条显式注册**（`standalone_runtime.rs:686-765`，每个路径一行 `.route(...)`），不是通配。
- 查询参数：`remote_sync_route` 只收 body（`payload: Option<Json<Value>>`），**GET 的 query string 目前没进 `handle`**——pws 现有 GET 端点都不带参数。读侧 API 要分页 / 过滤，得把 `uri.query()` 解析成 `Value` 合进 `payload`（一处小改，`:1366` 附近；`history()` 已经是从 `payload` 取 `limit/offset` 的写法，`:353-357`，正好对上）。
- 鉴权：pws 的 `/api/remote-sync/*` **服务端不校验 token**（全仓无 `UNAUTHORIZED` / 鉴权中间件；监控台的 admin 门是前端路由 `meta.requiresAdmin`）。本方案沿用这一层级，不单独加鉴权（§7 第 6 条）。
- 响应形状约定（`AGENTS.md` §4.3.2）：pws 一律 `{success, …, mode:"standalone-real"}`，列表放 `items` + `total`。

### 1.3 监控台怎么加

- `AGENTS.md` §10：新视图 = `src/views/Foo.vue`（`<script setup lang="ts">`）+ `router/index.ts` 路由（`meta.requiresAdmin`）+ `App.vue:298-314` 侧栏项（`admin: true`）；新 API 模块 = `src/api/fooApi.ts` + `index.ts` re-export。
- §4.3：视图只走 `src/api/*.ts`，**API 层与后端路由一一对应**，新增方法前先确认路由已注册；§8 hot rules（无裸 fetch / 无 alert / `err?.message || err` / naive-ui 自动 import）。
- 两种后端（§4.3.2）：pmg 的 axum 对未注册路径回 **404**，pws 对未分派路径回 **200 + `success:false`**——视图的「该后端不提供台账 API」空态要两种都认。
- 现有四层用例（`docs/e2e-smoke/remote-deploy-auto-test-cases.md`）：L1 mock `DA-xx`、L2 只读 live `LR-00–06`、L3 闭环 `LF-00–08`、L4 双站点 `LS-01–24`。台账是只读面，落在 L1 / L2 / L4。

---

## 2. 目标与非目标

**目标**

1. 站点后端（pws）提供台账读侧 API：分页 / 过滤的台账列表、单行详情、该行的 RefNo 级变更清单（分页）、水位、汇总。全部只读、参数白名单、SQL 全部绑定参数。
2. 监控台新视图「中继台账」：一眼看到最近的广播 / 接收及其校验结果；点进任意一次 outbound 能翻它的变更清单（RefNo + 种类），能按种类筛、按 RefNo 前缀搜；能看每个 dbnum 的当前水位。
3. 两种后端都不炸：pws 没建表 / 没数据 → 空态；pmg（无此 API）→ 「该后端不提供台账 API」空态，不出现未捕获红错。
4. 用例进四层：mock 契约、只读 live、双站点 LS-25（对着 LS-23 刚广播出去的那一行核对 API 与 sqlite3 读到的一致）。

**非目标**

- 不做元素 / 属性级查询（`/api/e3d/element/{refno}` 之类）——需要把 licensed `schema/` 包分发到站点，另立项。
- 不做台账清理 / 保留策略 API（表无限增长是既有风险，见 §6，给一条后续建议）。
- 不做导出（CSV / Excel）——列表与清单都有 `limit/offset`，脚本要导可以直接翻页；导出按钮下一期。
- 不改 `plant-model-gen`：它那份 `sync_ledger.rs` 也在写同样三张表，但该仓待废弃，不给它加读侧。
- 不改 `/history`「同步历史」视图的语义（它是任务历史，不是台账）。
- 不加服务端鉴权（pws 现状如此，单独立项）。

---

## 3. 方案

### 3.1 后端：`plant-web-server/src/relay/ledger_query.rs`（新）+ 5 个端点

只读模块，与 `ledger.rs`（只写）并列，共用 `ledger::resolve_db_path()`。连接 `OpenFlags::SQLITE_OPEN_READ_ONLY`、`busy_timeout(5s)`；库文件不存在或 `no such table` → 返回空结果（`items: []`, `total: 0`, `note: "ledger_not_initialized"`），**读侧绝不建表**（读不该有副作用）。所有查询同步执行，`handle` 里包 `spawn_blocking`。

| # | 端点 | 参数（query string） | 返回 |
|---|---|---|---|
| 1 | `GET /api/remote-sync/ledger` | `direction` `verify_status` `diff_status` `file_name`（前缀，`LIKE ?%`）`location` `msg_id` `since` `until`（RFC3339，对 `created_at`）`limit`（默认 50，上限 500）`offset` | `{success, items:[LedgerRowView…], total, limit, offset, mode}`；按 `created_at DESC`。每行 = 全部列 + `changes_count`（相关子查询 `COUNT(*) FROM e3d_sync_changes WHERE ledger_id = l.id`，走 PK 索引，一页 ≤ 500 行可接受） |
| 2 | `GET /api/remote-sync/ledger/rows/{id}` | — | `{success, item: LedgerRowView + kinds:{inserted, deleted, modified, relocated}}`；不存在 → `success:false, message` |
| 3 | `GET /api/remote-sync/ledger/rows/{id}/changes` | `kind` `refno`（前缀）`limit`（默认 200，上限 2000）`offset` | `{success, items:[{refno, kind}…], total, limit, offset}`；按 `refno` 升序（PK 顺序） |
| 4 | `GET /api/remote-sync/ledger/summary` | `since`（可选，默认不限） | `{success, by_direction_status:[{direction, verify_status, count}], rows_total, changes_total, watermarks_total, last_outbound_at, last_inbound_at, problems_recent:[最近 5 条非 ok/skipped 行]}` |
| 5 | `GET /api/remote-sync/ledger/watermarks` | — | `{success, items:[{dbnum, file_name, sesno, last_seen_fingerprint, updated_at}…], total}`；按 `dbnum` |

- 路径故意用 `ledger/rows/{id}`，避免 `ledger/{id}` 与 `ledger/summary` / `ledger/watermarks` 的静态段 / 参数段同级竞争。
- 枚举参数白名单：`direction ∈ {outbound, inbound}`，`verify_status` / `diff_status` / `kind` 只接受 §1.1 列出的值，其余 → `success:false, message:"invalid <param>"`；`since/until` 用 `chrono` 解析失败同样报错；`limit/offset` 越界夹到范围内。
- **`remote_sync_route` 把 query string 合进 payload**：`uri.query()` → `serde_urlencoded`（axum 已带）或手工 `split('&')` 解析成 `Value::Object`，与 body 合并（body 优先）；现有端点不受影响（它们不读这些键）。
- 顺手一处（可选，§7 第 7 条）：`relay::start` 成功后调一次 `ledger::ensure_schema`，让激活过的站点立刻有表——不改读侧「不建表」的原则，只是把建表时机从「首次写」提前到「激活」。

### 3.2 前端：`relayLedgerApi.ts` + `RelayLedgerView.vue`（`/ledger`「中继台账」）

**API 模块** `src/api/relayLedgerApi.ts`（`index.ts` re-export；README「API 模块清单」+ `AGENTS.md` §4.3 表各加一行）：

```ts
export interface LedgerRowView { id; msg_id; direction: 'outbound'|'inbound'; location; file_name; file_hash?; sesno_from?; sesno_to?; sesno_seen?; diff_inserted?; diff_deleted?; diff_modified?; diff_status?; verify_status; verify_detail?; msg_timestamp?; created_at; changes_count: number }
export interface LedgerChange { refno: string; kind: 'inserted'|'deleted'|'modified'|'relocated' }
export interface LedgerWatermark { dbnum; file_name; sesno; last_seen_fingerprint?; updated_at }
export const relayLedgerApi = { list(params), get(id), changes(id, params), summary(params?), watermarks() }
/** 404（pmg）或 success:false + status:'not_implemented'（pws 老版本）→ 视图显示「该后端不提供台账 API」 */
export function isLedgerUnavailable(err | res): boolean
```

**视图** `src/views/RelayLedgerView.vue`，路由 `/ledger`（`meta.requiresAdmin: true`，与 `/topology` 同门），侧栏 `App.vue` 在「同步历史」之后加 `{ name:'ledger', path:'/ledger', icon:'≡', label:'中继台账', admin:true }`：

1. **头部**：标题 + 汇总 chips（`summary`：outbound ok / inbound ok / 问题行数 / 最近一次广播 · 接收时间 / 水位数）+ 「刷新」+ 「30 s 自动刷新」开关（与 `/topology` 的 pill 轮询同一手法）。
2. **筛选栏**：方向（全部 / outbound / inbound）、校验状态（多选）、文件名前缀、时间范围（近 1 h / 24 h / 7 d / 自定义）；变化即重查、回第 1 页。
3. **表**（`NDataTable`，服务端分页 50/页）：时间、方向（tag）、文件名、`sesno_from → sesno_to`（`sesno_seen` 不同时红标）、diff（`+n −n ~n`）、校验状态（tag：ok 绿 / skipped 灰 / 其余 rose）、变更数（按钮，`changes_count`；`verify_detail` 含 `changes_truncated:<n>` 时显示 `20000 / n（截断）`）。
4. **抽屉**（点行 / 点变更数）：上半是该行全部字段（`msg_id` 可复制、`verify_detail` 原文），下半是**变更清单表**：服务端分页 200/页、种类筛选（四种 + 全部）、RefNo 前缀搜索、「复制本页 RefNo」；inbound 行没有清单，抽屉里说明「接收方不记清单，见 A 站同一 msg_id 的 outbound 行」并给一个「按 msg_id 过滤列表」的快捷键。
5. **水位面板**（折叠，默认收起）：`watermarks` 表（dbnum / 文件 / sesno / 指纹 / 更新时间）。
6. **空态**三种：没表没数据 → 「还没有收发过消息」；`isLedgerUnavailable` → 「该后端不提供台账 API（需 plant-web-server ≥ 本方案版本）」；请求失败 → rose banner（`err?.message || err`）。

不改 Dashboard（6 卡片布局不动；要不要加「中继台账」卡另议，§7 第 8 条）。

### 3.3 用例

- **pws 单测**（`ledger_query.rs` `#[cfg(test)]`，临时库 + `ledger::SCHEMA_SQL` 建表 + 直接 INSERT 样本）：分页与 total 一致、每个过滤条件、`changes` 分页 / 种类 / 前缀、`summary` 计数、库不存在 → 空结果、非法枚举 → 报错、`limit` 夹取。
- **L1 mock** `scripts/relay-ledger-smoke.mjs`（默认模式，`page.route` 拦 `/api/remote-sync/ledger*` 回固定 JSON）`RL-01–06`：列表渲染行数 == mock；筛选触发正确 query；点行开抽屉、清单分页 200；`changes_truncated` 显示；pmg 形状（404）与 pws 老版本（`not_implemented`）两种空态；全程 0 写请求、0 pageerror。
- **L2 只读 live**（同一脚本 `--api http://127.0.0.1:4100`）`RL-L1–L3`：视图行数 == `GET ledger?limit=50` 的 `items.length`；随机一行的抽屉清单 total == `GET rows/{id}/changes` total；水位面板行数 == `GET watermarks` total。
- **L4** `local-remote-collab-smoke.ps1` 加 **LS-25**（在 LS-24 之后、收尾之前）：`GET /api/remote-sync/ledger?direction=outbound&msg_id=<LS-23 的 msg_id>` 恰 1 行且 `verify_status == ok`；`GET ledger/rows/{id}/changes?limit=1` 的 `total` == LS-23 用 sqlite3 数出的 `e3d_sync_changes` 行数；B 站 `GET ledger?direction=inbound&msg_id=<同一 msg_id>` 恰 1 行 `ok`。通过线 ≥ 23/25。
- 常规：`npm run type-check` 0 errors、`npm run build`、`cargo build --bin plant-web-server` 本仓新增警告 0、`cargo test --lib relay::` 全绿。

---

## 4. 阶段拆解

| 阶段 | 内容 | 估时 | 验收 |
|---|---|---|---|
| **P0** 后端读侧 | `ledger_query.rs`（5 个查询 + 单测）；`remote_sync_route` 合并 query string；`handle` 加 5 个分派分支；`standalone_runtime.rs` 注册 5 条路由；（可选）`relay::start` 后 `ensure_schema` | 0.5 天 | 对 site-a 的 sqlite（16 行 / 324 变更 / 1 水位）：`curl` 5 个端点，`total` 与 `sqlite3` 一致；`limit=1&offset=15` 拿到最早一行；非法 `verify_status` 报错；指向不存在的库 → 空结果 |
| **P1** 前端 | `relayLedgerApi.ts` + `RelayLedgerView.vue` + 路由 + 侧栏 + README / AGENTS §4.3 表 | 1 天 | 对 site-a：列表、筛选、抽屉清单分页、水位、三种空态（把 `--api` 指到 pmg 的 :4100 旧后端或改 mock 验 404 / not_implemented）；`type-check` 0 errors |
| **P2** 用例 + 文档 | `relay-ledger-smoke.mjs`（mock + live）；`package.json` `smoke:relay-ledger` / `smoke:relay-ledger:live`；LS-25；`remote-deploy-auto-test-cases.md` 新加一节；CHANGELOG / HANDOFF | 0.5 天 | mock 6/6；live 3/3；双站点 25/25（或 ≥ 23/25） |

依赖：P1 依赖 P0 的端点形状（可先按 §3.1 表并行写 mock）；P2 依赖 P0 + P1。

**动手前**：pws 与 monitor 都是 git 仓，直接提交即可，不需要 2026-09-15 那种手工备份。

---

## 5. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 台账表无限增长（每文件每消息一行，变更每行最多 2 万） | 列表 `COUNT(*)`、`changes_count` 子查询变慢 | 现有索引够当前量级；列表默认只看近 7 天（`since`）；保留策略另立项（§6） |
| 读写并发（中继在写、监控台在读） | 偶发 `SQLITE_BUSY` | 只读连接 + `busy_timeout(5s)`；写事务都很短（一行 + 最多 2 万 changes 一次事务） |
| 站点还没建表 | 读侧报 `no such table` | 读侧当空结果；可选把建表提前到激活 |
| 两种后端形状 | pmg 404、pws 老版本 `not_implemented` | `isLedgerUnavailable` 统一成一种空态；LR 用例覆盖 |
| `verify_detail` 是自由文本 | 前端解析脆弱 | 只解析一个明确标记 `changes_truncated:<n>`，其余原文展示 |
| GET query string 合并进 `payload` | 影响现有端点？ | 现有 GET 端点不读任何键；合并时 body 优先；单测 + LR-00–06 回归 |
| 20 000 行清单一次拉完把浏览器拖死 | 卡顿 | 服务端分页 200/页、上限 2000，前端不做「全部加载」 |

---

## 6. 后续建议（不在本方案内）

1. 台账保留策略：`DELETE FROM e3d_sync_ledger WHERE created_at < ?`（级联删 changes），按天跑或 `runtime/status` 里报表大小；或者按 msg_id 归档到 `assets/archives/ledger-YYYYMM.sqlite`。
2. 导出 CSV（列表 / 某行清单）。
3. Dashboard 加「中继台账」卡（近 24 h 广播 / 接收 / 问题数）。
4. 元素 / 属性级查询（真正的 L3）：需要 licensed schema 分发方案。
5. pws `/api/remote-sync/*` 服务端鉴权。

---

## 7. 本版默认——不同意就点名改哪条

1. 新增独立视图 `/ledger`「中继台账」（admin），**不**塞进 `/history`「同步历史」（那是任务历史，语义不同）。
2. 端点放 `/api/remote-sync/ledger/*`（与监控台 `remoteSyncApi` 同一族、同一形状约定），不另起 `/api/relay/*`。
3. 只做 pws；pmg 不加读侧，监控台对它显示「该后端不提供台账 API」。
4. 列表 50/页（上限 500）、清单 200/页（上限 2000）、`created_at DESC`；无导出。
5. 只读：不加删除 / 清理端点。
6. 不加服务端鉴权，沿用 pws 现状（前端 admin 路由门）。
7. `relay::start` 成功后 `ensure_schema` 一次（让激活过的站点立刻有表）——**可选**，不想动激活路径就去掉。
8. Dashboard 不动。

---

## 8. 执行记录

### P0 后端读侧 · 已完成（2026-09-17 06:46，pws `b61b7ca`，已推）

按 §3.1 落地，`plant-web-server` 6 文件 +1514 / −17：新模块 `src/relay/ledger_query.rs`（1334 行，含 9 个单测），
`standalone_runtime.rs`（5 条路由 + `remote_sync_route` 合并 query string），`standalone_services.rs`（5 个分派分支 +
`ledger_query` 公共路径），`relay/mod.rs`（`start` 成功后 `ledger::ensure_schema_now()`），`relay/ledger.rs`
（`open_rw` / `ensure_schema_blocking` / `ensure_schema_now`；`insert_row` 改 `pub(crate)` 供读侧单测用真写侧写样本），
pws `README.md` 加「台账读侧」小节。

**与 §3.1 表相比的几处具体化 / 小出入**（P1 写 `relayLedgerApi.ts` 时以这里为准）：

| 项 | 方案写的 | 实际 | 为什么 |
|---|---|---|---|
| `verify_status` | 单值 | **逗号多选**（`verify_status=ok,skipped`，JSON 数组也认），逐项白名单、去重 | §3.2 前端筛选栏本来就是「校验状态（多选）」，不然前端得发 N 次 |
| 空结果的标记 | `note: "ledger_not_initialized"` | 同；**`note` 字段只在库不存在 / 表不全时出现**，表在就没有这个键 | 前端用 `'note' in res` 或 `res.note === 'ledger_not_initialized'` 判 |
| 错误形状 | `success:false, message:"invalid <param>"` | `{success:false, status:"invalid_param" \| "not_found" \| "query_failed", message, mode}` | 多一个 `status` 让前端分流；**不会**是 `not_implemented`，`isLedgerUnavailable` 照旧只认那个值 |
| `summary` | 表里列的字段 | 多 **`problems_total`**（校验状态 ∉ {ok, skipped} 的行数）与 **`since`**（生效的归一值）；`since` 只圈 `by_direction_status / rows_total / changes_total / problems_*`，**`last_*_at` / `watermarks_total` 不受限**（它们是「当前状态」） | 头部 chip「问题行数」直接拿总数；「最近一次广播 · 接收」不该因为时间窗为空而消失 |
| `changes` | `{items, total, limit, offset}` | 多 **`ledger_id`** 回显；行不存在 → `not_found`，行存在但没清单（inbound）→ `total: 0` 空列表 | 抽屉里分清「没这行」与「这行没清单」 |
| `since / until` | RFC3339 | RFC3339（任意时区，归一成 UTC 再比）**或 `YYYY-MM-DD`（UTC 零点）**；闭区间 | 手敲 / 脚本方便 |
| query string 合并 | `remote_sync_route` 合进 payload | **只对 GET 合**；POST / PUT 仍只取 body | `create_env` / `update_env` 把整个 payload 合进落盘对象，URL 上偶然带的参数不能混进 env |
| §7 第 7 条 | 可选 | 已做：`relay::start` 成功后 `ledger::ensure_schema_now()`，失败只 warn | 实测激活后立刻 `GET ledger` → `total: 0` 且无 `note` |
| `limit / offset` | 越界夹到范围 | 同；**非数字**（`limit=abc`）→ `invalid_param` 而不是静默用默认 | 契约清楚、可测 |
| 排序 | `created_at DESC` | `created_at DESC, rowid DESC` | 同一毫秒写入的多文件行分页稳定 |

**验证**（都是本轮实跑）：

- `cargo test --lib relay::` **28/28**（原 19 + 新 9）；`cargo build --bin plant-web-server` 通过，本仓新增警告 0；
  `D:\Rust\target\debug\plant-web-server.exe` 06:46 重编。
- 有尽头的双实例验收 **42/42**（临时脚本，跑完停进程、删临时文件、两站端口空闲）：
  - **site-a（`:4100`，真台账 16 行 / 324 变更 / 1 水位）**：`GET ledger` total 16 = sqlite3、首行 = `created_at` 最新那行；
    `limit=1&offset=15` 拿到最早一行；`direction=outbound` 15、`direction=inbound&verify_status=skipped,ok` 1、
    `file_name=scb` 16、`msg_id=…` 1、`since=<第 3 新行的 created_at>` 3 —— 全部与 sqlite3 一致；`rows/{id}`（变更最多那行，84 条）
    `changes_count=84`、`kinds.inserted=79 / modified=5`、四计数之和 = 84；`changes?limit=1` total 84 且首条 = sqlite3 `ORDER BY refno` 首条、
    `kind=modified` 5、`refno=14192` 前缀 1；`summary` rows 16 / changes 324 / wm 1 / problems 0 / `last_outbound_at` = `MAX(created_at)`、
    `by_direction_status` = `inbound/skipped=1, outbound/ok=15`；`watermarks` total 1、dbnum 6000。
    错误：`verify_status=bogus`、`limit=abc`、`since=yesterday` → `invalid_param`；不存在的 id（rows 与 changes）→ `not_found`；
    `limit=9999` → 500、清单 `limit=5000` → 2000。回归：`GET envs`、`GET runtime/status?foo=bar`、`GET logs` 照常。
    **site-a 库文件读前读后 SHA256 一致**（读侧无副作用）。
  - **临时站点（`:4102`，toml 的 `deployment_sites_sqlite_path` 指向不存在的文件）**：`ledger` / `summary` / `watermarks` 空结果 +
    `note: ledger_not_initialized`，`rows/x` → `not_found`，**库文件没有被读侧创建**；建 env → `activate` 成功（`relay: true`，日志
    「[sync-ledger] 台账表就绪」）→ `GET ledger` `total: 0` 且**无 `note`**、库文件已建、`watermarks` 拿到中继基线 1 行（dbnum 6000，
    日志「首次见到，只记水位不广播」）→ `runtime/stop`。
- 副作用说明：临时站点那次激活对着 site-a 的工程副本跑了一轮中继基线（不广播），顺带重扫了
  `runtime/local-collab/site-a/output/…/db_index.sqlite`（缓存索引，内容与 site-a 自己扫的一致）；site-a 的 `DbOption.toml` 未动
  （env 上没有连接参数）。
- **未跑**：本仓 24 项双站点 smoke（本轮没改站点收发路径，只加了读端点）；`npm run type-check` / `build`（本轮没改前端）。

**P1 起手**：按上表的实际形状写 `src/api/relayLedgerApi.ts`；`isLedgerUnavailable` 只认 404（pmg）与 `status === 'not_implemented'`
（pws 老版本）；空态判 `res.note === 'ledger_not_initialized'`。
