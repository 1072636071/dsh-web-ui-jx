/**
 * overlay-state-machine — 角色浮层状态机（纯逻辑，ADR-0016 四态收敛）。
 *
 * 4 循环态节点：idle / working / permission / error，对应素材
 * `{state}.webp`（working 的循环素材由显示层轮换 thinking/reading 担当，
 * 见 overlay-session-runtime 的 working 轮换层）。
 *
 * 一次性表演（边沿触发、播完自动回落、不占循环态、不作为切换意图目标）：
 * done（收工）/ nod-smile（批准）/ frown-wave（拒绝）/
 * surprised（poke 惊吓）/ happy / angry（摸鱼彩蛋）。
 * 入场无表演：welcome 已经 ADR-0023 彻底移除，浮层首次入场直接落待机。
 *
 * 过渡边收敛（PRD 实现决策 3「20 边」清单，ADR-0023 移除 welcome 后）：
 * idle 枢纽 ↔ 8 端点
 * （thinking/reading/permission/error/done/surprised/happy/angry，
 * 8 个无向对 = 16 有向段）+ 权限反馈链 4 有向段（permission→nod-smile、
 * nod-smile→idle、permission→frown-wave、frown-wave→idle），共 22 有向
 * 过渡段，与 assets/character/transition-*.webp 现存清单一一对应。
 *
 * 弃用边（查询返回 false）：idle↔working、idle↔replying、thinking↔replying、
 * idle↔listening、idle↔shush、idle↔shy-smile、idle↔cheek-rest、idle↔chin-rest、
 * idle→nod-smile、idle→frown-wave、nod-smile→permission、frown-wave→permission。
 *
 * 切换逻辑（A → B，A≠B，A/B ∈ 4 循环态）：
 *   - 存在直接过渡段 transition-A-B：先播该过渡段一次，然后落入 B 循环态。
 *   - 否则经 idle 中转：先播 A（或 working 当前轮换素材）→idle，再播
 *     idle→B（或 idle→working 入场素材），然后落入 B。
 *   - working 的出入场素材由显示层轮换决定（opts 注入，默认 thinking）。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。UI（CharacterOverlay）与宿主事件
 * （HostEventAdapter）只发意图（dispatch），不直接操作 DOM 切换。
 *
 * @module dsh-web-ui-jx/client
 */

// ---------------------------------------------------------------------------
// 状态定义（ADR-0016 类型层分离）
// ---------------------------------------------------------------------------

/** 4 循环态节点（持续循环播放的稳态）. */
export type OverlayState = "idle" | "working" | "permission" | "error";

/** 4 循环态有序列表. */
export const OVERLAY_STATES: readonly OverlayState[] = [
  "idle",
  "working",
  "permission",
  "error",
] as const;

/** 一次性表演类型（边沿触发、播完回落，不占循环态）. */
export type PerformanceKind =
  | "done"
  | "nod-smile"
  | "frown-wave"
  | "surprised"
  | "happy"
  | "angry";

/** working 显示层轮换素材（思考/看书，独立姿态循环，须经 idle 中转过渡衔接）. */
export type WorkingLoopAsset = "thinking" | "reading";

/** 过渡段端点（循环态 + 表演端点 + working 轮换素材）. */
export type TransitionEndpoint = OverlayState | PerformanceKind | WorkingLoopAsset;

// ---------------------------------------------------------------------------
// 过渡边（对应 assets/character/transition-{from}-{to}.webp）
// ---------------------------------------------------------------------------

/**
 * 过渡边：from-to 对，对应 assets/character/transition-{from}-{to}.webp。
 *
 * PRD「20 边」收敛清单的有向展开，ADR-0023 移除 welcome 两段后共 20 有向段：
 *   - idle ↔ thinking / reading（工作轮换中转，4）
 *   - idle ↔ permission / error（紧急态出入，4）
 *   - idle ↔ done（表演出入，2）
 *   - permission→nod-smile、nod-smile→idle（批准链，2）
 *   - permission→frown-wave、frown-wave→idle（拒绝链，2）
 *   - idle ↔ surprised / happy / angry（poke 与彩蛋，6）
 */
