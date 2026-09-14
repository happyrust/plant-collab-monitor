# Findings & Decisions

## Requirements
- 使用 planning skill 制定修复计划。
- 将代码审查发现的问题转化为可执行、可验证的阶段任务。
- 暂不直接修复代码，先明确范围、风险和验收标准。

## Research Findings
- 当前工作区包含已修改的 `docs/e2e-smoke/2026-04-26-phase7-plus-smoke-result.json`，以及未跟踪的 `.cursor/`、`docs/remote-collab-management-analysis.md`、`docs/remote-collab-management-architecture.png`。
- `.cursor/mcp.json` 写死 `best-mcp-32`、本机 Windows 绝对路径和 `BEST_MCP_SESSION=32`，不适合作为团队通用配置直接入库。
- `.cursor/rules/mcp-messenger.mdc` 强制每轮最终调用 `check_messages`，但该规则依赖 Best MCP 可用；若作为项目强制规则提交，可能阻塞没有配置该 MCP 的协作者。
- `docs/remote-collab-management-architecture.png` 的实际内容是一张浏览器错误页截图，显示 `Encoding error`，不是架构图。
- `docs/remote-collab-management-analysis.md` 声明了 `remote-collab-management-architecture.svg`，但当前仓库没有对应 SVG 文件。
- 源码核对显示 plain `<script setup>` 出现在 `TopologyView.vue`、`MqttNodesView.vue`、`SiteConfigView.vue`、`TopologyVisualizationView.vue`，分析文档只点名了其中一部分。
- `scripts/phase7-plus-smoke.mjs` 的通过条件没有纳入 `requestFailures`，但结果 JSON 新增了一个 `naive-ui.js` 的 `net::ERR_ABORTED` 记录。
- 修复后 `.cursor/mcp.json` 已被 `.gitignore` 忽略，仓库保留 `.cursor/mcp.example.json` 作为模板。
- 修复后架构图有 SVG 源文件和由 `rsvg-convert` 导出的 PNG，PNG 预览正常。
- 修复后 smoke 脚本输出 `expectedRequestFailures` / `unexpectedRequestFailures`，并把 unexpected 纳入失败条件。
- 修复后 `MqttNodesView.vue` 不再调用 `alert()` / `confirm()`；全仓 `src` 搜索只剩 SiteConfig 注释提及 legacy alert。
- 修复后 `src/views` 已无 plain `<script setup>`，全部视图均为 `<script setup lang="ts">`。
- 修复后 `src` 中无 `Record<string, any>`、`as any`、`: any` 显式类型用法；动态后端响应使用 `Record<string, unknown>` 和局部 narrowing。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 将 `.cursor/mcp.json` 作为个人配置处理 | 该文件含本机路径和固定会话号，直接入库会破坏协作者环境。 |
| 架构图修复必须包含人工/工具预览 | 当前 PNG 是错误页，单纯检查文件存在不足以证明文档可用。 |
| smoke 结果需要解释 request failure 语义 | `passed: true` 与未分类 request failure 并存会降低验收证据可信度。 |
| Best MCP 强制规则不再 alwaysApply | 项目规则应避免假设所有协作者都配置了同一 MCP 会话。 |
| MQTT 节点操作使用 Naive UI dialog/message | 与项目 UI 规范一致，避免 blocking browser modal。 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `rg` 默认不支持 lookahead，搜索非 TS script 时失败 | 改用普通 `<script setup` 搜索并人工核对结果。 |
| SVG 首次导出失败 | 中文内容被写入为控制字符后 XML 无法解析，改为 ASCII 标签重建 SVG。 |

## Resources
- `task_plan.md`
- `docs/remote-collab-management-analysis.md`
- `docs/remote-collab-management-architecture.png`
- `docs/remote-collab-management-architecture.svg`
- `.cursor/mcp.json`
- `.cursor/rules/mcp-messenger.mdc`
- `scripts/phase7-plus-smoke.mjs`

## Visual/Browser Findings
- `docs/remote-collab-management-architecture.png` 显示红色错误框：`This page contains the following errors: error on line 2 at column 21: Encoding error`，下方是空白区域。
- 修复后 `docs/remote-collab-management-architecture.png` 显示完整分层架构图，包含 Frontend Monitor Console、Frontend Communication Layer、Only Backend、Runtime Resources 四层。

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
