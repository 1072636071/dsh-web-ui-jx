/**
 * overlay-session-runtime 纯逻辑测试（工单 02/03 验收，seam）。
 *
 * seam：输入（会话注册/注销、快照差分事件、焦点变化、时钟推进）
 * → 断言输出（焦点会话、playback 序列、currentState、focusNonce）。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 时间驱动模式（单一时间接缝）：防抖与显示层序列（表演/轮换/彩蛋/poke）
 * 统一走注入时钟（手动推进 now + 显式 __tick）；不使用 fake timers。
 * 显示层每层每次 tick 至多推进一个相位，跨相位断言需分步 advance。
 * tickIntervalMs 取极大值避免 interval 抢跑。
 *
 * 覆盖（ADR-0016 四态收敛 + ADR-0008/0010/0011 主干）：
 *   - 注册/注销/焦点跟随/焦点切换不播过渡/focusNonce 语义。
 *   - 每会话独立 + B error 抢焦、消退交还。
 *   - 防抖：焦点会话 working 进入防抖 FOCUS_DEBOUNCE_MS；permission/error 硬切。
 *   - 表演：done（整圈边界切出→驻留→回 idle）、nod-smile/frown-wave（批准/拒绝双链）。
 *   - working 轮换：thinking↔reading 各播 2 整圈、整圈边界换段、经待机过渡。
 *   - 摸鱼彩蛋：并行驻留期间随机表情，池收敛为 happy/angry/surprised。
 *   - poke：冷却、紧急态不触发、与表演互斥、紧急态立即打断。
 *
 * fixture 约定（工单 21-01 起）：显示层/轮换/并行驻留/批准返回类用例的会话
 * 一律 `runningCallsCount: 0`（运行中但无 active tool call）——与 ADR-0014
 * 审批等待启发式解耦（该启发式以 runningCalls>0 卡住为判据，另行专属测试）。
 */

import { describe, expect, it } from "vitest";
import {
  createOverlaySessionRuntime,
  FOCUS_DEBOUNCE_MS,
  PERMISSION_BLOCKED_MS,
  ANGRY_BLOCKED_MS,
  POKE_HOLD_MS,
  PERFORMANCE_HOLD_MS,
  PERMISSION_FEEDBACK_HOLD_MS,
  WORKING_LOOP_MS,
  WORKING_ROTATION_LOOPS,
  type OverlaySessionRuntime,
  type RuntimeSnapshot,
} from "../../src/client/state-machine/overlay-session-runtime.ts";
import {
  transitionAssetUrl,
  workingLoopAssetUrl,
  type OverlayState,
  type PerformanceKind,
} from "../../src/client/state-machine/overlay-state-machine.ts";
import type { ConversationSnapshot } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { ISessions, SessionBinding, SessionListState } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type {
  PendingInteractionsSnapshot,
  PendingInteractionsSource,
} from "../../packages/dsh-session-bubble/src/session-list-adapter.ts";

const A = "a" as SessionId;
const B = "b" as SessionId;

/** 过渡段实测时长（与 runtime TRANSITION_EDGE_MS 同源，测试排程用）。 */
const EDGE = {
  idleThinking: 3484,
  idleReading: 5494,
  idlePermission: 3484,
  idleDone: 3484,
  idleSurprised: 766,
  thinkingIdle: 3484,
  readingIdle: 5494,
  permissionIdle: 3484,
  errorIdle: 5494,
  doneIdle: 3484,
  nodSmileIdle: 5494,
  frownWaveIdle: 5494,
  surprisedIdle: 766,
  permissionNodSmile: 3484,
  permissionFrownWave: 3484,
} as const;

// ---------------------------------------------------------------------------
// Mock Sessions
// ---------------------------------------------------------------------------

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
  base.runningCalls = Array.from(
    { length: opts.runningCallsCount ?? 0 },
    () => ({}),
  );
  base.promptError = opts.hasError ? ({ kind: "generic" }) : null;
  base.lastAgentError = opts.hasError ? "err" : null;
  base.openError = null;
  base.partial = opts.hasVisibleChunk
    ? ({ blocks: [{ kind: "text", text: "x" }] })
    : null;
  return base as unknown as ConversationSnapshot;
}

interface MockSession {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ConversationSnapshot;
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

interface MockSessions extends ISessions {
  __pushList(state: SessionListState): void;
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
      eventSource: {} as SessionBinding["eventSource"],
      ctx: {} as SessionBinding["ctx"],
    };
  }

  const mock: MockSessions = {
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

function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i += 1;
    return v;
  };
}

