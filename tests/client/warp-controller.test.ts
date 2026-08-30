/**
 * warp 控制器纯逻辑测试（工单 01，复用 Seam 2 模式）。
 *
 * seam：输入 pointermove 事件序列 + 设备能力，断言输出元素目标状态
 * {visible, x, y}。纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（19-03 落定「无淡出」语义，onFrame/fadePhase 死代码已删除）：
 *   - 移动 → 显示跟手（visible=true、坐标 = 事件坐标）
 *   - 无停止淡出：首次移动后 visible 恒真，不随停下复位、无控制器级淡出
 *   - rAF coalesce（一帧内多次 onMove 只取最后位置）
 *   - pointer:coarse / prefers-reduced-motion 降级（永不显示）
 *   - destroy 幂等
 */

import { describe, expect, it } from "vitest";
import {
  createWarpController,
  type WarpDeviceCapability,
} from "../../src/client/fx/warp-controller.ts";

// ---------------------------------------------------------------------------
// 设备能力：细指针 + 不减动（正常启用路径）
// ---------------------------------------------------------------------------

const FINE_DEVICE: WarpDeviceCapability = {
  pointerCoarse: false,
  reducedMotion: false,
};

// ---------------------------------------------------------------------------
// 移动 → 显示跟手
// ---------------------------------------------------------------------------

describe("warp-controller: 移动 → 显示跟手", () => {
  it("onMove 后 snapshot visible=true 且 (x,y) 跟手等于事件坐标", () => {
    const ctrl = createWarpController(FINE_DEVICE);
    ctrl.onMove(100, 200);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(true);
    expect(snap.x).toBe(100);
    expect(snap.y).toBe(200);
  });

  it("初始未移动：visible=false x/y=0", () => {
    const ctrl = createWarpController(FINE_DEVICE);
    expect(ctrl.getSnapshot()).toEqual({ visible: false, x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// 无停止淡出（19-03：删除 onFrame 后落定的语义）
// ---------------------------------------------------------------------------

describe("warp-controller: 无停止淡出（19-03）", () => {
  it("首次移动后 visible 恒真——不随停下复位、无 onFrame 淡出状态机", () => {
    const ctrl = createWarpController(FINE_DEVICE);
    ctrl.onMove(10, 20);
    expect(ctrl.getSnapshot().visible).toBe(true);
    // 控制器没有 onFrame；时间流逝不会把 visible 置回 false——
    // 粒子/涟漪各自自带 520ms/720ms 淡出动画（warp.ts / fx.css）。
    ctrl.onMove(30, 40);
    expect(ctrl.getSnapshot().visible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rAF coalesce：一帧内多次 onMove 只取最后位置
// ---------------------------------------------------------------------------

describe("warp-controller: rAF coalesce", () => {
  it("一帧内多次 onMove，snapshot 取最后位置", () => {
    const ctrl = createWarpController(FINE_DEVICE);
    ctrl.onMove(10, 20);
    ctrl.onMove(30, 40);
    ctrl.onMove(50, 60);
    const snap = ctrl.getSnapshot();
    expect(snap.x).toBe(50);
    expect(snap.y).toBe(60);
    expect(snap.visible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 降级：pointer:coarse / prefers-reduced-motion
// ---------------------------------------------------------------------------

describe("warp-controller: 降级", () => {
  it("pointer:coarse → onMove 后永不 visible", () => {
    const ctrl = createWarpController({
      pointerCoarse: true,
      reducedMotion: false,
    });
    ctrl.onMove(100, 200);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(false);
  });

  it("prefers-reduced-motion → onMove 后永不 visible", () => {
    const ctrl = createWarpController({
      pointerCoarse: false,
      reducedMotion: true,
    });
    ctrl.onMove(100, 200);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(false);
  });

  it("降级后初始 snapshot visible=false x/y=0", () => {
    const ctrl = createWarpController({
      pointerCoarse: true,
      reducedMotion: false,
    });
    expect(ctrl.getSnapshot()).toEqual({ visible: false, x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// destroy 幂等
// ---------------------------------------------------------------------------

describe("warp-controller: destroy", () => {
  it("destroy 后 onMove noop，getSnapshot 保持销毁前状态", () => {
    const ctrl = createWarpController(FINE_DEVICE);
    ctrl.onMove(100, 200);
    ctrl.destroy();
    ctrl.onMove(999, 999);
    const snap = ctrl.getSnapshot();
    expect(snap.x).toBe(100);
    expect(snap.y).toBe(200);
    expect(snap.visible).toBe(true);
  });

  it("destroy 幂等：重复调用安全", () => {
    const ctrl = createWarpController(FINE_DEVICE);
    ctrl.destroy();
    ctrl.destroy();
    ctrl.destroy();
  });

  it("destroy 后再 onMove 不复活", () => {
    const ctrl = createWarpController(FINE_DEVICE);
    ctrl.onMove(100, 200);
    ctrl.destroy();
    ctrl.onMove(500, 600);
    const snap = ctrl.getSnapshot();
    expect(snap.x).toBe(100);
  });
});
