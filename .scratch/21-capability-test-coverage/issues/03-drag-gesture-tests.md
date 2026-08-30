# 拖拽手势关键路径测试补强

**Status:** wontfix

**Blocked by:** 无——可立即开始

**构建内容：** 唯一移除手势（拖拽）有测试护栏——8px 臂态判定、禁止态不进臂、落点解析（收起区/归档区）、合成 click 吞除、归档失败静默。

**验收标准：**

- [ ] `bubble-drag-handle` 测试补：8px 进臂态 / 禁止态不进臂 / 落点解析 / 合成 click 吞除 / 归档失败静默
- [ ] 仿既有 `bubble-drag-handle.test.ts` 模式扩展
- [x] 全量测试全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30 关单（M5，**wontfix——工单过时，被测试的拖拽手势系统已被 ADR-0026 改型整体移除**）：
  本单要求的 8px 进臂态 / 禁止态不进臂 / 落点解析（收起区/归档区）/ 合成 click 吞除 /
  归档失败静默，全部属于 **2026-08-25 已删除的完整拖拽手势系统**（ADR-0026「已改型」：
  移除 `BubbleGesture` ref、`suppressClickRef`、`springBackBubble`、四个 pointer handler、
  `.dismissZone` / `.archiveZone`，归档功能整体移除；`resolveDragAction` / `DRAG_THRESHOLD_PX` /
  `isBubbleHandleHit` 标记 @deprecated）。被要求的行为在代码中已不存在，测试无从落地。
  现状护栏核查：① `resolveDragAction` 判定矩阵 / `isBubbleRowDraggable` 已在
  `session-bubbles.test.ts` 充分覆盖（1433-1747 行，@deprecated 保留）；② 实际唯一移除手势
  = 左侧手柄点击（`session-bubble-list.test.ts`「点击组气泡手柄收起」用例）+ 键盘 Delete/
  Backspace（本次补 `session-bubble-list.test.ts`「键盘 Delete 收起聚焦气泡」用例，
  ADR-0026 改型后无拖拽阈值/投放区/归档）。**验收第 1、2 项标「-」未勾**：被要求行为已
  移除，按 ADR-0026 口径关闭，不硬上。全量 37 文件 613 项全绿。
- 来源：PRD 21 候选 U4；证据见 memorial 017 archived `index.html`（bubble-drag-handle.test.ts 仅 1.83 KB）。
- 拖拽是气泡移除的唯一手势（ADR-0022，双击方案已否决），覆盖偏薄即回归风险。