function finalLoopState(
  snapshot: RuntimeSnapshot,
): OverlayState | PerformanceKind | undefined {
  const last = snapshot.playback[snapshot.playback.length - 1];
  return last && last.kind === "loop" ? last.state : undefined;
}

function hasTransition(snapshot: RuntimeSnapshot): boolean {
  return snapshot.playback.some((p) => p.kind === "transition");
}

/** 无 fake timers 的 runtime（同步断言用）。 */
function plainRuntime(sessions: ISessions): OverlaySessionRuntime {
  return createOverlaySessionRuntime(sessions, {
    tickIntervalMs: 1e9,
    random: () => 0.5,
  });
}

/** 注入时钟的 runtime（时间驱动断言用）：advance = 推进 now + 一次 __tick。 */
function timedRuntime(
  sessions: ISessions,
  random: () => number = () => 0.5,
  pendingInteractions?: PendingInteractionsSource,
): {
  rt: OverlaySessionRuntime;
  advanceClock: (ms: number) => void;
  tick: () => void;
  advance: (ms: number) => void;
} {
  let now = 1000;
  const rt = createOverlaySessionRuntime(sessions, {
    now: () => now,
    tickIntervalMs: 1e9,
    random,
    ...(pendingInteractions !== undefined ? { pendingInteractions } : {}),
  });
  return {
    rt,
    advanceClock: (ms: number) => {
      now += ms;
    },
    tick: () => rt.__tick(),
    advance: (ms: number) => {
      now += ms;
      rt.__tick();
    },
  };
}

// ---------------------------------------------------------------------------
// 待交互源（uiSession.pendingInteractions 形状）mock
// ---------------------------------------------------------------------------

interface MockPendingSource {
  readonly source: PendingInteractionsSource;
  /** 整体替换待交互表（sessionId → kind）并通知订阅者。 */
  __set(entries: Record<string, string>): void;
}

function createMockPendingSource(
  initial: Record<string, string> = {},
): MockPendingSource {
  let snapshot: PendingInteractionsSnapshot = toSnapshot(initial);
  const listeners = new Set<() => void>();
  function toSnapshot(entries: Record<string, string>): PendingInteractionsSnapshot {
    return new Map(
      Object.entries(entries).map(([id, kind]) => [id, { kind }]),
    );
  }
  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    __set(entries) {
      snapshot = toSnapshot(entries);
      for (const l of listeners) l();
    },
  };
}
// ---------------------------------------------------------------------------
// 注册 / 注销 / 生命周期
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 注册与生命周期", () => {
  it("无会话 → focusSessionId=undefined，playback=[loop-idle]", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const rt = plainRuntime(sessions);
    const s = rt.getSnapshot();
    expect(s.focusSessionId).toBe(undefined);
    expect(s.currentState).toBe("idle");
    expect(finalLoopState(s)).toBe("idle");
    expect(hasTransition(s)).toBe(false);
    rt.dispose();
  });

  it("列表出现新 id → 自动注册，焦点跟随 current", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const rt = plainRuntime(sessions);
    sessions.__pushList(makeListState([A], A));
    const s = rt.getSnapshot();
    expect(s.focusSessionId).toBe(A);
    expect(s.currentState).toBe("idle");
    rt.dispose();
  });

  it("从列表移除 → 销毁实例，焦点回 undefined", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working");
    sessions.__pushList(makeListState([], undefined));
    const s = t.rt.getSnapshot();
    expect(s.focusSessionId).toBe(undefined);
    expect(s.currentState).toBe("idle");
    t.rt.dispose();
  });

  it("切回已结束会话 → 保留 idle（done 表演已结束），不从头推导", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working");
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    // 工作轮换（reading）首段整圈边界切出 → done 入场
    t.advance(EDGE.idleReading + WORKING_LOOP_MS.reading + 100);
    expect(t.rt.getSnapshot().currentState).toBe("done");
    // 入场（reading→idle→done）+ 驻留 3s 到点 → 退场段
    t.advance(EDGE.readingIdle + EDGE.idleDone + PERFORMANCE_HOLD_MS + 100);
    // 退场（done→idle）播完 → 回 idle
    t.advance(EDGE.doneIdle + 100);
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    // 切走再切回：不重新推导（A 保留 idle，不重播 done）
    sessions.__pushList(makeListState([A, B], B));
    expect(t.rt.getSnapshot().focusSessionId).toBe(B);
    sessions.__pushList(makeListState([A, B], A));
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    t.rt.dispose();
  });
});

