# ADR-0014 — 审批等待（permission）时间启发式判据与 angry 升级线

## 状态

已接受（grill-with-docs 会话定案）。待实施。

## 背景

等待用户审批时，角色应立刻进入 permission（请求权限）动画。但实际观察：等待期浮层一直停留在
working，permission 动画在错误时机才出现。

根因（代码事实）：`permission` 目前仅由 `snapshot.pending` 的**上升沿**驱动
（`session-follow.ts diffTarget`），且 permission 属于硬切（`overlay-session-runtime.ts`
`HARD_CUT_STATES`，ADR-0010）。理论上只要宿主在等待期把 `pending` 置真，动画就会即时播放；
实测等待期角色停在 working，说明真实审批流程中 `snapshot.pending` 在等待期并未被置真
（或过于瞬时被吞），该信号不足以驱动 permission。

限制：client 半区只注入 `sessions`，插件与宿主之间仅有 host 半区注册的 http 路由，
无客户端可订阅的审批实时 push（`approval/asked` / `approval/decided` 事件发生在编排进程，
`ctx.approval.request` 属宿主 seam）。故「等宿主补 pending 快路径」或「host 半区旁路审批
事件推给 client」均需跨进程中继，成本高。

## 决策

1. **判据信号：时间启发式**。`runningCalls > 0`（工作态）持续顶着不动超过阈值，即视为
   「等待交互/审批」，进入 permission。零新依赖、self-contained；镜像既有
   `thinking→reading`（`READING_THRESHOLD_MS`）与 `done→idle`（`DONE_HOLD_MS`）的
   tick 时间驱动先例，每会话记 `blockedSince`，tick 判定、目标变化即清零。
2. **进入线：单一 10s**（permission 在卡住 10s 后进入），复用 ADR-0009 中 angry「10s」先例
   作为 permission 的进入阈值。
3. **窗口期 0→10s 维持 working**：阈值未达前启发式无法判定是否为审批，保持 working 最诚实。
4. **angry 作长候升级**：卡住持续更久（默认 30s 升级线，可调）由 permission 升级为 angry
   （久候无应表情，ADR-0009）。angry 与 permission 不可共用同一阈值，否则「升级」失效。
5. **现有 `snapshot.pending` 上升沿保留为即时快路径**：宿主一旦真置 `pending`，仍可立即硬切
   permission（与启发式共存，互不冲突）；启发式只兜底 pending 缺席的场景。

已否决的替代：继续纯依赖 `snapshot.pending`（真实流程不可靠）；host 半区旁路审批事件经
轮询/SSE 推给 client（跨进程中继成本最高，收益不成比例）；双向判据（pending→permission、
卡住→angry，需回头依赖 pending，与启发式混用复杂）。

## 后果

- 无法区分「等待审批」与「工具本身长跑/卡住」：长期 runningCalls 顶着会被误判为
  permission/angry。此为时间启发式的固有代价，用户已接受；阈值可配以缓解。
- 修正 ADR-0009 angry 的触发语义：原「10s 无应触发 angry」调整为「进入线 10s 为
  permission、30s 升级 angry」。
- 需在 `overlay-session-runtime.ts` 增加每会话 blocked 追踪（`blockedSince` + 阈值判定），
  与现有 thinkingSince/doneSince tick 机制并列；`session-follow.ts` 补充阈值常量。
- 阈值建议落入 SettingsCard「角色」section 可配（沿用既有设置键模式），默认
  permission@10s / angry@30s。