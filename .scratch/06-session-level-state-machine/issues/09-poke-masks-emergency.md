# 09 — poke 序列遮蔽紧急态约 8 秒

**Status:** ready-for-agent

**Blocked by:** 02

**构建内容：** 焦点会话处于 poke 惊吓序列（驻留 3s + 回落 5s，最长约 8s）期间，若该会话进入 permission/error，`computeSnapshot` 的显示仲裁顺序（紧急抢焦只查**非焦点**会话 → poke → 并行驻留 → 焦点跟随）会让 poke 分支持续覆盖紧急态画面；`reconcileFocus` 只在**非焦点**会话存在紧急态时才 `cancelPoke`。结果：紧急事件最多被压约 8 秒才可见。

**期望语义（ADR-0010 D1「permission/error 恒硬切」的延伸）**：紧急态应打断进行中的 poke 序列（含回落段），立即呈现紧急画面；poke 打断不做回落补偿（紧急优先，与彩蛋被打断的处理对齐）。

**验收标准：**

- [ ] poke 播放/回落期间焦点会话进入 permission 或 error → 显示立即切到紧急态（poke 状态与计时器清空）
- [ ] 非焦点会话紧急抢焦打断 poke 的既有行为（ADR-0011 D7）保持不回退
- [ ] 纯逻辑测试覆盖：poke×permission 交叠时序、poke 回落段被打断
- [ ] 通过 `npm run build` 与 `npm run verify`

## 评论

（来源：2026-08 grill 会话「审批动画延迟」排查中发现的同族遮蔽路径；仿真场景 B 量化遮蔽 ≈ 8000ms。）

2026-08-23 实施：`findEmergencySessionId` 不再跳过焦点会话——焦点会话自身的 permission/error 同样走紧急分支，poke 播放与回落段由 `reconcileFocus` 立即取消。回归测试：工单 09/10 describe ×4 用例（入场期打断、回落期打断、permission/error 各一）。附带修复：poke 定时器改按过渡段实测时长排程（入场过渡播完才开始 3s 惊吓驻留、回落过渡播完才交还），消除「惊吓循环从未完整展示」的截断缺陷（见 runtime 头注「显示层序列真实时长对齐」）。
