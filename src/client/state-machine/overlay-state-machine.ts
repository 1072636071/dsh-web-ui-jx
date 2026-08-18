/**
 * overlay-state-machine — 角色浮层状态机（纯逻辑）。
 *
 * 工单 05：浮层状态机与 10 态切换。
 *
 * 10 循环态节点：idle/thinking/reading/replying/working/error/welcome/done/
 * permission/listening，对应素材 {state}.webp（<img> 持续循环播放）。
 *
 * 36 过渡边：对应素材 transition-{from}-{to}.webp（<img> 播放一次后落入目标态）。
 * 其中 20 边连接 10 循环态，16 边连接循环态与 6 个中间态表情（shy-smile/shush/
 * nod-smile/frown-wave/chin-rest/cheek-rest，只出现在过渡段端点，无循环态素材，
 * 不作为切换意图目标）。
 *
 * 切换逻辑（A → B，A≠B）：
 *   - 若存在直接过渡段 transition-A-B：先播该过渡段一次，然后落入 B 循环态。
 *   - 否则经 idle 中转：先播 transition-A-idle，再播 transition-idle-B，然后落入 B。
 *   - 所有 10 循环态都有 X-idle 与 idle-X 过渡段，中转总是可行。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。UI（CharacterOverlay）与宿主事件
 * （HostEventAdapter）只发意图（dispatch），不直接操作 DOM 切换。
 *
 * @module dsh-web-ui-jx/client
 */

// ---------------------------------------------------------------------------
// 状态定义
// ---------------------------------------------------------------------------

/** 10 循环态节点（持续循环播放的稳态）. */
export type OverlayState =
  | "idle"
  | "thinking"
  | "reading"
  | "replying"
  | "working"
  | "error"
  | "welcome"
  | "done"
  | "permission"
  | "listening";

/** 10 循环态有序列表. */
export const OVERLAY_STATES: readonly OverlayState[] = [
  "idle",
  "thinking",
  "reading",
  "replying",
  "working",
  "error",
  "welcome",
  "done",
  "permission",
  "listening",
] as const;

/** 6 个中间态表情（只出现在过渡段端点，无循环态素材，不作为切换意图目标）. */
export type IntermediateState =
  | "shy-smile"
  | "shush"
  | "nod-smile"
  | "frown-wave"
  | "chin-rest"
  | "cheek-rest";

/** 过渡段端点（循环态或中间态表情）. */
export type TransitionEndpoint = OverlayState | IntermediateState;

// ---------------------------------------------------------------------------
// 36 过渡边（对应 assets/character/transition-{from}-{to}.webp）
// ---------------------------------------------------------------------------

/**
 * 36 过渡边：from-to 对，对应 assets/character/transition-{from}-{to}.webp。
 *
 * 命名模式：transition-{from}-{to}.webp。from-to 映射：
 *   - idle ↔ 9 循环态（18 边）
 *   - thinking ↔ replying（2 边）
 *   - idle ↔ 6 中间态表情（12 边）
 *   - permission ↔ nod-smile/frown-wave（4 边）
 */
export const TRANSITION_EDGES: ReadonlyArray<
  readonly [TransitionEndpoint, TransitionEndpoint]
> = [
  // idle ↔ 9 循环态（18 边）
  ["idle", "thinking"],
  ["thinking", "idle"],
  ["idle", "reading"],
  ["reading", "idle"],
  ["idle", "replying"],
  ["replying", "idle"],
  ["idle", "working"],
  ["working", "idle"],
  ["idle", "error"],
  ["error", "idle"],
  ["idle", "welcome"],
  ["welcome", "idle"],
  ["idle", "done"],
  ["done", "idle"],
  ["idle", "permission"],
  ["permission", "idle"],
  ["idle", "listening"],
  ["listening", "idle"],
  // thinking ↔ replying（2 边）
  ["thinking", "replying"],
  ["replying", "thinking"],
  // idle ↔ 6 中间态表情（12 边）
  ["idle", "shy-smile"],
  ["shy-smile", "idle"],
  ["idle", "shush"],
  ["shush", "idle"],
  ["idle", "nod-smile"],
  ["nod-smile", "idle"],
  ["idle", "frown-wave"],
  ["frown-wave", "idle"],
  ["idle", "chin-rest"],
  ["chin-rest", "idle"],
  ["idle", "cheek-rest"],
  ["cheek-rest", "idle"],
  // permission ↔ nod-smile/frown-wave（4 边）
  ["permission", "nod-smile"],
  ["nod-smile", "permission"],
  ["permission", "frown-wave"],
  ["frown-wave", "permission"],
] as const;

/** 边集合：`${from}|${to}` → true，用于 O(1) 查询. */
const EDGE_SET: ReadonlySet<string> = new Set(
  TRANSITION_EDGES.map(([from, to]) => `${from}|${to}`),
);

/** 判断过渡段 transition-{from}-{to}.webp 是否存在. */
export function hasTransitionEdge(
  from: TransitionEndpoint,
  to: TransitionEndpoint,
): boolean {
  return EDGE_SET.has(`${from}|${to}`);
}

