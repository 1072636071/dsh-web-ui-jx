# 08 — 审批动画延迟：播放计划结构等价门槛

**Status:** wontfix

**Blocked by:** 02

**构建内容：** 修复「需要用户审批时，permission 动画不立刻播放、批准完成后才播放」。根因两级：

1. **主犯·快照引用抖动**：`overlay-session-runtime` 的 `processSnapshot` 结尾无条件 `emit()`——即使会话帧内容无变化，每次都产生新的 `RuntimeSnapshot` 引用；`CharacterOverlay` 只要快照**引用**变化就把播放索引 `index` 打回 0。审批等待期间任何会话帧滴漏（工具树投影、队列镜像、其他会话事件等）都会不断归零索引，两段共约 7s 的入场过渡永远走不完，permission 循环不可达（仿真实测：等待 30s 画面始终停在第一段过渡）。
2. **从犯·7s 过渡串联**：permission 入场经 idle 中转播两段过渡，单段实测 3484ms，零事件理想情况下 permission 循环也要 ~7s 才落地（可读性差，但非本 issue 范围）。

**症状机制（倒挂呈现）**：批准瞬间降沿补态替换 playback，索引归零重播，第一段 `transition-permission-idle` 首帧即 permission 造型——「要权限的动画」反而成为批准后看到的第一个画面。

**修复决策（grill 会话 ADR-0016 决策 D1）**：`CharacterOverlay` 的索引重置门槛从「快照引用变化」改为「**播放计划结构等价被打破**」：新快照的 `playback` 与上一计划**长度相同且各项 `kind`/`url` 逐项相同** ⇒ 视为同一计划，沿用当前索引继续推进；否则才归零重播。

**为什么必须结构等价而非裸引用比较**：`computeSnapshot` 的 poke／摸鱼彩蛋／并行驻留分支每次调用都重建 playback 数组（新引用、同内容），裸引用比较治不了这三处的同类卡死。

**验收标准：**

- [ ] 把门槛判定抽为可测纯函数（如 `playbackPlanEquals(prev, next)`），单元测试覆盖：同内容新引用（视为同计划）、长度不同、任一项 url/kind 不同、空数组边界
- [ ] 逻辑级回归测试（UI 模型推进，可从 `.temp/scripts/approval-visible-sim.test.ts` 固化，该目录不入库）：等待期每秒注入无变化会话帧 30s，permission 入场过渡链仍能走完落到 `loop:permission`；批准后降沿补态正常落到工作呈现
- [ ] 对照组保留：零事件等待 ~7s 后落到 `loop:permission`（行为不回退）
- [ ] 变体轮换（ADR-0013）与彩蛋/poke 路径回归不受影响（轮换推进、彩蛋序列仍正常播放）
- [ ] 通过 `npm run build` 与 `npm run verify`

## 评论

2026-08 `/jxx-to-tickets`：实施拆解为 `.scratch/08-permission-anim-visible/issues/01-playback-cursor-module.md`（播放游标模块+回归用例）与 `02-overlay-cursor-wiring.md`（浮层接入端到端修复），本票让位关闭（wontfix）；根因取证与验收清单已由两票及 PRD 吸收，本文件保留为诊断记录。

（来源：2026-08 grill 会话「审批动画延迟」；仿真证据 `.temp/scripts/approval-timing-sim.test.ts`、`approval-visible-sim.test.ts`、`probe-transition-durations.mjs`（临时目录，实施时固化进 `tests/`）。关联：09 poke 遮蔽、10 并行驻留遮蔽、11 紧急态即达增强。）

规格文档：`.scratch/08-permission-anim-visible/PRD.md`（ready-for-agent）——实施以该 PRD 的实现决策与测试决策为准，本工单保留根因取证与验收清单。
