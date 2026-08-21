# ADR-0011 — 点击惊吓（poke）的显示层覆盖机制

## 状态

已接受（memorial 007 定案，已实施）。

## 背景

用户诉求（memorial 007）：点击姜晓时触发一个动画并说台词。点击触发惊吓（surprised）动画 + 一句台词。

- `surprised` 循环态与 `idle↔surprised` 过渡边早已存在（ADR-0009/0010），此前仅在摸鱼彩蛋池中随机出现。
- 浮层可整体拖动（ADR-0006），pointerdown 即进入拖动会话，故需区分「点击」与「拖动」。
- 现有状态变化自动弹台词机制会让惊吓入场/退场各弹一次台词（双弹噪音），需显式控泡。

## 决策

1. **点击判定**：pointerup 时位移 < 5px 且按下时长 ≤ 300ms 判为点击；命中 `[data-jx-interactive]` 不触发。位移判定复用 `dragSession.startPointer`，无需新增坐标追踪。
2. **动画**：点击 → runtime 显示层覆盖为惊吓序列「当前显示态→idle→惊吓过渡→惊吓循环(3s)→惊吓→idle→idle→当前显示态→当前态循环」。
3. **实现层**：在 `overlay-session-runtime` 新增独立 poke 状态 + 定时器（同构复用摸鱼彩蛋的「覆盖 + 定时器 + 回落」模式），`computeSnapshot` 增加 poke 分支（紧急分支之后）。**不在焦点会话 SM 上 dispatch** —— 避免污染 lastState/pendingTarget 记账，且回落自然。
4. **台词**：惊吓台词池随机一句，点击路径显式弹气泡，抑制状态变化自动弹（入场/退场各一次）以免双弹。
5. **互斥与打断**：poke 触发时取消进行中的摸鱼彩蛋；permission/error 紧急事件存在时不触发 poke、播放中则取消 poke 交还紧急呈现。

## 被否决的替代

- **在焦点会话 SM 上 dispatch(`switch` → surprised)**：会改变会话"真实"显示态，且需要额外记住返回目标并定时切回，与 runtime 的 lastState/pendingTarget 记账（ADR-0010 防抖）冲突，会话事件到达时可能被立刻覆盖或残留。
- **立即触发（pointerdown 即触发）**：每次拖动起手也闪一次惊吓，频繁拖动时过吵。
- **沿用默认台词单句**：缺少随机变化，且无法覆盖 character-lines.md 已列的多句示例。

## 后果

- 新增 runtime 公共 API（`poke()`）与 `computeSnapshot` 分支；CharacterOverlay 增加点击检测与显式台词控制。
- 显示层出现第二套覆盖机制（摸鱼彩蛋 + poke），二者互斥管理需保持清晰。
- 台词文案属内容层，改词不涉代码评审；台词池回填 character-lines.md 便于统一维护。
