/**
 * overlay-session-runtime — 会话级状态机容器、焦点仲裁与显示层调度
 * （ADR-0008 + ADR-0010 + ADR-0011 + ADR-0013 + ADR-0016 + ADR-0014）。
 *
 * ADR-0014 审批等待时间启发式：每会话记 blockedSince（runningCalls>0 且无
 * pending/error 的「卡住等待」起点），tick 扫描各 deadline——≥10s 进
 * permission、≥30s 升级 angry；目标/运行状态变化即清零；snapshot.pending
 * 上升沿的即时快路径保留（互补而非替代）。详见 `tick()` 与
 * `updateBlockedSince`。
 *
 * ADR-0016 四态收敛后的显示层管线（优先级高 → 低）：
 *   1. 紧急态（permission/error）：任意会话紧急 → 立即接管显示（硬切，
 *      打断一切进行中的表演/poke/彩蛋/工作轮换，紧急态即时原则）。
 *   2. poke 惊吓（ADR-0011）：点击触发的显示层覆盖。
 *   3. 一次性表演（done/nod-smile/frown-wave）：边沿触发、播完回落。
 *   4. 摸鱼彩蛋（happy/angry/surprised）：并行驻留期间随机触发。
 *   5. working 显示层轮换（thinking/reading 各播 2 整圈，经 idle 中转交替）。
 *   6. 基础显示：并行驻留 → working 轮换；否则跟随焦点会话 SM
 *      （idle → 变体轮换；working → 工作轮换）。
 *
 * 防抖（PRD 决策 5，约 2000ms）：仅作用于焦点会话 working 进入
 * （防连续回合/多会话切焦抖动）；permission/error 硬切不防抖；
 * working 回落的保护由 done 表演的整圈边界切出承担（回合重启时在
 * 边界校验会话目标，已回 working 则取消收工表演）。
 *
 * 循环自然三原则（ADR-0016）：工作轮换切换只发生在整圈边界（单圈
 * WORKING_LOOP_MS）；跨姿态必经 idle 中转过渡段；表演/轮换排程按
 * 过渡段实测时长（TRANSITION_EDGE_MS）计截止——驻留从目标态可见后起算，
 * 清除在退场过渡播完时。
 *
 * 单一时间接缝：防抖与全部显示层排程（表演/彩蛋/poke/工作轮换/变体轮换）
 * 不设独立 setTimeout，只记录注入 now() 的截止时刻，由统一 __tick 扫描
 * 到点推进（生产由内部 tick interval 驱动）——消除多定时器竞态，
 * 单时钟可测。
 *
 * 事件打断语义（实现期裁决，见工单 03）：
 *   - permission/error：从任何显示（含工作轮换中段）立即硬切接管——
 *     紧急态即时原则（ADR-0011/0016、工单 06「紧急态硬切即时」）优先于
 *     memorial 009 D9 的整圈边界措辞；
 *   - done / idle 回落：等当前工作整圈播完再切出（D7/D9 整圈边界切出）；
 *   - 表演被紧急态打断时立即让位；poke 与表演互斥（poke 播放中事件触发的
 *     表演跳过、仅更新会话 SM；表演播放中 poke 忽略）；poke/表演打断彩蛋。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。UI（CharacterOverlay）通过
 * useSyncExternalStore 订阅 runtime 快照。
 *
 * @module dsh-web-ui-jx/client
 */

import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session";
import {
  visiblePendingKind,
  type PendingInteractionsSource,
} from "../../../packages/dsh-session-bubble/src/session-list-adapter.ts";
import {
  createOverlayStateMachine,
  loopAssetUrl,
  transitionAssetUrl,
  workingLoopAssetUrl,
  type LoopPlaybackItem,
  type OverlayState,
  type PerformanceKind,
  type PlaybackItem,
  type TransitionEndpoint,
  type TransitionPlaybackItem,
  type WorkingLoopAsset,
} from "./overlay-state-machine.ts";
import { resolveDisplayLayer } from "./display-arbiter.ts";
import {
  extractCore,
  diffTarget,
  type SessionSnapshotLike,
  type SnapshotCore,
} from "./session-follow.ts";
import {
  pickNextVariant,
  rotationPeriodMs,
  rotationPool,
  type RotatableState,
} from "./variant-rotation.ts";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** working 进入防抖窗口 ms（PRD 决策 5「约 2000ms」；permission/error 硬切不防抖）。 */
export const FOCUS_DEBOUNCE_MS = 2000;

/** 审批等待时间启发式（ADR-0014）：卡住 ≥10s 进 permission。 */
export const PERMISSION_BLOCKED_MS = 10_000;

/** 审批等待时间启发式（ADR-0014）：卡住 ≥30s 由 permission 升级为 angry。 */
export const ANGRY_BLOCKED_MS = 30_000;

/** poke 惊吓循环驻留时长 ms（惊吓循环态可见后开始计时，ADR-0011）。 */
export const POKE_HOLD_MS = 3000;

/** done 表演驻留时长 ms（表演循环体可见后起算，PRD 决策 7）。 */
export const PERFORMANCE_HOLD_MS = 3000;

/** nod-smile / frown-wave 权限反馈表演驻留时长 ms（循环体约 2s，PRD 决策 7）。 */
export const PERMISSION_FEEDBACK_HOLD_MS = 2000;

/** 摸鱼彩蛋表情池（ADR-0016 收敛为 3 表情；surprised 与 poke 共用循环体）。 */
const EASTER_EGG_POOL: readonly PerformanceKind[] = [
  "happy",
  "angry",
  "surprised",
];

/** 彩蛋最短/最长间隔 ms（2–5 分钟）。 */
const EASTER_EGG_MIN_MS = 2 * 60 * 1000;
const EASTER_EGG_MAX_MS = 5 * 60 * 1000;

/** 彩蛋表情单次展示时长 ms（入场过渡播完、表情循环可见后开始计时）。 */
const EASTER_EGG_HOLD_MS = 3000;

/**
 * working 轮换素材单圈时长 ms（实测：thinking/reading 均 148 帧 × 67ms
 * pingpong 烘焙 = 9916ms。素材重生成后需复测，脚本
 * `.temp/scripts/measure_all_durations.mjs`）。
 */
export const WORKING_LOOP_MS: Readonly<Record<WorkingLoopAsset, number>> =
  Object.freeze({
    thinking: 9916,
    reading: 9916,
  });

/** 每段工作素材播几整圈后轮换（PRD 决策 5「各播约两整圈」）。 */
export const WORKING_ROTATION_LOOPS = 2;

/**
 * 过渡段实测时长表（ms）。2026-08-23 素材重组后全量复测（复测脚本
 * `.temp/scripts/measure_all_durations.mjs`，素材重生成后需同步重测）。
 * 三档：表情边（33ms × 23 帧）= 766；标准经典边（67×44 + 536 定格）= 3484；
 * 长经典边（67×74 + 536 定格）= 5494。共 20 边（ADR-0023 移除 welcome 两边后），
 * 与 TRANSITION_EDGES 一一对应。
 *
 * 用途：poke / 彩蛋 / 表演 / 工作轮换的显示层序列排程按「过渡段真实
 * 总时长 + 驻留时长」计截止——驻留从目标态可见后起算、退场在过渡播完时清除。
 */
