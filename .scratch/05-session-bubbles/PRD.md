# PRD — 角色浮层会话气泡列（气泡数 = 会话数 + 点击跳转）

Status: ready-for-agent
来源: grill 会话（jxx-grill-with-memorial 003-session-bubbles，2026-08-19）+ ADR-0007 + DESIGN.md §4 + CONTEXT.md

## 问题陈述

姜晓角色浮层（`CharacterOverlay`）现在只会显示单例瞬态台词气泡（"思考中…"等，
播放后自动隐去，`pointer-events: none`）。当用户同时有多个会话在跑（或刚跑完
未查看）时，角色浮层不提供任何多会话的可见状态，也无法从浮层直接跳到某个会话
——用户必须去侧边栏找。需求：角色浮层显示与**运行中/已结束未查看**的会话等量的
会话气泡，点击某个气泡直接跳到对应会话。

## 解决方案

在角色浮层盒内新增**会话气泡列**（ADR-0007）：

- **范围**：`sessions.list.items` 中 `running === true`（运行中）或 `completed === true`
  （运行完未查看）的会话，各占一气泡；其余不显示。会话状态变化（开始跑/跑完/移除）
  实时反映。
- **内容**：单行会话标题（超长省略号，无 title 回落 sessionId）+ 状态点（运行中 =
  金色呼吸点 / 已完成 = 石绿实心点）。
- **位置**：角色左侧竖排一列，自下而上生长（列表顺序第一个在底部），随浮层盒整体
  移动；台词气泡保留头顶右上原位，两层并存。
- **点击**：气泡 `pointer-events: auto` + `cursor: pointer`，点击调 `sessions.open(id)`
  跳转该会话；气泡挂 `data-jx-interactive` 不触发整盒拖动；当前会话气泡金描边高亮，
  点击无动作。
- **上限**：默认 5（范围 1-10），SettingsCard 新增「角色」section 数字输入配置，
  持久化 `localStorage('jx-max-session-bubbles')`；超出部分折叠为「+N」气泡（弱化
  样式），点击原地展开全部，再点收起。
- **动效**：出现 150ms 淡入 / 消失 100ms 淡出（退出快于进入），重排无动画，
  `prefers-reduced-motion` 全关。

## 用户故事

1. 作为 DSH 宿主用户，我想要角色浮层显示的气泡数与当前运行中/已结束未查看的会话数一致，以便一眼知道有多少会话在跑/待查看。
2. 作为 DSH 宿主用户，我想要点击某个气泡直接跳到对应会话，以便不必去侧边栏找。
3. 作为 DSH 宿主用户，我想要运行中的会话气泡带金色呼吸状态点，以便区分"正在跑"与"跑完待查看"。
4. 作为 DSH 宿主用户，我想要已结束未查看的会话气泡带石绿实心状态点，以便知道哪些会话出结果了还没看。
5. 作为 DSH 宿主用户，我想要气泡列在角色左侧竖排、自下而上生长，以便与台词气泡（头顶右上）互不遮挡、可同时存在。
6. 作为 DSH 宿主用户，我想要气泡列随浮层整体拖动移动，以便拖动角色时气泡不丢位。
7. 作为 DSH 宿主用户，我想要当前会话的气泡带金描边高亮，以便知道"我现在在哪个会话"。
8. 作为 DSH 宿主用户，我想要点击当前会话的气泡无动作，以便不会误跳（已在其中）。
9. 作为 DSH 宿主用户，我想要气泡数量超过上限时折叠为「+N」小气泡，以便气泡列视觉不失控。
10. 作为 DSH 宿主用户，我想要点击「+N」气泡原地展开全部会话气泡、再点收起，以便超出上限的会话也能直达。
11. 作为 DSH 宿主用户，我想要气泡数量上限可在设置卡「角色」section 调整（1-10，默认 5），以便按自己同时开会话的习惯配置。
12. 作为 DSH 宿主用户，我想要会话开始运行/跑完/被删除时气泡列实时增减，以便气泡数始终与真实会话状态一致。
13. 作为 DSH 宿主用户，我想要无运行/待查看会话时不显示气泡列，以便浮层保持素净。
14. 作为 DSH 宿主用户，我想要没有标题的会话气泡显示会话 id 截断，以便气泡不空白。
15. 作为 DSH 宿主用户，我想要在触屏/鼠标上点击气泡都有效，以便触屏设备也能跳转会话。
16. 作为 DSH 宿主用户，我想要拖动浮层时从气泡上按下不触发拖动，以便点击与拖动互不干扰。
17. 作为 DSH 宿主用户，我想要 `prefers-reduced-motion` 下气泡出现/消失无动画、状态点不呼吸，以便满足可访问性。
18. 作为开发者，我想要过滤（running/completed）/折叠（上限 + moreCount）/current 标记提取为纯函数模块，以便用 vitest node 环境单元测试（复用 state-machine / warp-controller 同款 seam）。
19. 作为开发者，我想要 `CharacterOverlay` 通过 `sessions?: ISessions` prop 接收数据源，由 `index.ts` 传入 `ctx.get("sessions")`，以便不引入新的全局单例。
20. 作为维护者，我想要 DESIGN.md §4 已更新会话气泡列专规、CONTEXT.md 已登记术语、ADR-0007 已记录决策，以便文档与代码一致。