// ---------------------------------------------------------------------------
// 焦点跟随
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 焦点跟随", () => {
  it("current 变化 → focusSessionId 跟随", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const rt = plainRuntime(sessions);
    expect(rt.getSnapshot().focusSessionId).toBe(A);
    sessions.__pushList(makeListState([A, B], B));
    expect(rt.getSnapshot().focusSessionId).toBe(B);
    sessions.__pushList(makeListState([A, B], A));
    expect(rt.getSnapshot().focusSessionId).toBe(A);
    rt.dispose();
  });

  it("焦点切换不播过渡（直接切目标会话当前 loop）", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // 切焦到 B（idle）：直切当前 loop，无 transition
    sessions.__pushList(makeListState([A, B], B));
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("idle");
    expect(hasTransition(s)).toBe(false);
    expect(finalLoopState(s)).toBe("idle");
    t.rt.dispose();
  });

  it("焦点切换 focusNonce 递增（焦点切换语义保留，ADR-0016 D15）", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const rt = plainRuntime(sessions);
    const n0 = rt.getSnapshot().focusNonce;
    sessions.__pushList(makeListState([A, B], B));
    expect(rt.getSnapshot().focusNonce).toBeGreaterThan(n0);
    rt.dispose();
  });

  it("current 不变的其他 list 变化不递增 focusNonce", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const rt = plainRuntime(sessions);
    const n0 = rt.getSnapshot().focusNonce;
    sessions.__pushList(makeListState([A, B], A));
    expect(rt.getSnapshot().focusNonce).toBe(n0);
    rt.dispose();
  });
});

// ---------------------------------------------------------------------------
// 每会话独立 + 紧急抢焦
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 每会话独立 + 紧急抢焦", () => {
  it("每会话 SM 独立 + B error 抢焦、消退交还", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working"); // A 焦点 working

    // B error → 抢焦
    sessions.__session(B)?.__push(makeSnapshot(B, { hasError: true }));
    expect(t.rt.getSnapshot().currentState).toBe("error");
    expect(t.rt.getSnapshot().focusSessionId).toBe(B);

    // B error 消退 → 交还 A（A SM 仍为 working）
    sessions.__session(B)?.__push(makeSnapshot(B, { running: false }));
    expect(t.rt.getSnapshot().currentState).toBe("working");

    // 手动切焦 B：B 已 idle
    sessions.__pushList(makeListState([A, B], B));
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    // 切回 A：A SM 仍 working
    sessions.__pushList(makeListState([A, B], A));
    expect(t.rt.getSnapshot().currentState).toBe("working");
    t.rt.dispose();
  });

  it("非焦点会话 permission 抢焦，批准后 nod-smile 并交还用户焦点", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // B 非焦点请求授权 → 抢焦
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 1, pending: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    expect(t.rt.getSnapshot().focusSessionId).toBe(B);
    // B 批准 → nod-smile 表演 → 交还 A（A、B 并行 running → 驻留 working）
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, pending: false }),
    );
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("nod-smile");
    expect(s.focusSessionId).toBe(A); // 紧急消退，交还用户焦点
    // 入场（permission→nod-smile）+ 驻留 2s 到点 → 退场段
    t.advance(EDGE.permissionNodSmile + PERMISSION_FEEDBACK_HOLD_MS + 100);
    // 退场（nod-smile→idle→工作素材）播完 → 回并行驻留 working
    t.advance(EDGE.nodSmileIdle + EDGE.idleReading + 200);
    const done = t.rt.getSnapshot();
    expect(done.currentState).toBe("working");
    expect(done.focusSessionId).toBe(A);
    t.rt.dispose();
  });
});
// ---------------------------------------------------------------------------
// 焦点层防抖（ADR-0010 / PRD 决策 5）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 焦点层防抖（PRD 决策 5）", () => {
  it("working 进入后不立即生效，需超 FOCUS_DEBOUNCE_MS 才落", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    expect(t.rt.getSnapshot().currentState).toBe("idle"); // 防抖窗口内
    t.advanceClock(FOCUS_DEBOUNCE_MS - 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    t.advanceClock(2);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working");
    t.rt.dispose();
  });

  it("permission/error 硬切：不接受防抖直接落态", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const rt = plainRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true })); // 防抖中
    sessions.__session(A)?.__push(makeSnapshot(A, { hasError: true })); // error 硬切
    expect(rt.getSnapshot().currentState).toBe("error");
    rt.dispose();
  });

  it("亚防抖幻影回合（working 从未落态）：running 下降沿不播 done", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    // 未过防抖即结束：SM 从未进 working，done 不触发
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    t.advance(20000);
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    t.rt.dispose();
  });
});