const TRANSITION_EDGE_MS: Readonly<Record<string, number>> = Object.freeze({
  "angry-idle": 766,
  "done-idle": 3484,
  "error-idle": 5494,
  "frown-wave-idle": 5494,
  "happy-idle": 766,
  "idle-angry": 766,
  "idle-done": 3484,
  "idle-error": 5494,
  "idle-happy": 766,
  "idle-permission": 3484,
  "idle-reading": 5494,
  "idle-surprised": 766,
  "idle-thinking": 3484,
  "nod-smile-idle": 5494,
  "permission-frown-wave": 3484,
  "permission-idle": 3484,
  "permission-nod-smile": 3484,
  "reading-idle": 5494,
  "surprised-idle": 766,
  "thinking-idle": 3484,
});

/** 表内缺项边的回退时长：取表内最大档（宁晚勿早——晚切落在定格/循环帧，早切截断过渡）。 */
const TRANSITION_EDGE_MS_FALLBACK = 5494;

/** 查过渡段实测时长（键为 `${from}-${to}` 边名，同素材文件名去前缀）。 */
function edgeTransitionMs(
  from: TransitionEndpoint,
  to: TransitionEndpoint,
): number {
  return TRANSITION_EDGE_MS[`${from}-${to}`] ?? TRANSITION_EDGE_MS_FALLBACK;
}

/** 无会话时浮层停留的初始态。 */
const IDLE: OverlayState = "idle";
// ---------------------------------------------------------------------------
// 播放计划构造辅助
// ---------------------------------------------------------------------------

/** 过渡段播放项。 */
function transitionItem(
  from: TransitionEndpoint,
  to: TransitionEndpoint,
): TransitionPlaybackItem {
  return { kind: "transition", from, to, url: transitionAssetUrl(from, to) };
}

/** 循环态播放项。 */
function loopItem(
  state: OverlayState | PerformanceKind,
  url: string,
): LoopPlaybackItem {
  return { kind: "loop", state, url };
}

/**
 * 经 idle 中转的显示计划：[source→idle?, idle→target?, loop]。
 * source/target 为 idle 时省略对应过渡段（无 idle→idle 自环边）。
 */
function viaIdlePlan(
  source: TransitionEndpoint,
  target: TransitionEndpoint,
  finalLoop: LoopPlaybackItem,
): PlaybackItem[] {
  const seq: PlaybackItem[] = [];
  if (source !== "idle") seq.push(transitionItem(source, "idle"));
  if (target !== "idle") seq.push(transitionItem("idle", target));
  seq.push(finalLoop);
  return seq;
}

/** 计划前导过渡段总时长 ms（工作轮换/表演排程用）。 */
function planPrefixMs(plan: readonly PlaybackItem[]): number {
  let total = 0;
  for (const item of plan) {
    if (item.kind !== "transition") break;
    total += edgeTransitionMs(item.from, item.to);
  }
  return total;
}

/** 计划末尾循环项的落点姿态（working 取轮换素材姿态）。 */
function planHeadingPose(plan: readonly PlaybackItem[]): TransitionEndpoint {
  const last = plan[plan.length - 1];
  if (last === undefined || last.kind !== "loop") return "idle";
  return loopPose(last);
}


/** 循环项对应的显示姿态（working → thinking/reading，其余即状态）。 */
function loopPose(item: LoopPlaybackItem): TransitionEndpoint {
  if (item.state === "working") {
    return item.url === workingLoopAssetUrl("reading") ? "reading" : "thinking";
  }
  return item.state;
}

// ---------------------------------------------------------------------------
// 快照
// ---------------------------------------------------------------------------

/** runtime 快照（UI 据此渲染，useSyncExternalStore 兼容）. */
export interface RuntimeSnapshot {
  /** 焦点会话 id（undefined 表示无会话，浮层显示 idle）。 */
  readonly focusSessionId: SessionId | undefined;
  /**
   * 当前显示的状态：4 循环态或一次性表演态（表演/彩蛋/poke 期间为对应
   * 表情，紧急抢焦时为 emergency 会话的 permission/error）。
   */
  readonly currentState: OverlayState | PerformanceKind;
  /** 当前显示的播放序列。 */
  readonly playback: readonly PlaybackItem[];
  /**
   * 焦点切换 nonce：焦点会话变化（含紧急抢焦/交还）时递增。
   * 同一会话内的防抖、并行驻留、彩蛋切换不递增（UI 淡入淡出改由播放项
   * url 变化触发，nonce 仅保留焦点切换语义，ADR-0016 D15）。
   */
  readonly focusNonce: number;
}

// ---------------------------------------------------------------------------
// 每会话运行时条目与显示层状态
// ---------------------------------------------------------------------------

interface SessionEntry {
  /** 会话 id（防抖归属判定用）。 */
  readonly id: SessionId;
  /** 该会话的状态机实例（状态跟踪；显示计划由 runtime 显示层统一构造）。 */
  readonly stateMachine: ReturnType<typeof createOverlayStateMachine>;
  /** binding.session 订阅取消函数。 */
  unsub: (() => void) | undefined;
  /** 上一次核心快照（差分用）。 */
  prevCore: SnapshotCore | null;
  /** 上一次实际派发到状态机的循环态。 */
  lastState: OverlayState;
  /** 当前底层目标态（可能与 lastState 不同：焦点会话 working 进入防抖期间）。 */
  pendingTarget: OverlayState;
  /**
   * 审批等待时间启发式（ADR-0014）起点：会话进入「runningCalls>0 且无
   * pending/error」卡住等待的时刻（注入时钟 ms）。undefined = 未卡住。
   * tick 扫描 ≥10s 进 permission、≥30s 升级 angry；目标/运行状态变化即清零。
   */
  blockedSince: number | undefined;
  /**
   * 最近一次原始会话快照（宿主 SessionSnapshot 结构子集）。待交互源
   * （uiSession.pendingInteractions）变化时以它重放差分——pending 信号
   * 不再随会话快照到达，边沿检测依赖重放。
   */
  rawSnapshot: SessionSnapshotLike | undefined;
}

/** 紧急态显示层（permission/error 接管，入场源姿态捕获）。 */
interface EmergencyDisplay {
  readonly sessionId: SessionId;
  readonly state: "permission" | "error";
  /**
   * 紧急显示的实际表情：permission 长候 ≥30s 升级为 angry（ADR-0014），
   * error 恒 error。SM 状态保持 permission（审批解析仍走既有反馈链）。
   */
  readonly expression: "permission" | "error" | "angry";
  /** 入场源姿态（捕获一次；紧急链切换时取上一紧急态）。 */
  readonly pose: TransitionEndpoint;
}

/** 一次性表演种类（显示层调度；surprised/happy/angry 归 poke/彩蛋机制）。 */
type PerformanceKindLayer = "done" | "nod-smile" | "frown-wave";

/** 一次性表演显示层。 */
interface PerformanceLayer {
  readonly kind: PerformanceKindLayer;
  /** entry：入场过渡+循环驻留；exit：退场过渡+回落目标循环。 */
  phase: "entry" | "exit";
  /** 入场源姿态。 */
  readonly sourcePose: TransitionEndpoint;
  /** 驻留时长 ms（entry 相位起算，从前导过渡播完起）。 */
  readonly holdMs: number;
  /** exit 相位的退场计划（构建于退出时刻，回落目标按当时基础显示态裁决）。 */
  exitPlan: readonly PlaybackItem[] | undefined;
}

