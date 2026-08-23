# 浮层状态机与 10 态切换

**Status:** resolved

**Blocked by:** 04

**构建内容：** 用户能通过状态切换钮让角色在 idle/thinking/reading/replying/working/error/welcome/done/permission/listening 共 10 态间切换；切换时播放对应过渡动画（transition-*），过渡只播一次后自然落入目标循环态，不生硬跳变。

**验收标准：**

- [ ] 状态机模块统一驱动状态切换（10 循环态节点 + 36 过渡边）；UI 与宿主事件只发意图，不直接操作 DOM 切换
- [ ] 10 循环态互通；每对状态切换经对应过渡段
- [ ] 过渡段播放一次后落入目标循环态；循环段持续循环
- [ ] 仅状态切换钮可点（浮层其余部分 `pointer-events: none`）
- [ ] 状态机测试（seam 2）：输入意图断言输出（当前态、过渡序列、落入的循环态），覆盖 10 态互通与过渡只播一次约束
- [ ] 预留宿主事件接入口（助手行为 → 状态意图），本工单只留接口不接事件源

## 评论

- 回写（2026-08-23）：清点核实已实施——`overlay-state-machine.ts` 状态机驱动过渡播放（其 extractCore/diffTarget 后被会话级 runtime 复用吸收）。状态由 ready-for-agent 补记为 resolved。
