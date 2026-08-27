/**
 * persistent-setting 工厂测试（架构审查候选者 3 的深化模块）。
 *
 * 环境：jsdom（真实 localStorage + window storage 事件）。
 *
 * 覆盖：
 *   - 默认值：键缺失回落 default；解析失败回落 default
 *   - set：持久化 + get 反映 + 通知订阅者
 *   - subscribe/unsubscribe 语义
 *   - reload：外部改写 localStorage 后重读生效（初始化/恢复语义）
 *   - 跨标签页 storage 事件同步（新值 ≠ 当前值时更新并通知；同值不通知）
 *   - 自定义 serialize/parse（"on"/"off" 格式）
 */

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPersistentSetting } from "../persistent-setting.ts";

beforeEach(() => {
  window.localStorage.clear();
});

describe("persistent-setting: 默认值与解析", () => {
  it("键缺失 → 默认值", () => {
    const s = createPersistentSetting<boolean>("t-missing", {
      parse: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
      default: true,
    });
    expect(s.get()).toBe(true);
  });

  it("解析失败 → 默认值", () => {
    window.localStorage.setItem("t-bad", "garbage");
    const s = createPersistentSetting<boolean>("t-bad", {
      parse: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
      default: true,
    });
    expect(s.get()).toBe(true);
  });

  it("合法持久化值 → 解析生效", () => {
    window.localStorage.setItem("t-ok", "false");
    const s = createPersistentSetting<boolean>("t-ok", {
      parse: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
      default: true,
    });
    expect(s.get()).toBe(false);
  });
});

describe("persistent-setting: set + 订阅", () => {
  it("set 持久化 + get 反映 + 通知", () => {
    const s = createPersistentSetting<number>("t-num", { default: 5 });
    const listener = vi.fn();
    s.subscribe(listener);

    s.set(7);
    expect(s.get()).toBe(7);
    expect(window.localStorage.getItem("t-num")).toBe("7");
    expect(listener).toHaveBeenLastCalledWith(7);
  });

  it("unsubscribe 后不再通知", () => {
    const s = createPersistentSetting<number>("t-num2", { default: 1 });
    const listener = vi.fn();
    const unsub = s.subscribe(listener);
    unsub();
    s.set(2);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("persistent-setting: reload", () => {
  const numOpts = { parse: (raw: string) => Number(raw), default: 5 };

  it("外部改写后 reload 读到新值并通知", () => {
    const s = createPersistentSetting<number>("t-reload", numOpts);
    const listener = vi.fn();
    s.subscribe(listener);

    window.localStorage.setItem("t-reload", "9");
    expect(s.reload()).toBe(9);
    expect(s.get()).toBe(9);
    expect(listener).toHaveBeenLastCalledWith(9);
  });

  it("reload 值未变时不通知", () => {
    const s = createPersistentSetting<number>("t-reload2", numOpts);
    const listener = vi.fn();
    s.subscribe(listener);
    s.reload();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("persistent-setting: 跨标签页同步", () => {
  it("storage 事件新值 ≠ 当前值 → 更新并通知", () => {
    const s = createPersistentSetting<boolean>("t-sync", {
      parse: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
      default: true,
    });
    const listener = vi.fn();
    s.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "t-sync", newValue: "false" }),
    );
    expect(s.get()).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it("storage 事件新值 = 当前值 → 不通知", () => {
    const s = createPersistentSetting<boolean>("t-sync2", {
      parse: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
      default: true,
    });
    const listener = vi.fn();
    s.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "t-sync2", newValue: "true" }),
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it("其他键的 storage 事件不影响本实例", () => {
    const s = createPersistentSetting<boolean>("t-sync3", {
      parse: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
      default: true,
    });
    const listener = vi.fn();
    s.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "t-other", newValue: "false" }),
    );
    expect(s.get()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("persistent-setting: 自定义序列化", () => {
  it("serialize/parse 自定义格式（on/off）", () => {
    const s = createPersistentSetting<boolean>("t-onoff", {
      serialize: (v) => (v ? "on" : "off"),
      parse: (raw) => (raw === "on" ? true : raw === "off" ? false : undefined),
      default: true,
    });
    s.set(false);
    expect(window.localStorage.getItem("t-onoff")).toBe("off");
    expect(s.get()).toBe(false);

    s.set(true);
    expect(window.localStorage.getItem("t-onoff")).toBe("on");
    expect(s.get()).toBe(true);
  });
});
