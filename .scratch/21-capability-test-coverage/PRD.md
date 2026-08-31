# 能力落地与测试补强：ADR-0014 / SettingsCard / 拖拽

Status: resolved

## 问题陈述

ADR-0014（审批等待时间启发式：每会话记 `blockedSince`，卡住 ≥10s 进 permission、≥30s 升级 angry）决策已定但代码零落地——permission 只能靠 `snapshot.pending` 上升沿的即时快路径进入，没有时间兜底；同时 `src/client/components/` 的 UI 组件层**零单测**，承载全部设置开关接线的 `SettingsCard`、承载 zip 导入与路径安全 UI 的 `ImportPanel`/`AssetList` 属高风险 - 零覆盖；而拖拽（移除气泡的唯一手势）的测试仅 1.83 KB，覆盖偏薄。

## 解决方案

按 ADR-0014 原文实施 `blockedSince` 时间兜底，复用既有注入 `now()`/`tick` 时间接缝，零新定时器；补 `SettingsCard` 开关接线的 jsdom 回归测试；补拖拽手势关键路径测试。

## 用户故事

1. 作为用户，我想要审批等待超过 10s 时角色可靠地进入 permission 表达、超过 30s 升级为 angry，以便等待反馈不依赖偶然的 pending 上升沿。
2. 作为维护者，我想要 `SettingsCard` 的开关接线有回归测试，以便改动设置逻辑不怕破坏。
3. 作为维护者，我想要拖拽手势的关键路径有测试，以便唯一移除手势可安全演进。

## 实现决策

- **U1（实施 ADR-0014）**：每会话记 `blockedSince`，`tick()` 扫描各 deadline 到期判定（复用 runtime 既有注入 `now()` + `tick()` seam，不新增真实定时器）；目标/运行状态变化即清零；`snapshot.pending` 上升沿的即时快路径**保留**（与时间兜底互补而非替代）；阈值沿用 ADR-0014（10s / 30s）。
- **U3（SettingsCard 测试）**：补 jsdom 渲染测试——各开关读写 / 订阅通知 / 重置入口 / 角色 section 项；仿 `session-bubble-list.test.ts` 的渲染模式。
- **U4（拖拽测试补强）**：`bubble-drag-handle` 补：8px 进臂态判定、禁止态不进臂、落点解析（收起区/归档区）、合成 click 吞除、归档失败静默。

## 测试决策

- 复用既有 seam：`overlay-session-runtime.test.ts` 的注入 `now`/`tick` seam（U1 全部时间推进靠它驱动，无需 `vi.useFakeTimers`）；组件渲染仿 `session-bubble-list.test.ts`。
- 好的测试 = 只测外部行为（状态切换、DOM 投影、手势判定），不测实现细节。
- 新增测试文件是既有模式的扩展，非新 seam。
- 先例：`tests/client/overlay-session-runtime.test.ts`、`tests/client/state-machine.test.ts`、`packages/.../__tests__/session-bubble-list.test.ts`。

## 超出范围

- C1 / H3 / H4 / H1 / M2 / U2 / M5 / L2 / H2 / M1 / M3 / M4 / L3 / L4 —— 见 18/19/20 号 PRD。
- C2 / C3 / X1 / X2 / X3（维持现状与已证伪）—— 见 22 号 PRD。

## 补充说明

- 证据见 memorial 017 archived `index.html`（U1 / U3 / U4 卡片）。
- U1 与既有 ADR-0016「UI 侧门槛」互补：彼管「何时能看见」，此管「何时进入 permission」。

