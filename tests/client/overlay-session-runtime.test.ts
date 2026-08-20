/**
 * overlay-session-runtime 纯逻辑测试（工单 06-02 验收 + ADR-0010，seam）。
 *
 * seam：输入（会话注册/注销、快照差分事件、焦点变化、时钟推进）
 * → 断言输出（焦点会话、playback 序列、currentState、focusNonce）。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（对齐工单 02 验收标准 + ADR-0008 + ADR-0010）：
 *   - 注册：sessions.list 出现新 id → 自动创建实例并挂订阅
 *   - 注销：ids 移除 → 销毁实例并释放订阅（无泄漏）
 *   - 焦点跟随：current 变化 → focusSessionId 跟随
 *   - 焦点切换不播过渡：直接切目标会话当前 loop，无 transition 项
 *   - 切回已结束会话：保留状态（如 done），不从头推导
 *   - 每会话独立：A thinking、B error 互不干扰
 *   - 无会话：focusSessionId=undefined，playback=[loop-idle]
 *   - 时间驱动：thinking 超 READING_THRESHOLD_MS → reading（注入时钟）
 *   - 时间驱动：done 驻留 DONE_HOLD_MS → idle（注入时钟）
 *   - 焦点层防抖：工作态（thinking/reading/replying/working）防抖 FOCUS_DEBOUNCE_MS
 *   - 多会话并行驻留：≥2 running 且至少一个非 idle → 显示 working
 *   - 紧急抢焦：非焦点会话 permission/error 抢焦，消退后交还
 */

import { describe, expect, it } from "vitest";
import {
  createOverlaySessionRuntime,
  FOCUS_DEBOUNCE_MS,
  type RuntimeSnapshot,
} from "../../src/client/state-machine/overlay-session-runtime.ts";
import {
  DEFAULT_TRANSITION_DURATION_MS,
  loopAssetUrl,
  transitionAssetUrl,
  type OverlayState,
} from "../../src/client/state-machine/overlay-state-machine.ts";
import {
  READING_THRESHOLD_MS,
  DONE_HOLD_MS,
} from "../../src/client/state-machine/session-follow.ts";
import type {
  ConversationSnapshot,
  ISessions,
  SessionBinding,
  SessionId,
  SessionListState,
} from "@deepseek-ai/dsh-client-runtime/client";

// ---------------------------------------------------------------------------
// SessionId branded 常量（SDK 的 SessionId 是 Branded<'SessionId'>）
// ---------------------------------------------------------------------------

const A = "a" as SessionId;
const B = "b" as SessionId;

// ---------------------------------------------------------------------------
// Mock Sessions（最小可测 ISessions 双）
// ---------------------------------------------------------------------------

/** 最小 ConversationSnapshot（只填 extractCore 关心字段，其余空值）. */
function makeSnapshot(
  sessionId: SessionId,
  opts: {
    running?: boolean;
    hasVisibleChunk?: boolean;
    runningCallsCount?: number;
    pending?: boolean;
    hasError?: boolean;
  } = {},
): ConversationSnapshot {
  const base = {
    sessionId,
    views: {},
    chat: {},
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    running: opts.running ?? false,
    subagent: null,
    composerPhase: "idle",
    removed: false,
    openState: "open",
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: true,
    lastAgentError: null,
  } as unknown as Record<string, unknown>;
  base.running = opts.running ?? false;
  base.pending = opts.pending ? [{ kind: "approval" }] : [];
  base.runningCalls = Array.from({ length: opts.runningCallsCount ?? 0 }, () => ({}));
  base.promptError = opts.hasError ? ({ kind: "generic" }) : null;
  base.lastAgentError = opts.hasError ? "err" : null;
  base.openError = null;
  base.partial = opts.hasVisibleChunk
    ? ({ blocks: [{ kind: "text", text: "x" }] })
    : null;
  return base as unknown as ConversationSnapshot;
}

/** Mock SessionFace（只暴露 subscribe/getSnapshot）. */
interface MockSession {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ConversationSnapshot;
  /** 测试用：推送新快照并通知订阅者. */
  __push(snapshot: ConversationSnapshot): void;
}

function createMockSession(initial: ConversationSnapshot): MockSession {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    __push(next) {
      snapshot = next;
      for (const l of listeners) l();
    },
  };
}

