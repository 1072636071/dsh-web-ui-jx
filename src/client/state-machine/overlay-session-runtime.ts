/**
 * overlay-session-runtime — 会话级状态机容器与焦点跟随（ADR-0008，工单 06-02）。
 *
 * 替换原模块级单例状态机 + session-follow"只跟 current"逻辑。每会话一个状态机
 * 实例（Map<sessionId, SM>）+ 一个 binding(id).session 订阅；浮层只渲染焦点会话
 * 的 playback。焦点 = 用户手动切焦 ?? 当前打开会话（紧急抢焦留给工单 03）。
 *
 * 焦点切换不播状态机过渡（ADR-0008 决策 3）：直接切到目标会话当前 playback，
 * UI 据 focusNonce 递增触发 150ms 淡入淡出。会话内部状态演变照常经 stateMachine
 * 生成过渡段（属于单一会话内部过渡，非跨会话）。
 *
 * 生命周期随 sessions.list.ids（ADR-0008 决策 4）：会话出现即创建实例 + 挂订阅，
 * 从 ids 移除即销毁并释放全部订阅。无泄漏。
 *
 * 每会话差分推导复用 session-follow 的 extractCore / diffTarget（error > permission
 * > working > replying > thinking > done > idle；reading 由 thinking 超时推导）。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。UI（CharacterOverlay）通过
 * useSyncExternalStore 订阅 runtime 快照。时间驱动（thinking→reading 超时、
 * done→idle 驻留）通过内部 setInterval tick（测试可注入 now + 手动 __tick）。
 *
 * @module dsh-web-ui-jx/client
 */

import type {
  ConversationSnapshot,
  ISessions,
  SessionId,
} from "@deepseek-ai/dsh-client-runtime/client";
import {
  createOverlayStateMachine,
  loopAssetUrl,
  type OverlayState,
  type PlaybackItem,
  type StateMachineSnapshot,
} from "./overlay-state-machine.ts";
import {
  extractCore,
  diffTarget,
  READING_THRESHOLD_MS,
  DONE_HOLD_MS,
  type SnapshotCore,
} from "./session-follow.ts";

// ---------------------------------------------------------------------------
// 快照
// ---------------------------------------------------------------------------

/** runtime 快照（UI 据此渲染，useSyncExternalStore 兼容）. */
export interface RuntimeSnapshot {
  /** 焦点会话 id（undefined 表示无会话，浮层显示 idle）. */
  readonly focusSessionId: SessionId | undefined;
  /** 焦点会话当前循环态（无会话时为 idle）. */
  readonly currentState: OverlayState;
  /** 焦点会话的播放序列（无会话时为 [loop-idle]）. */
  readonly playback: readonly PlaybackItem[];
  /**
   * 焦点切换 nonce：每次焦点会话变化递增，UI 据此触发 150ms 淡入淡出。
   * 会话内部状态变化（不切换焦点）不递增。
   */
  readonly focusNonce: number;
}

// ---------------------------------------------------------------------------
// 每会话运行时条目
// ---------------------------------------------------------------------------

interface SessionEntry {
  /** 该会话的状态机实例. */
  readonly stateMachine: ReturnType<typeof createOverlayStateMachine>;
  /** binding.session 订阅取消函数. */
  unsub: (() => void) | undefined;
  /** 上一次核心快照（差分用）. */
  prevCore: SnapshotCore | null;
  /** 上一次派发的循环态（去重 + 时间驱动判定用）. */
  lastState: OverlayState;
  /** thinking 进入时间戳（reading 超时判定用）. */
  thinkingSince: number | undefined;
  /** done 进入时间戳（idle 驻留判定用）. */
  doneSince: number | undefined;
}

// ---------------------------------------------------------------------------
// runtime 实例
// ---------------------------------------------------------------------------

/** overlay-session-runtime 实例. */
export interface OverlaySessionRuntime {
  /** 取当前快照（供 useSyncExternalStore 等订阅机制读取）. */
  getSnapshot(): RuntimeSnapshot;
  /** 订阅快照变化；返回取消订阅函数. */
  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void;
  /** 释放全部订阅（list + 各会话 binding.session + tick timer）. */
  dispose(): void;
  /** 测试用：手动触发一次 tick（时间驱动判定）. */
  __tick(): void;
}

