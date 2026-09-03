/**
 * new-session-greeting 纯逻辑测试（工单 04 验收，seam）。
 *
 * seam：喂入构造的会话列表快照（current / byId[id].blank）与注入时钟，
 * 断言触发判定与台词文本。纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 沿用 overlay-session-runtime 测试的 fake sessions 双先例（list 快照 store +
 * __pushList 驱动订阅），本文件内自建带 `blank` 字段的轻量双。
 *
 * 覆盖（memorial 017 D13 / D14 / D16）：
 *   - shouldGreetNewSession：id 变化且 blank 触发 / 同 id 不重复 /
 *     非 blank 不触发 / 挂载时已是 blank 补一次。
 *   - selectNewSessionLine：四档台词与 memorial 017 定稿逐字一致。
 *   - createNewSessionGreeter：挂载补触发、id 变化触发、同 id 不重复、
 *     非 blank 不触发、挂载即非 blank 不触发；时钟 now 可注入。
 */

import { describe, expect, it } from "vitest";
import type { ISessions, SessionListState } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session";
import {
  createNewSessionGreeter,
  NEW_SESSION_LINES,
  selectNewSessionLine,
  shouldGreetNewSession,
  type GreetingBucket,
} from "../../src/client/state-machine/new-session-greeting.ts";

/** 以本地小时构造 Date，隔离时区/日期影响。 */
function at(hour: number, minute = 0): Date {
  return new Date(2026, 0, 1, hour, minute, 0, 0);
}

// ---------------------------------------------------------------------------
// Fake sessions（带 blank 字段的轻量双）
// ---------------------------------------------------------------------------

const A = "a" as SessionId;
const B = "b" as SessionId;
const C = "c" as SessionId;

function makeListState(
  ids: SessionId[],
  current: SessionId | undefined,
  blanks: Partial<Record<string, boolean>> = {},
): SessionListState {
  const byId = {} as Record<SessionId, unknown>;
  for (const id of ids) {
    byId[id] = {
      id,
      displayTitle: id,
      running: false,
      blank: blanks[id] ?? false,
    };
  }
  return {
    ids,
    byId: byId as SessionListState["byId"],
    current,
    phase: "ready",
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as SessionListState;
}

interface MockSessions extends ISessions {
  __pushList(state: SessionListState): void;
}

function createMockSessions(initial: SessionListState): MockSessions {
  let listState = initial;
  const listeners = new Set<() => void>();
  const list = {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): SessionListState {
      return listState;
    },
  };
  return {
    list: list as unknown as ISessions["list"],
    create() {
      return Promise.resolve("" as SessionId);
    },
    refresh() {
      return Promise.resolve();
    },
    searchResultLimit: 10,
    open() {},
    openSubagent() {},
    subagentAddress() {
      return undefined;
    },
    setSubagentCatalogOpen() {},
    refreshSubagents() {
      return Promise.resolve();
    },
    noteAgentPreset() {},
    clear() {},
    search() {
      return Promise.resolve({ items: [], hasMore: false } as unknown);
    },
    fork() {
      return Promise.resolve("" as SessionId);
    },
    provide() {
      return () => {};
    },
    scope() {
      return undefined;
    },
    scopeOf() {
      return undefined;
    },
    sessionOf() {
      return undefined;
    },
    binding() {
      return undefined;
    },
    __pushList(next: SessionListState) {
      listState = next;
      for (const l of listeners) l();
    },
  } as unknown as MockSessions;
}

// ---------------------------------------------------------------------------
// shouldGreetNewSession：纯判定
// ---------------------------------------------------------------------------

