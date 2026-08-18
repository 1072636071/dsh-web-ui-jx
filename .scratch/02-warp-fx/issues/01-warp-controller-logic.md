# warp 纯逻辑控制器 + 单元测试

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** warp 生命周期控制器的纯逻辑（移动→显示跟手、停下→淡出→隐藏、rAF coalesce、pointer:coarse/reduced-motion 降级）以纯函数形式实现，配 vitest node 环境单元测试（复用 `tests/client/state-machine.test.ts` 同款 seam），测试全绿。此切片不依赖 DOM，控制器可独立验证。

**验收标准：**

- [ ] 控制器纯函数实现：输入 pointermove 事件序列 + 当前时间戳 + 设备能力（`pointer: coarse` / `prefers-reduced-motion`），输出元素目标状态 `{ visible, x, y, fadePhase }`
- [ ] 移动事件 → `visible=true` 且 `(x,y)` 跟手等于事件坐标
- [ ] 停下累计 ≤ 400ms → `visible=true`；> 400ms → 进入淡出 → `visible=false`
- [ ] rAF coalesce：一帧内多次 move，控制器只取最后位置
- [ ] `pointer: coarse` → 永不 `visible=true`
- [ ] `prefers-reduced-motion: reduce` → 永不 `visible=true`
- [ ] 半径/强度参数从 CSS 自定义属性读取后传入控制器生效
- [ ] 控制器创建/销毁幂等：重复创建安全、销毁后无悬挂引用
- [ ] vitest node 环境单元测试全绿，不依赖 DOM/React
- [ ] 测试先例对齐 `tests/client/state-machine.test.ts`（纯逻辑、输入意图断言输出快照、node 环境）
- [ ] `npm run build` 通过

## 评论

来源：`.scratch/02-warp-fx/PRD.md`（测试决策：复用 Seam 2 模式）+ ADR-0005。
此工单把可测逻辑先落地，DOM 副作用留待工单 02 接线。
