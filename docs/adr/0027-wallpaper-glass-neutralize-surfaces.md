# ADR-0027 — 壁纸全层玻璃化 + 不透明表面中和

## 状态

已接受（2026-08 memorial 013 grill 会话「壁纸被严重遮挡」定案；待实施）。

## 背景

ADR-0024 建了整页壁纸层，但忧虑实际观感：**壁纸被整个 APP 挡住，只能看到一点影子**。定位（对齐参考项目 dsh-web-ui 的 `wallpaper.ts`/`backdrop-scene.ts`/`wallpaper-exclusive` 机制）：宿主 app 根/对话根这类**顶层框架面板的底色是 shell 自己写死的不透明白底**，与 jx L2 token 重映射无关——而 ADR-0024 只把 `--jx-surface-*` 做成半透明，**只对「消费 token 的面板」生效**，解决不了「不吃 token 的 app 根」。且当前壁纸层 `z-index:0` 与宿主 app 根可能同层互排，加剧遮挡。

参考项目 dsh-web-ui 证明「壁纸优先」需要三件事：负 z-index 挂底层 + **主动中和不透明表面**（方案 A，关键是全域表面探测器）+ **全浮层毛玻璃让壁纸透出**（方案 B）。jx 缺后两者。

## 决策

**D1 — 不被 token 罩住的不透明表面，用探测器主动中和（方案 A）**：

新增迁集的 `defaultWallpaperSurface` 探测器：扫 `document.body` 全域，凡「`getBoundingClientRect().height ≥ 视口 90%` 且 `backgroundColor` 非透明 且非 modal/plugin/自营层（zIndex≤100）」的元素判定为「会盖住壁纸的表面」，打上 `data-jx-backdrop-surface` 标记。中和规则在 `body[data-jx-wallpaper-active]` 作用域内生效，把 `background{transparent!important; background-image:none!important}` 抹掉。配 `surfaceObserver`（body subtree MutationObserver，导航重建后增量 tag/untag）与层连接感知复挂（`!isConnected` 即 `body.appendChild` 回拼）。

**D2 — 全浮层毛玻璃让壁纸透出（方案 B）、玻璃继承现有 alpha**：

真毛玻璃铺满全插件家族表面（输入卡/气泡/代码块/内联 code/sidebar/dialog/menu/listbox/popper/tooltip/`[data-dsh-plugin="..."]` 各插件面板/底部面板/设置表面）。`backdrop-filter: blur(10px)` 恒定，`background-color` **继承既有 `--jx-panel-*` 区域 alpha**——即不新增滑杆、不盖住 ADR-0025 交付的区域滑杆收益，模糊度固定、透明度随现有滑杆。

**D3 — 壁纸层改负 z-index 做层级分离**：

`media/图=-3`、`veil/压纱=-2`、base 同 -3 兜底，彻底垫于全部宿主内容之下，杜绝与 app 根 `z-index:0` 同层互排。否决保留 `z-index:0` 靠中和兜底——不稳。

**D4 — 性能/降级复用 reduced-motion 惯例，不加新开关**：

`@media (prefers-reduced-motion: reduce)` 下 `backdrop-filter` 全关（回纯 alpha + 压纱兜底），对齐 jx DESIGN §6 既有「全关」惯例与 `fx.css` 先例。不做独立低性能开关。

**D5 — 双端标记 gate，可重入清扫沿用**：

壁纸层常驻挂载时在 `document.body` + `documentElement` 写 `data-jx-wallpaper-active`；皮肤关/背景关卸层时清除标记 + 摘 `surfaceObserver` + 清 `--jx-panel-*`（沿用 ADR-0017 可重入约束 + `sweepResidualBackdrops` 兜底先例）。中和规则只在标记作用域内生效，皮肤/插件样式不受影响。否决固定 glass token 盖住现有滑杆与新增独立玻璃滑杆两案。

## 后果

- 壁纸在整幅 UI 背后持续可见：不透明表面被中和（露出）+ 浮层毛玻璃（透出）。
- 引入 `backdrop-filter` 大片模糊：有合成/渲染成本，低端机靠 reduced-motion 降级；总开关一键关即回纯色。
- 覆盖矩阵依赖宿主 DOM 语义锚点，实施期若某面板类名/属性变化不命中，按参考项目 `patches.css` 稳定后缀兜底回填选择器。
- 影响范围：仅「壁纸被挡」的解决，不扩 L2 token 体系（不新增可玻璃化维度；玻璃直接消费既有区域 alpha）。
- 参考项目 dsh-web-ui 的机制为只读参照，不复用其任何包（对齐 ADR-0001）。