/** Mock ISessions（只暴露 list + binding，足够 runtime 使用）. */
interface MockSessions extends ISessions {
  /** 测试用：推送新 list state 并通知订阅者. */
  __pushList(state: SessionListState): void;
  /** 测试用：取某会话的 MockSession（用于 __push 快照）. */
  __session(id: SessionId): MockSession | undefined;
}

function createMockSessions(initial: SessionListState): MockSessions {
  let listState = initial;
  const listListeners = new Set<() => void>();
  const sessions = new Map<SessionId, MockSession>();

  const list = {
    subscribe(listener: () => void): () => void {
      listListeners.add(listener);
      return () => {
        listListeners.delete(listener);
      };
    },
    getSnapshot(): SessionListState {
      return listState;
    },
  };

  function binding(id: SessionId): SessionBinding | undefined {
    let s = sessions.get(id);
    if (!s) {
      s = createMockSession(makeSnapshot(id));
      sessions.set(id, s);
    }
    return {
      sessionId: id,
      session: s as unknown as SessionBinding["session"],
      ctx: {} as SessionBinding["ctx"],
    };
  }

  const mock: MockSessions = {
    list: list as unknown as ISessions["list"],
    currentProvideInfo: {} as ISessions["currentProvideInfo"],
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
    binding,
    __pushList(next: SessionListState) {
      listState = next;
      for (const l of listListeners) l();
    },
    __session(id: SessionId) {
      return sessions.get(id);
    },
  } as unknown as MockSessions;
  return mock;
}

