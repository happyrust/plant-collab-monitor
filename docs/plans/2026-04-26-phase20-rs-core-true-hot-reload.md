# Phase 20 · rs-core OnceCell → RwLock 真热加载精细计划（B6+）

> 跨仓改造计划。本文档落在 `plant-collab-monitor` 仓但**实际改动在 `rs-core` + `plant-model-gen` 双仓**，给后续接手的 AI / Rust 工程师可以直接 implement。
>
> 上游：
> - 后端 Phase 11 子计划（B6 诊断版）：`../plant-model-gen/docs/plans/2026-04-26-sprint-b-phase11-b6-reload.md`
> - 后端 Phase 11 实现（commit `2286cd2`）：`../plant-model-gen/src/web_server/site_config_handlers.rs:430-700`
> - rs-core 当前 OnceCell 实现：`D:/work/plant-code/rs-core/src/lib.rs:166-219`

---

## 0. 背景

**当前 B6（Phase 11）状态**：plant-model-gen 已落「reload diff + 分类响应」诊断版（commit `2286cd2`），但 `aios_core::get_db_option()` 是 `OnceCell::get_or_init`，**全局静态不可变**，所以 reload 端点只能告诉用户「哪些字段需要重启」，**不能真正热应用**。

**Phase 20 目标**：把 rs-core 的 `OnceCell<DbOption>` 改造为 `RwLock<Arc<DbOption>>`，让 `aios_core::set_db_option_from_file()` 函数能在运行时替换全局实例，所有后续读取自动看到新值。

**升级后效果**：
- `POST /api/site-config/reload` 在 `hot_changed_keys` 非空时**自动应用变更**，前端显示 `actions: ["hot_reloaded"]`
- 用户改 `enable_log` / `mesh_tol_ratio` / `gen_*` 等 12 个白名单字段后，无需重启 `web_server`
- 改 `static_changed_keys`（如 surrealdb / location / project_path）仍触发 graceful shutdown（B5 路径，已有）

---

## 1. 改造范围

### 1.1 rs-core（核心）

**文件**：`D:/work/plant-code/rs-core/src/lib.rs:155-219`

**当前 API**：
```rust
pub fn get_db_option() -> &'static DbOption {
    static INSTANCE: OnceCell<DbOption> = OnceCell::new();
    INSTANCE.get_or_init(|| { /* config build + env override + mesh_precision side-effect */ })
}
```

**改造后 API**：
```rust
use std::sync::{Arc, RwLock};
use once_cell::sync::OnceCell;

// 内部：RwLock<Arc<DbOption>>，外部：Arc<DbOption> 引用计数
static DB_OPTION: OnceCell<RwLock<Arc<DbOption>>> = OnceCell::new();

/// 加载配置（首次 init / 主动 reload 共用），含 env override + mesh_precision 副作用
fn load_db_option() -> DbOption {
    use config::{Config, File};
    let config_file_name = get_config_file_name();
    let s = Config::builder()
        .add_source(File::with_name(&config_file_name))
        .build()
        .unwrap();
    let mut option = s.try_deserialize::<DbOption>().unwrap();
    apply_env_overrides(&mut option);  // 抽出原 env override 逻辑
    crate::mesh_precision::set_active_precision(option.mesh_precision.clone());
    option
}

fn apply_env_overrides(option: &mut DbOption) {
    if let Ok(mode) = std::env::var("SURREAL_CONN_MODE") { /* ... */ }
    if let Ok(ip) = std::env::var("SURREAL_CONN_IP") { option.surrealdb.ip = ip; }
    // ... 其他 11 个 env 字段（保持原顺序）
}

/// 获取当前 DbOption 快照（Arc 引用计数，零拷贝）
#[inline]
pub fn get_db_option() -> Arc<DbOption> {
    DB_OPTION
        .get_or_init(|| RwLock::new(Arc::new(load_db_option())))
        .read()
        .expect("DB_OPTION RwLock poisoned")
        .clone()
}

/// 主动重新从 TOML 文件加载 DbOption 并替换全局实例
///
/// 返回新实例的 Arc 副本（调用方可立即使用）。失败时不替换，保留旧值。
pub fn set_db_option_from_file() -> Result<Arc<DbOption>, String> {
    let new_option = std::panic::catch_unwind(load_db_option)
        .map_err(|e| format!("load_db_option panicked: {:?}", e))?;
    let new_arc = Arc::new(new_option);
    let cell = DB_OPTION.get_or_init(|| RwLock::new(new_arc.clone()));
    let mut writer = cell.write().expect("DB_OPTION RwLock poisoned");
    *writer = new_arc.clone();
    Ok(new_arc)
}
```

