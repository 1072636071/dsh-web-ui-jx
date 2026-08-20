/**
 * overlay-session-runtime — 会话级状态机容器与焦点仲裁（ADR-0008 + ADR-0010）。
 *
 * ADR-0008：
 *   - 替换原模块级单例状态机 + session-follow"只跟 current"逻辑。
 *   - 每会话一个状态机实例（Map<sessionId, SM>）+ 一个 binding(id).session 订阅。
 *   - 浮层渲染焦点会话的 playback；焦点 = 当前打开会话（sessions.list.current）。
 *   - error/permission 可紧急抢焦；消退后交还用户焦点。
 *
 * ADR-0010：
 *   - 焦点层防抖：thinking/reading/replying/working 在焦点会话上防抖 3000ms，
 *     避免工具链高频切换导致动画僵硬；permission/error 硬切；done/idle 直接落。
 *   - 多会话并行驻留：≥2 会话 running 且至少一个非 idle 时，浮层显示 working。
 *   - 摸鱼彩蛋：并行驻留期间随机 2–5 分钟触发一次表情动画。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。UI（CharacterOverlay）通过
 * useSyncExternalStore 订阅 runtime 快照。
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
  transitionAssetUrl,
  type IntermediateState,
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
// 常量
// ---------------------------------------------------------------------------

/** 工作态防抖窗口 ms（ADR-0010 D1）。 */
export const FOCUS_DEBOUNCE_MS = 3000;

/** 工作态集合：走防抖。 */
const DEBOUNCE_STATES: ReadonlySet<OverlayState> = new Set([
  "thinking",
  "reading",
  "replying",
  "working",
]);

/** 硬切白名单：permission/error 立即打断当前动画（ADR-0010 D1）。 */
const HARD_CUT_STATES: ReadonlySet<OverlayState> = new Set([
  "permission",
  "error",
]);

/** 非防抖直接落状态：done / idle。 */
const DIRECT_STATES: ReadonlySet<OverlayState> = new Set(["done", "idle"]);

/** 无会话时浮层停留的初始态。 */
const IDLE: OverlayState = "idle";

/** 无会话时的空闲 playback。 */
const IDLE_PLAYBACK: readonly PlaybackItem[] = [
  { kind: "loop", state: "idle", url: loopAssetUrl("idle") },
];

/** 摸鱼彩蛋状态池（6 中间态表情 + 3 新增生活化表情循环态，ADR-0010 D7）。 */
const EASTER_EGG_POOL: ReadonlyArray<OverlayState | IntermediateState> = [
  "shy-smile",
  "shush",
  "nod-smile",
  "frown-wave",
  "chin-rest",
  "cheek-rest",
  "happy",
  "angry",
  "surprised",
];

/** 彩蛋最短/最长间隔 ms（2–5 分钟）。 */
const EASTER_EGG_MIN_MS = 2 * 60 * 1000;
const EASTER_EGG_MAX_MS = 5 * 60 * 1000;

/** 彩蛋表情单次展示时长 ms（循环态展示 3s 后切回 working）。 */
const EASTER_EGG_HOLD_MS = 3000;

/** 彩蛋退出动画时长 ms（表情 → idle → working）。 */
const EASTER_EGG_EXIT_MS = 5000;

/** 表情循环态集合（拥有 {state}.webp 循环素材）。 */
const EXPRESSION_LOOP_STATES: ReadonlySet<OverlayState> = new Set([
  "happy",
  "angry",
  "surprised",
]);

// ---------------------------------------------------------------------------
// 快照
// ---------------------------------------------------------------------------

/** runtime 快照（UI 据此渲染，useSyncExternalStore 兼容）. */
export interface RuntimeSnapshot {
  /** 焦点会话 id（undefined 表示无会话，浮层显示 idle）。 */
  readonly focusSessionId: SessionId | undefined;
  /**
   * 当前显示的状态。
   * 通常是焦点会话的循环态；并行驻留时为 working 或彩蛋表情；
   * 紧急抢焦时为 emergency 会话的 permission/error。
   */
  readonly currentState: OverlayState | IntermediateState;
  /** 当前显示的播放序列。 */
  readonly playback: readonly PlaybackItem[];
  /**
   * 焦点切换 nonce：焦点会话变化（含紧急抢焦/交还）时递增，UI 据此触发 150ms 淡入淡出。
   * 同一会话内的防抖、并行驻留、彩蛋切换不递增。
   */
  readonly focusNonce: number;
}