// ---------------------------------------------------------------------------
// 素材路由 URL
// ---------------------------------------------------------------------------

/** 素材路由前缀（同源根访问，经 host 半区 /api/dsh-jx/* 路由服务）. */
export const CHARACTER_ASSET_PREFIX = "/api/dsh-jx/character";

/** 循环态素材 URL：/api/dsh-jx/character/{state}.webp. */
export function loopAssetUrl(state: OverlayState): string {
  return `${CHARACTER_ASSET_PREFIX}/${state}.webp`;
}

/** 过渡段素材 URL：/api/dsh-jx/character/transition-{from}-{to}.webp. */
export function transitionAssetUrl(
  from: TransitionEndpoint,
  to: TransitionEndpoint,
): string {
  return `${CHARACTER_ASSET_PREFIX}/transition-${from}-${to}.webp`;
}

// ---------------------------------------------------------------------------
// 播放计划项
// ---------------------------------------------------------------------------

/** 过渡段播放项（播放一次后推进到下一项）. */
export interface TransitionPlaybackItem {
  readonly kind: "transition";
  readonly from: TransitionEndpoint;
  readonly to: TransitionEndpoint;
  readonly url: string;
  /** 预估播放时长 ms（webp 实际时长未知，UI 用此值 setTimeout 后推进）. */
  readonly durationMs: number;
}

/** 循环态播放项（持续循环直到下次切换）. */
export interface LoopPlaybackItem {
  readonly kind: "loop";
  readonly state: OverlayState;
  readonly url: string;
}

/** 播放计划项：过渡段（一次）或循环态（持续）. */
export type PlaybackItem = TransitionPlaybackItem | LoopPlaybackItem;

// ---------------------------------------------------------------------------
// 意图
// ---------------------------------------------------------------------------

/** 切换意图：切到目标循环态. */
export interface SwitchIntent {
  readonly type: "switch";
  readonly target: OverlayState;
}

/** 状态机意图（目前只有 switch；后续可扩展 play-expression 等）. */
export type OverlayIntent = SwitchIntent;

// ---------------------------------------------------------------------------
// 状态机快照
// ---------------------------------------------------------------------------

/** 状态机快照（UI 据此渲染）. */
export interface StateMachineSnapshot {
  /** 当前已确认的循环态（dispatch 后立即更新为目标态）. */
  readonly currentState: OverlayState;
  /** 应播放的素材序列：[transition..., loop]（过渡段 0-2 个，循环态 1 个在末尾）. */
  readonly playback: readonly PlaybackItem[];
}

// ---------------------------------------------------------------------------
// 过渡段预估时长
// ---------------------------------------------------------------------------

/** 过渡段预估播放时长 ms（webp 实际时长未知，给保守默认值；UI 用此值 setTimeout 推进）. */
export const DEFAULT_TRANSITION_DURATION_MS = 800;

// ---------------------------------------------------------------------------
// 切换计划构造（纯函数）
// ---------------------------------------------------------------------------

/**
 * 构造从 from 切到 to 的播放计划。
 *
 * - from === to：[loop-to]（无切换）。
 * - 存在直接过渡段 transition-from-to：[transition-from-to, loop-to]。
 * - 否则经 idle 中转：[transition-from-idle, transition-idle-to, loop-to]。
 *
 * 所有 10 循环态都有 X-idle 与 idle-X 过渡段，中转总是可行。
 *
 * @param from - 起始循环态。
 * @param to - 目标循环态。
 * @returns 播放计划项数组（过渡段 0-2 个 + 末尾 1 个循环态）。
 */
export function planSwitch(
  from: OverlayState,
  to: OverlayState,
): readonly PlaybackItem[] {
  if (from === to) {
    return [{ kind: "loop", state: to, url: loopAssetUrl(to) }];
  }
  if (hasTransitionEdge(from, to)) {
    return [
      {
        kind: "transition",
        from,
        to,
        url: transitionAssetUrl(from, to),
        durationMs: DEFAULT_TRANSITION_DURATION_MS,
      },
      { kind: "loop", state: to, url: loopAssetUrl(to) },
    ];
  }
  // 经 idle 中转：from → idle → to
  // 所有 10 循环态都有 X-idle 与 idle-X 过渡段（已由素材确认）
  return [
    {
      kind: "transition",
      from,
      to: "idle",
      url: transitionAssetUrl(from, "idle"),
      durationMs: DEFAULT_TRANSITION_DURATION_MS,
    },
    {
      kind: "transition",
      from: "idle",
      to,
      url: transitionAssetUrl("idle", to),
      durationMs: DEFAULT_TRANSITION_DURATION_MS,
    },
    { kind: "loop", state: to, url: loopAssetUrl(to) },
  ];
}

// ---------------------------------------------------------------------------
// 状态机
// ---------------------------------------------------------------------------

/** 状态机实例. */
export interface OverlayStateMachine {
  /** 派发意图（UI 与宿主事件只通过此方法驱动状态机）. */
  dispatch(intent: OverlayIntent): void;
  /** 取当前快照（供 useSyncExternalStore 等订阅机制读取）. */
  getSnapshot(): StateMachineSnapshot;
  /** 订阅快照变化；返回取消订阅函数. */
  subscribe(listener: (snapshot: StateMachineSnapshot) => void): () => void;
}