/** poke 显示层（ADR-0011）。 */
interface PokeLayer {
  /** entry：入场+驻留；exit：回落过渡+回落目标循环。 */
  phase: "entry" | "exit";
  /** 入场源姿态（入场时刻捕获一次；驻留期间事件不改变计划内容）。 */
  readonly sourcePose: TransitionEndpoint;
  /** exit 相位的回落计划（构建于回落时刻，回落目标按当时基础显示态裁决）。 */
  exitPlan: readonly PlaybackItem[] | undefined;
}

/** 摸鱼彩蛋显示层。 */
interface EasterEggLayer {
  readonly expression: PerformanceKind;
  phase: "entry" | "exit";
  /** 入场源姿态（入场时刻捕获一次；驻留期间事件不改变计划内容）。 */
  readonly sourcePose: TransitionEndpoint;
  exitPlan: readonly PlaybackItem[] | undefined;
}

/** working 显示层轮换段。 */
interface WorkingRotation {
  /** 当前轮换素材（thinking/reading）。 */
  asset: WorkingLoopAsset;
  /** 当前段显示计划（入场/换段时重建；末项为 loop-working(asset)）。 */
  plan: readonly PlaybackItem[];
  /** 本段已播整圈数（达到 WORKING_ROTATION_LOOPS 后换段）。 */
  loopsPlayed: number;
}

// ---------------------------------------------------------------------------
// runtime 实例
// ---------------------------------------------------------------------------

/** overlay-session-runtime 实例。 */
export interface OverlaySessionRuntime {
  /** 取当前快照（供 useSyncExternalStore 等订阅机制读取）。 */
  getSnapshot(): RuntimeSnapshot;
  /** 订阅快照变化；返回取消订阅函数。监听者通过 getSnapshot() 读取，无需参数。 */
  subscribe(listener: () => void): () => void;
  /** 点击惊吓：触发一次「当前姿态→idle→惊吓→惊吓循环→idle→回落目标」（ADR-0011）。 */
  poke(): void;
  /** 释放全部订阅（list + 各会话 binding.session + tick timer）。 */
  dispose(): void;
  /** 测试钩子：手动推进一次时间驱动判定（读注入时钟 now）。生产由内部 tick 间隔驱动。 */
  __tick(): void;
  /**
   * 重算显示层（变体轮换开关变化时由接线层调用，ADR-0013 D7）：
   * 丢弃进行中的轮换段并重算快照。
   */
  resetRotation(): void;
}

/** runtime 选项。 */
export interface CreateOverlaySessionRuntimeOptions {
  /** 时钟注入（默认 Date.now，测试可注入虚拟时钟；防抖与显示层排程统一走该时钟）。 */
  now?: () => number;
  /** tick 间隔 ms（默认 1000，测试可缩短以加速）。 */
  tickIntervalMs?: number;
  /**
   * 随机数注入（测试用）：工作轮换抽段/变体轮换/彩蛋抽取与间隔共用。
   * 返回 [0,1) 之间浮点数；默认 Math.random。
   */
  random?: () => number;
  /**
   * 变体轮换开关读取器（ADR-0013 D7）。
   * 未注入时变体轮换禁用（纯测试环境默认行为与现状一致）。
   */
  variantRotationEnabled?: () => boolean;
  /**
   * 宿主待交互源（uiSession.pendingInteractions，宿主 SDK 升级后的
   * pending 快路径）：会话 id → 待交互条目。注入后 runtime 订阅其变化，
   * 以上升/下降沿驱动 permission 硬切与批准/拒绝表演；缺省时 pending
   * 仅依赖旧宿主快照遗留字段（新宿主下恒无 pending）。
   */
  pendingInteractions?: PendingInteractionsSource;
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
  const rotationEnabled = opts?.variantRotationEnabled ?? (() => false);
  const pendingSource = opts?.pendingInteractions;

  /** 会话当前是否有可见待交互（approval/plan-review/question；未知 kind 不算）。 */
  function pendingOf(id: SessionId): boolean {
    if (pendingSource === undefined) return false;
    return (
      visiblePendingKind(pendingSource.getSnapshot().get(id)?.kind) !==
      undefined
    );
  }

  const entries = new Map<SessionId, SessionEntry>();
  const listeners = new Set<() => void>();

  // 焦点相关
  let userFocusSessionId: SessionId | undefined = undefined; // 用户当前打开会话
  let currentFocusSessionId: SessionId | undefined = undefined; // 当前显示焦点（可能被 emergency 抢占）
  let focusNonce = 0;

  // 防抖相关（仅焦点会话 working 进入）：deadline 判定走注入时钟，便于测试。
  // 记录归属会话——紧急抢焦期间显示焦点会变化，到期 dispatch 不应错发给当前显示会话。
  let debounce:
    | { readonly sessionId: SessionId; readonly deadline: number }
    | undefined = undefined;

  // 显示层状态
  let displayPose: TransitionEndpoint = "idle"; // 当前显示计划落点姿态
  let emergency: EmergencyDisplay | undefined = undefined;
  let performance: PerformanceLayer | undefined = undefined;
  let poke: PokeLayer | undefined = undefined;
  let egg: EasterEggLayer | undefined = undefined;
  let rotation: WorkingRotation | undefined = undefined;
  /** 待整圈边界执行的 done 表演所属会话（回合重启时在边界校验取消）。 */
  let pendingDone: SessionId | undefined = undefined;

  // 显示层排程截止时刻（单一时间接缝，见模块头注释）：各阶段只记录
  // 注入 now() 的截止时刻，由统一 tick 扫描到点推进。
  let performanceHoldUntil: number | undefined = undefined;
  let performanceExitUntil: number | undefined = undefined;
  let pokeHoldUntil: number | undefined = undefined;
  let pokeExitUntil: number | undefined = undefined;
  let eggAt: number | undefined = undefined;
  let eggHoldUntil: number | undefined = undefined;
  let eggExitUntil: number | undefined = undefined;
  let rotationBoundaryAt: number | undefined = undefined;

  // idle 变体轮换（ADR-0013）：当前轮换段 + 推进截止时刻。
  // 打断（状态切换/彩蛋/poke/紧急态）时丢弃位置，回落后重抽（D9）。
  let rotationSegment:
    | { state: RotatableState; url: string }
    | undefined = undefined;
  let variantAdvanceAt: number | undefined = undefined;

  let disposed = false;
  /**
   * 缓存快照：useSyncExternalStore 要求 getSnapshot 在状态未变时返回稳定
   * 引用。构造期（handleListChange 初始同步 → emit）即会被写入，故先以
   * 占位快照初始化，构造尾部再正式重算。
   */
  let cachedSnapshot: RuntimeSnapshot = {
    focusSessionId: undefined,
    currentState: IDLE,
    playback: [loopItem(IDLE, loopAssetUrl(IDLE))],
    focusNonce: 0,
  };

  // ---------------------------------------------------------------------------
  // 排程截止清理辅助
  // ---------------------------------------------------------------------------

  function clearPerformanceSchedule(): void {
    performanceHoldUntil = undefined;
    performanceExitUntil = undefined;
  }

  function clearPokeSchedule(): void {
    pokeHoldUntil = undefined;
    pokeExitUntil = undefined;
  }