**API 兼容性要求**：
- ❌ **不兼容**：返回值从 `&'static DbOption` 改为 `Arc<DbOption>`（**所有调用点都要改**）
- ❌ **不兼容**：取字段方式从 `aios_core::get_db_option().field` 改为 `aios_core::get_db_option().field`（解引用 Arc 自动 deref，**实际上这部分兼容**）
- ✅ **新增**：`set_db_option_from_file()` 函数，返回 `Result<Arc<DbOption>, String>`

**影响面盘点**（grep `aios_core::get_db_option` 全量）：

| 位置 | 调用方式 | 是否需改 |
|---|---|---|
| `plant-model-gen/src/web_server/managed_project_sites.rs:1070` | `&aios_core::get_db_option()` | ⚠️ `&Arc<DbOption>` → `&DbOption`，加一次 deref |
| `plant-model-gen/src/web_server/sse_handlers.rs:174` | `let db_option = aios_core::get_db_option();` | ✅ 无需改（变量类型 Arc<DbOption>，访问字段自动 deref） |
| `plant-model-gen/src/web_server/mod.rs:277/282/1068` | `let _ = aios_core::get_db_option();` 等 | ✅ 无需改 |
| `plant-model-gen/src/web_server/remote_sync_handlers.rs:1496/1531` | `let opt = aios_core::get_db_option();` | ✅ 无需改 |
| `plant-model-gen/src/web_server/site_config_handlers.rs:134` | `use aios_core::get_db_option;` 后 `get_db_option()` 调用 | ✅ 无需改 |
| **rs-core 自身**：`src/lib.rs:339` | `// 使用 get_db_option() 以复用 OnceCell 缓存` | ✅ 无需改（Arc deref） |

**结论**：除 `managed_project_sites.rs:1070` 一处需要 `&*aios_core::get_db_option()` 显式 deref 外，其余调用点 Rust 自动 Arc deref 兼容。

**dependency 检查**：
- `once_cell_serde`（rs-core 当前用）：仅限 OnceCell，无 RwLock。可以继续保留 OnceCell 作为外层 wrapper，内层加 RwLock。
- 推荐：`once_cell::sync::OnceCell` + `std::sync::{Arc, RwLock}`（标准库）

### 1.2 plant-model-gen 后端 reload 升级

**文件**：`plant-model-gen/src/web_server/site_config_handlers.rs:516-700` `reload_site_config()`

**Phase 11 当前实现**（精简）：
```rust
let new_option: DbOption = toml::from_str(&fs::read_to_string(&toml_path)?)?;
let current = aios_core::get_db_option();
let (hot_changed, static_changed) = diff_db_option(current, &new_option);

let mut response = json!({ "hot_changed_keys": hot_changed, /* ... */ });
let actions = if hot_changed.is_empty() && static_changed.is_empty() {
    vec!["no_change"]
} else if !static_changed.is_empty() {
    vec!["manual_restart_required"]
} else {
    vec!["log_only"]  // 不真正应用，仅日志
};
```

