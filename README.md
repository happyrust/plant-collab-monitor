# plant-collab-monitor

> 异地协同站点管理 · 专业监控台（从 `web-server/frontend` 剥离而来）

独立的 Vue 3 单页应用，承担 **运维级** 异地协同站点监控职责：

- 全局拓扑可视化
- 任务队列 / 同步历史 / 实时进度推送
- MQTT 消息与节点监控
- 站点配置管理（`DbOption.toml` 编辑）
- 归档文件浏览（`.cba`）

## 与现有组件的关系

| 组件 | 角色 | 入口 |
|---|---|---|
| `plant-model-gen` | **唯一后端** · Rust + Axum · 暴露 `/api/*` | `http://127.0.0.1:9099` |
| `plant-model-gen/ui/admin/#/collaboration` | 轻量管理入口（嵌入在 admin） | admin 子路由 |
| **本项目 plant-collab-monitor** | 专业监控台（独立 SPA） | `http://localhost:3200`（dev） |
| `web-server` | **Legacy · 已废弃** · 作为迁移源头保留备份 | — |

## 开发

```bash
npm install
npm run dev     # http://localhost:3200
```

前提：`plant-model-gen` 的 web_server 在 `127.0.0.1:9099` 运行，dev server 会自动代理：

- `/api/*` → `plant-model-gen`
- `/ws/*`  → `plant-model-gen`（WebSocket）
- `/files/*` → `plant-model-gen`

## 构建

```bash
npm run build
# 产物在 dist/
```

## 部署

见 `plant-model-gen/shells/deploy/deploy_all_with_frontend.sh`（Phase 4 完成后追加步骤）。

## 状态

| Phase | 内容 | 状态 |
|---|---|---|
| P0 | 仓库初始化 | ✅ 完成 |
| P1 | plant-model-gen API 汇入 | 进行中 |
| P2 | 本项目脚手架 + 11 视图移植 | 待开始 |
| P3 | 端到端联通验证 | 待开始 |
| P4 | 文档 + 部署脚本 | 待开始 |

详见 `plant-model-gen/docs/plans/2026-04-22-异地协同前端独立与API汇总计划.md`。

## 来源

- 设计图：`plant-model-gen/design/collab-consolidation/*.html`
- UI 源：`D:\work\plant-code\web-server\frontend\src`
- API 文档：`plant-model-gen/docs/architecture/异地协同API汇总清单.md`（Phase 1 产出）
