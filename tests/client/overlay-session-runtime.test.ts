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

import { describe, expect, it, vi } from "vitest";
import {
  createOverlaySessionRuntime,
  FOCUS_DEBOUNCE_MS,
  POKE_HOLD_MS,
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

// ---------------------------------------------------------------------------
// permission 消退（授权完成）：下降沿补边 + 紧急态退出不经防抖
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: permission 消退（授权完成）", () => {
  it("授权完成 → 立即离开 permission 落 working（不经防抖、不推进时钟）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
    });
    // 工具调用中请求授权 → permission 硬切
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    expect(runtime.getSnapshot().currentState).toBe("permission");
    // 授权完成（pending 落、工具调用继续）→ 立即落 working，无需等防抖窗口
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: false }),
    );
    const s = runtime.getSnapshot();
    expect(s.currentState).toBe("working");
    expect(finalLoopState(s)).toBe("working");
    runtime.dispose();
  });

  it("拒绝/中止 → done（回合结束边沿）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
    });
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    expect(runtime.getSnapshot().currentState).toBe("permission");
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: false, runningCallsCount: 1, pending: false }),
    );
    expect(runtime.getSnapshot().currentState).toBe("done");
    runtime.dispose();
  });

  it("非焦点会话 permission 抢焦，授权完成后交还用户焦点", () => {
    let now = 1000;
    const sessions = createMockSessions(makeListState([A, B], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 100,
    });
    // A 焦点 thinking（防抖后落态）
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    now += FOCUS_DEBOUNCE_MS + 1;
    runtime.__tick();
    expect(runtime.getSnapshot().currentState).toBe("thinking");
    // B 非焦点请求授权 → 抢焦
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 1, pending: true }),
    );
    expect(runtime.getSnapshot().currentState).toBe("permission");
    expect(runtime.getSnapshot().focusSessionId).toBe(B);
    // B 授权完成 → 紧急态消退，交还 A
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 1, pending: false }),
    );
    const s = runtime.getSnapshot();
    expect(s.focusSessionId).toBe(A);
    // 交还后 A、B 双会话并行 running（B 工具调用继续）→ 按 ADR-0010 D5 驻留 working
    expect(s.currentState).toBe("working");
    runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// ADR-0011：点击惊吓 poke（显示层覆盖）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 点击惊吓 poke（ADR-0011）", () => {
  it("无会话 idle 下点击 → 惊吓入场（idle→surprised 过渡 + 惊吓循环），focusNonce 不变", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions, { tickIntervalMs: 100 });
    const n0 = runtime.getSnapshot().focusNonce;
    runtime.poke();
    const s = runtime.getSnapshot();
    expect(s.currentState).toBe("surprised");
    expect(s.focusNonce).toBe(n0); // poke 不递增 focusNonce（与彩蛋一致，无淡入淡出）
    const transitions = s.playback.filter((p) => p.kind === "transition");
    expect(transitions.length).toBe(1);
    if (transitions[0].kind === "transition") {
      expect(transitions[0].url).toBe(transitionAssetUrl("idle", "surprised"));
    }
    expect(finalLoopState(s)).toBe("surprised");
    runtime.dispose();
    vi.useRealTimers();
  });

  it("冷却：poke 播放中重复点击忽略（不重启动画，播放计划引用不变）", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions, { tickIntervalMs: 100 });
    runtime.poke();
    const p1 = runtime.getSnapshot().playback;
    runtime.poke();
    expect(runtime.getSnapshot().playback).toBe(p1);
    runtime.dispose();
    vi.useRealTimers();
  });

  it("播放推进：入场过渡播完后驻留 POKE_HOLD_MS，再回落过渡播完后恢复", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions, { tickIntervalMs: 100 });
    runtime.poke();
    expect(runtime.getSnapshot().currentState).toBe("surprised");
    // 入场过渡（idle→surprised 766ms）播完 + 驻留结束 → 回落：currentState 回 returnState（idle）
    vi.advanceTimersByTime(766 + POKE_HOLD_MS);
    expect(runtime.getSnapshot().currentState).toBe("idle");
    // 回落过渡（surprised→idle 766ms）播完 → poke 清除，恢复 idle
    vi.advanceTimersByTime(766);
    const s = runtime.getSnapshot();
    expect(s.currentState).toBe("idle");
    expect(finalLoopState(s)).toBe("idle");
    runtime.dispose();
    vi.useRealTimers();
  });

  it("紧急态（error）存在时不触发 poke", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, { tickIntervalMs: 100 });
    sessions.__session(A)?.__push(makeSnapshot(A, { hasError: true }));
    expect(runtime.getSnapshot().currentState).toBe("error");
    runtime.poke();
    expect(runtime.getSnapshot().currentState).toBe("error");
    runtime.dispose();
  });

  it("并行驻留 working 下点击 → 惊吓 → 回落回 working", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
      random: () => 0.5,
    });
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true, runningCallsCount: 1 }));
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(makeSnapshot(B, { running: true, runningCallsCount: 2 }));
    expect(runtime.getSnapshot().currentState).toBe("working");
    runtime.poke();
    expect(runtime.getSnapshot().currentState).toBe("surprised");
    // 入场过渡（working→idle 3484 + idle→surprised 766）+ 驻留 3000 后进入回落
    vi.advanceTimersByTime(3484 + 766 + POKE_HOLD_MS);
    expect(runtime.getSnapshot().currentState).toBe("working"); // 回落回 working
    // 回落过渡（surprised→idle 766 + idle→working 3484）播完 → poke 清除
    vi.advanceTimersByTime(766 + 3484);
    expect(runtime.getSnapshot().currentState).toBe("working");
    expect(finalLoopState(runtime.getSnapshot())).toBe("working");
    runtime.dispose();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// 工单 09/10：焦点会话自身的紧急态不得被显示层覆盖遮蔽（ADR-0010 D1 延伸）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 焦点会话紧急态可见性（工单 09/10）", () => {
  it("工单09：poke 入场期间焦点会话进入 permission → 立即取消惊吓并显示 permission", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, { tickIntervalMs: 100 });
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    runtime.poke();
    expect(runtime.getSnapshot().currentState).toBe("surprised");
    // 焦点会话自身请求授权：permission 必须立即可见（惊吓序列被取消）
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    const s = runtime.getSnapshot();
    expect(s.currentState).toBe("permission");
    expect(finalLoopState(s)).toBe("permission");
    // poke 序列已清除：推进任意时长不得再出现 surprised
    vi.advanceTimersByTime(20_000);
    expect(runtime.getSnapshot().currentState).toBe("permission");
    runtime.dispose();
    vi.useRealTimers();
  });

  it("工单09：poke 回落段同样被焦点会话 permission 打断（含回落段语义）", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, { tickIntervalMs: 100 });
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    runtime.poke();
    // 推进到回落段（入场 4250ms + 驻留 3000ms 后即回落）
    vi.advanceTimersByTime(3484 + 766 + POKE_HOLD_MS + 100);
    expect(runtime.getSnapshot().currentState).not.toBe("surprised");
    // 回落期间授权请求到达 → 立即切 permission
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    const s = runtime.getSnapshot();
    expect(s.currentState).toBe("permission");
    expect(finalLoopState(s)).toBe("permission");
    runtime.dispose();
    vi.useRealTimers();
  });

  it("工单10：并行驻留期间焦点会话自身 permission 立即可见，批准后恢复 working 驻留", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
      variantRotationEnabled: () => false,
      random: () => 0.5,
    });
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 2 }),
    );
    expect(runtime.getSnapshot().currentState).toBe("working"); // 并行驻留生效
    // 焦点会话 A 自身请求授权：不得被并行驻留的 working 覆盖
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    const s = runtime.getSnapshot();
    expect(s.currentState).toBe("permission");
    expect(finalLoopState(s)).toBe("permission");
    // 批准完成 → 紧急消退，恢复并行驻留 working
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 2, pending: false }),
    );
    expect(runtime.getSnapshot().currentState).toBe("working");
    runtime.dispose();
    vi.useRealTimers();
  });

  it("工单10：并行驻留期间焦点会话自身 error 同样立即可见", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
      variantRotationEnabled: () => false,
      random: () => 0.5,
    });
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 2 }),
    );
    expect(runtime.getSnapshot().currentState).toBe("working");
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, hasError: true }),
    );
    expect(runtime.getSnapshot().currentState).toBe("error");
    runtime.dispose();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// 显示层序列真实时长对齐：poke / 彩蛋定时器不得截断过渡段（实测时长表）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 显示层序列真实时长对齐", () => {
  it("poke：入场过渡播完才开驻留计时，退场过渡播完才交还（idle 往返全程 4532ms）", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions, { tickIntervalMs: 100 });
    runtime.poke();
    // idle→surprised 过渡 766ms 内计划保持入场序列（末项惊吓循环）
    vi.advanceTimersByTime(765);
    let playback = runtime.getSnapshot().playback;
    expect(playback[playback.length - 1]?.kind).toBe("loop");
    expect(playback[0]?.kind).toBe("transition");
    // 驻留窗口（至 766+3000=3766ms）内仍是入场序列
    vi.advanceTimersByTime(2999);
    playback = runtime.getSnapshot().playback;
    expect(playback[playback.length - 1]?.url).toBe(loopAssetUrl("surprised"));
    // 驻留结束（t=3766）→ 回落计划（surprised→idle 过渡在前）
    vi.advanceTimersByTime(2);
    playback = runtime.getSnapshot().playback;
    expect(playback[0]?.kind).toBe("transition");
    if (playback[0]?.kind === "transition") {
      expect(playback[0].url).toBe(transitionAssetUrl("surprised", "idle"));
    }
    // 回落过渡 766ms 播完 → poke 清除交还 idle 循环
    vi.advanceTimersByTime(765);
    expect(runtime.getSnapshot().currentState).toBe("idle");
    vi.advanceTimersByTime(1);
    const done = runtime.getSnapshot();
    expect(done.currentState).toBe("idle");
    expect(finalLoopState(done)).toBe("idle");
    runtime.dispose();
    vi.useRealTimers();
  });

  it("彩蛋：入场过渡播完才开始 3s 表情展示，退场过渡播完才清除（happy 全程 11500ms）", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    const randomSeq = [0.9, 0.72]; // 间隔=120000+0.9*180000=282000；floor(0.72*9)=6→happy
    let r = 0;
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
      random: () => randomSeq[r++] ?? 0.5,
    });
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 2 }),
    );
    expect(runtime.getSnapshot().currentState).toBe("working"); // 并行驻留
    vi.advanceTimersByTime(282_000); // 彩蛋触发
    const egg = runtime.getSnapshot();
    expect(egg.currentState).toBe("happy");
    expect(egg.playback[0]?.kind).toBe("transition");
    if (egg.playback[0]?.kind === "transition") {
      expect(egg.playback[0].url).toBe(transitionAssetUrl("working", "idle"));
    }
    // 展示期（入场 3484+766=4250 起 3000ms）内计划保持**入场序列**
    // （判别特征：含 happy 循环项；退场计划不含）
    vi.advanceTimersByTime(7249);
    let playback = runtime.getSnapshot().playback;
    expect(
      playback.some((p) => p.kind === "loop" && p.url === loopAssetUrl("happy")),
    ).toBe(true);
    // 展示结束 → 退场计划（happy→idle 在前）
    vi.advanceTimersByTime(1);
    playback = runtime.getSnapshot().playback;
    expect(playback[0]?.kind).toBe("transition");
    if (playback[0]?.kind === "transition") {
      expect(playback[0].url).toBe(transitionAssetUrl("happy", "idle"));
    }
    // 退场过渡 766+3484=4250ms 播完 → 彩蛋清除，回并行驻留 working
    vi.advanceTimersByTime(4250);
    const done = runtime.getSnapshot();
    expect(done.currentState).toBe("working");
    expect(finalLoopState(done)).toBe("working");
    runtime.dispose();
    vi.useRealTimers();
  });

  it("并行驻留上升沿必须触发彩蛋调度（基线采样在落态前，回归锁）", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    // 第一个 random 决定调度间隔：0 → 2min（下限），推进 2min 即触发
    let r = 0;
    const randomSeq = [0, 0.72]; // floor(0.72*9)=6 → happy
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
      random: () => randomSeq[r++] ?? 0.5,
    });
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    sessions.__pushList(makeListState([A, B], A));
    expect(runtime.getSnapshot().currentState).toBe("idle"); // B 尚未 running
    // B 转入工作：这是第二个 running 会话 —— hold 上升沿发生在本次快照内，
    // 回归点：基线若在落态后采样，此处将漏检、彩蛋永不调度。
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 1 }),
    );
    expect(runtime.getSnapshot().currentState).toBe("working"); // 并行驻留生效
    vi.advanceTimersByTime(120_000); // 彩蛋定时器到点
    expect(runtime.getSnapshot().currentState).toBe("happy");
    runtime.dispose();
    vi.useRealTimers();
  });
});
