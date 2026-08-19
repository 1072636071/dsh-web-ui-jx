# 01 · session-bubbles 纯逻辑与配置（seam 先行）

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 会话气泡列的计算内核与配置存储可用：给定会话列表快照与当前会话 id，能算出应显示哪些气泡（运行中/已结束未查看）、可见上限内的截取与溢出计数、当前会话标记；气泡数量上限可读写（默认 5，钳制 1-10，持久化）。此工单无 UI——逻辑经 vitest 验证，为工单 02 的 UI 提供唯一数据来源。

**验收标准：**

- [ ] 新建纯逻辑模块（对齐 state-machine / overlay-position 单例模式），导出 `selectBubbleEntries(items, current, maxVisible)`：过滤 `running || completed`、保持列表顺序、截取前 `maxVisible` 条为 visible、返回 `{ visible, moreCount }`（moreCount = max(0, 总数 - maxVisible)），每条携带 `isCurrent`（sessionId === current）
- [ ] 新建配置模块（对齐 skin.ts 模式）：`getMaxSessionBubbles()` / `setMaxSessionBubbles(n)`，读写 `localStorage('jx-max-session-bubbles')`，默认 5，钳制 [1,10]，读失败回落默认、写失败静默忽略
- [ ] `tests/client/session-bubbles.test.ts` 覆盖：过滤（仅 running/completed 入选、空列表 → 空）；顺序保持；折叠边界（total ≤ max、total = max+1、total 大额）；isCurrent（匹配/无 current/不匹配）；maxVisible 边界值
- [ ] `npm run typecheck` + `npm run test` 全绿

## 评论

来源：`.scratch/05-session-bubbles/PRD.md` 实现决策 2/3 + 测试决策；ADR-0007 决策 1/5。