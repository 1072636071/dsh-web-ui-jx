# Memorial 003 — 会话气泡（会话数与气泡数一致 + 点击跳转）

**状态**：已完成（grill + 回写完成，待实施）
**创建**：2026-08-19
**slug**：session-bubbles

---

## 诉求

用户原话：

> 我希望姜晓动画头上的对话框，和当前运行的会话一样多。然后还可以点击对应的气泡，去到对应的会话，你来看看怎么实现比较好

---

## 追问记录

### 2026-08-19 — 事实查证（代码库，非问用户）

- 数据源已就绪：`ctx.sessions`（ISessions）已注入 client 半区（`src/client/index.ts:44` inject、`:93-99` attachSessionFollow）。
- `sessions.list`（ObservableSnapshot）快照含 `items: SessionListEntry[]` + `current`；每条含 `sessionId / title? / running / completed / agentPreset / updatedAt / depth`（`node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/manager.d.ts:21-33`、`lineage.d.ts:11-32`）。注意：条目无 `displayTitle`，展示需自取 title 或回落 sessionId。
- 导航：`sessions.open(id)` 切换当前会话（`contract/sessions.d.ts:35`），与侧边栏同一入口；点击气泡跳转 = 调它。
- 现状气泡：单例瞬态 `SpeechBubble`（淡入→显示→淡出→卸载），`pointer-events: none`（`speech-bubble.module.css:38`），由 `CharacterOverlay` 内部 bubble state 持有（`CharacterOverlay.tsx:279-315`）。
- 状态机 `session-follow` 只跟随 `current` 会话（`session-follow.ts:233-248`），与「多会话气泡」是并行关注点。
- 拖动交互（ADR-0006）：整盒 `pointer-events:auto`，pointerdown 命中 `[data-jx-interactive]` 子元素时不启动拖动（`CharacterOverlay.tsx:209-227`）→ 气泡可点击需挂该属性。
- 气泡视觉约束：DESIGN.md §4「台词气泡淡入淡出、播放后自动隐去、pointer-events:none」→ 常驻可点击气泡与之冲突，需改规或新增规（潜在 ADR）。

### 2026-08-19 — Q1 会话范围

**Q1**：「当前运行的会话」范围定义？
**A1**：用户选 (B)「running + completed（未查看的已完成）」。→ D1。

### 2026-08-19 — Q2 气泡内容

**Q2**：每个气泡显示什么？
**A2**：用户选「标题 + 状态点」（运行中金色呼吸点 / 已完成石绿实心点）。→ D2。

### 2026-08-19 — Q3 与台词气泡的关系

**Q3**：现有瞬态台词气泡（"思考中…"）怎么处理？
**A3**：用户选「两层并存，但会话气泡在人物左边，台词气泡留在原位置（头顶右上）」。→ D3。

### 2026-08-19 — Q4 排列方式

**Q4**：会话气泡在人物左侧怎么排？
**A4**：用户选「左侧竖排一列，自下而上生长」。→ D4。

### 2026-08-19 — Q5 溢出处理

**Q5**：会话多时气泡列超出浮层盒顶部怎么办？
**A5**：用户选「数量上限（默认 5）+ 超出折叠为「+N」」，且**上限可配置**。→ D5。

### 2026-08-19 — Q6「+N」交互

**Q6**：超过上限的会话怎么折叠展示？
**A6**：用户选「+N 小气泡，点击原地展开，再点收起」。→ D6。

### 2026-08-19 — Q7 配置载体

**Q7**：数量上限的配置放哪里？
**A7**：用户选「SettingsCard 新增「角色」section（数字输入，默认 5，范围 1-10）」。→ D7。

### 2026-08-19 — Q8 排序

**Q8**：自下而上生长时谁在底部？
**A8**：用户选「按列表顺序（侧边栏顺序）自下而上填充」。→ D8。

### 2026-08-19 — Q9 当前会话气泡

**Q9**：当前会话的气泡怎么表现？
**A9**：用户选「金描边高亮 + 点击无动作」。→ D9。

### 2026-08-19 — Q10 样式与授权

**Q10**：会话气泡用什么样式？
**A10**：用户选「新建独立样式（SessionBubble）」，并授权「其他你也自行决策」。→ D10-D22 为自行决策，理由见下。

---

## 决策汇总