export const TRANSITION_EDGES: ReadonlyArray<
  readonly [TransitionEndpoint, TransitionEndpoint]
> = [
  ["idle", "thinking"],
  ["thinking", "idle"],
  ["idle", "reading"],
  ["reading", "idle"],
  ["idle", "permission"],
  ["permission", "idle"],
  ["idle", "error"],
  ["error", "idle"],
  ["idle", "done"],
  ["done", "idle"],
  ["permission", "nod-smile"],
  ["nod-smile", "idle"],
  ["permission", "frown-wave"],
  ["frown-wave", "idle"],
  ["idle", "surprised"],
  ["surprised", "idle"],
  ["idle", "happy"],
  ["happy", "idle"],
  ["idle", "angry"],
  ["angry", "idle"],
] as const;

/** 边集合：`${from}|${to}` → true，用于 O(1) 查询. */
const EDGE_SET: ReadonlySet<string> = new Set(
  TRANSITION_EDGES.map(([from, to]) => `${from}|${to}`),
);

/** 判断过渡段 transition-{from}-{to}.webp 是否存在（弃用边返回 false）. */
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

/** 循环态素材 URL：/api/dsh-jx/character/{state}.webp（含表演态循环体）. */
export function loopAssetUrl(state: OverlayState | PerformanceKind): string {
  return `${CHARACTER_ASSET_PREFIX}/${state}.webp`;
}

