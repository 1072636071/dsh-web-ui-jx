# memorial 013-wallpaper-obscured-research

状态：已完成（2026-08-25 收尾：C1–C5 全绿；ADR-0027 已建并同步全局 docs/adr/ + CONTEXT.md；术语已回写 CONTEXT.md）

## 诉求

> 我想让你研究一下：E:\work\sp\dsh-web-ui 怎么做的壁纸，解决壁纸被严重遮挡的问题。

## 追问记录

### 调查结果（2026-08-25 · 人工研读参考项目 dsh-web-ui + 本项目 jx）

**参考项目 E:\work\sp\dsh-web-ui 的壁纸分层机制**（来源：`packages/skins/skin-center/src/client/wallpaper.ts`、`.../runtime/backdrop-scene.ts`、`skins/wallpaper-exclusive/{skin.css,patches.css,skin.json}`、`docs/archive/2026-08-20-wallpaper-exclusive-dev.md`）：

1. **层结构**：壁纸是两个 `body` 直挂 `fixed` 全视口层，负 z-index → `media` 层 `z-index:-3`（video/iframe/图片），`scrim` 压暗纱 `z-index:-2`；skin-center 磨砂毛玻璃元素在 `z-index:-1`。全部垫在所有宿主内容之下。`pointer-events:none`。
2. **彻底解决「壁纸被遮挡」有两条互补手段**：
   - **A. 消除不透明背景表面（不让壁纸被藏）**：`rootNeutralizer` 内 `[id="root"]{background:transparent}` + `data-dsh-wallpaper-active`/`data-dsh-wallpaper-surface` 双标记。准备「全视口不透明表面」探测器 `defaultWallpaperSurface()`（`getBoundingClientRect().height ≥ 视口 90%` 且 `backgroundColor` 非透明 且非 modal/plugin/owned 层 zIndex≤100）→ 用 `markSurfaces()` 逐元素打上 `data-dsh-wallpaper-surface` 标记 → 中和规则 `html[data-dsh-wallpaper-active] [data-dsh-wallpaper-surface]{background:transparent!important}` 把整幅 app 根/对话根面板的底抹透明，让壁纸露出来。配 `surfaceObserver`（body subtree MutationObserver，增量 tag/untag）在导航重建 #root 后重扫（#805）；连接感知的层复挂避免切换会话丢壁纸。
   - **B. 全浮层毛玻璃（让壁纸在所有面板内「透出」而非躲开）**：`wallpaper-exclusive` 皮肤把 `--dsw-wallpaper-glass-fill`（半透明 + `backdrop-filter:blur()`) 铺到每一个浮层/面板/卡片上——输入卡 `[data-composer-card]`、气泡、代码块、内联 code、设置表面、dialog/menu/listbox/popper、侧栏 `[data-slot="sidebar"]`、任务看板 `data-dsh-plugin="task-board"`、ssh、git-graph、pet、remote、skill-explorer、底部面板、composer +/ / 弹窗、tooltip。**关键取舍**：不做「逐皮肤适配」，不做「回去画自己的底」，而是所有面板半透明磨砂 → 壁纸在整幅 UI 背后持续可见。
3. **关键踩坑**（`backdrop-scene.ts`）：composer seat 会在气泡下画底部遮挡渐变（z-index 7）→ 木 backdrop 激活时用 `data-dsh-backdrop-active` 中和掉 `[data-composer-seat]::before{background:none}`；`data-dsh-conversation-content` 只在有消息正文时才上毛玻璃，避免空会话闪一下。皮肤管道把 `:root` 作用域成 `html[data-dsh-skin=...]`/`body` 两处，变量需内联 html+body 双端写。

**本项目 dsh-web-ui-jx 现状**（来源：`src/client/welcome-backdrop.ts`、`docs/adr/0024`、`doc/adr/0025`）：
- 仅用 **A 的弱化版 + 半透明 token**（ADR-0024 D2/D3）：body 首位 fixed 整页层 `z-index:-1`，三层 `base/img/veil`。通过 `--jx-panel-alpha` + 五区域 alpha 让 L2 `--jx-surface-*` 半透明，壁纸从面板后透出；总开关 + 双滑杆（壁纸不透明度/面板不透明度）。
- **无毛玻璃模糊层**、**无「全视口不透明表面」探测器/标记/中和的机制**：凡是「不吃 `--jx-surface-*` token 的插件面板/浮层/卡片」（各自写死不透明白底），壁纸就会被它们盖死 → 这就是「壁纸被严重遮挡」的根因方向。

