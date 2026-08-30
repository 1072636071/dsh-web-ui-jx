# 特效与壁纸性能：布局风暴 / 毛玻璃 / warp 语义

Status: ready-for-agent

## 问题陈述

欢迎壁纸层用 `MutationObserver` 全子树监听，回调对每个新增节点做逐元素 `getBoundingClientRect` + `getComputedStyle` + 长选择器 `closest`，无防抖、无 rAF 批处理，构成流式输出场景下的强制同步布局风暴；毛玻璃 `backdrop-filter: blur(10px)` 大面积覆盖宿主高频重绘元素；warp 特效的 `visible` 守卫因 `onFrame` 死代码而恒真——模块承诺的「停下淡出」实际失效，且每次 `pointerdown` 触发一次强制 reflow；fall 飘落叶子的 CSS `drop-shadow` 可能阻碍纯合成层路径。

## 解决方案

壁纸打标改 rAF 合并 + 廉价前置过滤 + 收窄观察范围；毛玻璃矩阵收窄或对高频重绘元素降级为纯 alpha；warp 的 `onFrame` 二选一了结（接上 rAF 或删守卫并改文档），并取消强制 reflow；fall 阴影经实测后烘进 SVG 素材。

## 用户故事

1. 作为用户，我想要流式输出时壁纸打标不拖慢主线程，以便长对话保持流畅。
2. 作为用户，我想要毛玻璃只作用于必要区域，以便滚动与重绘更快。
3. 作为维护者，我想要 warp 特效行为与文档一致（要么真正淡出、要么明确无淡出），以便不被死代码误导、不重复排查。
4. 作为用户，我想要点击时不触发强制同步布局，以便交互保持 60fps。

## 实现决策

- **H1（壁纸 MutationObserver）**：`handleSurfaceMutations` 改 `requestAnimationFrame` 合并 + 微批去重；`isWallpaperSurface` 先用 `offsetHeight`/`clientHeight` 廉价前置过滤，只对通过者做 rect + computedStyle；观察范围从 `document.body` 收窄到 `#root` 或加 depth/数量上限。不改变中和规则语义，回归 ADR-0024/0027 视觉契约。
- **M2（毛玻璃矩阵）**：先 Profiler 实测成本，再收窄 `GLASS_SURFACE_SELECTORS` 或对高频重绘元素（bubble / code / listbox）降级为纯 alpha。改后重测视觉（ADR-0027 D2/D8）。
- **U2（warp onFrame 二选一）**：① 接上 rAF 恢复「停下淡出」语义（代价：引入常驻帧循环）；或 ② 删除 `onFrame` 淡出状态机、明确「无淡出」并同步改文档与测试。二者必择其一，不得保留「写了不接」状态。**2026-08-30 已选定 ②**：`visible` 保留为「已接合」门控（首次移动后恒真，承担 coarse/reduced-motion 降级拦截与首次移动前不产粒子的职责，非死代码），`WarpConfig` 全字段无消费点故一并移除。
- **M5（涟漪强制布局）**：取消 `void el.offsetWidth`，改用 `el.getAnimations().forEach(a => a.cancel())` + `anim.play()` 重放，或 rAF 内重置。
- **L2（fall drop-shadow）**：实测滤镜与 WAAPI 动画叠加的栅格化成本；若成立，把阴影烘进现有 SVG data-uri 素材，去掉 CSS filter。

## 测试决策

- 复用既有 seam：`welcome-backdrop.test.ts`（jsdom + MutationObserver）、`warp-controller.test.ts`。
- H1 扩展：rAF 批处理 / 合并去重的断言；观察范围收窄后的中和规则行为回归。
- U2 对齐：若选「删守卫」，同步更新 `warp-controller.test.ts` 与相关文档；若选「接 rAF」，补常驻帧循环的可见性断言（reduced-motion 下不启动）。
- M5 / L2：行为不变优化，回归为主。
- 视觉回归（H1/M2）：手工 + 截图对比，覆盖暗/亮两主题。

## 超出范围

- C1 / H3 / H4 / H2 / M1 / M3 / M4 / L3 / L4 / U1 / U3 / U4 —— 见 18/20/21 号 PRD。

## 补充说明

- 证据见 memorial 017 archived `index.html`（H1 / M2 / U2 / M5 / L2 卡片）。
- H1 与 M2 都触及壁纸视觉契约（ADR-0024/0027），建议同一迭代内实施并统一回归。

