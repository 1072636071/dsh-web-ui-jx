# 21-capability-test-coverage — 地图

> 来源：memorial 017 → PRD 21-capability-test-coverage（to-spec）→ 拆单（to-tickets）。

## 目标

能力落地与测试补强：实施 ADR-0014 审批等待启发式（01）、SettingsCard 开关接线测试（02）、拖拽手势关键路径测试（03）。

## 阻塞图

全部工单无阻塞。

```
01 ADR-0014 blockedSince（无阻塞）
02 SettingsCard 测试（无阻塞）
03 拖拽手势测试（无阻塞）
```

## 已做决策

- 01 复用既有注入 `now()`/`tick()` seam，零新定时器；pending 上升沿快路径保留（互补非替代）。
- 02/03 仿既有渲染/手势测试模式（`session-bubble-list.test.ts`、`bubble-drag-handle.test.ts`），不引入新 seam。
- 与 ADR-0016 互补：彼管「何时能看见」，此管「何时进入 permission」。
