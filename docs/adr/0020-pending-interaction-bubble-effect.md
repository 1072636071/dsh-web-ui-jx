# ADR-0020 — 等待用户交互的会话气泡朱砂印特效与折叠豁免

## 状态

已接受（2026-05-28 实施定案）。已实施。

## 背景

会话气泡列（ADR-0007）目前只有两种状态呈现：运行中金呼吸点 / 已完成石绿实心点。
当某会话被**用户交互阻塞**（工具审批、计划评审、助手提问）时，气泡列没有任何
区分——它与普通运行中会话视觉等价，用户感知不到「有一个会话正等自己表态」，
尤其该气泡被折叠进「+N」时彻底不可见。

代码事实：SDK `SessionSummary` 已携带权威信号
`pendingInteraction?: 'approval' | 'plan-review' | 'question'`（侧边栏琥珀点同源，
manager 持有的实时事实，经 `sessions.list` 快照下发）。ADR-0014 处理的是角色
浮层 permission 态的时间启发式兜底，与本条互不冲突：本条消费的是列表快照上的
确定性信号，不涉及动画时机。

需求：等待用户交互的会话气泡要有**特效区分**，且必须保证可见。

## 决策

1. **信号源**：`SessionSummary.pendingInteraction` 原样透传进气泡列纯逻辑层
   （字面量联合 `PendingInteractionKind` 解耦，形状固化于
   `session-bubbles.ts`），组件层据此挂 `.pending` class 与 `.dotPending` 点位。
2. **朱砂印语义**：需要用户「用印首肯」——描边转 `--jx-seal` 朱砂；点位以
   涟漪扩散环替代金呼吸（`::after` 边框环 scale+opacity 循环，transform/opacity
   GPU 友好）；class 叠加瞬间播放一次印章按压式入场强调（scale 1→1.05→1，
   强调档 350ms），呼应姜晓台词「此事需大人首肯」。
3. **优先级**：`.bubble.pending` 声明在 `.current` / `.bubble:hover` 之后，
   朱砂描边不被当前金描边或 hover 金描边覆盖（紧急态恒可见）；
   `.bubble.pending.leaving` 显式回落退出动画（100ms 淡出优先于印章强调）；
   `:focus-visible` 金描边为可访问性标准，保持不变。
4. **折叠豁免**：`selectBubbleEntries` 中 `pendingInteraction !== undefined`
   的条目**永不折叠**——落在截断线之外的按原相对顺序追加到 visible 尾部
   （列顶部最显眼位），不计入 moreCount。被折叠进「+N」的等待交互气泡用户
   永远看不到，特效即失去意义。分组模型（ADR-0018）下豁免按组聚合
   （补充裁定）：根本身或任一入选成员等待交互 ⇒ 整组豁免折叠、根气泡挂
   朱砂描边（状态点仍表根自身状态）。
5. **可访问性**：aria-label 追加「（等待确认）」；`prefers-reduced-motion` 下
   停印章强调与涟漪，保留静态朱砂点/描边（无动效时状态仍可区分）；
   零颜色字面量、零主题选择器，深浅双主题由 L2 remap 的 seal 双值自动覆盖。
6. **特效开关**：与既有气泡动效一致，仅受 `prefers-reduced-motion` 约束，
   不接入 `fx-*` 页面级开关（点位呼吸先例如此，保持同一语言）。

已否决的替代：琥珀色（`--jx-*` 无琥珀语义令牌，且与侧边栏职责重复、唐风
语言弱）；整泡呼吸光晕（与点位涟漪堆叠效果，违反「聚焦单一冲击」）；
仅靠点击展开才能看到的折叠内提示（紧急态不可依赖用户主动发现）。

## 后果

- `session-bubbles.ts` 输出结构新增透传字段（向后兼容，undefined 缺省）；
  折叠计数语义变化：moreCount 只计非豁免条目。
- 极端场景下 visible 数量可超过 maxVisible（豁免条目数量无上限）；
  pending 为低频事件，接受该上界失控风险。
- DESIGN.md §4 会话气泡列条目同步更新状态点三态与折叠豁免描述。
- 测试：`tests/client/session-bubbles.test.ts` 新增透传/豁免/边界/回归用例。
