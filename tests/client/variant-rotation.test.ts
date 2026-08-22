/**
 * variant-rotation 纯逻辑测试（memorial 008 / ADR-0013，工单 03/04 验收）。
 *
 * seam 1（模块）：输入池/上一段/随机源 → 断言抽取结果与周期常量。
 * seam 2（runtime 集成）：输入会话事件 + 开关读取器 + 时间推进
 *   → 断言 playback url 的轮换、推进、打断与回落。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（对齐工单 03/04 验收标准）：
 *   - 池配置：idle/working 各 = 基础主素材（v1）+ 3 变体，基础在首位
 *   - pickNextVariant：空池 undefined / 单元素池直返 / 不连续重复
 *   - rotationPeriodMs：基础段与变体段周期 = 名义时长 + 段间停顿
 *   - runtime：开关未注入默认关闭，行为与现状一致（基础 loop）
 *   - runtime：开关开启 + 无会话 → idle 变体轮换，周期后推进且不重复
 *   - runtime：并行驻留 working 期间照常轮换
 *   - runtime：poke 打断轮换，回落后重新开始（不续播半截）
 *   - runtime：运行中关闭开关 + refresh → 回退基础 loop
 *   - 设置存储：轮换开关默认开、set 通知订阅者
 */

import { afterEach, describe, expect, it, vi } from "vitest";
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
  type RuntimeSnapshot,
} from "../../src/client/state-machine/overlay-session-runtime.ts";
import {
  loopAssetUrl,
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

describe("variant-rotation 模块", () => {
  it("轮换池 = 基础主素材（首位）+ 3 变体", () => {
    for (const state of ROTATABLE_STATES) {
      const pool = rotationPool(state);
      expect(pool.length).toBe(4);
      expect(pool[0]).toBe(loopAssetUrl(state));
      for (let i = 2; i <= 4; i++) {
        expect(pool).toContain(`${CHARACTER_ASSET_PREFIX}/${state}-v${i}.webp`);
      }
    }
  });

  it("isRotatableState 仅 idle/working", () => {
    expect(isRotatableState("idle")).toBe(true);
    expect(isRotatableState("working")).toBe(true);
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

  it("rotationPeriodMs：基础段与变体段周期 = 名义时长 + 段间停顿", () => {
    // memorial 008 补充：经典态正反倒放烘焙后，idle/working 单圈不同（148/170 帧）
    expect(rotationPeriodMs(loopAssetUrl("idle"))).toBe(
      BASE_SEGMENT_MS.idle + ROTATION_HOLD_MS,
    );
    expect(rotationPeriodMs(loopAssetUrl("working"))).toBe(
      BASE_SEGMENT_MS.working + ROTATION_HOLD_MS,
    );
    expect(BASE_SEGMENT_MS.idle).toBe(9916); // 148 帧 × 67ms
    expect(BASE_SEGMENT_MS.working).toBe(11390); // 170 帧 × 67ms
    expect(rotationPeriodMs(`${CHARACTER_ASSET_PREFIX}/idle-v2.webp`)).toBe(
      VARIANT_SEGMENT_MS + ROTATION_HOLD_MS,
    );
    expect(isBaseLoopUrl(loopAssetUrl("idle"))).toBe(true);
    expect(isBaseLoopUrl(`${CHARACTER_ASSET_PREFIX}/working-v3.webp`)).toBe(
      false,
    );
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it("开关未注入默认关闭：idle 显示基础 loop（与现状一致）", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions, { tickIntervalMs: 100 });
    expect(runtime.getSnapshot().currentState).toBe("idle");
    expect(currentUrl(runtime.getSnapshot())).toBe(loopAssetUrl("idle"));
    runtime.dispose();
  });

  it("开关开启 + 无会话：idle 变体轮换，周期后推进且不连续重复", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
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
      vi.advanceTimersByTime(VARIANT_SEGMENT_MS + ROTATION_HOLD_MS);
      const url = currentUrl(runtime.getSnapshot());
      expect(url).not.toBe(seen[seen.length - 1]);
      expect(pool).toContain(url);
      seen.push(url);
    }
    // 轮换不递增 focusNonce（不触发 cross-fade）
    expect(runtime.getSnapshot().focusNonce).toBe(0);
    runtime.dispose();
  });

  it("并行驻留 working 期间照常轮换", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
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
    expect(runtime.getSnapshot().currentState).toBe("working");
    const first = currentUrl(runtime.getSnapshot());
    expect(first).not.toBe(loopAssetUrl("working"));
    expect(rotationPool("working")).toContain(first);
    vi.advanceTimersByTime(VARIANT_SEGMENT_MS + ROTATION_HOLD_MS);
    expect(currentUrl(runtime.getSnapshot())).not.toBe(first);
    runtime.dispose();
  });

  it("poke 打断轮换，回落后重新开始", () => {
    vi.useFakeTimers();
    const sessions = createMockSessions(makeListState([A], A));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
      variantRotationEnabled: () => true,
      random: sequenceRandom([0.1, 0.6, 0.35, 0.9]),
    });
    expect(currentUrl(runtime.getSnapshot())).not.toBe(loopAssetUrl("idle"));
    runtime.poke();
    expect(runtime.getSnapshot().currentState).toBe("surprised");
    // poke 全程后回落 idle：轮换重新抽取（仍是变体，非基础 loop）
    vi.advanceTimersByTime(3000 + 5000);
    expect(runtime.getSnapshot().currentState).toBe("idle");
    const url = currentUrl(runtime.getSnapshot());
    expect(rotationPool("idle")).toContain(url);
    expect(url).not.toBe(loopAssetUrl("idle"));
    runtime.dispose();
  });

  it("运行中关闭开关 + refresh：回退基础 loop", () => {
    vi.useFakeTimers();
    let enabled = true;
    const sessions = createMockSessions(makeListState([], undefined));
    const runtime = createOverlaySessionRuntime(sessions, {
      tickIntervalMs: 100,
      variantRotationEnabled: () => enabled,
      random: sequenceRandom([0.1, 0.6, 0.35, 0.9]),
    });
    expect(currentUrl(runtime.getSnapshot())).not.toBe(loopAssetUrl("idle"));
    enabled = false;
    runtime.refresh();
    expect(currentUrl(runtime.getSnapshot())).toBe(loopAssetUrl("idle"));
    // 关闭后不再推进
    vi.advanceTimersByTime((VARIANT_SEGMENT_MS + ROTATION_HOLD_MS) * 2);
    expect(currentUrl(runtime.getSnapshot())).toBe(loopAssetUrl("idle"));
    runtime.dispose();
  });
});
