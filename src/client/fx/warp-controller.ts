/**
 * warp 特效纯逻辑控制器。
 *
 * 输入 pointermove 事件序列 + 设备能力，输出元素目标状态 {visible, x, y}。
 * 不依赖 DOM（DOM 薄壳在 warp.ts）。
 *
 * 语义（19-03 二选一落定为「无淡出」）：
 *   - onMove(x, y)：pointermove 事件，一帧可多次（后调覆盖先调 = rAF coalesce 语义）。
 *   - visible = 已接合（首次移动后恒真，不随停下复位）：仅供薄壳门控是否产生
 *     粒子/涟漪。**无停止淡出**——粒子与涟漪自带 520ms/720ms 淡出动画
 *     （warp.ts / fx.css），不需要控制器级淡出状态机，也没有常驻帧循环。
 *
 * 降级：pointer:coarse 或 prefers-reduced-motion → 永不显示，所有方法 noop。
 *
 * @module dsh-web-ui-jx/client
 */

/** 设备能力（决定降级）。 */
export interface WarpDeviceCapability {
  /** pointer: coarse（无 hover，移动端）。 */
  readonly pointerCoarse: boolean;
  /** prefers-reduced-motion: reduce。 */
  readonly reducedMotion: boolean;
}

/** 元素目标状态（DOM 薄壳读取并应用）。 */
export interface WarpSnapshot {
  /** 特效已接合（首次移动后恒真；disabled/destroyed 时保持 false/最后值）。
   *  无停止淡出语义——见模块头。 */
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
}

/** warp 控制器接口。 */
export interface WarpController {
  /** pointermove 事件（一帧可多次，后调覆盖先调 = rAF coalesce 语义）。 */
  onMove(x: number, y: number): void;
  /** 当前元素目标状态。 */
  getSnapshot(): WarpSnapshot;
  /** 销毁，幂等。 */
  destroy(): void;
}

/**
 * 创建 warp 控制器。
 *
 * @param device - 设备能力（决定降级）。
 */
export function createWarpController(
  device: WarpDeviceCapability,
): WarpController {
  let x = 0;
  let y = 0;
  let engaged = false;
  let destroyed = false;

  const disabled = device.pointerCoarse || device.reducedMotion;

  return {
    onMove(mx, my) {
      if (destroyed || disabled) return;
      x = mx;
      y = my;
      engaged = true;
    },
    getSnapshot() {
      return { visible: engaged, x, y };
    },
    destroy() {
      destroyed = true;
    },
  };
}
