/**
 * overlay-gesture 纯逻辑测试（架构审查候选者 1 的深化模块）。
 *
 * seam：输入指针事件序列（down/move/up/cancel），断言拖动状态与点击判定。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）；时钟经 now 注入。
 *
 * 覆盖：
 *   - 点击判定：位移 <5px 且 ≤300ms → click；超位移/超时长 → 非点击
 *   - 交互子元素：interactive=true 不启动拖动、不判点击
 *   - 拖动会话：move 跟手钳制、up 提交位置、会话结束后 move 无位置
 *   - cancel：结束会话、不判点击
 */

import { describe, expect, it } from "vitest";
import {
  CLICK_MOVE_THRESHOLD,
  CLICK_TIME_MS,
  createOverlayGesture,
} from "../../src/client/state-machine/overlay-gesture.ts";

const VIEWPORT = { width: 1000, height: 800 };
const SIZE = { width: 140, height: 249 };
const ORIGIN = { x: 800, y: 500 };

/** 可控时钟（注入 now，测试点击时长判据）. */
function makeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("overlay-gesture: 点击判定（ADR-0011 D1）", () => {
  it("位移 <5px 且 ≤300ms → click", () => {
    const clock = makeClock();
    const g = createOverlayGesture({ now: clock.now });
    g.down({ point: { x: 100, y: 100 }, position: ORIGIN, interactive: false });
    clock.advance(100);
    const r = g.up({ point: { x: 102, y: 101 }, viewport: VIEWPORT, size: SIZE });
    expect(r.click).toBe(true);
  });

  it("位移 ≥5px → 非点击（视为拖动）", () => {
    const clock = makeClock();
    const g = createOverlayGesture({ now: clock.now });
    g.down({ point: { x: 100, y: 100 }, position: ORIGIN, interactive: false });
    const r = g.up({
      point: { x: 100 + CLICK_MOVE_THRESHOLD + 1, y: 100 },
      viewport: VIEWPORT,
      size: SIZE,
    });
    expect(r.click).toBe(false);
  });

  it("时长 >300ms → 非点击（视为长按）", () => {
    const clock = makeClock();
    const g = createOverlayGesture({ now: clock.now });
    g.down({ point: { x: 100, y: 100 }, position: ORIGIN, interactive: false });
    clock.advance(CLICK_TIME_MS + 1);
    const r = g.up({ point: { x: 100, y: 100 }, viewport: VIEWPORT, size: SIZE });
    expect(r.click).toBe(false);
  });

  it("恰好 300ms 且位移 0 → click（边界含等号）", () => {
    const clock = makeClock();
    const g = createOverlayGesture({ now: clock.now });
    g.down({ point: { x: 100, y: 100 }, position: ORIGIN, interactive: false });
    clock.advance(CLICK_TIME_MS);
    const r = g.up({ point: { x: 100, y: 100 }, viewport: VIEWPORT, size: SIZE });
    expect(r.click).toBe(true);
  });

  it("未 down 直接 up → 非点击、无提交位置", () => {
    const g = createOverlayGesture();
    const r = g.up({ point: { x: 100, y: 100 }, viewport: VIEWPORT, size: SIZE });
    expect(r.click).toBe(false);
    expect(r.position).toBeUndefined();
  });
});

describe("overlay-gesture: 交互子元素排除（ADR-0006 决策 7）", () => {
  it("interactive=true 不启动拖动、up 不判点击", () => {
    const g = createOverlayGesture();
    const d = g.down({
      point: { x: 100, y: 100 },
      position: ORIGIN,
      interactive: true,
    });
    expect(d.dragging).toBe(false);
    expect(g.isDragging()).toBe(false);
    const r = g.up({ point: { x: 100, y: 100 }, viewport: VIEWPORT, size: SIZE });
    expect(r.click).toBe(false);
  });
});

describe("overlay-gesture: 拖动会话", () => {
  it("move 跟手位置 = 起点 + 位移（钳制视口内）", () => {
    const g = createOverlayGesture();
    g.down({ point: { x: 100, y: 100 }, position: ORIGIN, interactive: false });
    expect(g.isDragging()).toBe(true);
    const r = g.move({
      point: { x: 130, y: 120 },
      viewport: VIEWPORT,
      size: SIZE,
    });
    expect(r.position).toEqual({ x: ORIGIN.x + 30, y: ORIGIN.y + 20 });
  });

  it("move 钳制到视口（不越界）", () => {
    const g = createOverlayGesture();
    g.down({ point: { x: 100, y: 100 }, position: ORIGIN, interactive: false });
    const r = g.move({
      point: { x: 100 + 5000, y: 100 + 5000 },
      viewport: VIEWPORT,
      size: SIZE,
    });
    expect(r.position).toEqual({
      x: VIEWPORT.width - SIZE.width,
      y: VIEWPORT.height - SIZE.height,
    });
  });

  it("up 提交钳制位置并结束会话；会话结束后 move 无位置", () => {
    const g = createOverlayGesture();
    g.down({ point: { x: 100, y: 100 }, position: ORIGIN, interactive: false });
    const r = g.up({ point: { x: 110, y: 105 }, viewport: VIEWPORT, size: SIZE });
    expect(r.position).toEqual({ x: ORIGIN.x + 10, y: ORIGIN.y + 5 });
    expect(g.isDragging()).toBe(false);
    expect(
      g.move({ point: { x: 200, y: 200 }, viewport: VIEWPORT, size: SIZE })
        .position,
    ).toBeUndefined();
  });
});

describe("overlay-gesture: pointercancel", () => {
  it("cancel 结束会话、提交位置、不判点击", () => {
    const g = createOverlayGesture();
    g.down({ point: { x: 100, y: 100 }, position: ORIGIN, interactive: false });
    const r = g.cancel({
      point: { x: 100, y: 100 },
      viewport: VIEWPORT,
      size: SIZE,
    });
    expect(r.click).toBe(false);
    expect(r.position).toEqual(ORIGIN);
    expect(g.isDragging()).toBe(false);
  });
});
