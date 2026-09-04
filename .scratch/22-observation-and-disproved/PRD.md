# 维持现状与已证伪登记（防重复排查）

Status: ready-for-agent

## 问题陈述

memorial 017 全量盘点确认了两项「维持现状」候选（浮层位置持久化收口 C2、client 设置壳 C3）与三项被证伪的常见优化假设（getSnapshot 引用不稳定、多 store 各自 setState、feDisplacementMap 重绘成本）。若无登记，未来审查会重复评估、重复测量，甚至误优化破坏有意语义。

## 解决方案

将「不要再动」清单与反证登记为本规格文档，作为未来审查与施工作业的权威引用源。

## 用户故事

1. 作为维护者，我想要一份「已证伪 / 维持现状」清单，以便未来审查直接引用、不再重复排查。
2. 作为维护者，我想要 C2 的「move 不写盘是有意语义」决策被记录，以便不会在不知情时破坏跟手语义。

## 实现决策

- **C2（浮层位置，维持现状）**：`overlay-position` 的「move 只改内存不写盘、`set` 提交语义（ADR-0006 决策 3）」是**有意设计**，工厂 `set` 一律写盘会破坏它——不套工厂。未来若收口，只抽「容错读写」层并保留 move/set 双语义，且必须先读过 `overlay-position.ts` 全文再评估。
- **C3（client 设置壳，维持现状）**：S8 结论不变——`overlay-settings` / `skin` 是深模块的薄壳，属健康形态。观察触发条件：新增第 3+ 个 client 设置项时再评估声明式表。
- **X1（getSnapshot 引用不稳定，证伪）**：三处 store 均有快照引用缓存（runtime / state-machine / playback-cursor），`CharacterOverlay` 三处 `useSyncExternalStore` 稳定。不要再做「引用稳定化」优化。
- **X2（多 store 各自 setState，证伪）**：均走 `useSyncExternalStore.subscribe` + React 18 自动批处理。不要再做「合并 store」优化。
- **X3（feDisplacementMap 重绘，证伪）**：`fx.css` 的 `feTurbulence` 是静态 mask，无 DisplacementMap、零热循环。不要再做「SVG filter 优化」。

## 测试决策

- 本 PRD 为记录性质，无新增测试。
- 验收 = 本清单与 memorial 017 结论一致、来源可回溯（`sub-task/001.md`、`sub-task/002.md`、archived `index.html`）。

## 超出范围

- 其余 18 个候选点见 18/19/20/21 号 PRD。
- 边界 bug / 竞态专项审计（本次未覆盖）—— 建议后续单独开票。

## 补充说明

- 若未来某证伪项的条件变化（如升级 React 版本改变批处理语义），先重测再推翻本登记，并在此追加反证修正。

