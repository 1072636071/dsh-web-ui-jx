/**
 * warp 控制器纯逻辑测试（工单 01，复用 Seam 2 模式）。
 *
 * seam：输入 pointermove 事件序列 + 时间戳 + 设备能力，断言输出元素目标状态
 * {visible, x, y, fadePhase}。纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖：
 *   - 移动 → 显示跟手
 *   - 停下淡出（dwellMs 保持 → fadeMs 渐隐 → 隐藏）
 *   - rAF coalesce（一帧内多次 onMove 只取最后位置）
 *   - pointer:coarse / prefers-reduced-motion 降级（永不显示）
 *   - getConfig 持有参数
 *   - destroy 幂等
 */

import { describe, expect, it } from "vitest";
import {
  createWarpController,
  type WarpConfig,
  type WarpDeviceCapability,
} from "../../src/client/fx/warp-controller.ts";

// ---------------------------------------------------------------------------
// 默认参数（与 PRD 推荐值一致）
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: WarpConfig = {
  radius: 200,
  dwellMs: 400,
  fadeMs: 200,
  scale: 15,
};

const FINE_DEVICE: WarpDeviceCapability = {
  pointerCoarse: false,
  reducedMotion: false,
};

// ---------------------------------------------------------------------------
// 移动 → 显示跟手
// ---------------------------------------------------------------------------

describe("warp-controller: 移动 → 显示跟手", () => {
  it("onMove 后 onFrame，snapshot visible=true 且 (x,y) 跟手等于事件坐标，fadePhase=1", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(100, 200, 1000);
    ctrl.onFrame(1000);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(true);
    expect(snap.x).toBe(100);
    expect(snap.y).toBe(200);
    expect(snap.fadePhase).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 停下淡出
// ---------------------------------------------------------------------------

describe("warp-controller: 停下淡出", () => {
  it("停下 elapsed < dwellMs：保持显示 fadePhase=1", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(0, 0, 0);
    ctrl.onFrame(200);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(true);
    expect(snap.fadePhase).toBe(1);
  });

  it("停下 elapsed = dwellMs：仍保持显示 fadePhase=1（边界）", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(0, 0, 0);
    ctrl.onFrame(400);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(true);
    expect(snap.fadePhase).toBe(1);
  });

  it("dwellMs < elapsed < dwellMs+fadeMs：淡出中 fadePhase∈(0,1)", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(0, 0, 0);
    ctrl.onFrame(500);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(true);
    expect(snap.fadePhase).toBeCloseTo(0.5, 5);
  });

  it("elapsed = dwellMs+fadeMs：完全隐藏 visible=false fadePhase=0（边界）", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(0, 0, 0);
    ctrl.onFrame(600);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(false);
    expect(snap.fadePhase).toBe(0);
  });

  it("elapsed > dwellMs+fadeMs：隐藏 visible=false", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(0, 0, 0);
    ctrl.onFrame(1000);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(false);
    expect(snap.fadePhase).toBe(0);
  });

  it("淡出中再次移动：立即恢复显示 fadePhase=1 且位置更新", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(0, 0, 0);
    ctrl.onFrame(500);
    ctrl.onMove(50, 60, 500);
    ctrl.onFrame(500);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(true);
    expect(snap.fadePhase).toBe(1);
    expect(snap.x).toBe(50);
    expect(snap.y).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// rAF coalesce：一帧内多次 onMove 只取最后位置
// ---------------------------------------------------------------------------

describe("warp-controller: rAF coalesce", () => {
  it("一帧内多次 onMove，onFrame 后 snapshot 取最后位置", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(10, 20, 1000);
    ctrl.onMove(30, 40, 1000);
    ctrl.onMove(50, 60, 1000);
    ctrl.onFrame(1000);
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
  it("pointer:coarse → onMove/onFrame 后永不 visible", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, {
      pointerCoarse: true,
      reducedMotion: false,
    });
    ctrl.onMove(100, 200, 1000);
    ctrl.onFrame(1000);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(false);
    expect(snap.fadePhase).toBe(0);
  });

  it("prefers-reduced-motion → onMove/onFrame 后永不 visible", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, {
      pointerCoarse: false,
      reducedMotion: true,
    });
    ctrl.onMove(100, 200, 1000);
    ctrl.onFrame(1000);
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(false);
    expect(snap.fadePhase).toBe(0);
  });

  it("降级后初始 snapshot visible=false fadePhase=0", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, {
      pointerCoarse: true,
      reducedMotion: false,
    });
    const snap = ctrl.getSnapshot();
    expect(snap.visible).toBe(false);
    expect(snap.fadePhase).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getConfig 持有参数
// ---------------------------------------------------------------------------

describe("warp-controller: getConfig", () => {
  it("getConfig 返回传入的 config", () => {
    const config: WarpConfig = {
      radius: 250,
      dwellMs: 300,
      fadeMs: 100,
      scale: 20,
    };
    const ctrl = createWarpController(config, FINE_DEVICE);
    expect(ctrl.getConfig()).toBe(config);
  });

  it("不同 dwellMs/fadeMs 产生不同淡出时机", () => {
    const ctrlShort = createWarpController(
      { radius: 200, dwellMs: 100, fadeMs: 50, scale: 15 },
      FINE_DEVICE,
    );
    const ctrlLong = createWarpController(
      { radius: 200, dwellMs: 400, fadeMs: 200, scale: 15 },
      FINE_DEVICE,
    );
    ctrlShort.onMove(0, 0, 0);
    ctrlShort.onFrame(200);
    ctrlLong.onMove(0, 0, 0);
    ctrlLong.onFrame(200);
    expect(ctrlShort.getSnapshot().visible).toBe(false);
    expect(ctrlLong.getSnapshot().visible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// destroy 幂等
// ---------------------------------------------------------------------------

describe("warp-controller: destroy", () => {
  it("destroy 后 onMove/onFrame noop，getSnapshot 保持销毁前状态", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(100, 200, 1000);
    ctrl.onFrame(1000);
    ctrl.destroy();
    ctrl.onMove(999, 999, 2000);
    ctrl.onFrame(2000);
    const snap = ctrl.getSnapshot();
    expect(snap.x).toBe(100);
    expect(snap.y).toBe(200);
    expect(snap.visible).toBe(true);
  });

  it("destroy 幂等：重复调用安全", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.destroy();
    ctrl.destroy();
    ctrl.destroy();
  });

  it("destroy 后再 onMove 不复活", () => {
    const ctrl = createWarpController(DEFAULT_CONFIG, FINE_DEVICE);
    ctrl.onMove(100, 200, 1000);
    ctrl.destroy();
    ctrl.onMove(500, 600, 3000);
    ctrl.onFrame(3000);
    const snap = ctrl.getSnapshot();
    expect(snap.x).toBe(100);
  });
});