/** 构造 SessionListState（只填 ids/byId/current，其余最小）. */
function makeListState(
  ids: SessionId[],
  current: SessionId | undefined,
): SessionListState {
  const byId = {} as Record<SessionId, unknown>;
  for (const id of ids) byId[id] = { sessionId: id, title: id, running: false };
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

// ---------------------------------------------------------------------------
// 辅助断言
// ---------------------------------------------------------------------------

/** 取 playback 末尾 loop 项的 state（落入的循环态）. */
function finalLoopState(snapshot: RuntimeSnapshot): OverlayState | undefined {
  const last = snapshot.playback[snapshot.playback.length - 1];
  return last && last.kind === "loop" ? last.state : undefined;
}

/** playback 是否含 transition 项. */
function hasTransition(snapshot: RuntimeSnapshot): boolean {
  return snapshot.playback.some((p) => p.kind === "transition");
}

// ---------------------------------------------------------------------------
// 注册 / 注销 / 生命周期
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 注册与生命周期", () => {
  it("无会话 → focusSessionId=undefined，playback=[loop-idle]", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions);
    const s = runtime.getSnapshot();
    expect(s.focusSessionId).toBe(undefined);
    expect(s.currentState).toBe("idle");
    expect(finalLoopState(s)).toBe("idle");
    expect(hasTransition(s)).toBe(false);
    runtime.dispose();
  });

  it("列表出现新 id → 自动注册，焦点跟随 current", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions);
    sessions.__pushList(makeListState([A], A));
    const s = runtime.getSnapshot();
    expect(s.focusSessionId).toBe(A);
    expect(s.currentState).toBe("idle");
    runtime.dispose();
  });

  it("从列表移除 → 销毁实例，焦点回 undefined", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    // thinking 走防抖，需推进超过 FOCUS_DEBOUNCE_MS 后经 tick 落态
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("thinking");
    sessions.__pushList(makeListState([], undefined));
    const s = runtime.getSnapshot();
    expect(s.focusSessionId).toBe(undefined);
    expect(s.currentState).toBe("idle");
    runtime.dispose();
  });

  it("切回已结束会话 → 显示保留状态（done），不从头推导", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const runtime = createOverlaySessionRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    expect(runtime.getSnapshot().currentState).toBe("done");
    sessions.__pushList(makeListState([A, B], B));
    expect(runtime.getSnapshot().focusSessionId).toBe(B);
    sessions.__pushList(makeListState([A, B], A));
    expect(runtime.getSnapshot().currentState).toBe("done");
    runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// 焦点跟随 / 焦点切换不播过渡
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 焦点跟随", () => {
  it("current 变化 → focusSessionId 跟随", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const runtime = createOverlaySessionRuntime(sessions);
    expect(runtime.getSnapshot().focusSessionId).toBe(A);
    sessions.__pushList(makeListState([A, B], B));
    expect(runtime.getSnapshot().focusSessionId).toBe(B);
    sessions.__pushList(makeListState([A, B], A));
    expect(runtime.getSnapshot().focusSessionId).toBe(A);
    runtime.dispose();
  });

  it("焦点切换不播过渡（直接切目标会话当前 loop）", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A, B], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("thinking");
    // 切焦时 flush pending → 新焦点 B（idle）直接显示，无 transition
    sessions.__pushList(makeListState([A, B], B));
    const s = runtime.getSnapshot();
    expect(s.currentState).toBe("idle");
    expect(hasTransition(s)).toBe(false);
    expect(finalLoopState(s)).toBe("idle");
    runtime.dispose();
  });

  it("焦点切换 focusNonce 递增（UI 据此触发淡入淡出）", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const runtime = createOverlaySessionRuntime(sessions);
    const n0 = runtime.getSnapshot().focusNonce;
    sessions.__pushList(makeListState([A, B], B));
    const n1 = runtime.getSnapshot().focusNonce;
    expect(n1).toBeGreaterThan(n0);
    sessions.__pushList(makeListState([A, B], A));
    const n2 = runtime.getSnapshot().focusNonce;
    expect(n2).toBeGreaterThan(n1);
    runtime.dispose();
  });

  it("current 不变的其他 list 变化不递增 focusNonce", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions);
    const n0 = runtime.getSnapshot().focusNonce;
    sessions.__pushList(makeListState([A, B], A));
    expect(runtime.getSnapshot().focusNonce).toBe(n0);
    runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// 每会话独立
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 每会话独立", () => {
  it("每会话 SM 独立 + B error 抢焦、消退交还", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A, B], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("thinking"); // A 焦点 thinking

    // B error → 抢焦浮层（ADR-0008 / ADR-0010 D7）
    sessions.__session(B)?.__push(makeSnapshot(B, { hasError: true }));
    expect(runtime.getSnapshot().currentState).toBe("error"); // B 抢焦

    // B error 消退 → 交还 A（A SM 仍为 thinking）
    sessions.__session(B)?.__push(makeSnapshot(B, { running: false }));
    expect(runtime.getSnapshot().currentState).toBe("thinking");

    // 手动切焦 B：B 已 idle
    sessions.__pushList(makeListState([A, B], B));
    expect(runtime.getSnapshot().currentState).toBe("idle");
    // 切回 A：A SM 仍 thinking
    sessions.__pushList(makeListState([A, B], A));
    expect(runtime.getSnapshot().currentState).toBe("thinking");
    runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// 时间驱动（注入时钟）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 时间驱动", () => {
  it("thinking 持续 >= READING_THRESHOLD_MS → reading", () => {
    const sessions = createMockSessions(makeListState([A], A));
    let now = 1000;
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    // 先 flush 防抖让 thinking 落态
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("thinking");
    // 超 READING_THRESHOLD_MS → 推导 reading；reading 本身也是防抖工作态，需再等窗口
    now += READING_THRESHOLD_MS + 1;
    runtime.__tick();
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("reading");
    runtime.dispose();
  });

  it("done 驻留 >= DONE_HOLD_MS → idle", () => {
    const sessions = createMockSessions(makeListState([A], A));
    let now = 1000;
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    expect(runtime.getSnapshot().currentState).toBe("done");
    now += DONE_HOLD_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("idle");
    runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// 订阅接口
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 订阅", () => {
  it("subscribe 在快照变化时通知，取消后不再通知", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions);
    let callCount = 0;
    const unsub = runtime.subscribe(() => {
      callCount += 1;
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    expect(callCount).toBeGreaterThan(0);
    const after = callCount;
    unsub();
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    expect(callCount).toBe(after);
    runtime.dispose();
  });

  it("getSnapshot 在状态未变时返回稳定引用（useSyncExternalStore 兼容）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions);
    const s1 = runtime.getSnapshot();
    const s2 = runtime.getSnapshot();
    expect(s2).toBe(s1);
    runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// dispose 释放全部订阅（无泄漏）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: dispose", () => {
  it("dispose 后 list 推送不再触发通知", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions);
    let callCount = 0;
    runtime.subscribe(() => {
      callCount += 1;
    });
    runtime.dispose();
    const before = callCount;
    sessions.__pushList(makeListState([A, B], A));
    expect(callCount).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 素材 URL 对齐（确保 runtime 输出与现有状态机一致）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 素材 URL", () => {
  it("idle loop URL 对齐 loopAssetUrl", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions);
    const s = runtime.getSnapshot();
    const last = s.playback[s.playback.length - 1];
    expect(last?.kind).toBe("loop");
    expect(last && last.kind === "loop" ? last.url : "").toBe(loopAssetUrl("idle"));
    runtime.dispose();
  });

  it("会话内 thinking→error 过渡段 URL 对齐 transitionAssetUrl", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    // 此刻 thinking 已落态；再 error 硬切 → thinking→idle→error 两段过渡
    sessions.__session(A)?.__push(makeSnapshot(A, { hasError: true }));
    const s = runtime.getSnapshot();
    const transitions = s.playback.filter((p) => p.kind === "transition");
    expect(transitions.length).toBe(2);
    if (transitions[0].kind === "transition") {
      expect(transitions[0].url).toBe(transitionAssetUrl("thinking", "idle"));
    }
    if (transitions[1].kind === "transition") {
      expect(transitions[1].url).toBe(transitionAssetUrl("idle", "error"));
    }
    runtime.dispose();
  });
});

