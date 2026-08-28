/**
 * session-bubbles-config 测试（17-04 补测：上限配置削层后首次单测）。
 *
 * 环境：jsdom（真实 localStorage + window storage 事件）。
 * 模块单例在 import 时从 localStorage 初始化，故每例经 vi.resetModules() +
 * 动态 import 取得受控初始化的新模块实例（工厂内存缓存不随 clear 重置）。
 *
 * 覆盖：
 *   - 默认值 / 钳制 [1,10]
 *   - set 持久化 + get 反映 + 订阅通知 / 退订
 *   - 跨标签页 storage 事件同步
 */

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../storage-keys.ts";

type ConfigModule = typeof import("../session-bubbles-config.ts");

/** 清空存储后重新加载受控初始化的模块实例。 */
async function load(): Promise<ConfigModule> {
  vi.resetModules();
  return await import("../session-bubbles-config.ts");
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("session-bubbles-config: 默认值与钳制", () => {
  it("键缺失 → 默认 10", async () => {
    const mod = await load();
    expect(mod.getMaxSessionBubbles()).toBe(10);
    expect(mod.getMaxSessionBubblesSnapshot()).toBe(10);
  });

  it("越界钳制：上界 10 / 下界 1；非法值回落默认 10", async () => {
    window.localStorage.setItem(STORAGE_KEYS.maxSessionBubbles, "99");
    let mod = await load();
    expect(mod.getMaxSessionBubbles()).toBe(10); // 钳制上界

    window.localStorage.setItem(STORAGE_KEYS.maxSessionBubbles, "0");
    mod = await load();
    expect(mod.getMaxSessionBubbles()).toBe(1); // 钳制下界（ADR-0007 [1,10]）

    window.localStorage.setItem(STORAGE_KEYS.maxSessionBubbles, "garbage");
    mod = await load();
    expect(mod.getMaxSessionBubbles()).toBe(10); // 非法值回落默认
  });

  it("合法持久化值 → 解析生效", async () => {
    window.localStorage.setItem(STORAGE_KEYS.maxSessionBubbles, "5");
    const mod = await load();
    expect(mod.getMaxSessionBubbles()).toBe(5);
  });
});

describe("session-bubbles-config: set + 订阅", () => {
  it("set 钳制后持久化 + 反映 + 通知快照函数", async () => {
    const mod = await load();
    const listener = vi.fn();
    mod.subscribeMaxSessionBubbles(listener);

    const written = mod.setMaxSessionBubbles(7);
    expect(written).toBe(7);
    expect(mod.getMaxSessionBubbles()).toBe(7);
    expect(window.localStorage.getItem(STORAGE_KEYS.maxSessionBubbles)).toBe("7");
    expect(listener).toHaveBeenCalledTimes(1);

    // 越界钳制
    expect(mod.setMaxSessionBubbles(99)).toBe(10);
    expect(mod.getMaxSessionBubbles()).toBe(10);
    expect(window.localStorage.getItem(STORAGE_KEYS.maxSessionBubbles)).toBe("10");
  });

  it("退订后不再通知", async () => {
    const mod = await load();
    const listener = vi.fn();
    const unsub = mod.subscribeMaxSessionBubbles(listener);
    unsub();
    mod.setMaxSessionBubbles(3);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("session-bubbles-config: 跨标签页同步", () => {
  it("storage 事件新值 ≠ 当前值 → 更新并通知；同值不通知", async () => {
    const mod = await load();
    const listener = vi.fn();
    mod.subscribeMaxSessionBubbles(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEYS.maxSessionBubbles,
        newValue: "8",
      }),
    );
    expect(mod.getMaxSessionBubbles()).toBe(8);
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEYS.maxSessionBubbles,
        newValue: "8",
      }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("其他键的 storage 事件不影响本实例", async () => {
    const mod = await load();
    const listener = vi.fn();
    mod.subscribeMaxSessionBubbles(listener);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "jx-unrelated", newValue: "3" }),
    );
    expect(mod.getMaxSessionBubbles()).toBe(10);
    expect(listener).not.toHaveBeenCalled();
  });
});
