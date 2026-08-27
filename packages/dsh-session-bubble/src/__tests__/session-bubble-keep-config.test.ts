/**
 * session-bubble-keep-config 存储层测试（工单 14-02，ADR-0028 决策 1/D-seen2）。
 *
 * 环境：jsdom（真实 localStorage）。模块单例在 import 时从 localStorage 初始化，
 * 故每例经 vi.resetModules() + 动态 import 取得受控初始化的新模块实例——
 * 「种子读取」与「脏数据回落」才能按例构造。
 *
 * 覆盖（完成见闻集 seen 实例 + makeIdSetStore 工厂纪律）：
 *   - 初始化：键缺失回落空集；合法 JSON string[] 读入；脏数据（解析失败/
 *     非 Array/非字符串元素逐个忽略）回落或过滤
 *   - addSeen：写穿持久化 + 快照换新引用并通知；幂等（已存在不换引用不通知）
 *   - pruneSeen：只保留 validIds；仅在确有删除时写盘并通知；无删除零副作用
 */

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../storage-keys.ts";

type KeepConfigModule = typeof import("../session-bubble-keep-config.ts");

/** 清空存储后重新加载受控初始化的模块实例。 */
async function load(): Promise<KeepConfigModule> {
  vi.resetModules();
  return await import("../session-bubble-keep-config.ts");
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("完成见闻集存储：初始化读取", () => {
  it("键缺失 ⇒ 空集", async () => {
    const mod = await load();
    expect(mod.getSeenSnapshot().size).toBe(0);
  });

  it("合法 JSON string[] ⇒ 成员读入快照", async () => {
    window.localStorage.setItem(STORAGE_KEYS.seen, JSON.stringify(["s1", "s2"]));
    const mod = await load();
    expect(mod.getSeenSnapshot()).toEqual(new Set(["s1", "s2"]));
  });

  it("解析失败（非法 JSON）⇒ 回落空集", async () => {
    window.localStorage.setItem(STORAGE_KEYS.seen, "{not json");
    const mod = await load();
    expect(mod.getSeenSnapshot().size).toBe(0);
  });

  it("非数组 JSON（如对象）⇒ 回落空集", async () => {
    window.localStorage.setItem(STORAGE_KEYS.seen, JSON.stringify({ seen: true }));
    const mod = await load();
    expect(mod.getSeenSnapshot().size).toBe(0);
  });

  it("数组内非字符串元素逐个忽略", async () => {
    window.localStorage.setItem(STORAGE_KEYS.seen, JSON.stringify(["s1", 7, null, "s2"]));
    const mod = await load();
    expect(mod.getSeenSnapshot()).toEqual(new Set(["s1", "s2"]));
  });
});

describe("完成见闻集存储：addSeen 幂等与写穿", () => {
  it("addSeen 写穿 localStorage、换新快照引用并通知订阅者", async () => {
    const mod = await load();
    const before = mod.getSeenSnapshot();
    const listener = vi.fn();
    mod.subscribeSeen(listener);

    mod.addSeen("s1");

    expect(mod.getSeenSnapshot()).toEqual(new Set(["s1"]));
    expect(mod.getSeenSnapshot()).not.toBe(before); // 值变化必须换引用
    expect(window.localStorage.getItem(STORAGE_KEYS.seen)).toBe(JSON.stringify(["s1"]));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("重复 addSeen 幂等：不换引用、不写盘、不通知", async () => {
    const mod = await load();
    mod.addSeen("s1");
    const snapshot = mod.getSeenSnapshot();
    const listener = vi.fn();
    mod.subscribeSeen(listener);

    mod.addSeen("s1");

    expect(mod.getSeenSnapshot()).toBe(snapshot); // 引用稳定
    expect(listener).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEYS.seen)).toBe(JSON.stringify(["s1"]));
  });
});

describe("完成见闻集存储：pruneSeen 惰性裁剪纪律", () => {
  it("只保留 validIds 中的 id 并写穿；返回是否发生裁剪", async () => {
    const mod = await load();
    mod.addSeen("a");
    mod.addSeen("gone");

    const removed = mod.pruneSeen(new Set(["a"]));

    expect(removed).toBe(true);
    expect(mod.getSeenSnapshot()).toEqual(new Set(["a"]));
    expect(window.localStorage.getItem(STORAGE_KEYS.seen)).toBe(JSON.stringify(["a"]));
  });

  it("无删除时零副作用：不写盘、不通知、返回 false", async () => {
    const mod = await load();
    mod.addSeen("a");
    const snapshot = mod.getSeenSnapshot();
    const listener = vi.fn();
    mod.subscribeSeen(listener);

    const removed = mod.pruneSeen(new Set(["a", "b"]));

    expect(removed).toBe(false);
    expect(mod.getSeenSnapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEYS.seen)).toBe(JSON.stringify(["a"]));
  });
});

describe("完成见闻集存储：写失败静默降级（工单 02 AC1 / 故事 11）", () => {
  it("localStorage.setItem 抛错 ⇒ 静默降级：内存态照常推进、不向上抛错", async () => {
    const mod = await load();
    const setItem = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => {
      mod.addSeen("k1");
      mod.addSeen("k2");
      mod.pruneSeen(new Set(["k1"])); // 裁剪路径同样走写盘、同样静默
    }).not.toThrow();

    // 内存快照照常推进（本会话内功能不受影响），只是持久化失败。
    expect(mod.getSeenSnapshot()).toEqual(new Set(["k1"]));
    setItem.mockRestore();
  });
});