## 决策汇总

| # | 决策 | 值 | 依据 |
|---|------|-----|------|
| D1 | 症状定位 | 整幅 app 根不透明底盖住壁纸，只剩缝隙影子 | 用户确认「整个 APP 挡住只能看见影子」，匹配参考项目方案 A 场景 |
| D2 | 解决取向 | **A+B**：A=消除不透明表面（探测器+标记+中和）；B=全浮层毛玻璃让壁纸透出 | 用户从三个取向中选 A+B |
| D3 | 毛玻璃形态 | **真毛玻璃 backdrop-filter**（blur + 半透明 glass 底） | 用户从「真毛玻璃 / 纯alpha不模糊 / 真毛玻璃仅核心」中选真毛玻璃 |
| D4 | 与已有滑杆共存 | **玻璃继承现有区域 alpha**：blur 恒定，`background-color` 继承既有 `--jx-panel-*` 区域 alpha；不新增滑杆 | 用户否决固定 glass 盖住滑杆与新增滑杆两案；保留 ADR-0025 交付物收益 |

**追加决策（用户授权其余自行决策，D5–D10）：**
- D5 **z-index 改负**：壁纸层改负 z-index（`media/图=-3`、`veil/压纱=-2`，base 同 -3 兜底），彻底垫于全部宿主内容之下，杜绝与 app 根同层互排。用户选「改负 z-index」。
- D6 **全域探测器**：复用参考 `defaultWallpaperSurface`（`getBoundingClientRect().height ≥ 视口90%` 且 `backgroundColor` 非透明 且排除 modal/plugin/自营层 zIndex>100）扫 body 全域；`markSurfaces` 打 `data-jx-backdrop-surface`；中和规则 `body[data-jx-wallpaper-active] [data-jx-backdrop-surface]{background:transparent!important; background-image:none!important}`；配 `surfaceObserver`（body subtree MutationObserver 增量 tag/untag）+ 层连接感知复挂（`!isConnected` 即 `body.appendChild` 回拼）。用户选「全域探测器」。
- D7 **覆盖矩阵全表面**：真毛玻璃铺满全插件家族表面——输入卡 `[data-composer-card]`/气泡 `[data-chat-anchor-key] [class*="bubble"]`/代码块 `[class*="md-code-block"]`/内联 code/sidebar `[data-slot="sidebar"]`/dialog/menu/listbox/popper/tooltip/`[data-dsh-plugin="..."]` 各插件面板/底部面板/设置表面。用户选「全表面覆盖」。
- D8 **玻璃继承现有区域 alpha**：`backdrop-filter: blur(10px)` 恒定 + `background-color` 继承既有 `--jx-panel-*` 区域 alpha / `--jx-panel-alpha`，不新增滑杆。即「模糊度固定、透明度随现有滑杆」。
- D9 **性能/降级**：不做独立低性能开关。`@media (prefers-reduced-motion: reduce)` 下 `backdrop-filter` 全关（回纯 alpha + 压纱兜底），对齐 jx DESIGN §6 既有惯例（`fx.css` 全关先例）；总开关一键关即回到纯色。jx 已有 `overlay.module.css` `backdrop-filter: blur(2px)` 一处先例，不算全新能力。
- D10 **Skills/gate 对齐**：壁纸层常驻挂载时在 `document.body` + `documentElement` 写 `data-jx-wallpaper-active` 标记（对齐参考 `data-dsh-wallpaper-active` 双端写），中和规则在其作用域内才生效（皮肤/插件样式不受影响）；皮肤关或背景关卸层时清除标记 + 摘 `surfaceObserver` + 清 `--jx-panel-*`（ADR-0017 可重入约束 + `sweepResidualBackdrops` 兜底先例沿用）。

## 待澄清

（已清零——D1–D10 全部冻结，见「决策汇总」。实施期如遇宿主 DOM 锚点不命中（如某面板类名/属性变了）按参考项目 `patches.css` 的稳定后缀兜底回填选择器即可。）