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
import {
  createPersistentBoolSetting,
  createPersistentIdSetSetting,
  createPersistentSetting,
} from "../persistent-setting.ts";

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

describe("persistent-setting: createPersistentBoolSetting", () => {
  it("键缺失 / 脏数据回落默认；合法值解析生效", () => {
    const s1 = createPersistentBoolSetting("t-bool-missing", true);
    expect(s1.get()).toBe(true);

    window.localStorage.setItem("t-bool-bad", "garbage");
    const s2 = createPersistentBoolSetting("t-bool-bad", false);
    expect(s2.get()).toBe(false);

    window.localStorage.setItem("t-bool-ok", "false");
    const s3 = createPersistentBoolSetting("t-bool-ok", true);
    expect(s3.get()).toBe(false);
  });

  it("set 持久化 + 通知 + 跨标签页同步", () => {
    const s = createPersistentBoolSetting("t-bool-sync", true);
    const listener = vi.fn();
    s.subscribe(listener);

    s.set(false);
    expect(window.localStorage.getItem("t-bool-sync")).toBe("false");
    expect(listener).toHaveBeenLastCalledWith(false);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "t-bool-sync", newValue: "true" }),
    );
    expect(s.get()).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(true);
  });
});

describe("persistent-setting: createPersistentIdSetSetting", () => {
  it("初始化：键缺失回落空集；合法 JSON string[] 读入；脏数据回落空集", () => {
    const a = createPersistentIdSetSetting("t-set-missing");
    expect(a.getSnapshot().size).toBe(0);

    window.localStorage.setItem("t-set-ok", JSON.stringify(["s1", "s2"]));
    const b = createPersistentIdSetSetting("t-set-ok");
    expect(b.getSnapshot()).toEqual(new Set(["s1", "s2"]));

    window.localStorage.setItem("t-set-bad", "{not json");
    const c = createPersistentIdSetSetting("t-set-bad");
    expect(c.getSnapshot().size).toBe(0);

    window.localStorage.setItem("t-set-obj", JSON.stringify({ seen: true }));
    const d = createPersistentIdSetSetting("t-set-obj");
    expect(d.getSnapshot().size).toBe(0);
  });

  it("add 写穿 + 换新引用 + 通知；重复 add 幂等（不换引用不写盘不通知）", () => {
    const s = createPersistentIdSetSetting("t-set-add");
    const before = s.getSnapshot();
    const listener = vi.fn();
    s.subscribe(listener);

    s.add("a");
    expect(s.getSnapshot()).toEqual(new Set(["a"]));
    expect(s.getSnapshot()).not.toBe(before);
    expect(window.localStorage.getItem("t-set-add")).toBe(JSON.stringify(["a"]));
    expect(listener).toHaveBeenCalledTimes(1);

    const after = s.getSnapshot();
    s.add("a");
    expect(s.getSnapshot()).toBe(after);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("t-set-add")).toBe(JSON.stringify(["a"]));
  });

  it("remove 幂等：移出 + 写穿 + 通知；不存在时零副作用", () => {
    const s = createPersistentIdSetSetting("t-set-remove");
    s.add("a");
    s.add("b");
    const listener = vi.fn();
    s.subscribe(listener);

    s.remove("a");
    expect(s.getSnapshot()).toEqual(new Set(["b"]));
    expect(window.localStorage.getItem("t-set-remove")).toBe(JSON.stringify(["b"]));
    expect(listener).toHaveBeenCalledTimes(1);

    const after = s.getSnapshot();
    s.remove("a");
    expect(s.getSnapshot()).toBe(after);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("prune 惰性纪律：只保留 validIds；仅在确有删除时写盘并通知", () => {
    const s = createPersistentIdSetSetting("t-set-prune");
    s.add("a");
    s.add("gone");
    const listener = vi.fn();
    s.subscribe(listener);

    const removed = s.prune(new Set(["a"]));
    expect(removed).toBe(true);
    expect(s.getSnapshot()).toEqual(new Set(["a"]));
    expect(window.localStorage.getItem("t-set-prune")).toBe(JSON.stringify(["a"]));
    expect(listener).toHaveBeenCalledTimes(1);

    const after = s.getSnapshot();
    const noop = s.prune(new Set(["a", "b"]));
    expect(noop).toBe(false);
    expect(s.getSnapshot()).toBe(after);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("写失败静默降级：内存态照常推进、不向上抛错", () => {
    const s = createPersistentIdSetSetting("t-set-writefail");
    const setItem = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => {
      s.add("k1");
      s.add("k2");
      s.prune(new Set(["k1"]));
    }).not.toThrow();
    expect(s.getSnapshot()).toEqual(new Set(["k1"]));
    setItem.mockRestore();
  });

  it("跨标签页同步：storage 事件替换集合并通知；非法值 / 同值不生效", () => {
    const s = createPersistentIdSetSetting("t-set-sync");
    const listener = vi.fn();
    s.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "t-set-sync",
        newValue: JSON.stringify(["x1", "x2"]),
      }),
    );
    expect(s.getSnapshot()).toEqual(new Set(["x1", "x2"]));
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "t-set-sync", newValue: "garbage" }),
    );
    expect(s.getSnapshot()).toEqual(new Set(["x1", "x2"]));
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "t-set-sync",
        newValue: JSON.stringify(["x1", "x2"]),
      }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("其他键的 storage 事件不影响本实例", () => {
    const s = createPersistentIdSetSetting("t-set-other");
    const listener = vi.fn();
    s.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "t-unrelated", newValue: JSON.stringify(["a"]) }),
    );
    expect(s.getSnapshot().size).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
});
