/**
 * warp 特效纯逻辑控制器。
 *
 * 输入 pointermove 事件序列 + 时间戳 + 设备能力，输出元素目标状态
 * {visible, x, y, fadePhase}。不依赖 DOM（DOM 薄壳在 warp.ts，工单 02）。
 *
 * 生命周期：
 *   - onMove(x, y, now)：pointermove 事件，一帧可多次（后调覆盖先调 = rAF coalesce 语义）。
 *   - onFrame(now)：rAF 回调，推进淡出（不改变 x,y）。
 *   - 停下 elapsed ≤ dwellMs：保持显示 fadePhase=1。
 *   - dwellMs < elapsed ≤ dwellMs+fadeMs：淡出 fadePhase 从 1 渐到 0。
 *   - elapsed > dwellMs+fadeMs：隐藏 visible=false。
 *
 * 降级：pointer:coarse 或 prefers-reduced-motion → 永不显示，所有方法 noop。
 *
 * @module dsh-web-ui-jx/client
 */

/** warp 特效参数。 */
export interface WarpConfig {
  /** 光圈半径（px）。 */
  readonly radius: number;
  /** 停下后保持显示的时长（ms）。 */
  readonly dwellMs: number;
  /** 淡出持续时长（ms）。 */
  readonly fadeMs: number;
  /** feDisplacementMap 位移强度。 */
  readonly scale: number;
}

/** 设备能力（决定降级）。 */
export interface WarpDeviceCapability {
  /** pointer: coarse（无 hover，移动端）。 */
  readonly pointerCoarse: boolean;
  /** prefers-reduced-motion: reduce。 */
  readonly reducedMotion: boolean;
}

/** 元素目标状态（DOM 薄壳读取并应用）。 */
export interface WarpSnapshot {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  /** 1=完全显示，0=隐藏，(0,1)=淡出中。 */
  readonly fadePhase: number;
}

/** warp 控制器接口。 */
export interface WarpController {
  /** pointermove 事件（一帧可多次，后调覆盖先调）。 */
  onMove(x: number, y: number, now: number): void;
  /** rAF 回调，推进淡出。 */
  onFrame(now: number): void;
  /** 当前元素目标状态。 */
  getSnapshot(): WarpSnapshot;
  /** 持有的参数（薄壳读 radius/scale 用于 CSS）。 */
  getConfig(): WarpConfig;
  /** 销毁，幂等。 */
  destroy(): void;
}

/**
 * 创建 warp 控制器。
 *
 * @param config - 特效参数。
 * @param device - 设备能力。
 */
export function createWarpController(
  config: WarpConfig,
  device: WarpDeviceCapability,
): WarpController {
  let visible = false;
  let x = 0;
  let y = 0;
  let fadePhase = 0;
  let lastMoveTime = 0;
  let destroyed = false;

  const disabled = device.pointerCoarse || device.reducedMotion;

  return {
    onMove(mx, my, now) {
      if (destroyed || disabled) return;
      x = mx;
      y = my;
      lastMoveTime = now;
      visible = true;
      fadePhase = 1;
    },
    onFrame(now) {
      if (destroyed || disabled || !visible) return;
      const elapsed = now - lastMoveTime;
      if (elapsed <= config.dwellMs) {
        fadePhase = 1;
      } else if (elapsed < config.dwellMs + config.fadeMs) {
        fadePhase = 1 - (elapsed - config.dwellMs) / config.fadeMs;
      } else {
        fadePhase = 0;
        visible = false;
      }
    },
    getSnapshot() {
      return { visible, x, y, fadePhase };
    },
    getConfig() {
      return config;
    },
    destroy() {
      destroyed = true;
    },
  };
}
