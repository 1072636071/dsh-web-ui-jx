# PRD — 壁纸全层玻璃化 + 不透明表面中和

- Feature: `13-wallpaper-glass-neutralize`
- Status: `ready-for-agent`
- Source: memorial 013 `docs/memorial/013-wallpaper-obscured-research/`（决策 D1–D10）+ ADR-0027

## 问题陈述

开启欢迎背景后，姜晓欢迎壁纸被整个 APP 挡住，只能看到一点影子。根因是宿主 app 根/对话根这类**顶层框架面板的底色是 shell 自己写死的不透明白底**，与 jx 的 L2 token 重映射无关——而现有机制（ADR-0024）只把 `--jx-surface-*` 做成半透明，仅对「消费 token 的面板」生效，罩不住「不吃 token 的 app 根」。叠加当前壁纸层 `z-index:0` 与宿主 app 根同层互排，进一步加剧遮挡。

参考项目 dsh-web-ui 证明「壁纸优先」需要三件事：负 z-index 挂底层 + 主动中和不透明表面 + 全浮层毛玻璃，jx 缺后两者。

## 解决方案

让壁纸在整幅 UI 背后**持续可见**，通过两条互补手段：

- **方案 A（中和不透明表面）**：全域表面探测器扫 body，把「≥90% 视口 + 非透明底 + 非 modal/plugin/自营层」的表面打上标记，在壁纸激活作用域内抹透明——app 根不再盖住壁纸。
- **方案 B（全浮层毛玻璃）**：给所有浮层/面板/卡片加固定 `backdrop-filter: blur`，`background-color` 继承现有区域 alpha——壁纸从面板后透出，而非只露在夹缝。

## 用户故事

1. 作为用户，我希望开启欢迎背景后看到完整壁纸（而不是只露影子），以便感受整页背景观感。
2. 作为用户，我希望 app 根/对话根不再用不透明底盖住壁纸，以便壁纸铺满整个视口。
3. 作为用户，我希望输入卡/气泡/代码块/侧栏/各插件面板能透出壁纸，以便壁纸在整幅 UI 背后持续可见。
4. 作为用户，我希望面板透明度仍由我现有的区域滑块控制，以便不丢失已交付的透明度调节能力。
5. 作为用户，我希望关闭欢迎背景时所有壁纸相关的样式与残留层彻底清除，以便回到无壁纸的纯色状态。
6. 作为用户，我希望切换对话/新建会话后壁纸不消失、标记不残留，以便稳定体验。
7. 作为用户，我在「减少动态效果」系统设置下不看到毛玻璃模糊，以便低性能/敏感设备获得降级体验。
8. 作为开发者，我希望不可可重入的工具能安全清理（插件热重载后无残留层/标记/style），以便长驻存活。

## 实现决策

- **D1 — 全域表面探测器 + 中和（方案 A）**：迁移 `defaultWallpaperSurface` 探测器——扫 `document.body` 全域，凡「`getBoundingClientRect().height ≥ 视口 90%` 且 `backgroundColor` 非透明 且非 modal/plugin/自营层（zIndex≤100）」的元素，打 `data-jx-backdrop-surface` 标记。配 `surfaceObserver`（body subtree MutationObserver，导航重建后增量 tag/untag）与层连接感知复挂（`!isConnected` 即 `body.appendChild` 回拼）。
- **D2 — 全浮层毛玻璃继承区域 alpha（方案 B）**：`backdrop-filter: blur(10px)` 恒定，`background-color` 复用既有 `--jx-panel-*` 区域 alpha / `--jx-panel-alpha`。覆盖输入卡/气泡/代码块/内联 code/sidebar/dialog/menu/listbox/popper/tooltip/`[data-dsh-plugin="..."]` 各插件面板/底部面板/设置表面。**不新增滑杆**，不盖住 ADR-0025 区域滑杆收益。
- **D3 — 壁纸层改负 z-index**：`media/图=-3`、`veil/压纱=-2`、base 同 -3 兜底，彻底垫于全部宿主内容之下。
- **D4 — 性能降级复用 reduced-motion**：`@media (prefers-reduced-motion: reduce)` 下 `backdrop-filter` 全关（回纯 alpha + 压纱兜底）。不加独立低性能开关。
- **D5 — 双端标记 gate + 可重入清扫**：壁纸激活时在 `document.body` + `documentElement` 写 `data-jx-wallpaper-active`；卸层时清除标记 + 摘 `surfaceObserver` + 清 `--jx-panel-*`。中和规则只在标记作用域内生效。沿用 `sweepResidualBackdrops` 兜底。

### 模块（seam）

- **`welcome-backdrop.ts`**：D3(负 z-index 样式)、D5(active 标记)、D1(探测器 + `surfaceObserver` + 中和 style 注入)、连接感知复挂。
- **`welcome-backdrop-config.ts`**：不改。玻璃继承现有区域 alpha 的读写。
- **`jianguo.css`**（即 `styles/jiangxiao.css`）：新增 `[data-jx-backdrop]` 负 z-index、`body[data-jx-wallpaper-active] [data-jx-backdrop-surface]` 中和规则、毛玻璃模糊规则、`@media (prefers-reduced-motion)` 降级。
- **`overlay.module.css`**：只读参照（现有 `backdrop-filter: blur(2px)` 先例），不修改。

> 既有数据标记与 TT 对齐：层容器 `data-jx-backdrop`（已存在）；激活标记 `data-jx-wallpaper-active`（新增）；表面标记 `data-jx-backdrop-surface`（新增）。region alpha 变量名沿用 ADR-0025（`--jx-panel-{sidebar,input,bubble,tip,selector}-alpha`）。

## 测试决策

- **好测试的特征**：只测外部可观察行为——探测器是否选中某表面、激活标记是否被写/清、层是否在断连后复挂、残留是否被清扫；不测内部实现细节。
- **被测模块**：
  - 探测器/表面判定（`testWallpaperSurface`-类纯逻辑）——以 `welcome-backdrop.test.ts` 为样式先例。
  - 连接感知复挂 / 断连回拼——参考背景层既有单测。
  - 残留清扫（`sweepResidualBackdrops` 覆盖面）——对齐 ADR-0017 先例。
- **测试先例**：`tests/client/welcome-backdrop.test.ts`；区域 alpha 相关在 `12-panel-region-opacity` 的验收测试。

## 超出范围

- 不扩 L2 token 体系（不新增「可玻璃化」维度；玻璃直接消费既有区域 alpha）。
- 不做独立低性能开关（仅 reduced-motion 降级）。
- 不动宿主 app/插件的 DOM 结构本体（只打标/中和/玻璃化浮层，不改变布局语义锚点）。
- 不复用参考项目 dsh-web-ui 的任何包（对齐 ADR-0001）。

## 补充说明

- 若实施期某面板类名/属性变化导致选择器不命中，按参考项目 `patches.css` 的稳定后缀兜底回填选择器。
- 参考项目 dsh-web-ui 机制仅为标注参照，实现需按 jx L2 token 语义 + ADR-0024/0025/0027 落地。
- Gate 约束不变：皮肤开 且 背景开才挂层；皮肤关/背景关卸层并清理，残留零容忍。
- 逐步实施时可拆 issue：表面探测器 / 中和规则 / 毛玻璃覆盖矩阵 / reduced-motion 降级 / 验收。