## 实现决策

1. **数据源**：`CharacterOverlay` 新增 `sessions?: ISessions` prop；`index.ts` 把已获取的
   `ctx.get("sessions")` 传入（`src/client/index.ts:93-99` 已有）。`SessionBubbleList` 用
   `useSyncExternalStore` 订阅 `sessions.list`（`SnapshotStore<SessionListState>`，
   `subscribe`/`getSnapshot` 签名与 session-follow 用法一致）；`sessions` 缺省时气泡列
   不渲染（静默空转，与 session-follow 无 sessions 行为一致）。
2. **纯逻辑模块 `session-bubbles`（新建，对齐 state-machine / overlay-position 单例
   模式）**：
   - `selectBubbleEntries(items: readonly SessionListEntry[], current: SessionId | undefined, maxVisible: number)`：
     过滤 `running || completed` → 保持列表顺序 → 截取前 `maxVisible` 为 `visible`，
     返回 `{ visible, moreCount }`（`moreCount = max(0, total - maxVisible)`）；每条
     输出携带 `isCurrent`（sessionId === current）。
   - 错误会话（`lastAgentError` 等）结束同样落 `completed` 位（manager 的 running→idle
     边沿即 arm 提醒），不特殊处理，与侧边栏绿点语义一致。
3. **配置模块 `session-bubbles-config`（新建，对齐 skin.ts 模式）**：
   `getMaxSessionBubbles(): number` / `setMaxSessionBubbles(n)`，读写
   `localStorage('jx-max-session-bubbles')`，默认 5，钳制 [1,10]，读失败回落默认、
   写失败静默忽略（对齐 skin.ts 容错）。
4. **组件**：`SessionBubble`（单气泡：标题 + 状态点 + 点击 + 高亮 + hover 金描边提视，
   `role="button"`、键盘可激活、`aria-label` 含会话标题）与 `SessionBubbleList`
   （订阅、过滤/折叠计算、展开态 state、渲染列）。挂载在 `CharacterOverlay` 盒内。
5. **交互**：点击调 `sessions.open(sessionId)`（与侧边栏同一入口）；气泡根元素挂
   `data-jx-interactive`（复用 ADR-0006 拖动排除机制 `CharacterOverlay.tsx:213-215`，
   该机制被首次实际消费）；当前会话气泡点击 no-op。
6. **布局**：气泡列 `position: absolute`，整体置于角色盒外左侧（`left:auto;
      right: calc(100% + 8px)`，右缘贴盒左缘留 8px 间隙，不叠加角色本体），
   `bottom:0` + `flex-direction: column-reverse` 自下而上；气泡 132×24 单行、
   标题 `text-overflow: ellipsis`；「+N」在列视觉顶部（column-reverse 末位）；
   展开时原位变「收起」气泡。台词气泡位置（`bottom:100%; right:0`）不动。
7. **上限与展开**：默认 5（可配置），`visible` 条 + 1 条「+N」（`moreCount > 0` 时）；
   展开态显示全部，再点收起。上限变化即时生效（配置与列表同源订阅）。
8. **样式令牌**：气泡背景 `--dsw-specific-bubble`、文字 `--dsw-alias-label-primary`、
   边框 `--dsw-alias-border-l1`；hover 与当前会话描边 `--jx-gold` 专属轨；「+N」弱化
   （`--dsw-alias-label-dimmed` 系）；状态点：运行中 `--jx-gold` 呼吸点（CSS
   animation，`prefers-reduced-motion` 下静态）、已完成 `--dsw-alias-state-success-primary`
   石绿实心。无颜色字面量、无主题选择器（L2 remap 双值自动处理）。
