# 涟漪移除强制同步布局

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 点击时不再触发强制 reflow——移除 `void el.offsetWidth`，改用 `el.getAnimations().forEach(a => a.cancel())` + `anim.play()` 重放，或在 rAF 内重置。

**验收标准：**

- [x] `warp.ts` 无 `void el.offsetWidth` 之类的强制同步布局
- [x] 涟漪动画视觉与现状一致（WAAPI 关键帧逐值对齐原 CSS `@keyframes jx-warp-ripple`：720ms、cubic-bezier(0.16,1,0.3,1)、from opacity .5/scale .15 → to opacity 0/scale 1.05；像素与动画曲线一致）
- [x] 全量测试全绿（36 文件 578 项）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮复审标准/spec 双维度零发现项；工单置 `done`，随 M2 里程碑提交。
- 2026-08-30（实现）：`spawnRipple` 改 Web Animations API——`el.animate(RIPPLE_KEYFRAMES, RIPPLE_OPTIONS)` 替代 CSS `animation` 重置重触发（旧路径 `el.style.animation="none"; void el.offsetWidth; el.style.animation=""` 每次 pointerdown 一次强制 reflow）；`getAnimations().forEach(cancel)` + 动画结束移除回池（与 trail 粒子同构）。`fx.css` 移除涟漪的 CSS `animation` 与死掉的 `@keyframes jx-warp-ripple`，只留静态外观。
- 来源：PRD 19 候选 M5；证据见 memorial 017 archived `index.html`（warp.ts:190-193）。
