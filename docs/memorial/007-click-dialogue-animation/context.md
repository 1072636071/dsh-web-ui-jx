# Memorial 007 — 点击姜晓触发动画并说台词

**状态**：已完成（grill + 回写均完成）
**创建**：2026-08-21
**slug**：click-dialogue-animation

---

## 诉求

用户原话（按提出顺序）：

1. > 我想在点击姜晓的时候触发一个动画，并说台词。

---

## 追问记录

### 2026-08-21 — 诉求 1：事实查证（点击当前行为 + 惊吓现状 + 台词现状）

**查证结论（代码可追溯）**：
1. **点击当前行为**：`CharacterOverlay.tsx:290-306` handlePointerDown 仅启动拖动（dragStart），**无任何点击→动画/台词触发**；pointerup 提交位置并持久化。
2. **surprised（惊吓）现状**：`overlay-session-runtime.ts:77-87` surprised 只在「摸鱼彩蛋池」EASTER_EGG_POOL（2–5 分钟随机一次，并行驻留 working 时切表情 3s 后回），**未接点击触发**。SM 已有 `idle↔surprised` 过渡边（`overlay-state-machine.ts:137-138`）+ `surprised.webp` 循环素材 + `EXPRESSION_LOOP_STATES`（runtime:100-104）。
3. **台词现状**：`CharacterOverlay.tsx:120-133` STATE_SPEECH 在 currentState 变化时自动弹对应台词（`surprised: "咦？可是吓到大人了？"`，132 行）；外部触发走 `speech` prop（nonce 变化，161-169 行，当前无人调用）。
4. **台词场景表**：`docs/character-lines.md:33` 已有 shocked 行（「吓！」／「何人！」／「休要动手动脚！」），但「台词（用户填）」列为空 —— 用户尚未填写最终文案。
5. **与 004 的关系**：memorial 004 D12「惊吓 = 被点击/拖动触发」、D14「pointerdown 触发一次「idle→惊吓→idle」播完即回，拖动中不重复」**当时已决策但未实现**；本次诉求 = 实现该触发 + 追加台词。

**待 grill 澄清点**：
- 触发语义：pointerdown（按下即触发，含拖动起手）vs 区分点击/拖动（位移/时长阈值判定）
- 台词内容来源：沿用 STATE_SPEECH 既有句 / character-lines.md 表格用户填写 / 本次新定
- 台词与动画时序：同时 vs 动画中后段弹出
- 触发后回落：回当前真实会话态 vs 回 idle
- 冷却与防抖：连点/拖动期间去重
- 是否要设置开关（类似 jx-state-label-visible）

---

### 2026-08-21 — Q1 触发语义（用户已答）

**Q1**：什么算"点击姜晓"？
**A1**：用户选「方案 1 = 点击判定（位移阈值）」→ pointerdown 起记录落点，pointerup 时位移 < 阈值判为点击触发；位移 ≥ 阈值判为拖动不触发。用户同时授权：「其他你也自行决策，给我看一下你的决策结果就行」。

**事实支撑（决策依据）**：
- `dragSession.startPointer` 已存 pointerdown 坐标（`overlay-position.ts:176-180`），点击位移判定可直接复用，无需新增坐标追踪。
- `planSwitch`（`overlay-state-machine.ts:247-282`）：无直接边时经 idle 中转，`idle↔surprised` 边存在 → 任意态→surprised 的序列必然「当前态→idle→惊吓→…」。
- 摸鱼彩蛋机制（`overlay-session-runtime.ts:458-534`）已实现「显示层覆盖 + 定时器 + 回落」完整模式，点击惊吓可同构复用（独立 poke 状态），不污染焦点会话 SM 的 lastState/pendingTarget 记账。
- 现有「currentState 变化自动弹台词」（`CharacterOverlay.tsx:369-381`）会让 poke 入场/退场各触发一次台词（「吓！」后紧接当前态台词），需点击路径显式控泡 + 抑制自动弹，避免双弹。

---

## 决策汇总