// ---------------------------------------------------------------------------
// 每会话运行时条目
// ---------------------------------------------------------------------------

interface SessionEntry {
  /** 该会话的状态机实例。 */
  readonly stateMachine: ReturnType<typeof createOverlayStateMachine>;
  /** binding.session 订阅取消函数。 */
  unsub: (() => void) | undefined;
  /** 上一次核心快照（差分用）。 */
  prevCore: SnapshotCore | null;
  /** 上一次实际派发到状态机的循环态。 */
  lastState: OverlayState;
  /** 当前底层目标态（可能与 lastState 不同，焦点会话防抖期间）。 */
  pendingTarget: OverlayState;
  /** thinking 进入时间戳（reading 超时判定用）。 */
  thinkingSince: number | undefined;
  /** done 进入时间戳（idle 驻留判定用）。 */
  doneSince: number | undefined;
}

// ---------------------------------------------------------------------------
// runtime 实例
// ---------------------------------------------------------------------------

/** overlay-session-runtime 实例。 */
export interface OverlaySessionRuntime {
  /** 取当前快照（供 useSyncExternalStore 等订阅机制读取）。 */
  getSnapshot(): RuntimeSnapshot;
  /** 订阅快照变化；返回取消订阅函数。 */
  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void;
  /** 释放全部订阅（list + 各会话 binding.session + tick timer）。 */
  dispose(): void;
  /** 测试用：手动触发一次 tick（时间驱动判定）。 */
  __tick(): void;
}

/** runtime 选项。 */
export interface CreateOverlaySessionRuntimeOptions {
  /** 时钟注入（默认 Date.now，测试可注入虚拟时钟）。 */
  now?: () => number;
  /** tick 间隔 ms（默认 1000，测试可缩短以加速）。 */
  tickIntervalMs?: number;
  /**
   * 摸鱼彩蛋随机数注入（测试用）。
   * 返回 [0,1) 之间浮点数；默认 Math.random。
   */
  random?: () => number;
}

/**
 * 创建会话级状态机 runtime。
 *
 * @param sessions - ctx.sessions 服务。
 * @param opts - 选项（now/tickIntervalMs/random 注入测试）。
 * @returns runtime 实例。
 */
