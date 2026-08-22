# 01 — 播放游标纯逻辑模块与回归用例

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 落地本特性唯一新 seam：一个「计划进 → 可见项出」的播放游标纯逻辑模块（接口形状见 PRD 实现决策）。交付后即可独立验证缺陷核心行为：同内容的计划更新不再打断过渡链，permission 入场动画在事件风暴下也能完整播完。用户暂不可见，但行为被测试锁死。

**验收标准：**

- [ ] 模块仅暴露三能力：接收新计划、时钟推进、读当前可见项；无 DOM、无 React 依赖，node 环境可测
- [ ] 结构等价门槛边界全覆盖：同内容不同引用 ⇒ 同一计划沿用进度；长度变化 ⇒ 归零；任一项身份（kind/url）变化 ⇒ 归零；空计划不异常
- [ ] 回归主场景（自 prototype 固化）：每秒一次同内容计划更新持续 30s，permission 两段入场链仍按素材真实时长走完、落到 permission 循环态
- [ ] 对照场景：零重复更新时两段过渡各约 3.5s 推进，约 7s 落到 permission 循环态
- [ ] 批准退场场景：计划内容变化后从新计划首段重新推进
- [ ] 变体轮换语义兼容：轮换推进（url 变化）正常触发归零，循环态驻留不受影响
- [ ] vitest 全绿；`npm run build` 与 `npm run verify` 通过

## 评论

2026-08 实施：模块落地于 state-machine 目录（`playback-cursor.ts`，导出 `createPlaybackCursor` / `playbackPlansEqual`），推进由游标内部 setTimeout 排程（对齐 variant-rotation 先例；PRD 草图中的 `tick(nowMs)` 收敛为内部调度，对外保留 onPlan/resolveDuration/getSnapshot/subscribe/dispose）。新增 `playbackPlanEquals` 纯函数直测边界 + 8 组行为用例（30s 帧滴漏回归主场景、零事件对照、退场重播、兜底先行真时替换、缓存生效、失败回退、空计划、订阅语义）——11/11 绿；typecheck/build/verify 通过。prototype 仿真脚本使命完成，弃置。

prototype 来源：设计会话仿真脚本（`.temp/scripts/` 下可见项推进仿真与时序仿真，临时目录不入库）；固化后临时脚本弃置。决策依据：ADR-0016 决策 D1；规格：`.scratch/08-permission-anim-visible/PRD.md`。