// ---------------------------------------------------------------------------
// 权限反馈双链（PRD 决策 7 / ADR-0016）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 权限反馈双链", () => {
  it("批准 → nod-smile 表演后回 working", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    // 授权完成（running 继续）→ nod-smile 表演
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, pending: false }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("nod-smile");
    // 入场（permission→nod-smile）+ 驻留 2s 到点 → 退场段
    t.advance(EDGE.permissionNodSmile + PERMISSION_FEEDBACK_HOLD_MS + 100);
    // 退场（nod-smile→idle→工作素材）播完 → 回 working
    t.advance(EDGE.nodSmileIdle + EDGE.idleReading + 200);
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("working");
    expect(finalLoopState(s)).toBe("working");
    t.rt.dispose();
  });

  it("拒绝 → frown-wave 表演后回 idle", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: false, pending: false }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("frown-wave");
    // 入场 + 驻留 2s 到点 → 退场段（frown-wave→idle）
    t.advance(EDGE.permissionFrownWave + PERMISSION_FEEDBACK_HOLD_MS + 100);
    // 退场过渡播完 → 回 idle
    t.advance(EDGE.frownWaveIdle + 200);
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    t.rt.dispose();
  });

  it("表演被 permission 硬切打断时立即让位（紧急态原则）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: false, pending: false }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("frown-wave");
    // frown-wave 播放中再次请求授权 → 立即切 permission（不再继续表演）
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("permission");
    expect(finalLoopState(s)).toBe("permission");
    // 推进任意时长不再出现 frown-wave
    t.advance(20000);
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    t.rt.dispose();
  });
});