9. **动效**：出现 150ms 淡入（opacity + translateY 4px，自然减速）、消失 100ms 淡出
   （退出快于进入）；重排无动画；`prefers-reduced-motion` 全关（DESIGN.md §6）。
10. **SettingsCard**：新增「角色」section（默认折叠，复用既有 section 结构），含数字
    输入（min 1 / max 10 / step 1，默认 5），onChange 即时调
    `setMaxSessionBubbles` 并钳制，初始值 `getMaxSessionBubbles()`。
11. **文档同步**（已完成于 grill 会话）：ADR-0007 已写全局 `docs/adr/`；DESIGN.md §4
    已新增会话气泡列专规并修订台词气泡/可拖动条目；CONTEXT.md 已登记「会话气泡列」
    「角色 section」术语与 ADR-0007。

## 测试决策

- **好测试的定义**：只测外部行为（输入 items/current/maxVisible → 输出可见集/moreCount/
  isCurrent），不测实现细节（DOM、类名、React 渲染、订阅时序）。
- **Seam：复用既有 Seam**（client 纯逻辑 + vitest node 环境，先例
  `state-machine.test.ts` / `warp-controller.test.ts` / `overlay-position.test.ts`）。
  **新 seam 数 = 1**（`session-bubbles` 纯逻辑模块——功能逻辑当前不存在，必须新建，
  但完全对齐既有 seam 模式，无新测试基建）。
- **被测模块**：`session-bubbles` 纯逻辑（过滤 + 折叠 + isCurrent）。配置模块
  （`session-bubbles-config`，localStorage）与 DOM 薄壳（组件、点击、拖动排除、展开态）
  不在自动化测试范围（对齐 skin.ts / fx 无 localStorage 测试、组件无 DOM 测试的惯例）。
- **覆盖**：
  - 过滤：仅 `running || completed` 入选；idle/已查看会话不入选；空列表 → 空。
  - 顺序保持：入选条目按 items 顺序，不重排。
  - 折叠边界：total ≤ max → 全可见且 moreCount = 0；total = max + 1 → visible = max、
    moreCount = 1；total 大额 → moreCount = total - max。
  - isCurrent：匹配 current 的条目标记 true；无 current / 不匹配 → false。
  - maxVisible 边界（1 / 10 / 越界值由配置模块钳制，纯函数按传入值计算）。
- **测试先例**：`tests/client/warp-controller.test.ts`（纯逻辑、node 环境、输入断言
  输出、不依赖 DOM/React）。
- **不自动化部分**：气泡渲染、点击跳转（`sessions.open` 真实调用）、展开/收起交互、
  `data-jx-interactive` 拖动排除、状态点呼吸动画、触屏点击、reduced-motion——人工视觉
  验证，沿用浮层/拖动系统无自动化视觉测试的惯例（PRD-04 测试决策）。

## 超出范围

- **气泡内显示状态文字**（如"运行中/已完成"字样）——已定为标题 + 状态点，不做文字。
- **全量会话列表展示**——只显示 running/completed 会话，普通历史会话仍去侧边栏。
- **气泡拖拽排序 / 编辑 / 关闭单个气泡**——本期仅折叠展开。
- **「+N」之外的其他溢出形态**（滚动、分页、弹出层）——已否决，见 ADR-0007。
- **宿主/服务端变更**——纯 client 功能，`sessions` 接口仅消费不改动。
- **StateSwitcher 等其他盒内交互元素**——本期仅会话气泡。
- **配置迁移与版本化**——本期单 key 单值。

## 补充说明

- 此需求为 grill 会话（`jxx-grill-with-memorial` 003-session-bubbles，2026-08-19）
  定案的 ADR-0007 实现：D1-D20 共 20 项决策（10 项用户问答定案 + 10 项授权自行决策），
  详见 memorial（已归档 `docs/memorial/archived/003-session-bubbles/`）。
- 领域词汇以 `CONTEXT.md` 为准（「会话气泡列」「角色 section」已登记）；架构决策以
  ADR-0007 为准；视觉以 `DESIGN.md` §4 为准。
- **已接受的权衡**：气泡本体反转「气泡不拦截指针」规（仅气泡本体，台词气泡保持穿透，
  见 ADR-0007 后果）；上限折叠使"气泡数 = 会话数"在溢出时字面上不成立（用户选择）。
- 持久化 key `jx-max-session-bubbles` 对齐现有 `jx-fx` / `jx-skin` / `jx-overlay-pos`
  模式。
- 气泡列订阅 `sessions.list` 与 `session-follow` 订阅是并行关注点，互不改动。