/** runtime 选项. */
export interface CreateOverlaySessionRuntimeOptions {
  /** 时钟注入（默认 Date.now，测试可注入虚拟时钟）. */
  now?: () => number;
  /** tick 间隔 ms（默认 1000，测试可缩短以加速）. */
  tickIntervalMs?: number;
}

/** 无会话时浮层停留的初始态. */
const IDLE: OverlayState = "idle";

/** 无会话时的空闲 playback. */
const IDLE_PLAYBACK: readonly PlaybackItem[] = [
  { kind: "loop", state: "idle", url: loopAssetUrl("idle") },
];

/**
 * 创建会话级状态机 runtime。
 *
 * 订阅 sessions.list 跟踪 ids（会话集合）与 current（焦点信号源）。每会话挂
 * binding.session 订阅，快照差分经 diffTarget 推导目标态，dispatch 到该会话
 * 状态机。tick 驱动 thinking→reading 超时与 done→idle 驻留。dispose 释放全部
 * 订阅与 tick timer，无泄漏。
 *
 * @param sessions - ctx.sessions 服务。
 * @param opts - 选项（now/tickIntervalMs 注入测试）。
 * @returns runtime 实例。
 */
export function createOverlaySessionRuntime(
  sessions: ISessions,
  opts?: CreateOverlaySessionRuntimeOptions,
): OverlaySessionRuntime {
  const now = opts?.now ?? (() => Date.now());
  const tickIntervalMs = opts?.tickIntervalMs ?? 1000;

  const entries = new Map<SessionId, SessionEntry>();
  const listeners = new Set<(snapshot: RuntimeSnapshot) => void>();

  let focusSessionId: SessionId | undefined = undefined;
  let focusNonce = 0;
  let cachedSnapshot: RuntimeSnapshot = computeSnapshot();
  let disposed = false;

  // ---------------------------------------------------------------------------
  // 焦点仲裁：当前打开会话（紧急抢焦留给工单 03）
  // ---------------------------------------------------------------------------

  /** 计算当前快照（焦点会话的 stateMachine 快照；无焦点时 idle 兜底）. */
  function computeSnapshot(): RuntimeSnapshot {
    if (focusSessionId === undefined) {
      return {
        focusSessionId: undefined,
        currentState: IDLE,
        playback: IDLE_PLAYBACK,
        focusNonce,
      };
    }
    const entry = entries.get(focusSessionId);
    if (entry === undefined) {
      // 焦点会话不在 entries（已被销毁或 current 指向不存在的 id）
      return {
        focusSessionId,
        currentState: IDLE,
        playback: IDLE_PLAYBACK,
        focusNonce,
      };
    }
    const sm: StateMachineSnapshot = entry.stateMachine.getSnapshot();
    return {
      focusSessionId,
      currentState: sm.currentState,
      playback: sm.playback,
      focusNonce,
    };
  }

  function emit(): void {
    cachedSnapshot = computeSnapshot();
    for (const listener of listeners) listener(cachedSnapshot);
  }

  // ---------------------------------------------------------------------------
  // 每会话差分推导 → dispatch
  // ---------------------------------------------------------------------------

  function setState(entry: SessionEntry, state: OverlayState): void {
    if (state === entry.lastState) return;
    entry.lastState = state;
    if (state === "thinking") entry.thinkingSince = now();
    else if (state === "done") entry.doneSince = now();
    entry.stateMachine.dispatch({ type: "switch", target: state });
    // dispatch 已触发该会话 stateMachine emit；若该会话是焦点，runtime 快照也变
    if (focusSessionId !== undefined && entries.get(focusSessionId) === entry) {
      emit();
    }
  }

  function processSnapshot(entry: SessionEntry, snapshot: ConversationSnapshot): void {
    const currCore = extractCore(snapshot);
    const target = diffTarget(entry.prevCore, currCore);
    if (currCore.hasVisibleChunk || !currCore.running) entry.thinkingSince = undefined;
    if (target !== null) setState(entry, target);
    entry.prevCore = currCore;
  }

  // ---------------------------------------------------------------------------
  // 会话注册 / 注销（生命周期随 list.ids）
  // ---------------------------------------------------------------------------

  function registerSession(id: SessionId): void {
    if (entries.has(id)) return;
    const binding = sessions.binding(id);
    // ISessions 契约：binding 返回 undefined 表示会话不在列表且未 scoped。
    // registerSession 只对 list.ids 内 id 调用，binding 应返回 defined；
    // 此处防御性处理：binding undefined 时不入 map（避免悬挂 entry），
    // 下次 list 变化时 syncSessions 会重试注册。
    if (binding === undefined) return;
    const stateMachine = createOverlayStateMachine(IDLE);
    const entry: SessionEntry = {
      stateMachine,
      unsub: undefined,
      prevCore: null,
      lastState: IDLE,
      thinkingSince: undefined,
      doneSince: undefined,
    };
    entries.set(id, entry);
    entry.unsub = binding.session.subscribe(() => {
      processSnapshot(entry, binding.session.getSnapshot());
    });
    // 首次附加：用当前快照推导一次（可能直接进入非 idle 态）
    processSnapshot(entry, binding.session.getSnapshot());
  }

  function unregisterSession(id: SessionId): void {
    const entry = entries.get(id);
    if (entry === undefined) return;
    entry.unsub?.();
    entry.unsub = undefined;
    entries.delete(id);
  }

  function syncSessions(ids: readonly SessionId[]): void {
    const nextIds = new Set(ids);
    // 注销不再存在的会话
    for (const id of entries.keys()) {
      if (!nextIds.has(id)) unregisterSession(id);
    }
    // 注册新会话
    for (const id of ids) {
      if (!entries.has(id)) registerSession(id);
    }
  }

  // ---------------------------------------------------------------------------
  // list 订阅：ids 变化 → 同步会话；current 变化 → 更新焦点
  // ---------------------------------------------------------------------------

  function handleListChange(): void {
    if (disposed) return;
    const list = sessions.list.getSnapshot();
    syncSessions(list.ids);
    if (list.current !== focusSessionId) {
      focusSessionId = list.current;
      focusNonce += 1;
      emit();
    }
  }

  const listUnsub = sessions.list.subscribe(() => handleListChange());

  // 初始同步
  handleListChange();

  // ---------------------------------------------------------------------------
  // tick：时间驱动（thinking→reading 超时、done→idle 驻留）
  // ---------------------------------------------------------------------------

  function tick(): void {
    if (disposed) return;
    for (const entry of entries.values()) {
      if (entry.lastState === "thinking" && entry.thinkingSince !== undefined) {
        if (now() - entry.thinkingSince >= READING_THRESHOLD_MS) {
          entry.thinkingSince = undefined;
          setState(entry, "reading");
        }
      } else if (entry.lastState === "done" && entry.doneSince !== undefined) {
        if (now() - entry.doneSince >= DONE_HOLD_MS) {
          entry.doneSince = undefined;
          setState(entry, IDLE);
        }
      }
    }
    // setState 已在焦点会话变化时 emit；非焦点会话变化不触发 runtime emit
  }

  const tickTimer = setInterval(tick, tickIntervalMs);

  // ---------------------------------------------------------------------------
  // 公共接口
  // ---------------------------------------------------------------------------

  function getSnapshot(): RuntimeSnapshot {
    return cachedSnapshot;
  }

  function subscribe(
    listener: (snapshot: RuntimeSnapshot) => void,
  ): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    listUnsub();
    for (const entry of entries.values()) {
      entry.unsub?.();
      entry.unsub = undefined;
    }
    entries.clear();
    clearInterval(tickTimer);
    listeners.clear();
  }

  return {
    getSnapshot,
    subscribe,
    dispose,
    __tick: tick,
  };
}