| # | 决策 | 状态 | ADR |
|---|------|------|-----|
| D1 | 气泡范围 = `running === true`（运行中）+ `completed === true`（运行完未查看）的会话 | 已定 | ADR-0007 |
| D2 | 气泡内容 = 会话标题（超长省略）+ 状态点（运行中金呼吸点 / 已完成石绿实心点） | 已定 | ADR-0007 |
| D3 | 两层并存：会话气泡列在角色左侧，台词气泡留在原位置（头顶右上，`bottom:100%; right:0`） | 已定 | ADR-0007 |
| D4 | 左侧竖排一列，自下而上生长（列表顺序第一个在底部） | 已定 | ADR-0007 |
| D5 | 数量上限（默认 5）+ 超出折叠为「+N」气泡；上限可配置 | 已定 | — |
| D6 | 「+N」点击原地展开全部气泡，再点收起（展开时 +N 原位变「收起」） | 已定 | — |
| D7 | SettingsCard 新增「角色」section：数字输入（默认 5，范围 1-10），持久化 `localStorage('jx-max-session-bubbles')` | 已定 | — |
| D8 | 排序 = 按 `sessions.list.items` 顺序（与侧边栏一致） | 已定 | — |
| D9 | 当前会话气泡金描边高亮（`--jx-gold` 轨）；点击无动作 | 已定 | — |
| D10 | 新建独立组件/样式 `SessionBubble`（紧凑卡片），不复用 SpeechBubble 样式 | 已定 | ADR-0007 |
| D11 | 动效：出现 150ms 淡入（opacity+translateY 4px，自然减速）、消失 100ms 淡出；列表重排无动画；`prefers-reduced-motion` 全关（对齐 DESIGN.md §6 与 SpeechBubble 先例） | 自行决策 | — |
| D12 | 点击/拖动冲突：气泡挂 `data-jx-interactive`，pointerdown 不启动拖动（复用 ADR-0006 现有排除机制 `CharacterOverlay.tsx:213-215`）；气泡 `pointer-events:auto` + `cursor:pointer` | 自行决策 | ADR-0007 |
| D13 | 样式令牌：背景 `--dsw-specific-bubble` / 文字 `--dsw-alias-label-primary` / 边框 `--dsw-alias-border-l1`；hover 与当前会话描边用 `--jx-gold` 专属轨；「+N」弱化（`--dsw-alias-label-dimmed` 系）；状态点运行中 `--jx-gold` 呼吸点（reduced-motion 下静态）、已完成 `--dsw-alias-state-success-primary` 石绿实心 | 自行决策 | — |
| D14 | 布局：气泡列 `position:absolute; left:0` 角色左侧，`flex-direction: column-reverse` 实现自下而上；气泡宽 132px 高 24px 单行；「+N」在列视觉顶部；台词气泡位置不动（已核实空间不冲突） | 自行决策 | — |
| D15 | 组件结构：`SessionBubble`（单气泡）+ `SessionBubbleList`（订阅 sessions.list、过滤 running\|completed、上限与展开）；`CharacterOverlay` 新增 `sessions?: ISessions` prop 盒内渲染；`index.ts` 把 `ctx.get("sessions")` 传入 | 自行决策 | — |
| D16 | 配置模块：新增 `src/client/session-bubbles-config.ts`（getMaxSessionBubbles/setMaxSessionBubbles，对齐 skin.ts 模式），SettingsCard 与气泡列共用 | 自行决策 | — |
| D17 | 标题回落：`title` 为空用 sessionId 截断显示（实现细节） | 自行决策 | — |
| D18 | 过滤含 error 结束会话：出错结束的会话同样落 `completed` 位（manager 的 running→idle 边沿即 arm 提醒），与侧边栏绿点语义一致，不特殊处理 | 自行决策 | — |
| D19 | 纯逻辑抽离（过滤/上限/折叠计算）写测试，对齐 `tests/client/` 现有模式 | 自行决策 | — |
| D20 | 实施后跑 `npm run build` + `npm run verify`（AGENTS.md 构建验收约束） | 自行决策 | — |

**ADR-0007 判定**（满足三条）：难以逆转（新组件 + 改 DESIGN.md §4 规）✓；未来读者会惊讶（角色浮层上的常驻可点击导航组件，反转「气泡不拦截指针」规）✓；有真替代被否决（复用 SpeechBubble / 数量无上限 / 配置无 UI 等）✓ → 创建 `docs/memorial/003-session-bubbles/adr/0007-session-bubbles.md`，收尾时回写全局 `docs/adr/`。

---

## 待澄清

（已清零，D10 起为自行决策，均已落盘）

---

## 调查工单

（空）

---

## 回写记录

- ADR-0007 已回写全局 `docs/adr/0007-session-bubbles.md`（memorial `adr/` 存副本）。
- DESIGN.md §4 已新增「会话气泡列」条目，并修订台词气泡/可拖动条目（含 `data-jx-interactive` 排除）。
- CONTEXT.md 已登记术语：会话气泡列、角色 section；已定决策表新增 ADR-0007。