/**
 * 创建角色浮层状态机实例。
 *
 * @param initial - 初始循环态（默认 idle）。
 * @returns 状态机实例 { dispatch, getSnapshot, subscribe }。
 */
export function createOverlayStateMachine(
  initial: OverlayState = "idle",
): OverlayStateMachine {
  let currentState: OverlayState = initial;
  let playback: readonly PlaybackItem[] = [
    { kind: "loop", state: initial, url: loopAssetUrl(initial) },
  ];
  // 缓存快照：useSyncExternalStore 要求 getSnapshot 在状态未变时返回稳定引用。
  // 若每次调用都新建对象，React 每次 render 都会发现引用不等 → 判定 store 变化
  // → 无限重渲染（React error #301）。因此只在 emit（状态真变）时重建引用。
  let cachedSnapshot: StateMachineSnapshot = { currentState, playback };
  const listeners = new Set<(snapshot: StateMachineSnapshot) => void>();

  function getSnapshot(): StateMachineSnapshot {
    return cachedSnapshot;
  }

  function emit(): void {
    cachedSnapshot = { currentState, playback };
    for (const listener of listeners) listener(cachedSnapshot);
  }

  function dispatch(intent: OverlayIntent): void {
    if (intent.type === "switch") {
      if (intent.target === currentState) return; // 无变化，不通知
      const next = planSwitch(currentState, intent.target);
      currentState = intent.target;
      playback = next;
      emit();
    }
  }

  function subscribe(
    listener: (snapshot: StateMachineSnapshot) => void,
  ): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { dispatch, getSnapshot, subscribe };
}

// ---------------------------------------------------------------------------
// 模块级单例（供 CharacterOverlay 与 StateSwitcher 共享，不通过 Context/props）
// ---------------------------------------------------------------------------

/** 角色浮层状态机单例（CharacterOverlay 与 StateSwitcher 共享此实例）. */
export const overlayStateMachine: OverlayStateMachine =
  createOverlayStateMachine("idle");

/** 稳定的 subscribe 引用（供 useSyncExternalStore，引用恒等避免重渲染）. */
export const subscribeOverlayStateMachine = (
  onChange: () => void,
): (() => void) => overlayStateMachine.subscribe(onChange);

/** 稳定的 getSnapshot 引用（供 useSyncExternalStore，引用恒等避免重渲染）. */
export const getOverlayStateMachineSnapshot = (): StateMachineSnapshot =>
  overlayStateMachine.getSnapshot();

// ---------------------------------------------------------------------------
// 宿主事件接入口（助手行为 → 状态意图）
// ---------------------------------------------------------------------------

/**
 * 宿主事件适配器：把助手行为事件转成状态机切换意图。
 *
 * 本工单只留意图转换实现，不订阅宿主事件源（不在内部订阅任何宿主事件）。
 * 后续工单订阅宿主事件（如助手开始思考 → onAssistantThinking）时调用对应
 * 方法即可把事件转成状态机 dispatch。
 */
export interface HostEventAdapter {
  /** 助手空闲 → switch to idle. */
  onAssistantIdle(): void;
  /** 助手开始思考 → switch to thinking. */
  onAssistantThinking(): void;
  /** 助手阅读中 → switch to reading. */
  onAssistantReading(): void;
  /** 助手回复中 → switch to replying. */
  onAssistantReplying(): void;
  /** 助手工作中 → switch to working. */
  onAssistantWorking(): void;
  /** 助手出错 → switch to error. */
  onAssistantError(): void;
  /** 助手欢迎 → switch to welcome. */
  onAssistantWelcome(): void;
  /** 助手完成 → switch to done. */
  onAssistantDone(): void;
  /** 助手请求权限 → switch to permission. */
  onAssistantPermission(): void;
  /** 助手聆听中 → switch to listening. */
  onAssistantListening(): void;
}

/**
 * 创建宿主事件适配器：把助手行为事件转成状态机 dispatch 调用。
 *
 * 本工单只留意图转换实现，不接宿主事件源（不在内部订阅任何宿主事件）。
 * 后续工单订阅宿主事件时调用 adapter 对应方法。
 *
 * @param sm - 要驱动的状态机实例。
 * @returns 宿主事件适配器。
 */
export function createHostEventAdapter(
  sm: OverlayStateMachine,
): HostEventAdapter {
  const to =
    (target: OverlayState): (() => void) =>
    () =>
      sm.dispatch({ type: "switch", target });
  return {
    onAssistantIdle: to("idle"),
    onAssistantThinking: to("thinking"),
    onAssistantReading: to("reading"),
    onAssistantReplying: to("replying"),
    onAssistantWorking: to("working"),
    onAssistantError: to("error"),
    onAssistantWelcome: to("welcome"),
    onAssistantDone: to("done"),
    onAssistantPermission: to("permission"),
    onAssistantListening: to("listening"),
  };
}
