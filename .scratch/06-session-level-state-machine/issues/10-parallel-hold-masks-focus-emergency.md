# 10 — 并行驻留全程遮蔽焦点会话自身的紧急态

**Status:** ready-for-agent

**Blocked by:** 02

**构建内容：** `computeSnapshot` 的显示仲裁顺序为「紧急抢焦（跳过焦点会话）→ poke → 并行驻留 → 焦点跟随」。`findEmergencySessionId` 明确跳过焦点会话，注释假设「焦点会话的 emergency 已由 focus SM 呈现」——但该假设被第 3 步并行驻留打破：≥2 会话 running 时，**焦点会话自身**进入 permission/error 会被并行驻留的 working 画面**全程覆盖**（整个审批等待期显示「遵命，吾这就去办」，紧急画面完全不可见）。

**期望语义**：焦点会话自身的紧急态优先级高于并行驻留（紧急事件必须可见；ADR-0010 D1 与 ADR-0010 D2 冲突时紧急胜出）。非焦点会话的紧急抢焦（第 1 步）已正常，不动。

**验收标准：**

- [ ] ≥2 会话 running 且焦点会话进入 permission → 浮层显示 permission（而非 working）
- [ ] ≥2 会话 running 且焦点会话进入 error → 浮层显示 error
- [ ] 紧急态消退后恢复并行驻留 working 呈现（交还语义不变）
- [ ] 非焦点会话紧急抢焦既有行为不回退
- [ ] 纯逻辑测试覆盖：双会话 running × 焦点会话 pending 上升/下降沿
- [ ] 通过 `npm run build` 与 `npm run verify`

## 评论

（来源：2026-08 grill 会话「审批动画延迟」排查中发现的同族遮蔽路径；本次用户实测为单会话未触发，属潜伏缺陷。）
