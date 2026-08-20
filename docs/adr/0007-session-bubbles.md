# ADR-0007 — 角色浮层会话气泡列（常驻 + 可点击跳转）

## 状态

已接受（grill 会话 2026-08-19 定案，待实施）。

## 背景

角色浮层（`CharacterOverlay`）现仅有单例瞬态台词气泡（`SpeechBubble`）：
淡入 → 显示 → 淡出 → 卸载，`pointer-events: none`，绝对定位于浮层上方
（`bottom:100%; right:0`），由状态机驱动的状态台词（"思考中…"等）或外部
`speech` prop 触发（DESIGN.md §4）。

新需求：角色浮层应显示**与运行中会话等量**的会话气泡，每个气泡对应一个
会话，点击气泡跳转到该会话。数据源与导航均已在 client 半区就绪：
`ctx.sessions`（`ISessions`）已注入（`src/client/index.ts:44,93-99`），
`list` 快照提供 `items`（含 `running/completed/title`）+ `current`，
`open(id)` 即切换当前会话（与侧边栏同一入口）。

## 决策

1. **气泡范围**：`sessions.list.items` 中 `running === true`（运行中）或
   `completed === true`（运行完未查看，侧边栏绿点提醒同源位）的会话，各占
   一气泡；其余不显示。已否决的替代：仅 running（跑完即消失，切回看结果
   无入口）；全部非空会话（数十个气泡糊头上一片）。
2. **内容**：单行会话标题（超长省略号，无 title 回落 sessionId）+ 状态点：
   运行中 = `--jx-gold` 金色呼吸点（reduced-motion 下静态）、已完成 =
   `--dsw-alias-state-success-primary` 石绿实心点。
3. **布局**：`position:absolute` **整体置于角色盒外左侧**（`left:auto; right:
   calc(100% + 8px)` 右缘贴盒左缘并留 8px 间隙，不叠加在角色本身上），
   `bottom:0` + `flex-direction: column-reverse` 自下而上生长（列表顺序第一个
   在底部），随浮层盒整体移动。台词气泡保留原位置（头顶右上），两层并存互不
   遮挡（已核实空间）。
4. **交互**：气泡本体 `pointer-events:auto` + `cursor:pointer`，点击调
   `sessions.open(id)` 跳转；气泡挂 `data-jx-interactive`，pointerdown 不
   触发整盒拖动（复用 ADR-0006 决策 7 的排除机制）。当前会话气泡
   `--jx-gold` 金描边常驻高亮，点击无动作。
5. **数量上限**：默认 5（范围 1-10），可配置——SettingsCard 新增「角色」
   section 数字输入，持久化 `localStorage('jx-max-session-bubbles')`（对齐
   `jx-fx`/`jx-skin` 模式）；超出部分折叠为「+N」小气泡（弱化样式），点击
   原地展开全部，再点收起。
6. **样式**：新建独立紧凑组件 `SessionBubble`/`SessionBubbleList`，不复用
   SpeechBubble 样式（语义分离：台词气泡=说话，会话气泡=状态导航）；只消费
   语义别名 + `--jx-gold` 专属轨，无颜色字面量、无主题选择器。
7. **动效**：出现 150ms 淡入（opacity + translateY 4px，自然减速）、消失
   100ms 淡出（退出快于进入）；列表重排无动画（不堆叠效果）；`prefers-
   reduced-motion` 全关（DESIGN.md §6）。

## 后果

- **反转 DESIGN.md §4「台词气泡 pointer-events:none、播放后自动隐去」**：
  会话气泡是常驻可点击元素（`pointer-events:auto`），不自动隐去（会话不再
  running/completed 才消失）。反转仅限会话气泡本体，台词气泡保持穿透。
- DESIGN.md §4 相应更新，新增「会话气泡列」条目。
- 与 ADR-0006 交互叠加：气泡列在盒内，随盒拖动；`data-jx-interactive`
  排除机制被首次实际消费。
- 组件职责新增：`CharacterOverlay` 接收 `sessions?: ISessions` prop；
  `index.ts` 把已获取的 `ctx.get("sessions")` 传入。