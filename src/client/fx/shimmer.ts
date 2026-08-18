/**
 * shimmer 特效 — 鎏金流光顶线 + 标题烫金流动。
 *
 * 纯 CSS 实现（DESIGN.md §5：CSS background-position 动画）。
 * 由 `html.fx-shimmer` 类触发，样式见 src/client/styles/fx.css：
 *   - 鎏金流光顶线：固定顶部 2px 渐变条，background-position 横向流动。
 *   - 标题烫金：插件 root 内 h1/h2/h3 用 --jx-gold-foil 渐变 + background-clip:text，
 *     background-position 流动产生烫金流光效果。
 *
 * 本模块导出 noop 占位函数，保持与 fall.ts 一致的 start/stop 接口，
 * 便于 fx/index.ts 统一调度。实际特效由 CSS 选择器驱动，html 类的
 * 增删即开关。
 *
 * @module dsh-web-ui-jx/client
 */

/**
 * 启动 shimmer（CSS 驱动，noop）。
 *
 * 实际效果由 `html.fx-shimmer` 类触发 fx.css 中的样式生效。
 */
export function startShimmer(): void {
  // CSS-driven: html.fx-shimmer 选择器生效，无需 JS。
}

/**
 * 停止 shimmer（CSS 驱动，noop）。
 *
 * 实际效果由 fx/index.ts 移除 `html.fx-shimmer` 类停止。
 */
export function stopShimmer(): void {
  // CSS-driven: 移除 html.fx-shimmer 类即停止，无需 JS。
}
