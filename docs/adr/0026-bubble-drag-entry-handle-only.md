# ADR-0026 — 气泡拖拽入口收敛至手柄（已改型为点击收起）

## 状态

已接受 → **已改型**（2026-08-25 实施中用户反馈拖动体验差，改型为点击收起）。

## 背景

ADR-0022 D2/D9 建立的保留模式拖拽以「整泡即拖拽面」为前提：气泡任意位置 pointerdown、位移超 DRAG_THRESHOLD_PX(8px) 进拖态，点击与拖拽共享同一表面、仅靠阈值区分。该范式有两个代价：

1. 用户想点开会话时可能误把气泡拖走（反之亦然）——歧义靠 8px 阈值兜底，而非交互设计消除；
2. 「可拖性」仅有左缘 3px 石绿指示线（`.draggable` inset box-shadow），是**状态信号**而非**操作示能**——用户看不出「从哪里拖」。

本决策为可拖气泡增加显式拖拽手柄，并重新裁定拖拽入口归属。来源 memorial：`docs/memorial/012-session-bubble-drag-handle/`。

## 决策

**D1 — 手柄成为唯一拖拽入口（推翻 ADR-0022 D2 的整泡拖拽面）**：

可拖条目（`isBubbleRowDraggable` 为真）在泡内左缘渲染竖向抓手；pointerdown 门控从整泡迁移至手柄——只有按住手柄才能发起收起/归档拖拽；气泡本体回归纯点击语义。

否决**双入口并存**案（手柄可拖 + 本体维持整泡拖拽）：手柄失去独占意义沦为装饰重复、本体误拖问题依旧存在、两条触发路径使测试矩阵翻倍。判定矩阵 `resolveDragAction` / 可拖判定 `isBubbleRowDraggable` / 投放区几何零改动——变化仅在手势臂态的入口位置。

**D2 — 手柄视觉：泡内左缘叠加层，不占布局**：

`.dragHandle` 绝对定位于泡内左缘（left:0 纵向撑满、宽约 10px），两列圆点抓手造型（`--dsw-alias-label-dimmed` 色、hover 提亮 primary），叠于既有石绿指示线之上；`.bubble` 补 `position:relative` 定位上下文。不占 flex 布局 ⇒ 132×24 固定尺寸内标题/状态点/徽标零位移；完全在泡界内 ⇒ 不受 `.bubble` overflow:hidden 裁切。绿线保留（grill 诉求原话「不仅左边加一个绿边框」）：绿线=状态信号（这个条目可拖），手柄=操作示能（从这里拖）。否决悬挂泡外方案（需对抗 overflow:hidden 裁切或将手柄上提到列表层级，成本高收益小）。

## 后果

- 整泡拖拽习惯失效：老用户须改从手柄发起拖拽；触屏命中热区缩小，实施时须给手柄留足命中余量（纵向全高 + 视觉外扩命中区）。
- 手柄上未超阈值的按下-松手 = no-op（手柄无点击语义）；8px 阈值继续承担防抖动误拖职责。
- `suppressClickRef` 合成 click 吞噬机制不变（手柄为气泡子元素，click 冒泡路径一致）。
- 无障碍：手柄 `aria-hidden="true"`（纯视觉示能）；键盘收起路径（Delete/Backspace）与「归档刻意无键盘路径」裁定维持现状；可拖条目 aria-label 文案改为提及手柄。
- 归档投放区仍由总开关①+「拖拽归档」②双门控（ADR-0022 D6 沿用）：②关时手柄拖拽仅能收起。

## 改型（2026-08-25）

实施后用户反馈两个体验问题：
1. **拖动困难，容易变成文本选中**——手柄在泡内且 `.bubble` 无 `user-select: none`，按偏到标题即触发文本选择；
2. **拖动到收起和归档没有反应**——投放区命中需要较大拖拽距离，且光标始终在气泡上导致 `elementFromPoint` 难以命中 zone。

用户决策：**改型为点击收起**——手柄移到气泡外部左侧、点击直接触发 `addDismissed` 记账、移除 dismissZone 和 archiveZone、移除完整拖拽手势系统。

### 改型后架构
- **手柄位置**：气泡外部左侧（`left: -10px`），不受 `overflow:hidden` 裁切；
- **交互方式**：`onClick` → `addDismissed(id)`，无拖拽、无阈值、无投放区；
- **手柄图标**：圆角竖条（6×16px，圆角 3px，石绿色，hover 放大 1.2×）；
- **移除内容**：`BubbleGesture` ref、`suppressClickRef`、`springBackBubble`、四个 pointer handler、`dragHandlers` useMemo、`handleContainerClickCapture`、`.dismissZone`、`.archiveZone`；
- **保留内容**：`isBubbleRowDraggable`（显示手柄判定）、Delete/Backspace 键盘收起、`addDismissed` 记账；
- **废弃导出**：`resolveDragAction`、`DRAG_THRESHOLD_PX`、`isBubbleHandleHit` 标记 @deprecated。

## 改型后后果

- 交互极度简化：点击即收起，零学习成本；
- 无文本选中问题：手柄在气泡外部，点击手柄不影响气泡内容；
- 无投放区：列表下方空间释放；
- 归档功能移除：用户明确「去掉收起和归档区域」，归档不再通过手柄操作；
- 键盘路径保留：Delete/Backspace 仍可用于收起聚焦气泡。
