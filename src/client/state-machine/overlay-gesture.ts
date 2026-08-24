/**
 * overlay-gesture — 角色浮层手势判定（点击/拖动，纯逻辑）。
 *
 * 深化动机（架构审查候选者 1）：点击判据（位移 <5px 且 ≤300ms，ADR-0011 D1）
 * 与拖动会话编排此前焊在 CharacterOverlay 的 ref 里，测试无法穿过接口命中。
 * 本模块把「指针事件序列 → 拖动状态 + 点击判定」收敛为一个小接口：
 * down / move / up / cancel 四方法，返回结果不产生副作用。
 *
 * 位置钳制与持久化仍归 overlay-position（dragStart/dragMove/dragEnd 纯函数 +
 * 位置 store）；本模块只做手势语义判定，不重复钳制逻辑。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。时钟经 now 注入（测试可控）。
 *
 * @module dsh-web-ui-jx/client
 */

import {
  dragEnd,
  dragMove,
  dragStart,
  type DragSession,
  type OverlayPosition,
  type OverlaySize,
  type ViewportSize,
} from "./overlay-position.ts";

/** 点击判定：pointerup 相对 pointerdown 的位移阈值 px（ADR-0011 D1）. */
export const CLICK_MOVE_THRESHOLD = 5;

/** 点击判定：按下到松开的时长上限 ms，超过视为长按/拖动不触发（ADR-0011 D1）. */
export const CLICK_TIME_MS = 300;

/** 指针坐标（clientX/clientY）. */
export interface GesturePoint {
  readonly x: number;
  readonly y: number;
}

/** pointerdown 输入. */
export interface GestureDownInput {
  /** 指针坐标. */
  readonly point: GesturePoint;
  /** 浮层当前位置. */
  readonly position: OverlayPosition;
  /** 是否命中交互子元素（[data-jx-interactive]）；命中则不启动拖动. */
  readonly interactive: boolean;
}

/** pointermove/up/cancel 输入. */
export interface GestureMoveInput {
  /** 指针坐标. */
  readonly point: GesturePoint;
  /** 视口尺寸（钳制用）. */
  readonly viewport: ViewportSize;
  /** 浮层尺寸（钳制用）. */
  readonly size: OverlaySize;
}

/** pointerdown 结果. */
export interface GestureDownResult {
  /** 是否启动拖动会话. */
  readonly dragging: boolean;
}

/** pointermove 结果. */
export interface GestureMoveResult {
  /** 跟手位置（已钳制）；无拖动会话时 undefined. */
  readonly position: OverlayPosition | undefined;
}

/** pointerup 结果. */
export interface GestureUpResult {
  /** 提交位置（已钳制，将持久化）；无拖动会话时 undefined. */
  readonly position: OverlayPosition | undefined;
  /** 是否判定为点击（位移 <5px 且 ≤300ms，ADR-0011 D1）. */
  readonly click: boolean;
}

/** pointer 手势判定器实例. */
export interface OverlayGesture {
  /** pointerdown：启动拖动会话（命中交互子元素则跳过）并记录按下信息. */
  down(input: GestureDownInput): GestureDownResult;
  /** pointermove：有拖动会话时返回跟手位置（钳制），否则 undefined. */
  move(input: GestureMoveInput): GestureMoveResult;
  /** pointerup：提交钳制位置 + 点击判定；结束会话. */
  up(input: GestureMoveInput): GestureUpResult;
  /** pointercancel：结束会话，不判点击（系统取消，ADR-0011 D1）. */
  cancel(input: GestureMoveInput): GestureUpResult;
  /** 是否有进行中的拖动会话. */
  isDragging(): boolean;
}

/** 手势判定器选项. */
export interface CreateOverlayGestureOptions {
  /** 时钟注入（默认 performance.now；测试可注入虚拟时钟）. */
  now?: () => number;
}

/**
 * 创建指针手势判定器。
 *
 * @param opts - 选项（now 注入测试）。
 * @returns 手势判定器实例。
 */
export function createOverlayGesture(
  opts?: CreateOverlayGestureOptions,
): OverlayGesture {
  const now =
    opts?.now ??
    (typeof performance !== "undefined"
      ? () => performance.now()
      : () => Date.now());

  let session: DragSession | null = null;
  let press: { x: number; y: number; t: number } | null = null;

  function down(input: GestureDownInput): GestureDownResult {
    const start = dragStart(input.point, input.position, input.interactive);
    if (!start.active) {
      session = null;
      press = null;
      return { dragging: false };
    }
    session = start.session;
    press = { x: input.point.x, y: input.point.y, t: now() };
    return { dragging: true };
  }

  function move(input: GestureMoveInput): GestureMoveResult {
    if (session === null) return { position: undefined };
    return {
      position: dragMove(session, input.point, input.viewport, input.size),
    };
  }

  function up(input: GestureMoveInput): GestureUpResult {
    const position =
      session !== null
        ? dragEnd(session, input.point, input.viewport, input.size)
        : undefined;
    session = null;
    const p = press;
    press = null;
    if (p === null) return { position, click: false };
    const moved = Math.hypot(input.point.x - p.x, input.point.y - p.y);
    const held = now() - p.t;
    return {
      position,
      click: moved < CLICK_MOVE_THRESHOLD && held <= CLICK_TIME_MS,
    };
  }

  function cancel(input: GestureMoveInput): GestureUpResult {
    const position =
      session !== null
        ? dragEnd(session, input.point, input.viewport, input.size)
        : undefined;
    session = null;
    press = null;
    return { position, click: false };
  }

  function isDragging(): boolean {
    return session !== null;
  }

  return { down, move, up, cancel, isDragging };
}
