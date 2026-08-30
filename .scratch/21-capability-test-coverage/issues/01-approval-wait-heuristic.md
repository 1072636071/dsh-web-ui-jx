# 实施 ADR-0014 审批等待时间启发式

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 审批等待 ≥10s 时角色可靠地进入 permission 表达、≥30s 升级为 angry——每会话记 `blockedSince`，`tick()` 扫描各 deadline 到期判定；目标/运行状态变化即清零；`snapshot.pending` 上升沿的即时快路径保留（互补而非替代）。

**验收标准：**

- [x] 每会话 `blockedSince` 记账，`tick` 扫描 deadline（复用注入 `now()` + `tick()` seam，零新定时器）
- [x] 阈值沿用 ADR-0014：≥10s 进 permission、≥30s 升级 angry；目标变化即清零
- [x] `overlay-session-runtime.test.ts` 补时间推进用例（10s/30s 边界）
- [x] 全量测试 + build + verify 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30 实施（M5）：`overlay-session-runtime.ts` 落地 ADR-0014——
  ① 常量 `PERMISSION_BLOCKED_MS=10_000` / `ANGRY_BLOCKED_MS=30_000`（导出，测试消费）；
  ② `SessionEntry.blockedSince` 记账：`updateBlockedSince` 在 processSnapshot 维护，
  判据 = runningCalls>0 且无 pending/error（pending 在场时快路径即时 permission，不计入启发式）；
  ③ `tick()` 扫描 deadline：两条阈值独立判定（不可 if/else-if——越过 30s 但尚未进
  permission 的会话须先走 10s 分支），≥10s dispatch permission、≥30s `upgradeBlockedToAngry`
  （紧急显示表情 permission→angry，SM 保持 permission，审批反馈链不受影响）；
  ④ 快路径保留。测试：新增 describe 6 用例（10s 前 working/10s 进 permission、
  30s 前 permission/30s 升级 angry、目标变化清零、pending 快路径即时、升级后批准仍走
  nod-smile、非焦点卡住抢焦）。**fixture 约定**：既有显示层/轮换/并行驻留/批准返回类
  用例的会话改用 runningCallsCount:0（运行中无 active tool call），与启发式解耦
  （文件头注释）；variant-rotation.test.ts 同型一例同步。**偏差**：pending 在场的长候
  升级 angry 不在本次范围（快路径已即时 permission，且 blockedSince 随 pending 清零）。
  全量 37 文件 613 项全绿；build+verify 24 项全绿。
- 来源：PRD 21 候选 U1；证据见 memorial 017 archived `index.html`（全 src 检索 `blockedSince` = 0 命中；CONTEXT.md:25/:99 标「决策已定、待实施」）。
- 与 ADR-0016 互补：彼管「何时能看见」，此管「何时进入 permission」。