// 防止未使用导入告警
void DEFAULT_TRANSITION_DURATION_MS;

// ---------------------------------------------------------------------------
// ADR-0010：焦点层防抖
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 焦点层防抖（ADR-0010）", () => {
  it("工作态（thinking）切换后不立即生效，需超 FOCUS_DEBOUNCE_MS 才落", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    // 防抖窗口内：still idle
    expect(runtime.getSnapshot().currentState).toBe("idle");
    now += FOCUS_DEBOUNCE_MS - 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("idle");
    now += 2;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("thinking");
    runtime.dispose();
  });

  it("防抖窗口内目标反复变，只按最新 pending 落一次", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true })); // thinking
    now += 500;
    runtime.__tick();
    // 切到 working（runningCallsCount>0 → working）
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true, runningCallsCount: 2 }));
    now += 500;
    runtime.__tick();
    // 防抖尚未到点：始终 idle
    expect(runtime.getSnapshot().currentState).toBe("idle");
    // 超过最后一次更新的窗口
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("working");
    runtime.dispose();
  });

  it("permission/error 硬切：不接受防抖直接落态", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true })); // thinking（未落，防抖中）
    sessions.__session(A)?.__push(makeSnapshot(A, { hasError: true })); // error 硬切
    // error 硬切：立即显示 error
    expect(runtime.getSnapshot().currentState).toBe("error");
    runtime.dispose();
  });

  it("done/idle 直接落：不经防抖", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true })); // thinking 防抖中
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false })); // done 直接落
    expect(runtime.getSnapshot().currentState).toBe("done");
    runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// ADR-0010：多会话并行驻留 working
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 多会话并行驻留（ADR-0010）", () => {
  it("≥2 会话 running 且至少一个非 idle → 浮层显示 working 驻留", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
      random: () => 0.5,
    });
    // A thinking（焦点），B 也进入 running working
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true, runningCallsCount: 1 }));
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(makeSnapshot(B, { running: true, runningCallsCount: 2 }));
    // 并行判定只看底层目标（pendingTarget），即使焦点 A 防抖未落
    expect(runtime.getSnapshot().currentState).toBe("working");
    runtime.dispose();
  });

  it("只剩一个 running 会话 → 恢复焦点会话跟随", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A, B], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
      random: () => 0.5,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true, runningCallsCount: 1 }));
    sessions.__session(B)?.__push(makeSnapshot(B, { running: true, runningCallsCount: 2 }));
    expect(runtime.getSnapshot().currentState).toBe("working");
    // B 结束 → 只剩 A running → 恢复焦点跟随
    sessions.__session(B)?.__push(makeSnapshot(B, { running: false }));
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("working"); // A 焦点工作态（working）
    runtime.dispose();
  });
});