export function createOverlaySessionRuntime(
  sessions: ISessions,
  opts?: CreateOverlaySessionRuntimeOptions,
): OverlaySessionRuntime {
  const now = opts?.now ?? (() => Date.now());
  const tickIntervalMs = opts?.tickIntervalMs ?? 1000;
  const random = opts?.random ?? Math.random;

  const entries = new Map<SessionId, SessionEntry>();
  const listeners = new Set<(snapshot: RuntimeSnapshot) => void>();

  // 焦点相关
  let userFocusSessionId: SessionId | undefined = undefined; // 用户当前打开会话
  let currentFocusSessionId: SessionId | undefined = undefined; // 当前显示焦点（可能被 emergency 抢占）
  let focusNonce = 0;

  // 防抖相关（仅作用于焦点会话）：使用 deadline 而非 setTimeout，便于注入 now 测试。
  let debounceDeadline: number | undefined = undefined;
  let debouncePendingTarget: OverlayState | undefined = undefined;

  // 摸鱼彩蛋相关
  let easterEggTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let easterEggHoldTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let easterEggExitTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let easterEggState: OverlayState | IntermediateState | undefined = undefined;
  let easterEggExiting = false;

  let cachedSnapshot: RuntimeSnapshot = computeSnapshot();
  let disposed = false;

  // ---------------------------------------------------------------------------
  // 播放计划构造辅助
  // ---------------------------------------------------------------------------

  function loopPlayback(state: OverlayState): readonly PlaybackItem[] {
    return [{ kind: "loop", state, url: loopAssetUrl(state) }];
  }

  function transitionPlayback(
    from: OverlayState | IntermediateState,
    to: OverlayState | IntermediateState,
  ): readonly PlaybackItem[] {
    return [
      {
        kind: "transition",
        from,
        to,
        url: transitionAssetUrl(from, to),
      },
    ];
  }

  /** working 驻留态的循环 playback。 */
  function workingHoldPlayback(): readonly PlaybackItem[] {
    return loopPlayback("working");
  }

  /**
   * 彩蛋 playback：working → idle → 表情 →（展示）→ idle → working。
   * 对拥有循环素材的表情，展示阶段用 loop；否则用 transition 往返一次。
   */
  function easterEggEntryPlayback(
    expression: OverlayState | IntermediateState,
  ): readonly PlaybackItem[] {
    const seq: PlaybackItem[] = [];
    seq.push(
      ...transitionPlayback("working", "idle"),
      ...transitionPlayback("idle", expression),
    );
    if (EXPRESSION_LOOP_STATES.has(expression as OverlayState)) {
      seq.push({ kind: "loop", state: expression as OverlayState, url: loopAssetUrl(expression as OverlayState) });
    } else {
      // 中间态表情无循环素材：直接播表情→idle 过渡
      seq.push(...transitionPlayback(expression, "idle"));
    }
    seq.push(...transitionPlayback("idle", "working"));
    seq.push(...loopPlayback("working"));
    return seq;
  }

  /** 彩蛋退出 playback：表情 → idle → working。 */
  function easterEggExitPlayback(
    expression: OverlayState | IntermediateState,
  ): readonly PlaybackItem[] {
    const seq: PlaybackItem[] = [];
    if (EXPRESSION_LOOP_STATES.has(expression as OverlayState)) {
      seq.push(...transitionPlayback(expression, "idle"));
    }
    seq.push(...transitionPlayback("idle", "working"));
    seq.push(...loopPlayback("working"));
    return seq;
  }

  // ---------------------------------------------------------------------------
  // 焦点仲裁与快照
  // ---------------------------------------------------------------------------

  /** 判断某会话是否处于 emergency 态。 */
  function isEmergencyState(state: OverlayState): boolean {
    return HARD_CUT_STATES.has(state);
  }

  /** 查找应紧急抢焦的会话 id（按 sessions.list.ids 顺序取第一个）。 */
  function findEmergencySessionId(): SessionId | undefined {
    const list = sessions.list.getSnapshot();
    for (const id of list.ids) {
      const entry = entries.get(id);
      if (entry === undefined) continue;
      if (id === userFocusSessionId) continue; // 焦点会话的 emergency 已由 focus SM 呈现
      if (isEmergencyState(entry.lastState)) return id;
    }
    return undefined;
  }

  /** 多会话并行判定：≥2 会话 running 且至少一个非 idle（ADR-0010 D2）。 */
  function isParallelHold(): boolean {
    let runningCount = 0;
    let hasNonIdle = false;
    for (const entry of entries.values()) {
      const core = entry.prevCore;
      if (core === null) continue;
      if (core.running) {
        runningCount += 1;
        // 用 pendingTarget（真实底层目标）而非 lastState（可能因防抖落后）
        if (entry.pendingTarget !== "idle") hasNonIdle = true;
      }
    }
    return runningCount >= 2 && hasNonIdle;
  }

  /** 计算当前快照。 */
  function computeSnapshot(): RuntimeSnapshot {
    // 1. 无焦点会话
    if (currentFocusSessionId === undefined) {
      return {
        focusSessionId: undefined,
        currentState: IDLE,
        playback: IDLE_PLAYBACK,
        focusNonce,
      };
    }

    // 2. 紧急抢焦：显示 emergency 会话的 SM 快照
    const emergencyId = findEmergencySessionId();
    if (emergencyId !== undefined) {
      const entry = entries.get(emergencyId);
      if (entry !== undefined) {
        const sm = entry.stateMachine.getSnapshot();
        return {
          focusSessionId: emergencyId,
          currentState: sm.currentState,
          playback: sm.playback,
          focusNonce,
        };
      }
    }

    // 3. 并行驻留
    if (isParallelHold()) {
      if (easterEggState !== undefined) {
        return {
          focusSessionId: currentFocusSessionId,
          currentState: easterEggExiting ? "working" : easterEggState,
          playback: easterEggExiting
            ? easterEggExitPlayback(easterEggState)
            : easterEggEntryPlayback(easterEggState),
          focusNonce,
        };
      }
      return {
        focusSessionId: currentFocusSessionId,
        currentState: "working",
        playback: workingHoldPlayback(),
        focusNonce,
      };
    }

    // 4. 正常跟随焦点会话
    const entry = entries.get(currentFocusSessionId);
    if (entry === undefined) {
      return {
        focusSessionId: currentFocusSessionId,
        currentState: IDLE,
        playback: IDLE_PLAYBACK,
        focusNonce,
      };
    }
    const sm = entry.stateMachine.getSnapshot();
    return {
      focusSessionId: currentFocusSessionId,
      currentState: sm.currentState,
      playback: sm.playback,
      focusNonce,
    };
  }

  function emit(): void {
    cachedSnapshot = computeSnapshot();
    for (const listener of listeners) listener(cachedSnapshot);
  }

  /** 切换当前显示焦点，必要时递增 focusNonce。 */
  function setCurrentFocus(id: SessionId | undefined): void {
    if (id === currentFocusSessionId) return;
    currentFocusSessionId = id;
    focusNonce += 1;
  }

  /** 重新评估焦点：从 emergency 交还用户焦点，或保持 emergency。 */
  function reconcileFocus(): void {
    const emergencyId = findEmergencySessionId();
    if (emergencyId !== undefined) {
      setCurrentFocus(emergencyId);
      return;
    }
    // 无 emergency 时回到用户焦点
    setCurrentFocus(userFocusSessionId);
  }

  // ---------------------------------------------------------------------------
  // 防抖
  // ---------------------------------------------------------------------------

  function clearDebounceTimer(): void {
    debounceDeadline = undefined;
  }

  function dispatchFocusPending(entry: SessionEntry): void {
    if (debouncePendingTarget === undefined) return;
    if (entry.lastState !== debouncePendingTarget) {
      entry.lastState = debouncePendingTarget;
      entry.stateMachine.dispatch({ type: "switch", target: debouncePendingTarget });
    }
    debouncePendingTarget = undefined;
  }

  /**
   * 对焦点会话应用目标态。
   * - permission/error：立即硬切（取消防抖）。
   * - done/idle：立即落。
   * - 工作态：防抖 3000ms，窗口内只保留最新 pending。
   */
  function applyFocusTarget(entry: SessionEntry, target: OverlayState): void {
    if (HARD_CUT_STATES.has(target) || DIRECT_STATES.has(target)) {
      clearDebounceTimer();
      debouncePendingTarget = undefined;
      if (entry.lastState !== target) {
        entry.lastState = target;
        entry.stateMachine.dispatch({ type: "switch", target });
      }
      return;
    }

    if (DEBOUNCE_STATES.has(target)) {
      debouncePendingTarget = target;
      debounceDeadline = now() + FOCUS_DEBOUNCE_MS;
      return;
    }

    // 其他状态兜底：直接落
    clearDebounceTimer();
    debouncePendingTarget = undefined;
    if (entry.lastState !== target) {
      entry.lastState = target;
      entry.stateMachine.dispatch({ type: "switch", target });
    }
  }

  // ---------------------------------------------------------------------------
  // 摸鱼彩蛋
  // ---------------------------------------------------------------------------

  function clearEasterEggTimers(): void {
    if (easterEggTimer !== undefined) {
      clearTimeout(easterEggTimer);
      easterEggTimer = undefined;
    }
    if (easterEggHoldTimer !== undefined) {
      clearTimeout(easterEggHoldTimer);
      easterEggHoldTimer = undefined;
    }
    if (easterEggExitTimer !== undefined) {
      clearTimeout(easterEggExitTimer);
      easterEggExitTimer = undefined;
    }
  }

  function randomEasterEggIntervalMs(): number {
    return EASTER_EGG_MIN_MS + Math.floor(random() * (EASTER_EGG_MAX_MS - EASTER_EGG_MIN_MS));
  }

  function pickEasterEggState(): OverlayState | IntermediateState {
    const idx = Math.floor(random() * EASTER_EGG_POOL.length);
    return EASTER_EGG_POOL[idx]!;
  }

  function startEasterEggExit(): void {
    if (easterEggState === undefined) return;
    easterEggExiting = true;
    if (easterEggExitTimer !== undefined) clearTimeout(easterEggExitTimer);
    easterEggExitTimer = setTimeout(() => {
      easterEggExitTimer = undefined;
      easterEggState = undefined;
      easterEggExiting = false;
      scheduleEasterEgg(); // 为下一次彩蛋排期
      reconcileFocus();
      emit();
    }, EASTER_EGG_EXIT_MS);
  }

  function startEasterEggHold(): void {
    if (easterEggHoldTimer !== undefined) clearTimeout(easterEggHoldTimer);
    easterEggHoldTimer = setTimeout(() => {
      easterEggHoldTimer = undefined;
      startEasterEggExit();
      emit();
    }, EASTER_EGG_HOLD_MS);
  }

  function enterEasterEgg(): void {
    if (easterEggState !== undefined || easterEggExiting || !isParallelHold()) return;
    easterEggExiting = false;
    easterEggState = pickEasterEggState();
    startEasterEggHold();
    emit();
  }

  function scheduleEasterEgg(): void {
    if (easterEggTimer !== undefined) clearTimeout(easterEggTimer);
    easterEggTimer = setTimeout(() => {
      easterEggTimer = undefined;
      if (isParallelHold()) {
        enterEasterEgg();
      }
    }, randomEasterEggIntervalMs());
  }

  /** 并行驻留条件变化时重新调度彩蛋。 */
  function onParallelHoldChanged(isHold: boolean): void {
    if (!isHold) {
      clearEasterEggTimers();
      easterEggState = undefined;
      easterEggExiting = false;
      return;
    }
    if (easterEggState === undefined && !easterEggExiting && easterEggTimer === undefined) {
      scheduleEasterEgg();
    }
  }

  // ---------------------------------------------------------------------------
  // 每会话差分推导
  // ---------------------------------------------------------------------------

  function setUnderlyingTarget(entry: SessionEntry, target: OverlayState): void {
    if (target === entry.pendingTarget) return;
    entry.pendingTarget = target;

    // 维护时间驱动阈值
    if (target === "thinking" && entry.thinkingSince === undefined) {
      entry.thinkingSince = now();
    } else if (target !== "thinking") {
      entry.thinkingSince = undefined;
    }
    if (target === "done" && entry.doneSince === undefined) {
      entry.doneSince = now();
    } else if (target !== "done") {
      entry.doneSince = undefined;
    }
  }

  function processSnapshot(entry: SessionEntry, snapshot: ConversationSnapshot): void {
    const currCore = extractCore(snapshot);
    const target = diffTarget(entry.prevCore, currCore);
    if (currCore.hasVisibleChunk || !currCore.running) entry.thinkingSince = undefined;
    if (target !== null) {
      setUnderlyingTarget(entry, target);
      if (focusSessionIdToEntry(currentFocusSessionId) === entry) {
        applyFocusTarget(entry, target);
      } else {
        // 非焦点会话直接落（不可见，无需防抖）
        if (entry.lastState !== target) {
          entry.lastState = target;
          entry.stateMachine.dispatch({ type: "switch", target });
        }
      }
    }
    entry.prevCore = currCore;

    // 任何会话状态变化都可能影响 emergency/并行驻留
    const wasParallel = isParallelHold();
    reconcileFocus();
    const isHold = isParallelHold();
    if (wasParallel !== isHold) {
      onParallelHoldChanged(isHold);
    }
    emit();
  }

  function focusSessionIdToEntry(
    id: SessionId | undefined,
  ): SessionEntry | undefined {
    if (id === undefined) return undefined;
    return entries.get(id);
  }

  // ---------------------------------------------------------------------------
  // 会话注册 / 注销
  // ---------------------------------------------------------------------------

  function registerSession(id: SessionId): void {
    if (entries.has(id)) return;
    const binding = sessions.binding(id);
    if (binding === undefined) return;
    const stateMachine = createOverlayStateMachine(IDLE);
    const entry: SessionEntry = {
      stateMachine,
      unsub: undefined,
      prevCore: null,
      lastState: IDLE,
      pendingTarget: IDLE,
      thinkingSince: undefined,
      doneSince: undefined,
    };
    entries.set(id, entry);
    entry.unsub = binding.session.subscribe(() => {
      processSnapshot(entry, binding.session.getSnapshot());
    });
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
    for (const id of entries.keys()) {
      if (!nextIds.has(id)) unregisterSession(id);
    }
    for (const id of ids) {
      if (!entries.has(id)) registerSession(id);
    }
  }

  // ---------------------------------------------------------------------------
  // list 订阅
  // ---------------------------------------------------------------------------

  function handleListChange(): void {
    if (disposed) return;
    const list = sessions.list.getSnapshot();
    syncSessions(list.ids);
    const prevUserFocus = userFocusSessionId;
    userFocusSessionId = list.current;
    if (userFocusSessionId !== prevUserFocus) {
      // 切焦前 flush 旧焦点的 pending，避免旧会话状态机长期落后
      const oldFocusEntry = focusSessionIdToEntry(currentFocusSessionId);
      if (oldFocusEntry !== undefined && debouncePendingTarget !== undefined) {
        dispatchFocusPending(oldFocusEntry);
      }
      clearDebounceTimer();
      debouncePendingTarget = undefined;

      reconcileFocus();

      // 新焦点立即显示其当前真实目标（不重新防抖）
      const newFocusEntry = focusSessionIdToEntry(currentFocusSessionId);
      if (
        newFocusEntry !== undefined &&
        newFocusEntry.pendingTarget !== newFocusEntry.lastState
      ) {
        newFocusEntry.lastState = newFocusEntry.pendingTarget;
        newFocusEntry.stateMachine.dispatch({
          type: "switch",
          target: newFocusEntry.pendingTarget,
        });
      }

      onParallelHoldChanged(isParallelHold());
      emit();
      return;
    }
    // ids 变化可能影响并行/紧急态
    const wasParallel = isParallelHold();
    reconcileFocus();
    const isHold = isParallelHold();
    if (wasParallel !== isHold) {
      onParallelHoldChanged(isHold);
    }
    emit();
  }

  const listUnsub = sessions.list.subscribe(() => handleListChange());

  // 初始同步
  handleListChange();

  // ---------------------------------------------------------------------------
  // tick：时间驱动（thinking→reading 超时、done→idle 驻留）
  // ---------------------------------------------------------------------------

  function tick(): void {
    if (disposed) return;
    let changed = false;

    // 焦点会话防抖 deadline 到点：dispatch pending
    if (
      debouncePendingTarget !== undefined &&
      debounceDeadline !== undefined &&
      now() >= debounceDeadline
    ) {
      debounceDeadline = undefined;
      const focusEntry = focusSessionIdToEntry(currentFocusSessionId);
      if (focusEntry !== undefined) {
        dispatchFocusPending(focusEntry);
        changed = true;
      }
    }

    for (const entry of entries.values()) {
      if (
        entry.pendingTarget === "thinking" &&
        entry.thinkingSince !== undefined
      ) {
        if (now() - entry.thinkingSince >= READING_THRESHOLD_MS) {
          entry.thinkingSince = undefined;
          setUnderlyingTarget(entry, "reading");
          if (focusSessionIdToEntry(currentFocusSessionId) === entry) {
            applyFocusTarget(entry, "reading");
          } else {
            if (entry.lastState !== "reading") {
              entry.lastState = "reading";
              entry.stateMachine.dispatch({ type: "switch", target: "reading" });
            }
          }
          changed = true;
        }
      } else if (
        entry.pendingTarget === "done" &&
        entry.doneSince !== undefined
      ) {
        if (now() - entry.doneSince >= DONE_HOLD_MS) {
          entry.doneSince = undefined;
          setUnderlyingTarget(entry, IDLE);
          if (focusSessionIdToEntry(currentFocusSessionId) === entry) {
            applyFocusTarget(entry, IDLE);
          } else {
            if (entry.lastState !== IDLE) {
              entry.lastState = IDLE;
              entry.stateMachine.dispatch({ type: "switch", target: IDLE });
            }
          }
          changed = true;
        }
      }
    }

    if (changed) {
      const wasParallel = isParallelHold();
      reconcileFocus();
      const isHold = isParallelHold();
      if (wasParallel !== isHold) {
        onParallelHoldChanged(isHold);
      }
      emit();
    }
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
    clearDebounceTimer();
    clearEasterEggTimers();
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