// ---------------------------------------------------------------------------
// done 表演（PRD 决策 7：整圈边界切出）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: done 表演", () => {
  it("running 下降沿触发，工作态整圈边界切出 → 驻留 3s → 回 idle", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // running 下降沿 → done 待整圈边界（rotation entry: idle→reading + 首圈）
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    // 边界前仍是 working（整圈边界切出原则）
    t.advance(EDGE.idleReading + WORKING_LOOP_MS.reading - 100);
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // 边界到达 → done 入场（reading→idle→done）
    t.advance(200);
    expect(t.rt.getSnapshot().currentState).toBe("done");
    // 入场（reading→idle→done）+ 驻留 3s 到点 → 退场段
    t.advance(EDGE.readingIdle + EDGE.idleDone + PERFORMANCE_HOLD_MS + 100);
    // 退场（done→idle）播完 → 回 idle
    t.advance(EDGE.doneIdle + 200);
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    t.rt.dispose();
  });

  it("边界等待期间回合重启 → done 取消，轮换继续", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working");
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false })); // done 待边界
    // 回合重启（新 running 上升沿）：done 应在边界处被取消
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advance(60000); // 足够多整圈边界
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("working"); // 从未出现 done
    expect(finalLoopState(s)).toBe("working");
    t.rt.dispose();
  });
});
// ---------------------------------------------------------------------------
// poke 惊吓（ADR-0011）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 点击惊吓 poke（ADR-0011）", () => {
  it("无会话 idle 下点击 → 惊吓入场（idle→surprised 过渡 + 惊吓循环）", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const t = timedRuntime(sessions);
    const n0 = t.rt.getSnapshot().focusNonce;
    t.rt.poke();
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("surprised");
    expect(s.focusNonce).toBe(n0); // poke 不递增 focusNonce
    const ts = s.playback.filter((p) => p.kind === "transition");
    expect(ts.length).toBe(1);
    if (ts[0].kind === "transition") {
      expect(ts[0].url).toBe(transitionAssetUrl("idle", "surprised"));
    }
    expect(finalLoopState(s)).toBe("surprised");
    t.rt.dispose();
  });

  it("冷却：poke 播放中重复点击忽略", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const t = timedRuntime(sessions);
    t.rt.poke();
    const p1 = t.rt.getSnapshot().playback;
    t.rt.poke();
    expect(t.rt.getSnapshot().playback).toBe(p1);
    t.rt.dispose();
  });

  it("播放推进：入场过渡播完后驻留 POKE_HOLD_MS，再回落过渡播完后恢复", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const t = timedRuntime(sessions);
    t.rt.poke();
    // 入场过渡（idle→surprised 766ms）播完 + 驻留结束 → 回落段
    t.advance(EDGE.idleSurprised + POKE_HOLD_MS + 100);
    const exiting = t.rt.getSnapshot();
    expect(exiting.currentState).toBe("surprised"); // 回落段仍标惊吓
    const ts = exiting.playback.filter((p) => p.kind === "transition");
    expect(
      ts.some(
        (x) =>
          x.kind === "transition" && x.url === transitionAssetUrl("surprised", "idle"),
      ),
    ).toBe(true);
    // 回落过渡播完 → 恢复 idle
    t.advance(EDGE.surprisedIdle + 100);
    const done = t.rt.getSnapshot();
    expect(done.currentState).toBe("idle");
    expect(finalLoopState(done)).toBe("idle");
    t.rt.dispose();
  });

  it("紧急态（error）存在时不触发 poke", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const rt = plainRuntime(sessions);
    sessions.__session(A)?.__push(makeSnapshot(A, { hasError: true }));
    expect(rt.getSnapshot().currentState).toBe("error");
    rt.poke();
    expect(rt.getSnapshot().currentState).toBe("error");
    rt.dispose();
  });

  it("poke 与表演互斥：poke 期间事件触发的表演仅更新 SM", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    t.rt.poke();
    expect(t.rt.getSnapshot().currentState).toBe("surprised");
    // 期间回合起落：SM 更新，但显示仍是 surprised（互斥）
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    expect(t.rt.getSnapshot().currentState).toBe("surprised");
    // poke 入场 + 驻留到点 → 回落段
    t.advance(EDGE.idleSurprised + POKE_HOLD_MS + 100);
    // 回落过渡播完 → 会话已 idle（亚防抖幻影回合，done 被吞）
    t.advance(EDGE.surprisedIdle + 200);
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    t.rt.dispose();
  });

  it("poke 入场期间焦点会话进入 permission → 立即取消惊吓并显示 permission（工单 09）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    t.rt.poke();
    expect(t.rt.getSnapshot().currentState).toBe("surprised");
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("permission");
    expect(finalLoopState(s)).toBe("permission");
    // poke 已清除：推进任意时长不得再出现 surprised
    t.advance(20000);
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    t.rt.dispose();
  });

  it("并行驻留 working 下点击 → 惊吓 → 回落回 working", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("working");
    t.rt.poke();
    expect(t.rt.getSnapshot().currentState).toBe("surprised");
    // 入场（reading→idle 5494 + idle→surprised 766）+ 驻留 3000 → 回落段
    t.advance(EDGE.readingIdle + EDGE.idleSurprised + POKE_HOLD_MS + 100);
    expect(t.rt.getSnapshot().currentState).toBe("surprised"); // 回落段
    // 回落（surprised→idle 766 + idle→工作素材）播完 → 回并行驻留 working
    t.advance(EDGE.surprisedIdle + EDGE.idleReading + 200);
    const done = t.rt.getSnapshot();
    expect(done.currentState).toBe("working");
    expect(finalLoopState(done)).toBe("working");
    t.rt.dispose();
  });
});

