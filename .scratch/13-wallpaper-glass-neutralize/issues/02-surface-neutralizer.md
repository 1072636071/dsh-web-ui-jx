# 表面探测器 + 中和规则（方案 A）

**Status:** resolved

**Blocked by:** 01

**构建内容：** 开启壁纸时，全域表面探测器扫描 body，凡「高度 ≥ 视口 90% 且底非透明且非 modal/plugin/自营层（zIndex≤100）」的表面（如 app 根/对话根）被判定为「盖住壁纸的表面」，打上 `data-jx-backdrop-surface` 标记；在 `body[data-jx-wallpaper-active]` 作用域内，`background{transparent!important; background-image:none!important}` 把这些不透明的底抹透明，壁纸从 app 根后露出来；配 `surfaceObserver`（body subtree MutationObserver）在导航重建后增量重新打标/清标。端到端：壁纸不再被整个 APP 的不透明底盖住。

**验收标准：**

- [ ] 探测器能正确识别「≥90% 视口 + 非透明底 + 非 modal/plugin」的表面并打 `data-jx-backdrop-surface` 标记
- [ ] 激活作用域内被标记表面的底面被中和为透明，app 根不再盖住壁纸
- [ ] 导航/切会话重建后 `surfaceObserver` 对新表面重新打标、对移除表面清标
- [ ] 不污染未激活状态：皮肤/插件样式在壁纸未激活时不受影响

## 评论

### 实施记录（回填于 2026-08-27；实施提交 f92da4a，ADR-0027）

- [x] 表面判定：`fillsViewport ≥ 0.9`（`MIN_VIEWPORT_SURFACE_HEIGHT = 0.9`，取 documentElement 高度）+ 非透明底（background 有可见色/图）+ 非 excluded（modal/plugin 容器、zIndex > 100 自营层）—— `welcome-backdrop.ts`
- [x] 命中表面打 `data-jx-backdrop-surface`（`SURFACE_ATTR`）；中和规则在 `body[data-jx-wallpaper-active]` 作用域内 `background: transparent!important; background-image: none!important`
- [x] `surfaceObserver`（body subtree MutationObserver）：导航重建后对新子树增量重标、移除即清标；dispose/清扫时停观察
- [x] 未激活不污染：全部规则 gate 在 `data-jx-wallpaper-active` 作用域，卸层即随标记消失；未命中 surface 判定的元素一律不打标
- [x] 2026-08-27 复验：build ✓、typecheck ✓、welcome-backdrop.test.ts 27 例全绿