| # | 决策 | 状态 | ADR |
|---|------|------|-----|
| D1 | 点击判定：pointerup 时位移 < 5px 且按下时长 ≤ 300ms 判为点击 → 触发；否则视为拖动/长按不触发；命中 `[data-jx-interactive]` 不触发 | 已定 | — |
| D2 | 触发动画 = 惊吓（surprised）：序列「当前显示态→idle→惊吓过渡→惊吓循环(驻留 3s)→惊吓→idle→idle→当前显示态→当前态循环」，复用 SM `idle↔surprised` 边 | 已定 | — |
| D3 | 实现层 = runtime 显示层覆盖（同构复用摸鱼彩蛋的「覆盖状态 + 定时器 + 回落」模式，新增独立 poke 状态/定时器），不在焦点会话 SM 上 dispatch（避免污染 lastState/pendingTarget 记账与真实会话态） | 已定 | ADR-0011 |
| D4 | 台词 = 惊吓台词池随机一句（池：「吓！」「何人！」「休要动手动脚！」「咦？可是吓到大人了？」），点击路径显式弹气泡（不走状态变化自动弹，抑制入场/退场双弹）；STATE_SPEECH.surprised 保留随机池（摸鱼彩蛋随机惊吓仍可自动弹）；台词池回填 character-lines.md shocked 行 | 已定 | — |
| D5 | 时序：动画与台词同时触发（点击瞬间弹气泡 + poke 启动） | 已定 | — |
| D6 | 回落 = 回触发前显示态：poke 结束清除覆盖，computeSnapshot 自然回落到并行 working / 焦点会话当前态（经「surprised→idle→当前态」过渡序列，非硬切） | 已定 | — |
| D7 | 紧急打断：permission/error 存在时点击不触发 poke；poke 播放中出现紧急事件则取消 poke 交还紧急呈现（紧急优先） | 已定 | — |
| D8 | 冷却：poke 激活期间重复点击不重启动画也不换台词；序列结束恢复后可再次完整触发 | 已定 | — |
| D9 | 与摸鱼彩蛋互斥：poke 触发时取消进行中的彩蛋（清定时器 + 清 easterEggState），避免叠加；彩蛋池保留 surprised（摸鱼仍可出现） | 已定 | — |
| D10 | 不加设置开关（用户未要求；保持最小实现，后续可加 jx-poke-visible 类开关） | 已定 | — |
| D11 | reduced-motion 不额外禁用（角色 webp 动画为核心表现，与现有 loop/transition 行为一致） | 已定 | — |

**ADR-0011 已起草**（`adr/0011-poke-display-override.md`）：三条件满足（难逆转：新增 runtime 公共 API + computeSnapshot 分支；未来读者惊讶：为何第二个显示层覆盖、为何取消彩蛋、为何紧急打断；有被否决的真替代：焦点会话 SM dispatch）。

---

---

## 待澄清

（已清零）

- ~~触发语义~~ → D1 已定（点击位移判定）。
- ~~台词内容来源~~ → D4 已定（惊吓台词池随机一句）。
- ~~台词与动画时序~~ → D5 已定（同时触发）。
- ~~触发后回落~~ → D6 已定（回触发前显示态，过渡序列非硬切）。
- ~~冷却与防抖~~ → D8 已定（poke 播放中不重复）。
- ~~设置开关~~ → D10 已定（不加，保持最小实现）。
- ~~与摸鱼彩蛋/紧急态的关系~~ → D7/D9 已定。

---

## 备注

### Checklist（2026-08-21 收尾）

| # | 检查项 | 结果 |
|---|--------|------|
| C1 | 诉求回应：1 个诉求点（点击姜晓触发动画 + 说台词）有完整决策覆盖 | ✅ |
| C2 | 决策完备：D1–D11 全部已定，无待定/暂缓/未决 | ✅ |
| C3 | 待澄清清零 | ✅ |
| C4 | 调查闭环：无 sub-task 工单（事实全部代码自查完成，无需委派） | ✅ |
| C5 | ADR 齐全：D3 满足三条件 → ADR-0011 已起草 | ✅ |

全绿 → 进入回写确认。

**回写确认（2026-08-21）**：用户确认全部回写并立即实施。
- CONTEXT.md 已新增术语「点击惊吓（poke）」并更新「生活化表情」行（shocked = 点击判定触发，ADR-0011）。
- ADR-0011 已同步到全局 `docs/adr/0011-poke-display-override.md`。
- 实施：runtime poke 显示层覆盖 + CharacterOverlay 点击检测 + 惊吓台词池 + character-lines.md 回填，已构建验收。

### 统计

- 追问：1 轮（Q1；其余 D2–D11 由用户授权自行决策并确认）
- 决策：11 项（D1–D11）
- ADR：1 项（0011，memorial 内部起草 + 同步全局）
- 调查工单：0 项（事实全部代码自查完成）

