/**
 * micro 特效 — 微交互 hover/active。
 *
 * 纯 CSS 实现（DESIGN.md §5：transform + cubic-bezier(0.16,1,0.3,1)）。
 * 由 `html.fx-micro` 类触发，样式见 src/client/styles/fx.css：
 *   全局 hover/active 微交互（按钮 hover translateY(-1px)、active scale(0.98)），
 *   用自然减速曲线 cubic-bezier(0.16,1,0.3,1)（DESIGN.md §6）。
 *
 * 本模块导出 noop 占位函数，保持与 fall.ts 一致的 start/stop 接口。
 *
 * @module dsh-web-ui-jx/client
 */

/**
 * 启动 micro（CSS 驱动，noop）。
 *
 * 实际效果由 `html.fx-micro` 类触发 fx.css 中的全局 hover/active 微交互生效。
 */
export function startMicro(): void {
  // CSS-driven: html.fx-micro 选择器生效，无需 JS。
}

/**
 * 停止 micro（CSS 驱动，noop）。
 *
 * 实际效果由 fx/index.ts 移除 `html.fx-micro` 类停止。
 */
export function stopMicro(): void {
  // CSS-driven: 移除 html.fx-micro 类即停止，无需 JS。
}
