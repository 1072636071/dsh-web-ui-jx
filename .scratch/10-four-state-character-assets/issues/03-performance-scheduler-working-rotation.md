# 一次性表演调度器 + working 思考/看书轮换

**Status:** resolved

**Blocked by:** 01, 02

**构建内容：** 角色有了仪式感与叙事感——回合完成时做收工表演再回待机；浮层首次入场做欢迎表演；批准权限颔首微笑后继续工作、拒绝权限皱眉摆手后回待机；工作中思考与看书动作各播约两整圈后经待机姿态自然交替，长时间工作不单调。所有切换只发生在整圈边界，跨姿态必经过渡段。

**验收标准：**

- [x] 表演类型与循环态在类型层分离；表演边沿触发、播完自动回落基础显示态，不作为切换意图目标
- [x] done 表演：running 下降沿触发，工作态整圈边界切出 → 经 idle 中转 → done 驻留约 3s → 回 idle
- [x] welcome 表演：浮层首次入场触发，驻留约 3s 后回 idle
- [x] 权限反馈双链：pending 下降沿 + 回合继续 → nod-smile 表演（约 2s）后回 working；pending 下降沿 + 回合终止 → frown-wave 表演后回 idle；宿主若有显式拒绝信号优先采用（实现期验证并记录结论）
- [x] working 显示层轮换：thinking/reading 各播 2 整圈（整圈时长以 webp 时长解析为准）→ 整圈边界切出 → 经 idle 中转过渡 → 随机抽下一段（不连续重复，随机源可注入）；事件打断时等当前整圈播完再切出
- [x] 全部表演/轮换定时器按过渡段实测时长排程；TRANSITION_EDGE_MS 表按 20 边新素材集全量重测（复测脚本更新）
- [x] 表演被 permission/error 硬切打断时立即让位（紧急态原则）；poke/彩蛋与表演互斥规则明确并测试
- [x] 循环自然三原则测试覆盖：整圈边界切出、过渡段衔接、无硬切
- [x] 全量 vitest 绿


- 2026-08-23：决策依据 PRD 实现决策 2/5/7/8；ADR-0016 循环自然三原则。定时器排程沿用 memorial 006/007 实测时长模式（驻留从目标态可见后起算，退场在过渡播完时清除）。

## 评论

- 2026-08-23：决策依据 PRD 实现决策 2/5/7/8；ADR-0016 循环自然三原则。
- 2026-08-23（完成）：runtime 显示层表演调度器（entry→驻留→exit 三相，退场回落目标按当时基础显示态裁决）；done 整圈边界切出（pendingDone 待边界校验，回合重启自动取消收工）；welcome 首次入场自触发（welcomeOnStart 可注入）；权限反馈直达链 permission→nod-smile/frown-wave（不经 idle 中转——idle→kind 为弃用边，实现期修正）；working 轮换 thinking/reading 各播 WORKING_ROTATION_LOOPS=2 整圈、整圈边界换段、经 idle 中转、不连续重复；TRANSITION_EDGE_MS 按素材重组后 22 边全量复测（measure_all_durations.mjs：6×766 / 10×3484 / 6×5494）；定时器一律按实际入场计划前缀排程（修复 idle 源姿态时 idle-idle 边命中回退值的缺陷）。事件打断语义实现期裁决并记录于模块头注释：permission/error 立即硬切让位优先于整圈边界措辞（工单 06「紧急态硬切即时」）；poke 与表演互斥。循环自然三原则测试覆盖（整圈边界切出/过渡衔接/currentState 恒 working）。- 2026-08-23（实现期裁决）：PRD 决策 5「进入 working 时经 idle→thinking 过渡起播」放宽为首段素材随机抽取（thinking/reading 等概率、随机源可注入）——与段间「随机不重复」同构，避免每次进入工作都从 thinking 起播的模式化观感；换段仍严格不连续重复。- 2026-08-23（实现期验证结论）：宿主显式拒绝信号——核查 `@deepseek-ai/dsh-client-runtime` 会话快照可用字段（running / pending / runningCallsCount / hasVisibleChunk / promptError 等），无「权限被显式拒绝」的专用信号字段；批准/拒绝维持 pending 下降沿 + running 是否继续的启发式（session-follow.ts 注释已同步）。若上游未来提供 denied 字段，在 diffTarget 规则 3 前插入优先分支即可。