**Phase 20 升级**（关键 diff）：
```rust
let actions = if hot_changed.is_empty() && static_changed.is_empty() {
    vec!["no_change"]
} else if !static_changed.is_empty() {
    // static 字段变更走 graceful shutdown（B5 路径已有）
    let triggered = trigger_graceful_shutdown(&state).await;
    if triggered {
        vec!["graceful_shutdown_triggered", "supervisor_will_restart"]
    } else {
        vec!["manual_restart_required"]
    }
} else {
    // 仅 hot 字段变更 → 真正应用
    match aios_core::set_db_option_from_file() {
        Ok(new_arc) => {
            log::info!("✅ [reload] 热加载成功，hot_changed_keys = {:?}", hot_changed);
            vec!["hot_reloaded"]
        }
        Err(e) => {
            log::error!("❌ [reload] 热加载失败: {}", e);
            vec!["hot_reload_failed"]  // 保留旧值
        }
    }
};
```

**前端 SiteConfigView 兼容**：
- 当前已显示 `data.message + data.actions`，新增 `"hot_reloaded"` 不需要前端改动（Phase 20 不会破坏前端）
- 可选：前端 `siteConfigApi.reload()` 加一个 `actions.includes('hot_reloaded')` 时显示 `flashSuccess('热加载成功，无需重启')`

### 1.3 跨仓 Cargo.toml 升级

**plant-model-gen/Cargo.toml:66**（已有）：
```toml
aios_core = { git = "https://github.com/happyrust/rs-core.git", branch = "dev-3.1" }
```

**升级流程**：
1. rs-core 在 `dev-3.1` 分支（或新 `feat/hot-reload` 分支）落 §1.1 改动 + cargo test
2. push rs-core 后 plant-model-gen 在自己 `Cargo.lock` 跑 `cargo update -p aios_core`
3. plant-model-gen 落 §1.2 reload 升级
4. `cargo check --features web_server` 0 errors
5. **手动跑 mini smoke**（参考 `plant-collab-monitor/docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md` §2-[8]）：
   - 改 `db_options/DbOption.toml` 中 `enable_log = false` 一项
   - `POST /api/site-config/reload` → 期望 `actions: ["hot_reloaded"]`
   - 后续 GET `/api/site-config` 看 `enable_log: false` 真生效
   - 改回 `enable_log = true` 重复一遍

---

## 2. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| `Arc<DbOption>` 替换 `&'static DbOption` 后 lifetime 不一致 | 🟡 中 | 几乎所有调用站点 Rust 自动 Arc deref 兼容；只有 1 处需要显式 `&*` |
| RwLock poisoned 风险 | 🟢 低 | 写锁仅在 reload 时持有 ~1ms，不会跨 await |
| reload 期间长生命引用 | 🟡 中 | 调用方应该用 `let opt = aios_core::get_db_option();` 拿 Arc 快照，不要 `aios_core::get_db_option().some_field` 链式（链式短期 OK，但避免长持有）|
| reload 失败后 fallback | 🟢 低 | `set_db_option_from_file` Result 失败时不替换，保留旧 Arc |
| mesh_precision 副作用重复 | 🟡 中 | `load_db_option` 内每次 reload 都会调 `set_active_precision`，确认幂等 |
| 多个 `web_server` 同时 reload 触发竞争 | 🟢 低 | RwLock 序列化；操作幂等，多次连续 reload 等于一次 |
| 跨仓 dev-3.1 分支误改 | 🟡 中 | 建议新开 `feat/hot-reload-rwlock` 分支，PR review 后 merge |

---

## 3. 验收

### 3.1 rs-core 单元测试

**新增测试**：`rs-core/tests/db_option_hot_reload.rs`

```rust
#[test]
fn test_set_db_option_from_file_replaces_instance() {
    // 1. 初始化默认 DbOption
    let original = aios_core::get_db_option();
    let original_log = original.enable_log;
    
    // 2. 临时改 DB_OPTION_FILE 环境变量指向 test 配置
    std::env::set_var("DB_OPTION_FILE", "tests/fixtures/DbOption-test-flipped");
    
    // 3. reload
    let new_arc = aios_core::set_db_option_from_file().unwrap();
    assert_ne!(new_arc.enable_log, original_log, "enable_log 应翻转");
    
    // 4. 后续 get 也看到新值
    let after = aios_core::get_db_option();
    assert_eq!(after.enable_log, new_arc.enable_log);
    
    // 5. cleanup
    std::env::remove_var("DB_OPTION_FILE");
    aios_core::set_db_option_from_file().unwrap();  // 复原
}
```

