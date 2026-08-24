/**
 * overlay-settings 测试（localStorage 持久化 + 订阅通知 + 跨标签页同步）。
 *
 * 环境：jsdom（模块单例在 import 时读 window.localStorage 初始化，需真实
 * localStorage + window 事件）。
 *
 * 覆盖：
 *   - 默认值：状态标签可见 / 动作轮换均默认开
 *   - set → 持久化到 localStorage + 内存值反映
 *   - subscribe 通知 / unsubscribe 停止通知
 *   - 跨标签页 storage 事件同步（新值 ≠ 当前值时更新并通知）
 */

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  getShowStateLabel,
  getVariantRotationEnabled,
  setShowStateLabel,
  setVariantRotationEnabled,
  subscribeShowStateLabel,
  subscribeVariantRotationEnabled,
} from "../../src/client/state-machine/overlay-settings.ts";

describe("overlay-settings: 默认值", () => {
  it("状态标签可见默认开", () => {
    expect(getShowStateLabel()).toBe(true);
  });

  it("动作轮换默认开（ADR-0013 D7）", () => {
    expect(getVariantRotationEnabled()).toBe(true);
  });
});

describe("overlay-settings: set 持久化 + 订阅", () => {
  it("setShowStateLabel 持久化并反映", () => {
    setShowStateLabel(false);
    expect(getShowStateLabel()).toBe(false);
    expect(window.localStorage.getItem("jx-state-label-visible")).toBe("false");

    setShowStateLabel(true);
    expect(getShowStateLabel()).toBe(true);
    expect(window.localStorage.getItem("jx-state-label-visible")).toBe("true");
  });

  it("setVariantRotationEnabled 持久化并反映", () => {
    setVariantRotationEnabled(false);
    expect(getVariantRotationEnabled()).toBe(false);
    expect(window.localStorage.getItem("jx-variant-rotation")).toBe("false");
  });

  it("subscribe 通知新值；unsubscribe 后不再通知", () => {
    const onShow = vi.fn();
    const unsubShow = subscribeShowStateLabel(onShow);

    setShowStateLabel(false);
    expect(onShow).toHaveBeenLastCalledWith(false);

    unsubShow();
    setShowStateLabel(true);
    expect(onShow).toHaveBeenCalledTimes(1); // 解绑后不再追加
  });

  it("跨标签页 storage 事件同步（新值 ≠ 当前值时更新并通知）", () => {
    // 前置用例可能把当前值改为 false，这里显式复位为 true，确保事件的新值 ≠ 当前值。
    setVariantRotationEnabled(true);

    const onRotation = vi.fn();
    const unsub = subscribeVariantRotationEnabled(onRotation);

    // 当前值为 true，模拟另一标签页写 false。
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "jx-variant-rotation",
        newValue: "false",
      }),
    );

    expect(getVariantRotationEnabled()).toBe(false);
    expect(onRotation).toHaveBeenLastCalledWith(false);

    unsub();
  });
});
