# Task Plan: 修复当前代码审查问题

## Goal
把当前工作区中会阻碍协作、误导验收或破坏文档展示的问题修复到可提交状态。

## Current Phase
Done

## Phases

### Phase 1: 收敛入库范围
- [x] 确认 `.cursor/mcp.json` 是否为个人本地配置。
- [x] 决定 `.cursor/rules/*.mdc` 是否应作为团队级规则入库。
- [x] 将个人配置从提交范围移除或改成模板。
- **Status:** complete

### Phase 2: 修复架构图与文档引用
- [x] 重新生成 `docs/remote-collab-management-architecture.png`，确认内容是架构图而不是错误页。
- [x] 若文档声明 SVG 源文件，则补充 `docs/remote-collab-management-architecture.svg`。
- [x] 若不提交 SVG，则删除文档中的 SVG 声明。
- **Status:** complete

### Phase 3: 校准分析文档事实
- [x] 补全 plain `<script setup>` 视图清单。
- [x] 保留 `MqttNodesView.vue` 的 `alert/confirm` 收口提醒。
- [x] 确认文档与 `AGENTS.md`、`README.md` 的当前实现状态不冲突。
- **Status:** complete

### Phase 4: 修复 smoke 结果语义
- [x] 判断 `net::ERR_ABORTED` 的 Vite dependency request 是否为预期导航中止。
- [x] 若是预期行为，在 smoke 脚本或报告中显式分类说明。
- [x] 若不是预期行为，重新跑 smoke 并更新结果文件。
- **Status:** complete

### Phase 5: 验证与交付
- [x] 运行 `git diff --check`。
- [x] 若改动触及源码或 smoke 脚本，运行 `npm run type-check`。
- [x] 预览 Markdown 文档，确认图片正常渲染、链接不失效。
- [x] 汇总最终修复和残余风险。
- **Status:** complete

## Key Questions
1. `.cursor/rules` 是团队规则，还是当前操作者的个人会话规则？
2. 架构图应以 SVG 作为源文件，还是只保留 PNG？
3. smoke 的 `requestFailures` 应作为失败条件，还是按 URL/失败类型做预期分类？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 先处理配置和文档产物，再处理 smoke 结果 | 当前最高风险是协作者环境被本机 MCP 配置污染，以及文档核心图像不可用。 |
| 不立即修改源码视图 | 本轮审查发现的源码问题是既有技术债，当前修复范围优先聚焦这次待提交变更。 |
| 将 Best MCP 强制规则改为非 alwaysApply | 避免没有配置 Best MCP 的协作者被项目规则阻塞。 |
| 保留 SVG 源文件并从 SVG 导出 PNG | 避免 PNG 再次变成不可维护的错误页截图。 |
| 顺手收口 `MqttNodesView.vue` 的 blocking modal | 这是审查中已确认的 UI 规范问题，改动集中且验证成本低。 |
| 优先迁移 `MqttNodesView.vue` 到 TypeScript | 文件刚完成 UI 收口，局部类型可随改动一起补齐，风险低于一次性迁移多个视图。 |
| 继续迁移 `TopologyVisualizationView.vue` 到 TypeScript | 该视图相对独立，局部拓扑类型足以覆盖模板和交互逻辑。 |
| 继续迁移 `SiteConfigView.vue` 到 TypeScript | 该视图可直接复用 API 层 `SiteConfig` 类型，迁移收益高且范围可控。 |
| 最后迁移 `TopologyView.vue` 到 TypeScript | 这是剩余最大视图，前面迁移通过后再处理可降低一次性风险。 |
| 使用 `Record<string, unknown>` 替代 `Record<string, any>` | 符合项目“后端响应 unknown / Record<string, unknown>，前端 narrowing”的约定。 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `check_messages` 首次调用缺少 `turn_complete` | 1 | 按工具 schema 使用 `turn_complete: true` 重试成功。 |
| SVG 首次导出失败，中文文本被写入链路破坏为控制字符 | 1 | 改用 ASCII 英文标签重建 SVG 后导出成功。 |

## Notes
- 当前计划文件由 planning-with-files skill 创建，用于后续阶段更新。
- 不要在未确认团队意图前提交本机 `.cursor/mcp.json`。
