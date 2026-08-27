# 04 — 现有表情活化

**Status:** resolved

**Blocked by:** 02

**构建内容：** 现有 6 个中间态表情素材（微笑/捂嘴/点头/皱眉/托腮/托脸）不再吃灰：permission 场景角色经点头（nod-smile）或皱眉（frown-wave）过渡，情绪贴合授权语境；空闲时角色每 30–60 秒随机做一个现有小表情（「idle→表情→idle」），播完自然回到空闲，角色更生动。全程零新增素材。

**验收标准：**

- [ ] permission 进场经 nod-smile/frown-wave 表情过渡（复用现有 4 边素材）
- [ ] idle 随机点缀调度器：空闲时每 30–60 秒随机一次「idle→表情→idle」（现有 6 表情池），播完回 idle
- [ ] 点缀不打断进行中的会话状态切换（切换时取消/跳过点缀）
- [ ] 点缀调度为纯逻辑（可注入时钟测试），不依赖 DOM
- [ ] 表情过渡不拦截指针（点缀播放期间可继续拖动/点击）
- [ ] `prefers-reduced-motion` 下关闭全部点缀动画
- [ ] 纯逻辑测试覆盖：permission 情绪化路径、点缀触发/跳过/时钟驱动
- [ ] 通过 `npm run build` 与 `npm run verify`

## 评论

（来源：PRD 实现决策 7；ADR-0009 决策 1。）

### 关闭记录（2026-08-27 状态回填）

本票按方案演进关闭（feature 10 四态收敛，commit ed0a0dd / a246967，ADR-0016 明文退役 6 个中间态表情）：

- 「idle 随机点缀（6 表情池 / 30–60s）」作废——中间态表情不再是状态机端点；
- permission 情绪化诉求保留为权限反馈表演：批准链 nod-smile→working、拒绝链 frown-wave→idle（diffTarget pending 下降沿启发式，session-follow.ts），语义等价；
- 低频生动化诉求由摸鱼彩蛋池承接（EASTER_EGG_POOL = happy/angry/surprised，ADR-0010 D3）；
- reduced-motion 关动效、动画不拦截指针两原则在四态体系全局成立。

行为承诺由现行 tests/client/overlay-session-runtime.test.ts 与 display-arbiter.test.ts 覆盖；2026-08-27 复验全量 447 用例绿。
