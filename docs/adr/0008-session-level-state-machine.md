# ADR-0008 — 会话级状态机 + 焦点仲裁（多会话适配）

## 状态

已接受（memorial 004 定案，待实施）。

## 背景

角色浮层状态机原为**模块级单例**（`overlay-state-machine.ts:341`）：全局一个
`currentState` + 一个 `playback`，任何 `dispatch` 全局覆盖；`session-follow.ts`
也只跟随 `sessions.list.current` 单个会话。多会话运行（用户可并行打开多个
会话，各有独立 thinking/replying/working 状态）时，各会话事件互相覆盖，
浮层无法反映"谁在干什么"。

调查结论（sub-task/001）：宿主信号**全部按 sessionId 分区**
（`sessions.binding(id).session` 快照自带 `sessionId`；`sessions.list` 提供
`{ ids, byId, current }`），不存在全局单助手事件流——每会话状态只能由各自
快照差分推导（`session-follow.ts` diffTarget 机制已证明可行）。

另一项事实（sub-task/002）：webp 过渡段真实时长 3484/5494ms，而
`CharacterOverlay` 用 `setTimeout(800)` 推进，只覆盖真实时长 15%–23%——
过渡动画实际被截断（播 12 帧就切走，末帧定格永不出现）。

## 决策

1. **会话级 SM 实例**：`Map<sessionId, SM>`，每会话一个状态机 + 一个
   `binding(id).session` 订阅；浮层只渲染**焦点会话**的 playback。
2. **焦点仲裁**：当前打开的会话（`sessions.list.current`）最优先；非焦点
   会话事件照常驱动各自 SM，不抢焦；**error（hasError）与 permission
   （pending）可紧急抢焦**，事件消退即自动交还焦点给当前打开会话（用户
   手动切焦则保留手动焦点）。已否决的替代：单实例优先级聚合（并发覆盖、
   过渡被打断）；纯用户操作切焦（后台进度不可见）。
3. **跨会话焦点切换不播状态机过渡**：直接切到目标会话当前 loop + CSS
   150ms 淡入淡出。理由：过渡段素材是离散整段，img src 切换必然重置播放
   位置，跨会话衔接无从谈起；过渡动画只属于**单一会话内部的状态演变**。
   已否决的替代：跨会话播过渡段/idle 中转（跳帧 + 1.6s 拖沓）。
4. **生命周期随 `list.ids`**：会话出现即创建实例 + 挂订阅，从 ids 移除
   （`host/session-removed` / `removed=true`）即销毁并释放订阅。
5. **播放时长精确化**：播放期（过渡段切入时）ANMF 解析素材真实时长 → 按
   素材缓存，解析成功以真实时长推进、失败回退 800ms 兜底（解析挂起也不
   冻结播放链路）。已否决的替代：硬编码 3484/5494 两档（导入素材无法
   适配）。

## 后果

- `session-follow.ts` 的 diffTarget 推导逻辑（error > permission > working >
  replying > thinking > done > idle）复用为**每会话推导器**，不再只跟
  current。
- 焦点信号消费 `sessions.list.subscribe`；`sessions.binding(id)` 对未在列表
  的会话返回 undefined，`list.ids` 是会话集合事实来源。
- 跨会话切换的淡入淡出需在 overlay 的 img 上加 opacity 过渡（仅焦点切换
  路径，不影响拖动 transform 无过渡约束）。
- 新增 3 表情素材（happy/angry/shocked，见 ADR-0009）后，过渡段时长档位
  增至 4 种（45/75 帧 + 新表情段），动态解析方案天然覆盖。
