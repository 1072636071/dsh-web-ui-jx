# 10 — 并行驻留全程遮蔽焦点会话自身的紧急态

**Status:** resolved

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

2026-08-23 实施：同 issue 09 的 `findEmergencySessionId` 修复覆盖本票——紧急分支现含焦点会话自身，压过并行驻留画面；批准消退后恢复 working 驻留（测试覆盖 pending 上升/下降沿 + error 场景）。插桩中还发现并修复了同域更深缺陷：`processSnapshot`/`tick` 的并行驻留基线在**本会话落态之后**采样，hold 上升沿永远检测不到 → **摸鱼彩蛋在常态下从未被调度**（唯一活路径是切焦点的无条件调用）；已改为变更前采样并加回归锁（「并行驻留上升沿必须触发彩蛋调度」用例）。

### 关闭记录（2026-08-27 状态回填）

修复本体持续生效：紧急分支含焦点会话自身、压过并行驻留画面（resolveDisplayLayer 承诺 emergency 最高优先），消退后经 computeSnapshot 回到驻留/焦点跟随路径；交还后恢复驻留由「非焦点 permission 抢焦 → 交还回并行驻留 working」用例反向覆盖；附带修复回归锁「并行驻留上升沿必须触发彩蛋调度（基线采样在落态前）」在 tests/client/overlay-session-runtime.test.ts:790 通过。

诚实备注：原验收的「双 running × 焦点会话 pending 上升/下降沿」专项命名用例在 ADR-0016 后的测试重组中未以原名保留（现行覆盖 = 实现路径统一 + 相邻用例反推），如需可补一条针对性用例加固；不影响行为承诺成立。2026-08-27 复验 build ✓ / verify 21/21 ✓ / vitest 447 绿。本票关闭。