// ---------------------------------------------------------------------------
// 摸鱼彩蛋（ADR-0010 D7 + ADR-0016 彩蛋池收敛）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 摸鱼彩蛋（池收敛为 happy/angry/surprised）", () => {
  it("并行驻留期间随机触发表情，退场后回 working", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions, sequenceRandom([0, 0.72])); // 间隔=2min
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("working"); // 并行驻留
    t.advance(120_000); // 彩蛋定时器到点
    const egg = t.rt.getSnapshot();
    expect(["happy", "angry", "surprised"]).toContain(egg.currentState);
    // 入场（工作姿态→idle→表情）+ 驻留 3s 到点 → 退场段
    t.advance(5494 + 766 + 3000 + 100);
    // 退场（表情→idle→工作素材）播完 → 回并行驻留 working
    t.advance(766 + 5494 + 200);
    const done = t.rt.getSnapshot();
    expect(done.currentState).toBe("working");
    expect(finalLoopState(done)).toBe("working");
    t.rt.dispose();
  });

  it("并行驻留上升沿必须触发彩蛋调度（基线采样在落态前，回归锁）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions, sequenceRandom([0, 0.72]));
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    sessions.__pushList(makeListState([A, B], A));
    expect(t.rt.getSnapshot().currentState).toBe("idle"); // B 尚未 running
    // B 转入工作：hold 上升沿发生在本次快照内（回归点：基线若在落态后采样，
    // 此处将漏检、彩蛋永不调度）
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("working"); // hold 生效
    t.advance(120_000);
    expect(["happy", "angry", "surprised"]).toContain(
      t.rt.getSnapshot().currentState,
    );
    t.rt.dispose();
  });

  it("并行驻留解除后 done 待边界：轮换驻留受保护直至整圈边界切出", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick(); // working 防抖落态
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("working"); // hold 生效
    // A 回合结束 → done 待整圈边界（pendingDone 保护轮换不被驻留解除清掉）
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    expect(t.rt.getSnapshot().currentState).toBe("working"); // 待边界驻留
    // B 也结束：并行驻留解除，但 pendingDone 在场 → 轮换保留至边界
    sessions.__session(B)?.__push(makeSnapshot(B, { running: false }));
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // 整圈边界到达（入场过渡 5494 + 首圈）→ done 入场
    t.advance(EDGE.idleReading + WORKING_LOOP_MS.reading);
    expect(t.rt.getSnapshot().currentState).toBe("done");
    t.rt.dispose();
  });
  it("彩蛋周期性：退场后为下一轮重排（并行驻留持续时多轮播放）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions, sequenceRandom([0, 0.72, 0, 0.72]));
    // 间隔均取下限 2min；floor(0.72*3)=2 → surprised
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("working"); // hold 生效
    t.advance(120_000); // 第一轮触发
    expect(["happy", "angry", "surprised"]).toContain(
      t.rt.getSnapshot().currentState,
    );
    // 入场 + 驻留 3s 到点 → 退场段
    t.advance(5494 + 766 + 3000 + 100);
    // 退场播完 → 回 working 并已排下一轮
    t.advance(766 + 5494 + 200);
    expect(t.rt.getSnapshot().currentState).toBe("working");
    t.advance(120_000); // 第二轮到点（若未重排则仍是 working）
    expect(["happy", "angry", "surprised"]).toContain(
      t.rt.getSnapshot().currentState,
    );
    t.rt.dispose();
  });
});
// ---------------------------------------------------------------------------
// 工作轮换（PRD 决策 5 / ADR-0016 D9 循环自然三原则）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: working 轮换（thinking↔reading）", () => {
  it("thinking 播 2 整圈后整圈边界换段（经 idle 中转过渡，无硬切）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions, sequenceRandom([0.1, 0.9, 0.5])); // 首段 thinking
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // 入场计划：idle→thinking 过渡 + thinking 循环
    const first = t.rt.getSnapshot().playback;
    expect(
      first.some(
        (p) => p.kind === "loop" && p.url === workingLoopAssetUrl("thinking"),
      ),
    ).toBe(true);
    expect(
      first.some(
        (p) =>
          p.kind === "transition" &&
          p.url === transitionAssetUrl("idle", "thinking"),
      ),
    ).toBe(true);
    // 首整圈边界：续播第二圈（不换段）
    t.advance(EDGE.idleThinking + WORKING_LOOP_MS.thinking + 100);
    // 第二整圈边界：换段 thinking→idle→reading
    t.advance(WORKING_LOOP_MS.thinking + 100);
    const after = t.rt.getSnapshot();
    expect(after.currentState).toBe("working");
    const ts = after.playback.filter((p) => p.kind === "transition");
    expect(
      ts.some(
        (x) =>
          x.kind === "transition" && x.url === transitionAssetUrl("thinking", "idle"),
      ),
    ).toBe(true);
    expect(
      ts.some(
        (x) =>
          x.kind === "transition" && x.url === transitionAssetUrl("idle", "reading"),
      ),
    ).toBe(true);
    t.rt.dispose();
  });

  it("不连续重复：换段后下一段素材与上段不同", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions, sequenceRandom([0.1, 0.9, 0.5]));
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(
      t.rt
        .getSnapshot()
        .playback.some(
          (p) => p.kind === "loop" && p.url === workingLoopAssetUrl("thinking"),
        ),
    ).toBe(true);
    // 首整圈边界：续播第二圈（不换段）
    t.advance(EDGE.idleThinking + WORKING_LOOP_MS.thinking + 100);
    // 第二整圈边界：换段 thinking→idle→reading
    t.advance(WORKING_LOOP_MS.thinking + 100);
    // thinking 之后换到 reading（不连续重复）
    expect(
      t.rt
        .getSnapshot()
        .playback.some(
          (p) => p.kind === "loop" && p.url === workingLoopAssetUrl("reading"),
        ),
    ).toBe(true);
    t.rt.dispose();
  });

  it("轮换期间 currentState 恒为 working（标签恒为工作中语义，工单 05）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions, sequenceRandom([0.1, 0.9, 0.5]));
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true }),
    );
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    for (let i = 0; i < 6; i++) {
      t.advance(WORKING_LOOP_MS.thinking);
      expect(t.rt.getSnapshot().currentState).toBe("working");
    }
    t.rt.dispose();
  });
});

