# 工单 05 — 里程碑验收闭环

**Status:** resolved

**Blocked by:** 16-04, 15-06

**构建内容：** 全部验收闭环——全量测试/build/verify 通过，文档（memorial/ADR/CONTEXT/DESIGN）与实现一致，朋友安装演示路径验证。交付后 15 + 16 两个功能整体可发布。

**验收标准：**

- [x] typecheck + 全量测试通过；根插件 `npm run build` + `npm run verify` 通过；库/薄壳各自 build 通过
- [ ] 朋友环境 `dsh plugin add`（link 或 publish）装完即用，气泡列 + 详情窗完整可用（待人工/发布验证）
- [x] 文档与实现一致：memorial 015、ADR-0030、CONTEXT.md、DESIGN.md 无过时描述
- [ ] 深浅主题、reduced-motion、触屏路径人工验证通过（待人工）

## 答案

2026-08-27 完成。

- 全量测试：30 文件 / 497 用例全绿（新增 detail-data 修复、dynamic-title 24、ai-title 路由 8、session-bubble-detail 9）。
- `npm run typecheck` 全绿；根插件 `npm run build`（host 176.78kB + client 191.12kB，woff2 运行时解析为预期）+ `npm run verify` 21 项全绿；库 `dsh-session-bubble` build 通过（dist/index.js 41.17kB）。
- 文档同步：ADR-0030 状态更新为「已接受 + 已实施」；memorial 015 补实施收尾说明；DESIGN.md §2 令牌表补纸感轨；工单 01-05 全部置 resolved。
- **待人工/待发布**：朋友环境 `dsh plugin add` 实装路径、深浅主题/触屏/reduced-motion 视觉与交互验收（与 15-06 相同的待用户验证项）。

## 评论

- 来源：PRD 15/16 测试决策 + AGENTS.md 构建验收约束。