describe("shouldGreetNewSession: 触发判定", () => {
  it("id 变化且 blank → 触发", () => {
    expect(shouldGreetNewSession(A, undefined, B, true)).toBe(true);
  });

  it("同 id（current 未变化）→ 不触发", () => {
    expect(shouldGreetNewSession(A, undefined, A, true)).toBe(false);
  });

  it("已问候过的同 id（lastGreetedId）→ 不重复", () => {
    expect(shouldGreetNewSession(B, A, A, true)).toBe(false);
  });

  it("非 blank → 不触发（即便 id 变化）", () => {
    expect(shouldGreetNewSession(A, undefined, B, false)).toBe(false);
  });

  it("current 为 undefined → 不触发", () => {
    expect(shouldGreetNewSession(A, undefined, undefined, true)).toBe(false);
  });

  it("挂载时已是 blank（prevCurrent undefined）→ 补触发一次", () => {
    expect(shouldGreetNewSession(undefined, undefined, A, true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// selectNewSessionLine：四档台词逐字
// ---------------------------------------------------------------------------

describe("selectNewSessionLine: 四档台词逐字（memorial 017 D16）", () => {
  it("上午档 → 晨安台词", () => {
    expect(selectNewSessionLine(at(8))).toBe(NEW_SESSION_LINES.morning);
    expect(selectNewSessionLine(at(8))).toBe(
      "大人，晨安。今日有何差遣？(￣▽￣)",
    );
  });

  it("下午档 → 午后安好台词", () => {
    expect(selectNewSessionLine(at(14))).toBe(NEW_SESSION_LINES.afternoon);
    expect(selectNewSessionLine(at(14))).toBe(
      "大人，午后安好。有何吩咐？(・∀・)",
    );
  });

  it("晚上档 → 夜安台词", () => {
    expect(selectNewSessionLine(at(20))).toBe(NEW_SESSION_LINES.evening);
    expect(selectNewSessionLine(at(20))).toBe(
      "大人，夜安。可要姜晓侍候？(￣ー￣)",
    );
  });

  it("该休息档 → 夜深了台词", () => {
    expect(selectNewSessionLine(at(23, 30))).toBe(NEW_SESSION_LINES.rest);
    expect(selectNewSessionLine(at(23, 30))).toBe(
      "夜深了，大人还不歇息？(¬_¬)",
    );
  });

  it("NEW_SESSION_LINES 四档与定稿逐字一致", () => {
    const expected: Record<GreetingBucket, string> = {
      morning: "大人，晨安。今日有何差遣？(￣▽￣)",
      afternoon: "大人，午后安好。有何吩咐？(・∀・)",
      evening: "大人，夜安。可要姜晓侍候？(￣ー￣)",
      rest: "夜深了，大人还不歇息？(¬_¬)",
    };
    (Object.keys(expected) as GreetingBucket[]).forEach((bucket) => {
      expect(NEW_SESSION_LINES[bucket]).toBe(expected[bucket]);
    });
  });
});

// ---------------------------------------------------------------------------
// createNewSessionGreeter：订阅行为集成（fake sessions 双 + now 注入）
// ---------------------------------------------------------------------------

describe("createNewSessionGreeter: 订阅触发行为", () => {
  it("挂载时当前已是 blank → 补触发一次（上午档）", () => {
    const greeted: string[] = [];
    const sessions = createMockSessions(
      makeListState([A, B], A, { [A]: true }),
    );
    const g = createNewSessionGreeter({
      sessions,
      now: () => at(8),
      onGreet: (line) => greeted.push(line),
    });
    expect(greeted).toEqual(["大人，晨安。今日有何差遣？(￣▽￣)"]);
    g.dispose();
  });

  it("current 变化到另一个 blank 会话 → 再触发一次", () => {
    const greeted: string[] = [];
    const sessions = createMockSessions(
      makeListState([A, B], A, { [A]: true, [B]: true }),
    );
    const g = createNewSessionGreeter({
      sessions,
      now: () => at(8),
      onGreet: (line) => greeted.push(line),
    });
    sessions.__pushList(makeListState([A, B], B, { [A]: true, [B]: true }));
    expect(greeted).toEqual([
      "大人，晨安。今日有何差遣？(￣▽￣)",
      "大人，晨安。今日有何差遣？(￣▽￣)",
    ]);
    g.dispose();
  });

  it("current 变化到非 blank 会话 → 不触发", () => {
    const greeted: string[] = [];
    const sessions = createMockSessions(
      makeListState([A, B], A, { [A]: true, [B]: false }),
    );
    const g = createNewSessionGreeter({
      sessions,
      now: () => at(8),
      onGreet: (line) => greeted.push(line),
    });
    sessions.__pushList(makeListState([A, B], B, { [A]: true, [B]: false }));
    expect(greeted).toEqual(["大人，晨安。今日有何差遣？(￣▽￣)"]);
    g.dispose();
  });

  it("同一 id 复用（离开再切回 blank）→ 不重复触发（同 id 不重复）", () => {
    const greeted: string[] = [];
    const sessions = createMockSessions(
      makeListState([A, B], A, { [A]: true, [B]: false }),
    );
    const g = createNewSessionGreeter({
      sessions,
      now: () => at(8),
      onGreet: (line) => greeted.push(line),
    });
    sessions.__pushList(makeListState([A, B], B, { [A]: true, [B]: false }));
    sessions.__pushList(makeListState([A, B], A, { [A]: true, [B]: false }));
    expect(greeted).toEqual(["大人，晨安。今日有何差遣？(￣▽￣)"]);
    g.dispose();
  });

  it("挂载时当前非 blank → 不触发", () => {
    const greeted: string[] = [];
    const sessions = createMockSessions(
      makeListState([A], A, { [A]: false }),
    );
    const g = createNewSessionGreeter({
      sessions,
      now: () => at(8),
      onGreet: (line) => greeted.push(line),
    });
    expect(greeted).toEqual([]);
    g.dispose();
  });

  it("时段映射（下午档）→ 台词随 now 注入切换", () => {
    const greeted: string[] = [];
    const sessions = createMockSessions(
      makeListState([A], A, { [A]: true }),
    );
    const g = createNewSessionGreeter({
      sessions,
      now: () => at(14),
      onGreet: (line) => greeted.push(line),
    });
    expect(greeted).toEqual(["大人，午后安好。有何吩咐？(・∀・)"]);
    g.dispose();
  });

  it("dispose 后列表变化不再触发", () => {
    const greeted: string[] = [];
    const sessions = createMockSessions(
      makeListState([A, B], A, { [A]: true, [B]: true }),
    );
    const g = createNewSessionGreeter({
      sessions,
      now: () => at(8),
      onGreet: (line) => greeted.push(line),
    });
    g.dispose();
    sessions.__pushList(makeListState([A, B], B, { [A]: true, [B]: true }));
    expect(greeted).toEqual(["大人，晨安。今日有何差遣？(￣▽￣)"]);
  });
});