// ---------------------------------------------------------------------------
// 订阅接口
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 订阅", () => {
  it("subscribe 在快照变化时通知，取消后不再通知", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const rt = plainRuntime(sessions);
    let count = 0;
    const unsub = rt.subscribe(() => count++);
    sessions.__session(A)?.__push(makeSnapshot(A, { hasError: true }));
    expect(count).toBeGreaterThan(0);
    const after = count;
    unsub();
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    expect(count).toBe(after);
    rt.dispose();
  });

  it("getSnapshot 在状态未变时返回稳定引用（useSyncExternalStore 兼容）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const rt = plainRuntime(sessions);
    const s1 = rt.getSnapshot();
    const s2 = rt.getSnapshot();
    expect(s2).toBe(s1);
    rt.dispose();
  });
});

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: dispose", () => {
  it("dispose 后 list 推送不再触发通知", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const rt = plainRuntime(sessions);
    let count = 0;
    rt.subscribe(() => count++);
    rt.dispose();
    const before = count;
    sessions.__pushList(makeListState([A, B], A));
    expect(count).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 审批等待时间启发式（工单 21-01，ADR-0014）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 审批等待时间启发式（ADR-0014）", () => {
  it("卡住（runningCalls>0 无 pending/error）≥10s 进 permission：10s 前仍 working", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    t.advanceClock(FOCUS_DEBOUNCE_MS + 1);
    t.tick(); // working 防抖落态
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // blockedSince 在快照到达时（now=1000）起算；推进到 10s 边界前 1ms
    t.advance(PERMISSION_BLOCKED_MS - FOCUS_DEBOUNCE_MS - 2);
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // 越过 10s → permission
    t.advance(2);
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("permission");
    expect(finalLoopState(s)).toBe("permission");
    t.rt.dispose();
  });

  it("permission 卡住 ≥30s 升级为 angry（30s 前仍 permission）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    t.advance(PERMISSION_BLOCKED_MS + 1); // 越过 10s → permission
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    // 推进到 30s 边界前 1ms
    t.advance(ANGRY_BLOCKED_MS - PERMISSION_BLOCKED_MS - 2);
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    // 越过 30s → angry
    t.advance(2);
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("angry");
    expect(finalLoopState(s)).toBe("angry");
    t.rt.dispose();
  });

  it("目标/运行状态变化即清零：卡住中途 running 终止，不再触发 permission/angry", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    t.advance(5000); // 卡住 5s（未到 10s）
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // running 终止 → blockedSince 清零，走 done 表演回落（非 permission/angry）
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    // 推进远超 10s/30s 窗口：绝不应出现 permission/angry
    t.advance(100_000);
    expect(["permission", "angry"]).not.toContain(t.rt.getSnapshot().currentState);
    // 多次 tick 消化 done 表演相位（每层每次 tick 至多推进一相位）→ 最终 idle
    t.advance(100_000);
    t.advance(100_000);
    expect(t.rt.getSnapshot().currentState).toBe("idle");
    t.rt.dispose();
  });

  it("pending 上升沿即时快路径仍生效（互补非替代）：pending 出现立即 permission，无需等 10s", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    t.advance(1000); // 卡住 1s（远未到 10s）
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    t.rt.dispose();
  });

  it("升级 angry 后审批解决（pending 下降沿批准）仍走 nod-smile 反馈链", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const t = timedRuntime(sessions);
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    t.advance(PERMISSION_BLOCKED_MS + 1); // 越过 10s → permission
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    t.advance(ANGRY_BLOCKED_MS - PERMISSION_BLOCKED_MS + 1); // 越过 30s → angry
    expect(t.rt.getSnapshot().currentState).toBe("angry");
    // 宿主补上 pending（快路径接管，SM 仍在 permission）→ 批准（下降沿）
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1, pending: true }),
    );
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, pending: false }),
    );
    expect(t.rt.getSnapshot().currentState).toBe("nod-smile");
    t.rt.dispose();
  });

  it("非焦点会话卡住 ≥10s 同样进 permission 并抢焦（与 pending 快路径抢焦一致）", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const t = timedRuntime(sessions);
    // A 仅运行中（无 active tool call），不触发启发式；B 卡住专用
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advance(FOCUS_DEBOUNCE_MS + 1);
    t.tick();
    expect(t.rt.getSnapshot().currentState).toBe("working"); // A 焦点 working
    // B 非焦点卡住（runningCalls>0 无 pending/error）
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 2 }),
    );
    t.advance(PERMISSION_BLOCKED_MS + 1);
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("permission");
    expect(s.focusSessionId).toBe(B); // 紧急抢焦
    t.rt.dispose();
  });

  it("非焦点会话卡住 ≥30s 后被接管 → 直接以 angry 呈现（接管补判）", () => {
    const sessions = createMockSessions(makeListState([A, B], A));
    const t = timedRuntime(sessions);
    // A error 抢焦（压住 B 的呈现）
    sessions.__session(A)?.__push(makeSnapshot(A, { hasError: true }));
    expect(t.rt.getSnapshot().currentState).toBe("error");
    // B 非焦点卡住（runningCalls>0 无 pending/error）→ 10s 进 permission（SM）
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 2 }),
    );
    t.advance(PERMISSION_BLOCKED_MS + 1);
    expect(t.rt.getSnapshot().currentState).toBe("error"); // A 仍压着
    // 越过 30s 后 A error 消退 → B 接管，直接以 angry 呈现（非 permission）
    t.advance(ANGRY_BLOCKED_MS - PERMISSION_BLOCKED_MS + 1);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("angry");
    expect(s.focusSessionId).toBe(B);
    t.rt.dispose();
  });
});

