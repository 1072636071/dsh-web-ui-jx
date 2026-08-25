# 会话气泡拖动手柄（点击收起）

**状态:** 已完成（决策完结；实施已验收）

## 诉求（用户原话）
> 我想修改一下会话气泡的展示效果，如果这个会话气泡能够被拖动，不仅左边加一个绿边框，在气泡左边加一个小手柄，使用小手柄拖动气泡去收起或者归档。

## 背景事实（grill 启动前自查）
- 「绿边框」现状：`src/client/styles/session-bubbles.module.css` 的 `.draggable` = `box-shadow: inset 3px 0 0 0 var(--dsw-alias-state-success-primary)`——左缘 3px 石绿内嵌竖线（inset shadow 实现，不占布局、不受 border 通道冲突），仅保留模式开 && 条目可拖时挂载。
- 可拖判定：`isBubbleRowDraggable(flags, groupRunningMembers)` = 自身非 running、无 pendingInteraction && 组内无运行中成员（ADR-0022 D4 + 队长追加需求 #2）。
- 拖拽手势现状（SessionBubbleList.tsx 工单02）：**整泡即拖拽面**——气泡任意位置 pointerdown 记起点 + setPointerCapture，位移 ≥8px（DRAG_THRESHOLD_PX）进拖态，直接写 DOM transform 跟手；pointerup 以 elementFromPoint → `closest("[data-jx-zone]")` 解析落点。
- 判定矩阵（resolveDragAction 纯函数）：未超阈值 ⇒ click 放行（跳转+记账）；running/pending ⇒ forbidden；当前泡×archive ⇒ forbidden；落 dismiss ⇒ 本地记账隐藏（可逆）；落 archive ⇒ workspaces.archiveSession 真归档（不可逆）；未命中 ⇒ 弹回。
- 投放区：收起区 `data-jx-zone="dismiss"` 常驻于整列正下方 8px，仅门控①（keepEnabled）；归档区 `data-jx-zone="archive"` 于角色盒正下方居中（远放防误触，朱红警示样式），门控①+②（keepEnabled && archiveDragEnabled）。
- 气泡几何约束：`.bubble` 132×24px、border-radius 4px、**overflow:hidden**、无 position 定位上下文、单行省略；内容 = 状态点(6px) + 标题(flex) + 子代理徽标(可选)。
- 无障碍现状：可拖条目 aria-label 追加「可拖至收起区移除，或按 Delete 收起」；Delete/Backspace 键盘收起已有；归档刻意无键盘路径。
- 配置开关：皮肤设置卡「拖拽归档」开关②（setArchiveDragEnabled）；保留模式总开关①关 = 完全回到无拖拽现状外观。

## 决策汇总
- Q1（2026-08-25 用户拍板）：**方案1——手柄成为唯一拖拽入口**。整泡拖拽移除，气泡本体回归纯点击（点击跳转）；收起/归档拖拽只能从手柄发起。已立 ADR（见 adr/001，同步全局 ADR-0026）。

### 自主定案（2026-08-25 用户授权「其他的你自己决策」）
- D2 手柄形态与位置：泡内左缘绝对定位抓手 `.dragHandle`——left:0 纵向撑满、宽约 10px、两列圆点造型（`--dsw-alias-label-dimmed`、hover 提亮 primary），叠于石绿指示线之上；`.bubble` 补 `position:relative`。不占 flex 布局 ⇒ 132×24 内标题/状态点/徽标零位移；完全泡界内 ⇒ 不受 overflow:hidden 裁切。绿线保留：绿线=状态信号（可拖），手柄=操作示能（从这拖）。否决悬挂泡外案。
- D3 交互细节：pointerdown 门控自整泡迁移至手柄；DRAG_THRESHOLD_PX(8) 保留防抖动误拖；手柄按-松未超阈值 = no-op（手柄无点击语义）；resolveDragAction / isBubbleRowDraggable / 投放区几何 / suppressClickRef 吞合成 click / 弹回 springBack / pointercancel / reduced-motion 分支全部原样复用。实施时给手柄留足触屏命中余量（纵向全高 + 视觉外扩命中区）。
- D4 无障碍：手柄 `aria-hidden="true"`；Delete/Backspace 键盘收起与「归档刻意无键盘路径」维持现状；可拖条目 aria-label 改述为「按住左侧手柄拖动可收起或归档，或按 Delete 收起」。
- D5 开关门控沿用：手柄出现条件 = 行可拖（隐含总开关①）；归档投放区仍①+②双门控，②关时手柄拖拽仅能收起。
- 回写裁定：ADR 同步全局 docs/adr/0026；无新领域术语，CONTEXT.md 不动。

