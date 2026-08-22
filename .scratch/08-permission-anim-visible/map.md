# map — 审批动画及时可见（播放计划结构等价门槛）

## 已做决策

- 根因与决策全文：`docs/adr/0016-playback-plan-identity-gate.md`（结构等价门槛；runtime 去抖否决；紧急态即达缓议）。
- 词汇：快照引用抖动／播放计划结构等价／状态身份倒挂 —— 见根目录 `CONTEXT.md`。
- 与 ADR-0014（审批等待时间启发式，并发会话产出）互补：彼管「何时进 permission」，此管「进了能否走出来被看见」。

## 规格

- PRD：`.scratch/08-permission-anim-visible/PRD.md`（ready-for-agent）。

## 工单

- 01 播放游标纯逻辑模块与回归用例（resolved：`playback-cursor.ts` + 11 用例）
- 02 浮层组件接入播放游标（resolved：CharacterOverlay 换芯，build/verify 过；手动验收待部署实测）

## 实施记录

- 2026-08 两票实施完成。全量套件 216/217：唯一失败为 host asset-routes 缓存头断言过时（并发会话白偏红缓存修复的在途改动遗留，未越界代修）。
- 手动验收路径：链接安装后触发工具审批——等待期应完整播完 permission 入场并驻留「需大人首肯」，批准后退场自然。

## 取证指针

- 原 grill 会话实施票（已让位 wontfix）：`.scratch/06-session-level-state-machine/issues/08-permission-anim-stuck.md`
- 同族潜伏缺陷：特性 06 issue 09（poke 遮蔽 ~8s）、10（并行驻留遮蔽焦点紧急态）；缓议增强 issue 11（紧急态 cross-fade 即达）。
- prototype 仿真脚本（临时，不入库）：`.temp/scripts/approval-timing-sim.test.ts`、`approval-visible-sim.test.ts`、`probe-transition-durations.mjs`（单段过渡实测 3484ms）。