/** working 显示层轮换素材 URL：/api/dsh-jx/character/{asset}.webp. */
export function workingLoopAssetUrl(asset: WorkingLoopAsset): string {
  return `${CHARACTER_ASSET_PREFIX}/${asset}.webp`;
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

/** 过渡段播放项（播放一次后推进到下一项）.
 *  播放时长不在计划项内携带：UI 侧播放期经 webp-duration 解析真实时长
 *  （失败回退 DEFAULT_TRANSITION_DURATION_MS）。 */
export interface TransitionPlaybackItem {
  readonly kind: "transition";
  readonly from: TransitionEndpoint;
  readonly to: TransitionEndpoint;
  readonly url: string;
}

/** 循环态播放项（持续循环直到下次切换）.
 *  working 态的 url 为显示层轮换素材（thinking/reading），state 仍为 working；
 *  表演态循环（done/nod-smile/frown-wave/surprised/happy/angry）由
 *  runtime 显示层构造，state 为对应表演类型。 */
export interface LoopPlaybackItem {
  readonly kind: "loop";
  readonly state: OverlayState | PerformanceKind;
  readonly url: string;
}

/** 播放计划项：过渡段（一次）或循环态（持续）. */
export type PlaybackItem = TransitionPlaybackItem | LoopPlaybackItem;

// ---------------------------------------------------------------------------
// 意图
// ---------------------------------------------------------------------------

/** 切换意图：切到目标循环态（表演不作为切换意图目标，ADR-0016 决策 2）. */
export interface SwitchIntent {
  readonly type: "switch";
  readonly target: OverlayState;
}

/** 状态机意图（目前只有 switch）. */
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

/** 过渡段播放时长的回退默认值 ms（真实时长解析失败时 UI 侧使用）. */
export const DEFAULT_TRANSITION_DURATION_MS = 800;

// ---------------------------------------------------------------------------
// 切换计划构造（纯函数）
// ---------------------------------------------------------------------------

/** 切换计划构造选项（working 出入场素材由显示层注入）. */
export interface PlanSwitchOptions {
  /** working 切出所用轮换素材（默认 thinking）. */
  readonly workingExitAsset?: WorkingLoopAsset;
  /** working 切入所用轮换素材（默认 thinking）. */
  readonly workingEnterAsset?: WorkingLoopAsset;
}

/**
 * 构造从 from 切到 to 的播放计划（from/to ∈ 4 循环态）。
 *
 * - from === to：[loop-to]（无切换；working 的 loop url 取入场素材）。
 * - 存在直接过渡段 transition-from-to：[transition-from-to, loop-to]。
 * - 否则经 idle 中转：working 侧用其轮换素材出入（transition-{asset}-idle /
 *   transition-idle-{asset}），非 working 侧用自身过渡段。
 *
 * @param from - 起始循环态。
 * @param to - 目标循环态。
 * @param opts - working 出入场素材（可选）。
 * @returns 播放计划项数组（过渡段 0-2 个 + 末尾 1 个循环态）。
 */
export function planSwitch(
  from: OverlayState,
  to: OverlayState,
  opts?: PlanSwitchOptions,
): readonly PlaybackItem[] {
  const exitAsset = opts?.workingExitAsset ?? "thinking";
  const enterAsset = opts?.workingEnterAsset ?? "thinking";
  const loopItem = (state: OverlayState): LoopPlaybackItem => ({
    kind: "loop",
    state,
    url: state === "working" ? workingLoopAssetUrl(enterAsset) : loopAssetUrl(state),
  });
  if (from === to) {
    return [loopItem(to)];
  }
  if (hasTransitionEdge(from, to)) {
    return [
      { kind: "transition", from, to, url: transitionAssetUrl(from, to) },
      loopItem(to),
    ];
  }
  // 经 idle 中转：from → idle → to（working 侧用轮换素材端点）
  const plan: PlaybackItem[] = [];
  if (from !== "idle") {
    const exitFrom: TransitionEndpoint = from === "working" ? exitAsset : from;
    plan.push({
      kind: "transition",
      from: exitFrom,
      to: "idle",
      url: transitionAssetUrl(exitFrom, "idle"),
    });
  }
  if (to !== "idle") {
    const enterTo: TransitionEndpoint = to === "working" ? enterAsset : to;
    plan.push({
      kind: "transition",
      from: "idle",
      to: enterTo,
      url: transitionAssetUrl("idle", enterTo),
    });
  }
  plan.push(loopItem(to));
  return plan;
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
    {
      kind: "loop",
      state: initial,
      url: initial === "working" ? workingLoopAssetUrl("thinking") : loopAssetUrl(initial),
    },
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
// 宿主事件接入口（助手行为 → 状态意图，ADR-0016 决策 12 五目标收敛）
// ---------------------------------------------------------------------------

/**
 * 宿主事件适配器：把助手行为事件转成状态机切换意图。
 *
 * 方法收敛为五目标（idle/working/permission/error/done）：replying/reading/
 * thinking/listening/welcome 等旧方法移除（welcome 入场表演已随 ADR-0023
 * 整体移除；done 经性能层表演调度，适配器仅保留目标语义入口）。
 */
export interface HostEventAdapter {
  /** 助手空闲 → switch to idle. */
  onAssistantIdle(): void;
  /** 助手工作中（思考/工具/输出统一） → switch to working. */
  onAssistantWorking(): void;
  /** 助手出错 → switch to error（硬切）. */
  onAssistantError(): void;
  /** 助手请求权限 → switch to permission（硬切）. */
  onAssistantPermission(): void;
  /** 助手完成 → 落 idle（收工表演由 runtime 差分层承担；本入口供宿主直接驱动）. */
  onAssistantDone(): void;
}

/**
 * 创建宿主事件适配器：把助手行为事件转成状态机 dispatch 调用。
 *
 * @param sm - 要驱动的状态机实例。
 * @returns 宿主事件适配器（五目标）。
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
    onAssistantWorking: to("working"),
    onAssistantError: to("error"),
    onAssistantPermission: to("permission"),
    onAssistantDone: to("idle"),
  };
}