### 3.2 plant-model-gen 集成测试

**手动 smoke**（按 `plant-collab-monitor/docs/e2e-smoke/2026-04-26-mini-api-smoke-report.md` §2-[8] 风格）：

```powershell
$base = 'http://127.0.0.1:3100'
$token = '<admin_token>'

# 1. 当前 enable_log
(Invoke-WebRequest "$base/api/site-config" -Headers @{Authorization="Bearer $token"}).Content | ConvertFrom-Json | % { $_.config.enable_log }
# → true

# 2. 改 db_options/DbOption.toml 中 enable_log = false 后保存

# 3. 触发 reload
(Invoke-WebRequest "$base/api/site-config/reload" -Method POST -Headers @{Authorization="Bearer $token";'Content-Type'='application/json'} -Body '{}').Content
# → actions: ["hot_reloaded"], hot_changed_keys: ["enable_log"], requires_restart: false

# 4. 再次 GET 看真生效
(Invoke-WebRequest "$base/api/site-config" -Headers @{Authorization="Bearer $token"}).Content | ConvertFrom-Json | % { $_.config.enable_log }
# → false   ✅
```

### 3.3 跨仓回归

- [ ] `cargo check --features web_server` 0 errors（plant-model-gen）
- [ ] `cargo build --release --features web_server` 0 errors
- [ ] `bash shells/smoke-collab-api.sh` 仍 20/20 PASS
- [ ] plant-collab-monitor 前端 `npm run type-check` 0 errors（无前端改动也跑一遍确认）
- [ ] 手动验证 hot reload 真生效（§3.2）
- [ ] 手动验证 static 字段变更仍触发 graceful shutdown（§1.2 与 B5 路径联动）

---

## 4. 时间线

| 步骤 | 估时 |
|---|---|
| rs-core 改 lib.rs 加 RwLock + set_db_option_from_file | 30 min |
| rs-core 加单元测试 + cargo test | 30 min |
| rs-core 提 PR / push | 10 min |
| plant-model-gen Cargo.lock 更新 | 5 min |
| plant-model-gen 改 site_config_handlers.rs reload 升级 | 20 min |
| plant-model-gen 改 managed_project_sites.rs 1 处 deref | 5 min |
| plant-model-gen cargo check + 手动 smoke | 30 min |
| plant-model-gen 改 sprint-b-plan.md / sprint-b-verification-report.md 同步状态 | 10 min |
| plant-collab-monitor README 更新 G7 状态 → ✅ | 5 min |
| 文档归档 | 10 min |

**总估时**：~2.5 小时（不含 cargo build 编译时间，首次编译可能 ~10 min）

---

## 5. 不在本计划

- ❌ rs-core 其他 `OnceCell` 静态变量同步改造（仅限 `DbOption` 一个；其余如 `PdmsDatabaseInfo` 不改，不影响热加载场景）
- ❌ DbOption 字段级原子更新（本计划是整 struct 替换，足够 99% 场景）
- ❌ reload 后通知所有已建立 SurrealDB 连接重连（surrealdb 字段属 static_changed，走 graceful shutdown 路径）
- ❌ 配置版本号 / 操作历史（运维监控类，不在 G7 范围）

---

## 6. 后续动作

| 动作 | 触发条件 |
|---|---|
| Phase 20 落地 | 用户决定推进，建议跨仓独立会话 |
| 升级前端 SiteConfigView「热加载成功」反馈 | Phase 20 落地后 0.5h |
| AGENTS.md 更新 hot-reload 章节 | Phase 20 落地后 |
| 回填 Sprint B verification report 升级版 | Phase 20 落地后 |

---

## 7. 验收签字（pending Phase 20 实施）

| 角色 | 行为 | 时间 |
|---|---|---|
| 计划产出 | 本文件落盘 | 2026-04-26（plant-collab-monitor 仓） |
| rs-core 改造 | 待 |
| plant-model-gen 升级 | 待 |
| 真热加载 smoke | 待 |
| 关闭 G7 100% | 待 |
