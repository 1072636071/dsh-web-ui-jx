# 四态状态机核心重构（广泛重构工单）

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 角色浮层状态空间收敛为四循环态——助手跑工具/思考/输出时统一呈现「工作中」，请求权限/出错立即硬切，空闲回待机。细分工作态（thinking/reading/replying 作为独立状态）与 6 中间态表情整体退役。本工单不含表演序列与 working 轮换（工单 03），交付后端到端行为：事件驱动四态切换正确、防抖/彩蛋/poke/并行驻留不回退、全量测试绿。

**验收标准：**

- [ ] 循环态类型收敛为 idle/working/permission/error 四态；中间态表情类型移除
- [ ] 过渡边表收敛为 20 边（idle↔thinking/reading/permission/error/done/welcome/surprised/happy/angry + permission→nod-smile、nod-smile→idle、permission→frown-wave、frown-wave→idle）；弃用边查询返回 false
- [ ] 事件差分推导重写：error/pending 上升沿硬切；运行中统一映射 working；running 下降沿 → done 目标；全静 → idle；thinking→reading 8s 阈值推导废弃
- [ ] 防抖保留但对象改为 working 进入/回落（约 2000ms）；permission/error 硬切不防抖
- [ ] 彩蛋池收敛为 happy/angry/surprised；poke 惊吓机制保留；并行驻留仍显示 working
- [ ] 宿主事件适配器方法收敛为五目标（idle/working/permission/error/done）
- [ ] 变体轮换配置移除 working 池，idle 池（主素材 + 3 变体）行为不变
- [ ] 全量 vitest 绿；`npm run build` 通过

## 评论

- 2026-08-23：广泛重构例外工单——循环态类型影响半径覆盖 runtime/UI/测试，无法分批保持绿色，按 to-tickets 扩展-收缩例外集中处理。决策依据：PRD 实现决策 1/3/4/6/11/12；ADR-0016。
