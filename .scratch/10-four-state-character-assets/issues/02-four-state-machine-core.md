# 四态状态机核心重构（广泛重构工单）

**Status:** resolved

**Blocked by:** 01

**构建内容：** 角色浮层状态空间收敛为四循环态——助手跑工具/思考/输出时统一呈现「工作中」，请求权限/出错立即硬切，空闲回待机。细分工作态（thinking/reading/replying 作为独立状态）与 6 中间态表情整体退役。本工单不含表演序列与 working 轮换（工单 03），交付后端到端行为：事件驱动四态切换正确、防抖/彩蛋/poke/并行驻留不回退、全量测试绿。

**验收标准：**

- [x] 循环态类型收敛为 idle/working/permission/error 四态；中间态表情类型移除
- [x] 过渡边表收敛为 20 边（idle↔thinking/reading/permission/error/done/welcome/surprised/happy/angry + permission→nod-smile、nod-smile→idle、permission→frown-wave、frown-wave→idle）；弃用边查询返回 false
- [x] 事件差分推导重写：error/pending 上升沿硬切；运行中统一映射 working；running 下降沿 → done 目标；全静 → idle；thinking→reading 8s 阈值推导废弃
- [x] 防抖保留但对象改为 working 进入/回落（约 2000ms）；permission/error 硬切不防抖
- [x] 彩蛋池收敛为 happy/angry/surprised；poke 惊吓机制保留；并行驻留仍显示 working
- [x] 宿主事件适配器方法收敛为五目标（idle/working/permission/error/done）
- [x] 变体轮换配置移除 working 池，idle 池（主素材 + 3 变体）行为不变
- [x] 全量 vitest 绿；`npm run build` 通过


- 2026-08-23：广泛重构例外工单——循环态类型影响半径覆盖 runtime/UI/测试，无法分批保持绿色，按 to-tickets 扩展-收缩例外集中处理。决策依据：PRD 实现决策 1/3/4/6/11/12；ADR-0016。

## 评论

- 2026-08-23：决策依据 PRD 实现决策 1/3/4/6/11/12；ADR-0016。
- 2026-08-23（完成）：overlay-state-machine.ts 四态 + 表演类型分离 + 22 有向边（PRD「20 边」有向展开）+ 弃用边查询返回 false；session-follow.ts diffTarget 重写为 DiffOutcome（switch/perform），补充 error 下降沿恢复规则（实现期发现：错误清偿后角色会卡 error）；HostEventAdapter 收敛五目标；variant-rotation.ts 移除 working 池；overlay-session-runtime.ts 重写为显示层管线（紧急态 > poke > 表演 > 彩蛋 > 工作轮换 > 基础显示），防抖收敛为 working 进入约 2000ms 且记录归属会话（紧急抢焦期间不错发）；全量 vitest 绿（263 测试）、build+verify 21 项绿。- 2026-08-23（实现期裁决）：「working 回落防抖约 2000ms」由 done 表演整圈边界切出机制等价承担——焦点会话处于 working（已落态）时回合结束必经 running 下降沿 → done 表演待整圈边界（≥0 圈且边界校验 pendingTarget，回合重启自动取消），天然提供 ≥2s 级确认窗口；裸 switch-idle 仅出现在亚防抖幻影回合（working 从未落态，SM 本就为 idle）与非焦点会话，直落无抖动可见。故不再对 idle 目标叠加独立防抖定时器。
