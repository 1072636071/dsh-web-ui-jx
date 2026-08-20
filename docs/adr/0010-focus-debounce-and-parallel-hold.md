# ADR-0010 — 焦点层防抖 + 多会话并行驻留 + 摸鱼彩蛋

## 状态

已接受（memorial 006 定案）。

## 背景

ADR-0008 将会话级状态机与焦点仲裁落地后，浮层已能按焦点会话渲染。但实际运行中，单个助手会话内部会因工具调用、思考、推理反复在 thinking/reading/replying/working 之间快速切换（尤其多工具链调用），导致浮层动画切换过快、观感僵硬。

 memorial 006 进一步引入：
1. 运行期高频切换防抖；
2. 多会话并行时浮层长期驻留 working，以「全局忙碌」表达整体负荷；
3. 驻留期间偶发「摸鱼彩蛋」增加生活化趣味。

这些策略属于**焦点呈现层**的行为规则，不替代每会话内部的状态推导（`session-follow.ts` diffTarget），而是在 runtime 焦点输出前再加一层缓冲/仲裁。

## 决策

### D1 — 焦点层防抖

- **作用域**：只落在 runtime 焦点层；非焦点会话仍直接驱动各自 SM，不做防抖（不可见，无需防抖）。
- **语义**：挂起 `pending` 目标。工作态（thinking/reading/replying/working）底层目标变化时，不立即切动画，只更新 pending；连续 **3000ms** 无新目标变化，才一次性切到最新 pending。
- **例外（硬切）**：`permission` 与 `error` 不受防抖窗口限制，到达即立即丢弃 pending，直接按状态机过渡段播到目标态。
- **硬切过渡方式**：permission/error 并非生硬跳帧，而是仍正常播一次 `transition-X→permission/error`，再落入目标循环态。

已否决的替代：
- 防抖落在每会话 SM 内：浪费计算，非焦点会话不可见；
- 最小驻留（lockout）：窗口内合法目标变化被延迟，偏钝；
- 全部状态都防抖：done/idle 等阶段落点也被拖慢，反馈迟滞。

### D2 — 多会话并行驻留 working

- **并行判定**：`sessions.list.ids` 中 **≥2 个会话同时 running**，且其中**至少一个非 idle**。满足时，浮层切换到全局 `working` 驻留，不再跟随焦点会话的频繁演变。
- **紧急态仍抢焦**：并行驻留期间，`permission`/`error` 仍按 ADR-0008 紧急抢焦；紧急态消退后重新评估并行条件，若仍满足则回到 working 驻留，否则恢复焦点会话跟随。
- **恢复跟随**：并行条件不满足时（只剩一个 running 会话或全部 idle），浮层恢复为渲染焦点会话的 playback。

已否决的替代：
- 全部会话都 working 才算并行：判定过窄，用户体验不到驻留效果；
- 只要 ≥2 ids 就驻留：idle 会话也会被误判为并行；
- 并行时完全屏蔽紧急抢焦：削弱 permission/error 的视觉强调。

### D3 — 摸鱼彩蛋

- **触发时机**：仅在多会话并行驻留 working 期间，且当前不是紧急态时触发。
- **触发方式**：随机计时，平均 **2–5 分钟/次**。
- **彩蛋状态池**：6 个中间态表情（shy-smile/shush/nod-smile/frown-wave/chin-rest/cheek-rest）+ 3 个新增生活化表情（happy/angry/surprised）。
- **播放形式**：从当前 working 先切到 idle，再播 `idle→彩蛋→idle` 一次，最后回到 working。整个彩蛋不抢焦、不破坏并行驻留语义。

已否决的替代：
- 时间过短（30–60s）：干扰工作氛围；
- 时间过稀疏（10–15min）：彩蛋存在感过弱；
- 彩蛋池加入 welcome/listening：稀释业务语义。

## 后果

- `overlay-session-runtime.ts` 需新增焦点层防抖逻辑：维护 `pendingTarget`、`debounceTimer`、硬切白名单。
- `CharacterOverlay` 消费 runtime 快照逻辑不变，仍只按 `playback` 渲染。
- 多会话并行驻留需读取所有会话 `running` 状态；`session-follow.ts` 的 `extractCore` 已暴露 `running`，可直接复用。
- 摸鱼彩蛋是 runtime 层的临时调度，不写入会话 SM 的 `currentState`，彩蛋结束后恢复 working 驻留或焦点会话 playback。
- 新增 3 个生活化表情循环态后，状态机循环态从 10 扩展到 13，过渡边从 36 扩展到 42（新增 `idle↔happy/angry/surprised` 共 6 边）。
