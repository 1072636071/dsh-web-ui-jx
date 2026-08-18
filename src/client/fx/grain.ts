/**
 * grain 特效 — 墨韵暗纹静态 SVG turbulence。
 *
 * 纯 CSS 实现（DESIGN.md §5：静态 SVG turbulence，零热循环）。
 * 由 `html.fx-grain` 类触发，样式见 src/client/styles/fx.css：
 *   body::before 背景层用 inline SVG feTurbulence 作为 data URI 背景，
 *   静态呈现墨韵暗纹，无动画（零热循环）。
 *
 * 装饰层 pointer-events: none，不拦截指针。
 * 本模块导出 noop 占位函数，保持与 fall.ts 一致的 start/stop 接口。
 *
 * @module dsh-web-ui-jx/client
 */

/**
 * 启动 grain（CSS 驱动，noop）。
 *
 * 实际效果由 `html.fx-grain` 类触发 fx.css 中的静态 SVG 背景生效。
 */
export function startGrain(): void {
  // CSS-driven: html.fx-grain 选择器生效，无需 JS。
}

/**
 * 停止 grain（CSS 驱动，noop）。
 *
 * 实际效果由 fx/index.ts 移除 `html.fx-grain` 类停止。
 */
export function stopGrain(): void {
  // CSS-driven: 移除 html.fx-grain 类即停止，无需 JS。
}
