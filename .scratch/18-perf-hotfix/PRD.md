# 快速修复批：writeJson 收敛 + 素材路由 304 + React.memo

Status: ready-for-agent

## 问题陈述

host 半区存在两份逐字相同的 JSON 响应写入实现，且 `import-api` 同时导入两个同名 `writeJson`——S5（HTTP 共享件）的收口成果已漂移，改一处不生效另一处；素材路由在命中 304 前仍全量读盘，MB 级素材每次请求（含 304）都付一次完整磁盘读；角色浮层每次状态推进都使整个会话气泡列子树重渲染，即使气泡内容完全没变；且 S7 的「host 产物不含 React 组件」验收尚未复核。

## 解决方案

收敛 `writeJson` 到单一实现并删除重复导入绑定；素材路由改为先 `stat` 判定 304 再读文件；`SessionBubbleList` 包 `React.memo` 隔离重渲染；重跑构建复核 host 产物纯净度。

## 用户故事

1. 作为宿主端维护者，我想要 host 半区只有一份 `writeJson` 实现，以便改动一处即可全量生效，不再被两份重复实现误导。
2. 作为宿主端维护者，我想要 `import-api` 不再同时绑定两个同名 `writeJson`，以便消除「改了 A 处、B 处不生效」的隐患。
3. 作为用户，我想要浏览器命中 304 时无需等待整文件读盘，以便热点素材请求更快返回。
4. 作为用户，我想要浮层状态变化时气泡列不随之重渲染，以便长会话下 UI 更跟手。
5. 作为发布者，我想要确认 host 产物不混入 React 组件代码，以便 Node 半区保持纯净、体积可控。

## 实现决策

- **C1（writeJson 收敛）**：删除 `json-response.ts`；`session-messages` 与 `import-api` 统一从 `http-shared` 导入 `writeJson`。两份实现逐字节等价，行为不变，既有 HTTP seam 测试零改动全绿为护栏。
- **H3（素材路由 304 顺序）**：调整素材路由读取顺序——先 `stat`（得到 ETag 所需 size/mtime），命中 `if-none-match` 直接 304 返回、不再 `readFile`；可选引入按 `path + mtimeMs` 的 LRU 字节缓存。**明确不启用强缓存**（既有 2026-08-22 强缓存事故记录）。
- **H4（React.memo）**：`SessionBubbleList` 导出处包 `React.memo`，或提升到 `RootApp` 与 `CharacterOverlay` 并列。**不触碰 runtime 的 emit 语义**（ADR-0016 已否决 runtime 层去抖——playback 的内容是推进的唯一身份）。
- **U5（S7 验收复核）**：`npm run build` 后检查 `lib/index.js` 无 `SessionBubbleList` / `useState` / `createElement` 痕迹、体积不显著增长；必要时给库 `package.json` 加 `"sideEffects": false`。

## 测试决策

- 全部复用既有 seam，零新建。好的测试 = 只测外部行为（HTTP 响应、渲染结果），不测实现细节。
- C1/H3：`tests/host/` 全量回归（`session-messages-route` / `import-api` / `asset-routes`），目标零改动全绿。
- H4：`session-bubble-list.test.ts` 渲染回归；可选补「稳定 props 下不重渲染」断言（若 jsdom 可可靠观察）。
- U5：构建后脚本/人工核验产物，可考虑并入 `scripts/verify-release.mjs`。
- 先例：`tests/host/http-shared.test.ts`、`tests/host/asset-routes.test.ts`（真实 HTTP seam 断言响应）。

## 超出范围

- H1 / M1 / M2 / M3 / M4 / H2 / L2 / L3 / L4 / U1 / U2 / U3 / U4 / C2 / C3 / X1 / X2 / X3 —— 见 19/20/21/22 号 PRD。

## 补充说明

- 证据（文件:行号）见 memorial 017 archived 的 `index.html`（C1 / H3 / H4 / U5 卡片）与 `sub-task/001.md`、`sub-task/002.md`。
- 三处 P0 改动相互独立，无依赖，可并行实施、独立验收。