  function clearEggSchedule(): void {
    eggAt = undefined;
    eggHoldUntil = undefined;
    eggExitUntil = undefined;
  }

  // -------------------------------------------------------------------------
  // idle 变体轮换（ADR-0013，仅 idle 池）
  // -------------------------------------------------------------------------

  /** 停止 idle 变体轮换：丢弃当前位置与推进截止（打断语义，D9）。 */
  function stopVariantRotation(): void {
    variantAdvanceAt = undefined;
    rotationSegment = undefined;
  }

  /** 排程当前变体段的推进截止：名义时长 + 段间停顿后抽下一段（tick 扫描驱动）。 */
  function scheduleVariantAdvance(): void {
    if (rotationSegment === undefined) return;
    variantAdvanceAt = now() + rotationPeriodMs(rotationSegment.url);
  }

  /** 推进变体段：重抽下一变体并排程下一次推进（tick 到点调用）。 */
  function advanceVariantRotation(): void {
    if (rotationSegment === undefined) return;
    const state = rotationSegment.state;
    const next = pickNextVariant(
      rotationPool(state),
      rotationSegment.url,
      random,
    );
    if (next === undefined) return;
    rotationSegment = { state, url: next };
    scheduleVariantAdvance();
    emit();
  }

  /**
   * 确保某可轮换状态有进行中的变体段，返回其 playback（ADR-0013 D4/D9）。
   *
   * - 开关关闭：停止轮换，回退基础循环。
   * - 首次进入该状态：随机抽一个变体起播；无变体可抽时回退基础循环。
   * - 已在轮换中：沿用当前段。
   */
  function ensureVariantRotation(
    state: RotatableState,
  ): readonly PlaybackItem[] {
    if (!rotationEnabled()) {
      stopVariantRotation();
      return [loopItem(state, loopAssetUrl(state))];
    }
    if (rotationSegment === undefined || rotationSegment.state !== state) {
      stopVariantRotation();
      const pool = rotationPool(state);
      // 首次进入抽变体（跳过基础主素材，直接打破单调）；无变体则用主素材。
      const firstPick =
        pool.length > 1
          ? pickNextVariant(pool.slice(1), undefined, random)
          : pool[0];
      if (firstPick === undefined) {
        return [loopItem(state, loopAssetUrl(state))];
      }
      rotationSegment = { state, url: firstPick };
      scheduleVariantAdvance();
    }
    return [loopItem(state, rotationSegment.url)];
  }

  // -------------------------------------------------------------------------
  // working 显示层轮换（ADR-0016 决策 5）
  // -------------------------------------------------------------------------

  /** 随机抽下一段工作素材（不连续重复，随机源可注入）。 */
  function pickWorkingAsset(
    exclude: WorkingLoopAsset | undefined,
  ): WorkingLoopAsset {
    if (exclude === undefined) {
      return random() < 0.5 ? "thinking" : "reading";
    }
    return exclude === "thinking" ? "reading" : "thinking";
  }

  /** 清除工作轮换（显示层被接管/退出 working 时）。 */
  function clearWorkingRotation(): void {
    rotationBoundaryAt = undefined;
    rotation = undefined;
  }

  /**
   * 以给定计划起播工作轮换段（计划末项为 loop-working(asset)）。
   * 首个整圈边界 = 前导过渡播完 + 单圈时长。
   */
  function armWorkingRotation(
    plan: readonly PlaybackItem[],
    asset: WorkingLoopAsset,
  ): void {
    rotation = { asset, plan, loopsPlayed: 0 };
    rotationBoundaryAt = now() + planPrefixMs(plan) + WORKING_LOOP_MS[asset];
  }

  /**
   * 进入 working 显示：从当前显示姿态经 idle 中转入场（PRD 决策 5
   * 「进入 working 时经 idle→thinking 过渡起播」；入场素材随机抽取）。
   */
  function enterWorkingDisplay(): WorkingRotation | undefined {
    if (rotation !== undefined) return rotation;
    const asset = pickWorkingAsset(undefined);
    const plan = viaIdlePlan(
      displayPose,
      asset,
      loopItem("working", workingLoopAssetUrl(asset)),
    );
    armWorkingRotation(plan, asset);
    return rotation;
  }

  /** 整圈边界（tick 到点调用）：待边界切出（done）优先，其次满 2 圈换段，否则续播下一圈。 */
  function rotationBoundary(): void {
    rotationBoundaryAt = undefined;
    if (rotation === undefined) return;
    rotation.loopsPlayed += 1;
    // 整圈边界切出校验（D7/D9）：done 待边界执行；会话已重新工作则取消。
    if (pendingDone !== undefined) {
      const entry = entries.get(pendingDone);
      pendingDone = undefined;
      if (entry !== undefined && entry.pendingTarget === "idle") {
        const asset = rotation.asset;
        clearWorkingRotation();
        startPerformance("done", asset);
        return;
      }
    }
    if (rotation.loopsPlayed >= WORKING_ROTATION_LOOPS) {
      const prevAsset = rotation.asset;
      const next = pickWorkingAsset(prevAsset);
      const plan = viaIdlePlan(
        prevAsset,
        next,
        loopItem("working", workingLoopAssetUrl(next)),
      );
      armWorkingRotation(plan, next);
      emit();
      return;
    }
    rotationBoundaryAt = now() + WORKING_LOOP_MS[rotation.asset];
  }
  // -------------------------------------------------------------------------
  // 一次性表演调度（PRD 决策 7 / ADR-0016 决策 2）
  // -------------------------------------------------------------------------

  /**
   * 表演入场计划：
   * - 权限反馈（nod-smile/frown-wave）从 permission 出发走直达反馈链
   *   permission→kind（批准/拒绝链边，不经 idle 中转——idle→kind 为弃用边）；
   * - 其余（done 及任意源姿态）经 idle 中转 [source→idle?, idle→kind, loop]。
   */
  function performanceEntryPlan(
    kind: PerformanceKindLayer,
    sourcePose: TransitionEndpoint,
  ): readonly PlaybackItem[] {
    if (kind === "nod-smile" || kind === "frown-wave") {
      // 批准/拒绝只发生在 permission 态之后；非 permission 源（理论不可达，防御未来
      // 调用点变化）同样从 permission 直达链入场，绝不产出 idle→kind 弃用边 URL。
      return [
        transitionItem("permission", kind),
        loopItem(kind, loopAssetUrl(kind)),
      ];
    }
    return viaIdlePlan(sourcePose, kind, loopItem(kind, loopAssetUrl(kind)));
  }

  /**
   * 退场计划：[source→idle, (idle→target)?, loop-target]。
   * 回落目标按退场时刻的基础显示态裁决（期间事件已更新 SM/驻留状态）。
   */
  function buildExitPlan(
    source: TransitionEndpoint,
  ): readonly PlaybackItem[] {
    const base = baseDisplayState();
    if (base === "working") {
      const asset = pickWorkingAsset(undefined);
      return viaIdlePlan(
        source,
        asset,
        loopItem("working", workingLoopAssetUrl(asset)),
      );
    }
    return viaIdlePlan(source, base, loopItem(base, loopAssetUrl(base)));
  }