// ---------------------------------------------------------------------------
// 待交互源驱动（uiSession.pendingInteractions，宿主 SDK 升级后的 pending 快路径）
// ---------------------------------------------------------------------------

describe("overlay-session-runtime: 待交互源驱动 pending（uiSession.pendingInteractions）", () => {
  it("running 中待交互出现（approval）→ 硬切 permission（紧急接管）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const pending = createMockPendingSource();
    const t = timedRuntime(sessions, () => 0.5, pending.source);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advance(FOCUS_DEBOUNCE_MS + 1);
    expect(t.rt.getSnapshot().currentState).toBe("working");
    // 宿主上报待交互 → 即时快路径进 permission
    pending.__set({ [A]: "approval" });
    const s = t.rt.getSnapshot();
    expect(s.currentState).toBe("permission");
    expect(s.focusSessionId).toBe(A);
    t.rt.dispose();
  });

  it("待交互解决 + running 继续 → nod-smile 表演（批准链）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const pending = createMockPendingSource();
    const t = timedRuntime(sessions, () => 0.5, pending.source);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advance(FOCUS_DEBOUNCE_MS + 1);
    pending.__set({ [A]: "question" });
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    // 用户回答（running 继续）→ nod-smile 表演
    pending.__set({});
    expect(t.rt.getSnapshot().currentState).toBe("nod-smile");
    t.rt.dispose();
  });

  it("待交互解决 + running 已终止 → frown-wave 表演（拒绝链）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const pending = createMockPendingSource();
    const t = timedRuntime(sessions, () => 0.5, pending.source);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advance(FOCUS_DEBOUNCE_MS + 1);
    pending.__set({ [A]: "approval" });
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    // 拒绝同时回合终止：快照先到（pending 仍在场 → 无差分），待交互随后移除
    sessions.__session(A)?.__push(makeSnapshot(A, { running: false }));
    pending.__set({});
    expect(t.rt.getSnapshot().currentState).toBe("frown-wave");
    t.rt.dispose();
  });

  it("未知 kind 不视为待交互（不触发 permission）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const pending = createMockPendingSource();
    const t = timedRuntime(sessions, () => 0.5, pending.source);
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    t.advance(FOCUS_DEBOUNCE_MS + 1);
    expect(t.rt.getSnapshot().currentState).toBe("working");
    pending.__set({ [A]: "some-future-domain" });
    expect(t.rt.getSnapshot().currentState).toBe("working");
    t.rt.dispose();
  });

  it("会话快照推进时同样读源：待交互先于快照在场 → 上升沿进 permission", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const pending = createMockPendingSource({ [A]: "plan-review" });
    const t = timedRuntime(sessions, () => 0.5, pending.source);
    // 首个快照到达即带 pending（源先在场）→ 初次差分即 permission
    sessions.__session(A)?.__push(makeSnapshot(A, { running: true }));
    expect(t.rt.getSnapshot().currentState).toBe("permission");
    t.rt.dispose();
  });
});
