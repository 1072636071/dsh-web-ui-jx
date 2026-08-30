# warp onFrame 死代码语义二选一

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** warp 特效行为与文档一致——要么「停下 400ms 淡出」真正生效（接上 rAF），要么明确「无淡出」并删除 `visible` 守卫、同步更新文档与测试。不留「代码写了但没接」的状态。

**验收标准：**

- [x] 二选一落地：选 **② 明确「无淡出」**——删除 `onFrame` 与 fadePhase 死代码/淡出状态机，`visible` 保留为「已接合」门控（首次移动后恒真），文档同步改「粒子/涟漪自带 520ms/720ms 淡出动画、无控制器级停止淡出」
- [x] `warp-controller.test.ts` 对齐所选语义（删除全部 onFrame/fadePhase 用例，新增「无淡出」恒真断言与 dwellMs/fadeMs 不再影响显示断言）
- [x] `prefers-reduced-motion` 下行为正确（控制器 disabled 门控 + fx.css 媒体查询 + fx/index 全关，三层不变）
- [x] 全量测试全绿（36 文件 578 项）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮复审标准/spec 双维度零发现项；PRD U2 措辞已与实现统一（保留 `visible` 接合门控说明）；工单置 `done`，随 M2 里程碑提交。
- 2026-08-30（审查修复）：按 `/jxx-code-review` 发现项①清理死配置——`WarpConfig`（radius/dwellMs/fadeMs/scale）与 `getConfig()` 全仓无消费点（4 字段全死：dwellMs/fadeMs 随 19-03 无淡出失效，radius/scale 早已无人读），属 Speculative Generality，整体删除；`createWarpController` 收敛为仅接收设备能力；测试同步移除 getConfig/DEFAULT_CONFIG 用例。warp 相关测试 12 项全绿。
- 2026-08-30（实现）：选 ②「明确无淡出」。理由：warp.ts 无持久核心元素，`fadePhase` 原本要驱动的对象已不存在，粒子/涟漪自带淡出动画（520ms/720ms）已实现「停下即隐」的视觉结果；接 rAF 只会引入常驻帧循环而无对象可驱动，且点击反馈本应与移动状态无关。改动：`warp-controller.ts` 删 `onFrame`/`fadePhase`/时间戳参数，`visible` 语义定为「已接合」（首次移动后恒真），保留 coarse/reduced-motion 降级；`warp.ts` 头部文档改「无淡出」；`DESIGN.md` §5 warp 行同步为粒子+涟漪现状实现；`docs/codebase-design.md` warp-controller 接缝描述同步。测试重写并更新 12 项全绿。
- 来源：PRD 19 候选 U2；证据见 memorial 017 archived `index.html`（warp-controller.ts:53 声明、:90-101 实现、全 src 无调用点；warp.ts:157/186/221/233 守卫恒真）。
- 附带事实：当前因未接 rAF 而**没有**常驻帧循环——选①会引入常驻开销，需权衡。