  /**
   * 显示层退场收尾（表演/彩蛋/poke 共用）：退场计划落点为工作姿态时直切
   * 续接工作轮换（计划内容收敛为单项 loop，游标可见项不变，无视觉重播），
   * 否则交还基础显示；最后重算快照。
   */
  function adoptExitPlan(plan: readonly PlaybackItem[] | undefined): void {
    if (plan !== undefined) {
      const pose = planHeadingPose(plan);
      if (pose === "thinking" || pose === "reading") {
        armWorkingRotation(
          [loopItem("working", workingLoopAssetUrl(pose))],
          pose,
        );
      }
    }
    emit();
  }

  /** 触发表演（边沿触发；打断彩蛋与工作轮换）。 */
  function startPerformance(
    kind: PerformanceKindLayer,
    sourcePose: TransitionEndpoint,
  ): void {
    clearPerformanceSchedule();
    cancelEasterEgg();
    clearWorkingRotation();
    pendingDone = undefined;
    stopVariantRotation();
    const holdMs =
      kind === "done" ? PERFORMANCE_HOLD_MS : PERMISSION_FEEDBACK_HOLD_MS;
    performance = {
      kind,
      phase: "entry",
      sourcePose,
      holdMs,
      exitPlan: undefined,
    };
    // 驻留从表演循环体可见后起算：按实际入场计划的前导过渡总时长计截止
    // （权限反馈链走 permission→kind 直达边，不经 idle 中转）。
    const entryPrefixMs = planPrefixMs(performanceEntryPlan(kind, sourcePose));
    performanceHoldUntil = now() + entryPrefixMs + holdMs;
    emit();
  }

  /** 表演驻留到点（tick 扫描）：构建退场计划进入 exit 相位并排程退场截止。 */
  function performanceExit(): void {
    if (performance === undefined) return;
    const kind = performance.kind;
    const exitPlan = buildExitPlan(kind);
    performance.phase = "exit";
    performance.exitPlan = exitPlan;
    performanceExitUntil = now() + planPrefixMs(exitPlan);
    emit();
  }

  /** 表演退场到点（tick 扫描）：清除表演层（working 回落时接续工作轮换）。 */
  function finishPerformanceExit(): void {
    performanceExitUntil = undefined;
    const plan = performance?.exitPlan;
    performance = undefined;
    adoptExitPlan(plan);
  }

  /** 清除表演层（紧急态打断/替代触发时）。 */
  function clearPerformance(): void {
    clearPerformanceSchedule();
    performance = undefined;
  }

  // -------------------------------------------------------------------------
  // 摸鱼彩蛋（ADR-0010 D7 + ADR-0016 彩蛋池收敛）
  // -------------------------------------------------------------------------

  function cancelEasterEgg(): void {
    clearEggSchedule();
    egg = undefined;
  }

  function randomEasterEggIntervalMs(): number {
    return (
      EASTER_EGG_MIN_MS +
      Math.floor(random() * (EASTER_EGG_MAX_MS - EASTER_EGG_MIN_MS))
    );
  }

  function pickEasterEggState(): PerformanceKind {
    const idx = Math.floor(random() * EASTER_EGG_POOL.length);
    return EASTER_EGG_POOL[idx]!;
  }

  /** 彩蛋驻留到点（tick 扫描）：按当时基础显示态构建退场计划进入 exit 相位。 */
  function easterEggExit(): void {
    if (egg === undefined) return;
    const exitPlan = buildExitPlan(egg.expression);
    egg.phase = "exit";
    egg.exitPlan = exitPlan;
    eggExitUntil = now() + planPrefixMs(exitPlan);
    emit();
  }

  /** 彩蛋退场到点（tick 扫描）：清除彩蛋层，并行驻留持续时为下一轮排期（ADR-0010 D3）。 */
  function finishEasterEggExit(): void {
    eggExitUntil = undefined;
    const plan = egg?.exitPlan;
    egg = undefined;
    adoptExitPlan(plan);
    if (isParallelHold()) scheduleEasterEgg();
  }

  function enterEasterEgg(): void {
    if (egg !== undefined || !isParallelHold()) return;
    if (performance !== undefined || poke !== undefined) return;
    const sourcePose = displayPose;
    const expression = pickEasterEggState();
    clearWorkingRotation();
    pendingDone = undefined;
    stopVariantRotation();
    egg = { expression, phase: "entry", sourcePose, exitPlan: undefined };
    // 驻留从表情循环可见后起算：按实际入场计划的前导过渡总时长计截止。
    const eggEntryPlan = viaIdlePlan(
      sourcePose,
      expression,
      loopItem(expression, loopAssetUrl(expression)),
    );
    eggHoldUntil = now() + planPrefixMs(eggEntryPlan) + EASTER_EGG_HOLD_MS;
    emit();
  }

  function scheduleEasterEgg(): void {
    eggAt = now() + randomEasterEggIntervalMs();
  }

  /** 并行驻留条件变化时重新调度彩蛋。 */
  function onParallelHoldChanged(isHold: boolean): void {
    if (!isHold) {
      clearEggSchedule();
      // 驻留结束且基础显示已非 working（无待边界 done）：工作轮换随之退场。
      const entry = focusSessionIdToEntry(currentFocusSessionId);
      if (
        rotation !== undefined &&
        pendingDone === undefined &&
        entry?.pendingTarget !== "working"
      ) {
        clearWorkingRotation();
      }
      return;
    }
    if (egg === undefined && eggAt === undefined) {
      scheduleEasterEgg();
    }
  }

  // -------------------------------------------------------------------------
  // poke 点击惊吓（ADR-0011）
  // -------------------------------------------------------------------------

  function clearPoke(): void {
    clearPokeSchedule();
    poke = undefined;
  }

  /**
   * 点击惊吓：触发一次「当前姿态→idle→惊吓→惊吓循环→idle→回落目标」。
   * - 冷却：播放中（含回落）重复调用忽略（ADR-0011 D8）。
   * - 紧急态（permission/error，含焦点会话自身）或表演播放中不触发
   *   （互斥：poke 期间事件触发的表演仅更新 SM；表演播放中 poke 忽略）。
   * - 触发时取消进行中的摸鱼彩蛋与工作轮换（打断语义，回落后重新开始）。
   * - 排程截止按过渡段实测时长计：驻留从惊吓循环可见后起算；回落目标按
   *   回落时刻的基础显示态重新裁决（期间并行驻留/焦点可能已变化）。
   */
  function pokeAction(): void {
    if (disposed) return;
    if (poke !== undefined) return; // 冷却
    if (performance !== undefined) return; // 表演播放中互斥
    if (findEmergencySessionId() !== undefined) return; // 紧急态不触发
    cancelEasterEgg();
    clearWorkingRotation();
    pendingDone = undefined;
    stopVariantRotation();
    const sourcePose = displayPose;
    poke = { phase: "entry", sourcePose, exitPlan: undefined };
    // 驻留从惊吓循环可见后起算：按实际入场计划的前导过渡总时长排程
    // （source 已是 idle 时无「source→idle」段）。
    const entryPlan = viaIdlePlan(
      sourcePose,
      "surprised",
      loopItem("surprised", loopAssetUrl("surprised")),
    );
    pokeHoldUntil = now() + planPrefixMs(entryPlan) + POKE_HOLD_MS;
    emit();
  }

  /** poke 驻留到点（tick 扫描）：按当时基础显示态构建回落计划进入 exit 相位。 */
  function pokeExit(): void {
    if (poke === undefined) return;
    const exitPlan = buildExitPlan("surprised");
    poke.phase = "exit";
    poke.exitPlan = exitPlan;
    pokeExitUntil = now() + planPrefixMs(exitPlan);
    emit();
  }

