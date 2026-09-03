// @vitest-environment jsdom
/**
 * greeting-enabled 纯逻辑测试（工单 03 验收，seam）。
 *
 * seam：直喂 `setGreetingEnabled` / 读 `getGreetingEnabled` + `greetingEnabledStore`
 * 快照，并断言关闭后 `createNewSessionGreeter` 不再弹请安台词（外部行为）。
 * 纯逻辑，不依赖 React（仅 jsdom 提供 localStorage 以验证持久化）。
 *
 * 覆盖（ADR-0036 D8）：
 *   - 默认值：键缺失 → 开（true）
 *   - 关闭 → getter / 快照反映 false，且 localStorage 写入 "false"
 *   - 持久化默认值（重启保持）：set 后构造全新实例读到持久化值；清键后新实例回落默认开
 *   - 外部行为：关 → 挂载即 blank 会话也不弹台词；开 → 弹
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createPersistentSetting,
  STORAGE_KEYS,
} from "../../packages/dsh-session-bubble/src/index.ts";
import {
  getGreetingEnabled,
  greetingEnabledStore,
  setGreetingEnabled,
} from "../../src/client/greeting-enabled.ts";
import {
  createNewSessionGreeter,
  isNewSessionGreetingEnabled,
} from "../../src/client/state-machine/new-session-greeting.ts";

// 与 greeting-enabled.ts 同构的工厂配置（验证持久化默认值用）。
function makeFreshSetting() {
  return createPersistentSetting<boolean>(STORAGE_KEYS.greetingEnabled, {
    serialize: (v) => (v ? "true" : "false"),
    parse: (raw) => {
      if (raw === "true") return true;
      if (raw === "false") return false;
      return undefined;
    },
    default: true,
  });
}

/** 轻量 fake sessions（带 blank 字段），仅满足 greeter 订阅契约。 */
function makeSessions(current: string, blank: boolean) {
  const state = {
    ids: [current],
    byId: {
      [current]: { id: current, displayTitle: current, running: false, blank },
    },
    current,
    phase: "ready" as const,
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as unknown as import("@deepseek-ai/dsh-api-session-controller/client").SessionListState;
  const listeners = new Set<() => void>();
  return {
    list: {
      getSnapshot: () => state,
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      },
    },
    /** 推进当前会话到另一 blank 会话（驱动 subscribe 回调 → 触发 greeter 重评估）. */
    __push(nextCurrent: string) {
      (state as { current: string }).current = nextCurrent;
      (state as { ids: string[] }).ids = [nextCurrent];
      (state as { byId: Record<string, unknown> }).byId = {
        [nextCurrent]: {
          id: nextCurrent,
          displayTitle: nextCurrent,
          running: false,
          blank: true,
        },
      };
      for (const l of listeners) l();
    },
  };
}

/** greeter 调用处的 sessions 类型（mock 仅满足 list 订阅契约，整体 cast 绕过 ISessions 其余字段）. */
type GreeterSessions = Parameters<typeof createNewSessionGreeter>[0]["sessions"];
function asSessions(m: ReturnType<typeof makeSessions>): GreeterSessions {
  return m as unknown as GreeterSessions;
}

beforeEach(() => {
  window.localStorage.clear();
  // 重置单例到默认开，保证用例间与顺序无关（persistent-setting 内存缓存重同步）。
  setGreetingEnabled(true);
});

describe("greeting-enabled: 开关存储与默认值（ADR-0036 D8）", () => {
  it("默认开：键缺失 → getGreetingEnabled / store 快照均为 true", () => {
    window.localStorage.clear();
    expect(getGreetingEnabled()).toBe(true);
    expect(greetingEnabledStore.getSnapshot()).toBe(true);
    expect(isNewSessionGreetingEnabled()).toBe(true);
  });

  it("关闭 → getter / 快照反映 false，并写入 localStorage('jx-greeting-enabled'='false')", () => {
    setGreetingEnabled(false);
    expect(getGreetingEnabled()).toBe(false);
    expect(greetingEnabledStore.getSnapshot()).toBe(false);
    expect(isNewSessionGreetingEnabled()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.greetingEnabled)).toBe(
      "false",
    );
  });

  it("重新打开 → getter / 快照回升 true，localStorage 写入 'true'", () => {
    setGreetingEnabled(false);
    setGreetingEnabled(true);
    expect(getGreetingEnabled()).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEYS.greetingEnabled)).toBe(
      "true",
    );
  });

  it("持久化默认值（重启保持）：set(false) 后全新实例仍读到 false", () => {
    setGreetingEnabled(false);
    const fresh = makeFreshSetting();
    expect(fresh.get()).toBe(false);
  });

  it("持久化默认值（重启保持）：清键后全新实例回落默认开", () => {
    setGreetingEnabled(false);
    window.localStorage.clear();
    const fresh = makeFreshSetting();
    expect(fresh.get()).toBe(true);
  });
});

describe("greeting-enabled: 外部行为（三处生效语义之台词落点）", () => {
  it("开（默认）→ 挂载即 blank 会话弹请安台词", () => {
    const greeted: string[] = [];
    const g = createNewSessionGreeter({
      sessions: asSessions(makeSessions("a", true)),
      now: () => new Date(2026, 0, 1, 8),
      onGreet: (line) => greeted.push(line),
    });
    expect(greeted).toHaveLength(1);
    g.dispose();
  });

  it("关 → 挂载即 blank 会话也不弹台词（新建会话台词静默）", () => {
    setGreetingEnabled(false);
    const greeted: string[] = [];
    const g = createNewSessionGreeter({
      sessions: asSessions(makeSessions("a", true)),
      now: () => new Date(2026, 0, 1, 8),
      onGreet: (line) => greeted.push(line),
    });
    expect(greeted).toEqual([]);
    g.dispose();
  });

  it("中途关闭 → 已订阅的 greeter 在后续 blank 会话切换时不再弹（即时生效）", () => {
    setGreetingEnabled(true);
    const greeted: string[] = [];
    const sessions = makeSessions("a", true);
    const g = createNewSessionGreeter({
      sessions: asSessions(sessions),
      now: () => new Date(2026, 0, 1, 8),
      onGreet: (line) => greeted.push(line),
    });
    expect(greeted).toHaveLength(1); // 挂载补触发一次

    // 关开关，再切到另一个 blank 会话 → 应静默（不补弹）。
    setGreetingEnabled(false);
    sessions.__push("b");
    expect(greeted).toHaveLength(1);

    // 重新开启，再切到第三个 blank 会话 → 应恢复弹。
    setGreetingEnabled(true);
    sessions.__push("c");
    expect(greeted).toHaveLength(2);

    g.dispose();
  });
});