## 需求变更（2026-08-25 实施中）
用户反馈实施后体验问题：
1. 拖动困难，容易变成文本选中
2. 拖动到收起和归档没有反应

**用户新决策**：
> 换个需求把手柄放在竖线的左边，重新设计一个手柄图标。点击这个手柄，进行收起，去掉收起和归档区域。

### 改型决策
- **手柄位置**：从气泡内部移到**气泡外部左侧**（竖线左边）——解决 overflow:hidden 裁切问题和文本选中干扰。
- **交互方式**：从**拖拽**改为**点击**——点击手柄直接触发 `addDismissed` 记账收起，无需拖拽手势、无阈值判断、无投放区。
- **手柄图标**：重新设计为圆角竖条造型——宽 6px、高 16px、圆角 3px、石绿色，hover 放大提亮。
- **移除区域**：`dismissZone`（收起区）和 `archiveZone`（归档区）完全移除——不再需要投放目标。
- **移除拖拽系统**：`BubbleGesture` ref、`suppressClickRef`、`springBackBubble`、`handleBubblePointerDown/Move/Up/Cancel`、`dragHandlers` useMemo、`handleContainerClickCapture` 全部移除。
- **简化 props**：GroupBubble/ChildBubble 的 `dragHandlers` 和 `onDismissKey` 替换为 `onDismiss` 回调。
- **保留键盘路径**：Delete/Backspace 收起聚焦气泡仍然保留。
- **保留判定**：`isBubbleRowDraggable` 仍用于决定哪些气泡显示手柄（completed 类 + 组内无运行中成员）。
- **废弃标记**：`resolveDragAction`、`DRAG_THRESHOLD_PX`、`isBubbleHandleHit` 标记为 @deprecated——保留导出供历史兼容，新代码不应依赖。

## 待澄清
（空）

## 追问记录

### 2026-08-25 Q1「拖拽入口：手柄独占还是双入口？」— 已答：方案1
- 方案1 手柄成为唯一拖拽入口【推荐】；方案2 双入口并存；方案3 手柄纯装饰。
- 用户答：「1 其他的你自己决策」→ Q1 定案方案1，其余决策授权 captain 自主定案（见上·自主定案 D2-D5），grill 就此收尾。

### 2026-08-25 实施中需求变更
- 用户反馈拖动体验差（文本选中 + 投放无反应）。
- 用户新决策：手柄放竖线左边、重新设计图标、点击收起、去掉收起和归档区域。
- 已按新决策实施并验收通过（typecheck ✓ / 390 tests ✓ / build ✓ / verify 21/21 ✓）。

## 收尾 checklist（2026-08-25）
| # | 检查项 | 结果 |
|---|--------|------|
| C1 | 诉求回应 | ✅ 绿边框+手柄叠加 → D2；点击手柄收起 → 改型；去掉区域 → 已移除 dismissZone/archiveZone |
| C2 | 决策完备 | ✅ 无待定条目 |
| C3 | 待澄清清零 | ✅ 空 |
| C4 | 调查闭环 | ✅ 无调查工单（事实全部本地自查） |
| C5 | ADR 齐全 | ✅ ADR-0026 已建并同步全局；改型已记录于本文档 |