  /** poke 回落到点（tick 扫描）：清除 poke 层，交还基础显示。 */
  function finishPokeExit(): void {
    pokeExitUntil = undefined;
    const plan = poke?.exitPlan;
    poke = undefined;
    adoptExitPlan(plan);
  }
  // ---------------------------------------------------------------------------
  // 焦点仲裁
  // ---------------------------------------------------------------------------

  /**
   * 查找应紧急呈现的会话 id（按 sessions.list.ids 顺序取第一个）。
   *
   * 含焦点会话自身（工单 09/10）：焦点会话进入 permission/error 时同样走
   * 紧急分支——否则 poke 与并行驻留分支会覆盖焦点会话的紧急画面，
   * 紧急事件最长被遮蔽整个 poke 序列乃至审批等待全程。
   */
  function findEmergencySessionId(): SessionId | undefined {
    const list = sessions.list.getSnapshot();
    for (const id of list.ids) {
      const entry = entries.get(id);
      if (entry === undefined) continue;
      if (entry.lastState === "permission" || entry.lastState === "error") {
        return id;
      }
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

  /** 基础显示态（无任何显示层接管时）：并行驻留 → working；否则跟随焦点会话。 */
  function baseDisplayState(): OverlayState {
    if (isParallelHold()) return "working";
    const entry = focusSessionIdToEntry(currentFocusSessionId);
    if (entry === undefined) return IDLE;
    return entry.lastState;
  }

  /** 切换当前显示焦点，必要时递增 focusNonce。 */
  function setCurrentFocus(id: SessionId | undefined): void {
    if (id === currentFocusSessionId) return;
    currentFocusSessionId = id;
    focusNonce += 1;
  }

  /**
   * 重新评估紧急接管与焦点：
   * - 有紧急会话：打断 poke/表演/彩蛋/工作轮换（立即让位原则），接管显示焦点。
   * - 无紧急会话：清除紧急层，交还用户焦点；基础显示由 computeSnapshot 重建。
   */
  function reconcileFocus(): void {
    const emergencyId = findEmergencySessionId();
    if (emergencyId !== undefined) {
      clearPoke();
      clearPerformance();
      cancelEasterEgg();
      clearWorkingRotation();
      pendingDone = undefined;
      stopVariantRotation();
      const entry = entries.get(emergencyId);
      if (entry === undefined) return;
      const state = entry.lastState;
      if (state !== "permission" && state !== "error") return;
      if (
        emergency === undefined ||
        emergency.sessionId !== emergencyId ||
        emergency.state !== state
      ) {
        // 紧急链切换（如 permission→error）时，源姿态取上一紧急态。
        const pose = emergency !== undefined ? emergency.state : displayPose;
        // 接管补判（ADR-0014）：会话卡住 ≥30s 才成为当前呈现者（此前被其他
        // 紧急态压着、tick 的升级路径未命中）时，直接以 angry 表情接管。
        let expression: "permission" | "error" | "angry" = state;
        if (
          state === "permission" &&
          entry.blockedSince !== undefined &&
          now() - entry.blockedSince >= ANGRY_BLOCKED_MS
        ) {
          expression = "angry";
        }
        emergency = { sessionId: emergencyId, state, expression, pose };
      }
      setCurrentFocus(emergencyId);
      return;
    }
    emergency = undefined;
    setCurrentFocus(userFocusSessionId);
  }

  // ---------------------------------------------------------------------------
  // 快照计算
  // ---------------------------------------------------------------------------

  /**
   * 计算当前快照。
   *
   * 显示层仲裁沉入 display-arbiter（架构审查候选者 2）：优先级
   * emergency > poke > performance > easter-egg > working-rotation >
   * parallel-working > focus-* > idle 是 resolveDisplayLayer 的接口承诺；
   * 本函数只按胜出层组装快照（各层计划构造依赖会话/姿态闭包，留在本模块）。
   */
  function computeSnapshot(): RuntimeSnapshot {
    const entry = focusSessionIdToEntry(currentFocusSessionId);
    const layer = resolveDisplayLayer({
      emergencyActive: emergency !== undefined,
      pokeActive: poke !== undefined,
      performanceActive: performance !== undefined,
      easterEggActive: egg !== undefined,
      workingRotationActive: rotation !== undefined,
      parallelHold: isParallelHold(),
      focusState: entry?.lastState,
    });

    switch (layer) {
      case "emergency": {
        // 紧急抢焦：显示紧急会话（入场源姿态经 idle 中转，计划内容稳定）。
        // permission 长候 ≥30s 升级为 angry 时 expression 为 "angry"（ADR-0014）。
        stopVariantRotation();
        const em = emergency!;
        const plan = viaIdlePlan(
          em.pose,
          em.expression,
          loopItem(em.expression, loopAssetUrl(em.expression)),
        );
        return {
          focusSessionId: currentFocusSessionId,
          currentState: em.expression,
          playback: plan,
          focusNonce,
        };
      }
      case "poke": {
        // poke 惊吓（显示层覆盖，无会话时也可用）。
        stopVariantRotation();
        const pk = poke!;
        if (pk.phase === "entry") {
          const plan = viaIdlePlan(
            pk.sourcePose,
            "surprised",
            loopItem("surprised", loopAssetUrl("surprised")),
          );
          return {
            focusSessionId: currentFocusSessionId,
            currentState: "surprised",
            playback: plan,
            focusNonce,
          };
        }
        return {
          focusSessionId: currentFocusSessionId,
          currentState: "surprised",
          playback: pk.exitPlan ?? [],
          focusNonce,
        };
      }
      case "performance": {
        // 一次性表演（done/nod-smile/frown-wave）。
        stopVariantRotation();
        const pf = performance!;
        if (pf.phase === "entry") {
          return {
            focusSessionId: currentFocusSessionId,
            currentState: pf.kind,
            playback: performanceEntryPlan(pf.kind, pf.sourcePose),
            focusNonce,
          };
        }
        return {
          focusSessionId: currentFocusSessionId,
          currentState: pf.kind,
          playback: pf.exitPlan ?? [],
          focusNonce,
        };
      }
      case "easter-egg": {
        // 摸鱼彩蛋（并行驻留期间）。
        stopVariantRotation();
        const eg = egg!;
        if (eg.phase === "entry") {
          const plan = viaIdlePlan(
            eg.sourcePose,
            eg.expression,
            loopItem(eg.expression, loopAssetUrl(eg.expression)),
          );
          return {
            focusSessionId: currentFocusSessionId,
            currentState: eg.expression,
            playback: plan,
            focusNonce,
          };
        }
        return {
          focusSessionId: currentFocusSessionId,
          currentState: eg.expression,
          playback: eg.exitPlan ?? [],
          focusNonce,
        };
      }
      case "working-rotation":
        // 工作轮换在播（显示 working；含待整圈边界切出的 done 驻留）。
        return {
          focusSessionId: currentFocusSessionId,
          currentState: "working",
          playback: rotation!.plan,
          focusNonce,
        };
      case "parallel-working":
      case "focus-working": {
        // 基础显示：并行驻留 / 焦点会话 working → 工作轮换（惰性起播）。
        const workingRotation = enterWorkingDisplay();
        if (workingRotation !== undefined) {
          return {
            focusSessionId: currentFocusSessionId,
            currentState: "working",
            playback: workingRotation.plan,
            focusNonce,
          };
        }
        // 不可达（enterWorkingDisplay 惰性起播必返段），防御回落 idle。
        return {
          focusSessionId: currentFocusSessionId,
          currentState: IDLE,
          playback: ensureVariantRotation("idle"),
          focusNonce,
        };
      }
      case "focus-idle":
      case "idle":
        // 无焦点 / 焦点条目缺失 / 焦点 idle：idle 变体轮换（ADR-0013）。
        return {
          focusSessionId: currentFocusSessionId,
          currentState: IDLE,
          playback: ensureVariantRotation("idle"),
          focusNonce,
        };
      case "focus-follow":
        // 兜底（permission/error 理论上已被紧急层接管）：直接显示循环。
        return {
          focusSessionId: currentFocusSessionId,
          currentState: entry!.lastState,
          playback: [loopItem(entry!.lastState, loopAssetUrl(entry!.lastState))],
          focusNonce,
        };
    }
  }

  function emit(): void {
    cachedSnapshot = computeSnapshot();
    displayPose = planHeadingPose(cachedSnapshot.playback);
    for (const listener of listeners) listener();
  }
  // ---------------------------------------------------------------------------
  // 目标态应用与差分
  // ---------------------------------------------------------------------------

  function focusSessionIdToEntry(
    id: SessionId | undefined,
  ): SessionEntry | undefined {
    if (id === undefined) return undefined;
    return entries.get(id);
  }

  /** 派发目标态到会话 SM（状态跟踪；显示计划由显示层统一构造）。 */
  function dispatchState(entry: SessionEntry, target: OverlayState): void {
    if (entry.lastState !== target) {
      entry.lastState = target;
      entry.stateMachine.dispatch({ type: "switch", target });
    }
  }

  /** 清除属于指定会话的 working 进入防抖（表演结果直接落目标态时让位）。 */
  function clearDebounceFor(entry: SessionEntry): void {
    if (debounce?.sessionId === entry.id) debounce = undefined;
  }

  /**
   * 对焦点会话应用差分目标态。
   * - permission/error：立即派发（硬切，紧急层接管显示）。
   * - working：防抖 FOCUS_DEBOUNCE_MS（防连续回合/多会话切焦抖动）。
   * - idle：直接落（working→idle 的实际视觉退出经 done 表演整圈边界切出）。
   * 非焦点会话直接派发（不可见，无需防抖）。
   */
  function applyTarget(entry: SessionEntry, target: OverlayState): void {
    entry.pendingTarget = target;
    if (focusSessionIdToEntry(currentFocusSessionId) !== entry) {
      dispatchState(entry, target);
      return;
    }
    if (target === "working") {
      debounce = { sessionId: entry.id, deadline: now() + FOCUS_DEBOUNCE_MS };
      return;
    }
    clearDebounceFor(entry);
    dispatchState(entry, target);
  }

  /**
   * 应用差分表演触发（display-focus 会话才展示；poke 播放中跳过仅更新 SM）。
   * - done：SM 落 idle；显示经整圈边界切出（工作轮换在播时待边界，
   *   否则立即入场——仅当会话确实处于 working，防止亚防抖幻影回合庆祝）。
   * - nod-smile：SM 立即落 working（授权完成即刻恢复工作语义，不经防抖）。
   * - frown-wave：SM 落 idle。
   */
  function applyPerformance(
    entry: SessionEntry,
    kind: "done" | "nod-smile" | "frown-wave",
  ): void {
    const isDisplayFocus =
      focusSessionIdToEntry(currentFocusSessionId) === entry;
    // 表演结果直接落目标态：本会话的 working 进入防抖让位（表演自带时序语义）。
    clearDebounceFor(entry);
    if (kind === "done") {
      const wasWorking = entry.lastState === "working";
      dispatchState(entry, IDLE);
      entry.pendingTarget = IDLE;
      if (!isDisplayFocus || !wasWorking || poke !== undefined) return;
      if (rotation !== undefined) {
        pendingDone = entry.id; // 整圈边界切出（D7）；绑定源会话而非焦点变量
        cancelEasterEgg(); // 待边界期间不让彩蛋抢入（否则收工被吞，ADR-0016 边沿优先）
      } else {
        startPerformance("done", displayPose);
      }
      return;
    }
    // 权限反馈：SM 立即离开 permission（硬切让位），表演从 permission 姿态入场。
    const target: OverlayState = kind === "nod-smile" ? "working" : IDLE;
    dispatchState(entry, target);
    entry.pendingTarget = target;
    if (!isDisplayFocus || poke !== undefined) return;
    startPerformance(kind, "permission");
  }

  function processSnapshot(
    entry: SessionEntry,
    snapshot: SessionSnapshotLike,
  ): void {
    // 并行驻留基线必须在**本会话目标态应用之前**采样：第二个会话转入工作
    // 正是发生在本次 processSnapshot 内，事后采样会让 wasParallel 恒等于
    // isHold，上升沿（hold 开始）永远检测不到 → 摸鱼彩蛋从未被调度。
    const wasParallel = isParallelHold();
    entry.rawSnapshot = snapshot;
    const currCore = extractCore(snapshot, pendingOf(entry.id));
    const outcome = diffTarget(entry.prevCore, currCore);
    entry.prevCore = currCore;
    if (outcome !== null) {
      if (outcome.kind === "switch") {
        applyTarget(entry, outcome.target);
      } else {
        applyPerformance(entry, outcome.performance);
      }
    }
    reconcileFocus();
    updateBlockedSince(entry, currCore);
    const isHold = isParallelHold();
    if (wasParallel !== isHold) {
      onParallelHoldChanged(isHold);
    }
    emit();
  }

  /**
   * 维护 ADR-0014 审批等待时间启发式的 blockedSince。
   *
   * 卡住判定 = runningCalls>0 且无 pending/error（工具调用顶着不动、宿主未报
   * 审批信号也不报错）。pending 在场时由 `snapshot.pending` 上升沿快路径接管
   * （即时 permission），故不计入启发式；目标/运行状态变化（含 pending 上升沿、
   * running 终止、error 出现）经本条清零。tick 按 blockedSince 的 elapsed 判定
   * 10s/30s deadline（见 tick()）。
   */
  function updateBlockedSince(
    entry: SessionEntry,
    core: SnapshotCore,
  ): void {
    const blocked =
      core.running &&
      core.runningCallsCount > 0 &&
      !core.pending &&
      !core.hasError;
    if (blocked) {
      if (entry.blockedSince === undefined) entry.blockedSince = now();
    } else {
      entry.blockedSince = undefined;
    }
  }

  /**
   * 审批长候升级（ADR-0014）：permission 卡住 ≥30s 时，紧急显示表情由
   * permission 升级为 angry（久候无应表情）。SM 状态保持 permission——
   * 审批解析（pending 下降沿 → nod-smile/frown-wave）仍走既有反馈链，
   * 紧急链切换（→error）亦不受影响。仅当该会话是当前紧急呈现者时升级；
   * 升级后本次紧急期间不重复（expression 已为 angry）。
   */
  function upgradeBlockedToAngry(entry: SessionEntry): void {
    if (entry.lastState !== "permission") return;
    if (emergency === undefined || emergency.sessionId !== entry.id) return;
    if (emergency.expression === "angry") return;
    // 从当前 permission 表情出发：permission→idle→angry 过渡 + angry 循环。
    emergency = { ...emergency, expression: "angry", pose: "permission" };
    emit();
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
      id,
      stateMachine,
      unsub: undefined,
      prevCore: null,
      lastState: IDLE,
      pendingTarget: IDLE,
      blockedSince: undefined,
      rawSnapshot: undefined,
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
    if (pendingDone === id) pendingDone = undefined;
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
      // 切焦前 flush 旧焦点的 working pending，避免旧会话状态机长期落后
      if (debounce !== undefined) {
        const pendingEntry = entries.get(debounce.sessionId);
        if (
          pendingEntry !== undefined &&
          pendingEntry.pendingTarget === "working"
        ) {
          dispatchState(pendingEntry, "working");
        }
        debounce = undefined;
      }
      // 焦点切换：显示直切目标会话当前 loop（不播过渡，ADR-0008 决策 3）。
      pendingDone = undefined;
      const prevAsset = rotation?.asset;
      clearWorkingRotation();
      reconcileFocus();
      const newFocusEntry = focusSessionIdToEntry(currentFocusSessionId);
      if (
        newFocusEntry !== undefined &&
        newFocusEntry.pendingTarget !== newFocusEntry.lastState
      ) {
        dispatchState(newFocusEntry, newFocusEntry.pendingTarget);
      }
      // 新焦点为 working：直切其工作循环（沿用原轮换素材保持画面连续）。
      if (
        emergency === undefined &&
        newFocusEntry !== undefined &&
        newFocusEntry.lastState === "working"
      ) {
        const asset = prevAsset ?? pickWorkingAsset(undefined);
        armWorkingRotation(
          [loopItem("working", workingLoopAssetUrl(asset))],
          asset,
        );
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

  // 待交互源订阅（宿主 SDK 升级后的 pending 快路径）：pending 不再随会话
  // 快照到达，源变化时以各会话最近一次原始快照重放差分，驱动 permission
  // 硬切与批准/拒绝表演边沿。
  const pendingUnsub = pendingSource?.subscribe(() => {
    if (disposed) return;
    for (const entry of entries.values()) {
      if (entry.rawSnapshot !== undefined) {
        processSnapshot(entry, entry.rawSnapshot);
      }
    }
  });

  // 初始同步
  handleListChange();

  // ---------------------------------------------------------------------------
  // tick：防抖 deadline + 全部显示层截止时刻的统一扫描（单一时间接缝）
  // ---------------------------------------------------------------------------

  function tick(): void {
    if (disposed) return;
    // 焦点会话 working 进入防抖 deadline 判定。
    if (debounce !== undefined && now() >= debounce.deadline) {
      const { sessionId } = debounce;
      debounce = undefined;
      // 会话最新意图仍为 working 才落（期间若已 done/拒绝，防抖作废）。
      const entry = entries.get(sessionId);
      if (entry !== undefined && entry.pendingTarget === "working") {
        dispatchState(entry, "working");
        reconcileFocus();
        emit();
      }
    }
    // 审批等待时间启发式（ADR-0014）：每会话 blockedSince 扫描——≥10s 进
    // permission、≥30s 由 permission 升级 angry。deadline 判定走注入时钟，
    // 零新定时器；目标/运行状态变化已在 updateBlockedSince 清零。两条阈值
    // 独立判定（不可用 if/else-if：越过 30s 但尚未进 permission 的会话仍须
    // 先走 10s 分支进 permission，再于后续 tick 升级）。
    for (const entry of entries.values()) {
      if (entry.blockedSince === undefined) continue;
      const elapsed = now() - entry.blockedSince;
      if (elapsed >= ANGRY_BLOCKED_MS && entry.lastState === "permission") {
        upgradeBlockedToAngry(entry);
      }
      if (
        elapsed >= PERMISSION_BLOCKED_MS &&
        entry.lastState !== "permission" &&
        entry.lastState !== "error"
      ) {
        dispatchState(entry, "permission");
        reconcileFocus();
        emit();
      }
    }
    // 显示层截止时刻扫描：每层每次 tick 至多推进一个相位（handler 内部自行
    // emit）。跨相位的大步长时间跳跃在后续 tick 继续消化。
    if (
      rotationSegment !== undefined &&
      variantAdvanceAt !== undefined &&
      now() >= variantAdvanceAt
    ) {
      variantAdvanceAt = undefined;
      advanceVariantRotation();
    }
    if (
      rotation !== undefined &&
      rotationBoundaryAt !== undefined &&
      now() >= rotationBoundaryAt
    ) {
      rotationBoundary();
    }
    if (
      performance !== undefined &&
      performance.phase === "entry" &&
      performanceHoldUntil !== undefined &&
      now() >= performanceHoldUntil
    ) {
      performanceHoldUntil = undefined;
      performanceExit();
    }
    if (
      performance !== undefined &&
      performance.phase === "exit" &&
      performanceExitUntil !== undefined &&
      now() >= performanceExitUntil
    ) {
      finishPerformanceExit();
    }
    if (eggAt !== undefined && now() >= eggAt) {
      eggAt = undefined;
      if (isParallelHold()) enterEasterEgg();
    }
    if (
      egg !== undefined &&
      egg.phase === "entry" &&
      eggHoldUntil !== undefined &&
      now() >= eggHoldUntil
    ) {
      eggHoldUntil = undefined;
      easterEggExit();
    }
    if (
      egg !== undefined &&
      egg.phase === "exit" &&
      eggExitUntil !== undefined &&
      now() >= eggExitUntil
    ) {
      finishEasterEggExit();
    }
    if (
      poke !== undefined &&
      poke.phase === "entry" &&
      pokeHoldUntil !== undefined &&
      now() >= pokeHoldUntil
    ) {
      pokeHoldUntil = undefined;
      pokeExit();
    }
    if (
      poke !== undefined &&
      poke.phase === "exit" &&
      pokeExitUntil !== undefined &&
      now() >= pokeExitUntil
    ) {
      finishPokeExit();
    }
  }

  const tickTimer = setInterval(tick, tickIntervalMs);

  // ---------------------------------------------------------------------------
  // 公共接口
  // ---------------------------------------------------------------------------

  cachedSnapshot = computeSnapshot();
  displayPose = planHeadingPose(cachedSnapshot.playback);

  function getSnapshot(): RuntimeSnapshot {
    return cachedSnapshot;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    listUnsub();
    pendingUnsub?.();
    debounce = undefined;
    clearPerformanceSchedule();
    clearPokeSchedule();
    clearEggSchedule();
    rotationBoundaryAt = undefined;
    variantAdvanceAt = undefined;
    rotationSegment = undefined;
    for (const entry of entries.values()) {
      entry.unsub?.();
      entry.unsub = undefined;
    }
    entries.clear();
    clearInterval(tickTimer);
    listeners.clear();
  }

  /** 重算显示层（变体轮换开关变化时调用，ADR-0013 D7）。 */
  function resetRotation(): void {
    if (disposed) return;
    stopVariantRotation();
    emit();
  }

  return {
    getSnapshot,
    subscribe,
    poke: pokeAction,
    dispose,
    __tick: tick,
    resetRotation,
  };
}
