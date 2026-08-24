/**
 * variant-rotation 纯逻辑测试（ADR-0013 + ADR-0016 工单 02/05 验收）。
 *
 * seam 1（模块）：输入池/上一段/随机源 → 断言抽取结果与周期常量。
 * seam 2（runtime 集成）：输入会话事件 + 开关读取器 + 时间推进
 *   → 断言 playback url 的轮换、推进、打断与回落。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（ADR-0016 收敛后仅 idle 池）：
 *   - 池配置：idle = 基础主素材（v1）+ 3 变体（idle-v2/v3/v4）
 *   - pickNextVariant：空池 undefined / 单元素池直返 / 不连续重复
 *   - rotationPeriodMs：基础段=整圈时长，变体段=名义时长+段间停顿
 *   - runtime：开关未注入默认关闭；开关开启 + 无会话 → idle 变体轮换
 *   - runtime：working 驻留走工作轮换（非变体轮换池，URL 为 thinking/reading）
 *   - runtime：poke 打断轮换，回落后重新开始（不续播半截）
 *   - runtime：运行中关闭开关 + resetRotation → 回退基础 loop
 *   - 设置存储：轮换开关默认开、set 通知订阅者
 */

import { describe, expect, it } from "vitest";
import {
  isRotatableState,
  isBaseLoopUrl,
  pickNextVariant,
  rotationPeriodMs,
  rotationPool,
  ROTATABLE_STATES,
  BASE_SEGMENT_MS,
  VARIANT_SEGMENT_MS,
  ROTATION_HOLD_MS,
} from "../../src/client/state-machine/variant-rotation.ts";
import {
  createOverlaySessionRuntime,
  WORKING_LOOP_MS,
  type OverlaySessionRuntime,
  type RuntimeSnapshot,
} from "../../src/client/state-machine/overlay-session-runtime.ts";
import {
  loopAssetUrl,
  workingLoopAssetUrl,
  CHARACTER_ASSET_PREFIX,
} from "../../src/client/state-machine/overlay-state-machine.ts";
import {
  getVariantRotationEnabled,
  setVariantRotationEnabled,
  subscribeVariantRotationEnabled,
} from "../../src/client/state-machine/overlay-settings.ts";
import type {
  ConversationSnapshot,
  ISessions,
  SessionBinding,
  SessionId,
  SessionListState,
} from "@deepseek-ai/dsh-client-runtime/client";

const A = "a" as SessionId;
const B = "b" as SessionId;

// ---------------------------------------------------------------------------
// Mock Sessions（与 overlay-session-runtime.test.ts 同款最小实现）
// ---------------------------------------------------------------------------

function makeSnapshot(
  sessionId: SessionId,
  opts: { running?: boolean; runningCallsCount?: number } = {},
): ConversationSnapshot {
  const base = {
    sessionId,
    views: {},
    chat: {},
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: Array.from(
      { length: opts.runningCallsCount ?? 0 },
      () => ({}),
    ),
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
  } as unknown as ConversationSnapshot;
  return base;
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
    binding,
    __pushList(state: SessionListState) {
      listState = state;
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

/** 序列随机源：避免恒定随机在不重复抽取中死循环。 */
function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i += 1;
    return v;
  };
}

function currentUrl(snapshot: RuntimeSnapshot): string {
  const item = snapshot.playback[snapshot.playback.length - 1];
  return item === undefined ? "" : item.url;
}

// ---------------------------------------------------------------------------
// 模块纯逻辑
// ---------------------------------------------------------------------------

