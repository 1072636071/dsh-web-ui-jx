/**
 * breathe 特效 — 墨光呼吸背景。
 *
 * 纯 CSS 实现（DESIGN.md §5：body::after opacity 呼吸动画）。
 * 由 `html.fx-breathe` 类触发，样式见 src/client/styles/fx.css：
 *   固定全屏装饰层 opacity 在 0.04 ↔ 0.08 之间 8s 周期呼吸，
 *   营造墨光隐隐明灭的氛围。
 *
 * 装饰层 pointer-events: none，不拦截指针。
 * 本模块导出 noop 占位函数，保持与 fall.ts 一致的 start/stop 接口。
 *
 * @module dsh-web-ui-jx/client
 */

/**
 * 启动 breathe（CSS 驱动，noop）。
 *
 * 实际效果由 `html.fx-breathe` 类触发 fx.css 中的 opacity 呼吸动画生效。
 */
export function startBreathe(): void {
  // CSS-driven: html.fx-breathe 选择器生效，无需 JS。
}

/**
 * 停止 breathe（CSS 驱动，noop）。
 *
 * 实际效果由 fx/index.ts 移除 `html.fx-breathe` 类停止。
 */
export function stopBreathe(): void {
  // CSS-driven: 移除 html.fx-breathe 类即停止，无需 JS。
}