describe("variant-rotation 模块（ADR-0016 收敛：仅 idle 池）", () => {
  it("轮换池 = idle 基础主素材（首位）+ 3 变体", () => {
    expect(ROTATABLE_STATES).toEqual(["idle"]);
    const pool = rotationPool("idle");
    expect(pool.length).toBe(4);
    expect(pool[0]).toBe(loopAssetUrl("idle"));
    for (let i = 2; i <= 4; i++) {
      expect(pool).toContain(`${CHARACTER_ASSET_PREFIX}/idle-v${i}.webp`);
    }
  });

  it("isRotatableState 仅 idle（working 池已移除，PRD 决策 6）", () => {
    expect(isRotatableState("idle")).toBe(true);
    expect(isRotatableState("working")).toBe(false);
    expect(isRotatableState("thinking")).toBe(false);
    expect(isRotatableState("happy")).toBe(false);
  });

  it("pickNextVariant：空池 undefined、单元素直返、不连续重复", () => {
    expect(pickNextVariant([], undefined, Math.random)).toBeUndefined();
    expect(pickNextVariant(["only"], "only", Math.random)).toBe("only");
    const pool = ["a", "b", "c", "d"];
    // 序列随机遍历多轮：任何结果都不等于 lastUrl
    let last: string | undefined = undefined;
    const random = sequenceRandom([0.1, 0.6, 0.35, 0.9, 0.55, 0.2]);
    for (let i = 0; i < 50; i++) {
      const next = pickNextVariant(pool, last, random);
      expect(next).not.toBe(last);
      expect(pool).toContain(next);
      last = next;
    }
  });

  it("rotationPeriodMs：基础段=整圈时长（无停顿，切点=回卷点），变体段=名义时长+段间停顿", () => {
    expect(rotationPeriodMs(loopAssetUrl("idle"))).toBe(BASE_SEGMENT_MS.idle);
    expect(BASE_SEGMENT_MS.idle).toBe(9916); // 148 帧 × 67ms
    expect(BASE_SEGMENT_MS.working).toBeUndefined(); // working 池已移除
    // 变体 loops=1 播完定格末帧（中性姿），+400ms 停顿读作自然微动
    expect(rotationPeriodMs(`${CHARACTER_ASSET_PREFIX}/idle-v2.webp`)).toBe(
      VARIANT_SEGMENT_MS + ROTATION_HOLD_MS,
    );
    expect(isBaseLoopUrl(loopAssetUrl("idle"))).toBe(true);
    expect(isBaseLoopUrl(workingLoopAssetUrl("thinking"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 设置存储（node 环境无 window：默认值 + 内存通知路径）
// ---------------------------------------------------------------------------

describe("变体轮换设置", () => {
  it("默认开启；set 通知订阅者", () => {
    expect(getVariantRotationEnabled()).toBe(true);
    const seen: boolean[] = [];
    const unsub = subscribeVariantRotationEnabled((v) => seen.push(v));
    setVariantRotationEnabled(false);
    expect(getVariantRotationEnabled()).toBe(false);
    setVariantRotationEnabled(true);
    expect(getVariantRotationEnabled()).toBe(true);
    unsub();
    expect(seen).toEqual([false, true]);
  });
});

// ---------------------------------------------------------------------------
// runtime 集成
// ---------------------------------------------------------------------------

describe("runtime 变体轮换集成", () => {
  // 注入时钟推进：advance = 推进 now + 一次 __tick（tick 扫描到点推进，
  // 每层每次 tick 至多一个相位，跨相位断言分步 advance）。
  function timedRuntime(
    sessions: ISessions,
    opts: {
      variantRotationEnabled?: () => boolean;
      random?: () => number;
    } = {},
  ): { runtime: OverlaySessionRuntime; advance: (ms: number) => void } {
    let now = 1000;
    const runtime = createOverlaySessionRuntime(sessions, {
      now: () => now,
      tickIntervalMs: 1e9,
      variantRotationEnabled: opts.variantRotationEnabled,
      random: opts.random,
    });
    return {
      runtime,
      advance: (ms: number) => {
        now += ms;
        runtime.__tick();
      },
    };
  }

  it("开关未注入默认关闭：idle 显示基础 loop（与现状一致）", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const { runtime } = timedRuntime(sessions);
    expect(runtime.getSnapshot().currentState).toBe("idle");
    expect(currentUrl(runtime.getSnapshot())).toBe(loopAssetUrl("idle"));
    runtime.dispose();
  });

  it("开关开启 + 无会话：idle 变体轮换，周期后推进且不连续重复", () => {
    const sessions = createMockSessions(makeListState([], undefined));
    const { runtime, advance } = timedRuntime(sessions, {
      variantRotationEnabled: () => true,
      random: sequenceRandom([0.1, 0.6, 0.35, 0.9, 0.55, 0.2]),
    });
    const pool = rotationPool("idle");
    const first = currentUrl(runtime.getSnapshot());
    // 首次进入抽变体（跳过基础主素材）
    expect(first).not.toBe(loopAssetUrl("idle"));
    expect(pool).toContain(first);

    const seen: string[] = [first];
    for (let i = 0; i < 4; i++) {
      advance(VARIANT_SEGMENT_MS + ROTATION_HOLD_MS);
      const url = currentUrl(runtime.getSnapshot());
      expect(url).not.toBe(seen[seen.length - 1]);
      expect(pool).toContain(url);
      seen.push(url);
    }
    // 轮换不递增 focusNonce（焦点切换语义保留，淡入淡出由 url 变化触发）
    expect(runtime.getSnapshot().focusNonce).toBe(0);
    runtime.dispose();
  });

  it("并行驻留 working 显示走工作轮换（thinking/reading 素材，非变体池）", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const { runtime, advance } = timedRuntime(sessions, {
      variantRotationEnabled: () => true,
      random: sequenceRandom([0.1, 0.6, 0.35, 0.9]),
    });
    // 造成并行驻留：两个会话 running 且非 idle
    sessions.__session(A)?.__push(
      makeSnapshot(A, { running: true, runningCallsCount: 1 }),
    );
    sessions.__pushList(makeListState([A, B], A));
    sessions.__session(B)?.__push(
      makeSnapshot(B, { running: true, runningCallsCount: 2 }),
    );
    const s = runtime.getSnapshot();
    expect(s.currentState).toBe("working");
    const url = currentUrl(s);
    // working 轮换素材为 thinking/reading 之一，绝不出现已退役的 working-v*.webp
    expect(
      url === workingLoopAssetUrl("thinking") ||
        url === workingLoopAssetUrl("reading"),
    ).toBe(true);
    // 推进 2 整圈后换段（不连续重复）：入场过渡 + 首圈 → 续播；第二圈 → 换段
    const firstUrl = url;
    advance(3484 + WORKING_LOOP_MS.thinking + 100);
    advance(WORKING_LOOP_MS.thinking + 100);
    const nextUrl = currentUrl(runtime.getSnapshot());
    expect(nextUrl).not.toBe(firstUrl);
    expect(
      nextUrl === workingLoopAssetUrl("thinking") ||
        nextUrl === workingLoopAssetUrl("reading"),
    ).toBe(true);
    runtime.dispose();
  });

  it("poke 打断轮换，回落后重新开始", () => {
    const sessions = createMockSessions(makeListState([A], A));
    const { runtime, advance } = timedRuntime(sessions, {
      variantRotationEnabled: () => true,
      random: sequenceRandom([0.1, 0.6, 0.35, 0.9]),
    });
    expect(currentUrl(runtime.getSnapshot())).not.toBe(loopAssetUrl("idle"));
    runtime.poke();
    expect(runtime.getSnapshot().currentState).toBe("surprised");
    // poke 入场（766）+ 驻留 3000 到点 → 回落段
    advance(766 + 3000 + 100);
    // 回落（766）播完 → 回 idle：轮换重新抽取
    advance(766 + 100);
    expect(runtime.getSnapshot().currentState).toBe("idle");
    const url = currentUrl(runtime.getSnapshot());
    expect(rotationPool("idle")).toContain(url);
    expect(url).not.toBe(loopAssetUrl("idle"));
    runtime.dispose();
  });

  it("运行中关闭开关 + resetRotation：回退基础 loop", () => {
    let enabled = true;
    const sessions = createMockSessions(makeListState([], undefined));
    const { runtime, advance } = timedRuntime(sessions, {
      variantRotationEnabled: () => enabled,
      random: sequenceRandom([0.1, 0.6, 0.35, 0.9]),
    });
    expect(currentUrl(runtime.getSnapshot())).not.toBe(loopAssetUrl("idle"));
    enabled = false;
    runtime.resetRotation();
    expect(currentUrl(runtime.getSnapshot())).toBe(loopAssetUrl("idle"));
    // 关闭后不再推进
    advance((VARIANT_SEGMENT_MS + ROTATION_HOLD_MS) * 2);
    expect(currentUrl(runtime.getSnapshot())).toBe(loopAssetUrl("idle"));
    runtime.dispose();
  });
});
