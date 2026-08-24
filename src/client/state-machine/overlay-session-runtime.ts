/**
 * overlay-session-runtime — 会话级状态机容器、焦点仲裁与显示层调度
 * （ADR-0008 + ADR-0010 + ADR-0011 + ADR-0013 + ADR-0016）。
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
 * WORKING_LOOP_MS）；跨姿态必经 idle 中转过渡段；表演/轮换定时器按
 * 过渡段实测时长（TRANSITION_EDGE_MS）排程——驻留从目标态可见后起算，
 * 清除在退场过渡播完时。
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

import type {
  ConversationSnapshot,
  ISessions,
  SessionId,
} from "@deepseek-ai/dsh-client-runtime/client";
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
import {
  extractCore,
  diffTarget,
  type SnapshotCore,
} from "./session-follow.ts";
import {
  isRotatableState,
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
 * 用途：poke / 彩蛋 / 表演 / 工作轮换的显示层序列定时器按「过渡段真实
 * 总时长 + 驻留时长」排程——驻留从目标态可见后起算、退场在过渡播完时清除。
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
}

/** 紧急态显示层（permission/error 接管，入场源姿态捕获）。 */
interface EmergencyDisplay {
  readonly sessionId: SessionId;
  readonly state: "permission" | "error";
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
  /** 取当前快照（供 useExternalStore 等订阅机制读取）。 */
  getSnapshot(): RuntimeSnapshot;
  /** 订阅快照变化；返回取消订阅函数。 */
  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void;
  /** 点击惊吓：触发一次「当前姿态→idle→惊吓→惊吓循环→idle→回落目标」（ADR-0011）。 */
  poke(): void;
  /** 释放全部订阅（list + 各会话 binding.session + tick timer + 显示层定时器）。 */
  dispose(): void;
  /** 测试用：手动触发一次 tick（防抖 deadline 判定）。 */
  __tick(): void;
  /**
   * 重新评估显示层（变体轮换开关变化时由接线层调用，ADR-0013 D7）：
   * 丢弃进行中的轮换位置并重算快照。
   */
  refresh(): void;
}

/** runtime 选项。 */
export interface CreateOverlaySessionRuntimeOptions {
  /** 时钟注入（默认 Date.now，测试可注入虚拟时钟；用于防抖 deadline 判定）。 */
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

  const entries = new Map<SessionId, SessionEntry>();
  const listeners = new Set<(snapshot: RuntimeSnapshot) => void>();

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

  // 显示层定时器
  let performanceTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let pokeTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let eggTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let eggScheduleTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let rotationTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  // idle 变体轮换（ADR-0013）：当前轮换段 + 推进计时。
  // 打断（状态切换/彩蛋/poke/紧急态）时丢弃位置，回落后重抽（D9）。
  let rotationSegment:
    | { state: RotatableState; url: string }
    | undefined = undefined;
  let variantTimer: ReturnType<typeof setTimeout> | undefined = undefined;

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
  // 定时器清理辅助
  // ---------------------------------------------------------------------------

  function clearPerformanceTimer(): void {
    if (performanceTimer !== undefined) {
      clearTimeout(performanceTimer);
      performanceTimer = undefined;
    }
  }

  function clearPokeTimer(): void {
    if (pokeTimer !== undefined) {
      clearTimeout(pokeTimer);
      pokeTimer = undefined;
    }
  }

  function clearEggTimers(): void {
    if (eggTimer !== undefined) {
      clearTimeout(eggTimer);
      eggTimer = undefined;
    }
    if (eggScheduleTimer !== undefined) {
      clearTimeout(eggScheduleTimer);
      eggScheduleTimer = undefined;
    }
  }

  function clearRotationTimer(): void {
    if (rotationTimer !== undefined) {
      clearTimeout(rotationTimer);
      rotationTimer = undefined;
    }
  }

  function clearVariantTimer(): void {
    if (variantTimer !== undefined) {
      clearTimeout(variantTimer);
      variantTimer = undefined;
    }
  }

  // -------------------------------------------------------------------------
  // idle 变体轮换（ADR-0013，仅 idle 池）
  // -------------------------------------------------------------------------

  /** 停止 idle 变体轮换：丢弃当前位置与推进计时（打断语义，D9）。 */
  function stopVariantRotation(): void {
    clearVariantTimer();
    rotationSegment = undefined;
  }

  /** 排程当前变体段的推进：名义时长 + 段间停顿后抽下一段。 */
  function scheduleVariantAdvance(): void {
    if (rotationSegment === undefined) return;
    clearVariantTimer();
    const period = rotationPeriodMs(rotationSegment.url);
    variantTimer = setTimeout(() => {
      variantTimer = undefined;
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
    }, period);
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
    clearRotationTimer();
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
    clearRotationTimer();
    rotation = { asset, plan, loopsPlayed: 0 };
    rotationTimer = setTimeout(
      rotationBoundary,
      planPrefixMs(plan) + WORKING_LOOP_MS[asset],
    );
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

  /** 整圈边界：待边界切出（done）优先，其次满 2 圈换段，否则续播下一圈。 */
  function rotationBoundary(): void {
    rotationTimer = undefined;
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
    rotationTimer = setTimeout(rotationBoundary, WORKING_LOOP_MS[rotation.asset]);
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
    clearPerformanceTimer();
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
    // 驻留从表演循环体可见后起算：按实际入场计划的前导过渡总时长排程
    // （权限反馈链走 permission→kind 直达边，不经 idle 中转）。
    const entryPrefixMs = planPrefixMs(performanceEntryPlan(kind, sourcePose));
    performanceTimer = setTimeout(performanceExit, entryPrefixMs + holdMs);
    emit();
  }

  /** 表演退场：构建退场计划，播完后清除表演层（working 回落时接续工作轮换）。 */
  function performanceExit(): void {
    performanceTimer = undefined;
    if (performance === undefined) return;
    const kind = performance.kind;
    const exitPlan = buildExitPlan(kind);
    performance.phase = "exit";
    performance.exitPlan = exitPlan;
    performanceTimer = setTimeout(() => {
      performanceTimer = undefined;
      const plan = performance?.exitPlan;
      performance = undefined;
      adoptExitPlan(plan);
    }, planPrefixMs(exitPlan));
    emit();
  }

  /** 清除表演层（紧急态打断/替代触发时）。 */
  function clearPerformance(): void {
    clearPerformanceTimer();
    performance = undefined;
  }

  // -------------------------------------------------------------------------
  // 摸鱼彩蛋（ADR-0010 D7 + ADR-0016 彩蛋池收敛）
  // -------------------------------------------------------------------------

  function cancelEasterEgg(): void {
    clearEggTimers();
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

  /** 彩蛋退场：按当时基础显示态构建退场计划，播完后清除彩蛋层。 */
  function easterEggExit(): void {
    eggTimer = undefined;
    if (egg === undefined) return;
    const exitPlan = buildExitPlan(egg.expression);
    egg.phase = "exit";
    egg.exitPlan = exitPlan;
    eggTimer = setTimeout(() => {
      eggTimer = undefined;
      const plan = egg?.exitPlan;
      egg = undefined;
      adoptExitPlan(plan);
      // 为下一轮彩蛋排期（并行驻留持续时周期性播放，ADR-0010 D3）。
      if (isParallelHold()) scheduleEasterEgg();
    }, planPrefixMs(exitPlan));
    emit();
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
    // 驻留从表情循环可见后起算：按实际入场计划的前导过渡总时长排程。
    const eggEntryPlan = viaIdlePlan(
      sourcePose,
      expression,
      loopItem(expression, loopAssetUrl(expression)),
    );
    eggTimer = setTimeout(
      easterEggExit,
      planPrefixMs(eggEntryPlan) + EASTER_EGG_HOLD_MS,
    );
    emit();
  }

  function scheduleEasterEgg(): void {
    if (eggScheduleTimer !== undefined) clearTimeout(eggScheduleTimer);
    eggScheduleTimer = setTimeout(() => {
      eggScheduleTimer = undefined;
      if (isParallelHold()) {
        enterEasterEgg();
      }
    }, randomEasterEggIntervalMs());
  }

  /** 并行驻留条件变化时重新调度彩蛋。 */
  function onParallelHoldChanged(isHold: boolean): void {
    if (!isHold) {
      clearEggTimers();
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
    if (egg === undefined && eggScheduleTimer === undefined) {
      scheduleEasterEgg();
    }
  }

  // -------------------------------------------------------------------------
  // poke 点击惊吓（ADR-0011）
  // -------------------------------------------------------------------------

  function clearPoke(): void {
    clearPokeTimer();
    poke = undefined;
  }

  /**
   * 点击惊吓：触发一次「当前姿态→idle→惊吓→惊吓循环→idle→回落目标」。
   * - 冷却：播放中（含回落）重复调用忽略（ADR-0011 D8）。
   * - 紧急态（permission/error，含焦点会话自身）或表演播放中不触发
   *   （互斥：poke 期间事件触发的表演仅更新 SM；表演播放中 poke 忽略）。
   * - 触发时取消进行中的摸鱼彩蛋与工作轮换（打断语义，回落后重新开始）。
   * - 定时器按过渡段实测时长排程：驻留从惊吓循环可见后起算；回落目标按
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
    pokeTimer = setTimeout(pokeExit, planPrefixMs(entryPlan) + POKE_HOLD_MS);
    emit();
  }

  /** poke 回落：按当时基础显示态构建回落计划，播完后清除 poke 层。 */
  function pokeExit(): void {
    pokeTimer = undefined;
    if (poke === undefined) return;
    const exitPlan = buildExitPlan("surprised");
    poke.phase = "exit";
    poke.exitPlan = exitPlan;
    pokeTimer = setTimeout(() => {
      pokeTimer = undefined;
      const plan = poke?.exitPlan;
      poke = undefined;
      adoptExitPlan(plan);
    }, planPrefixMs(exitPlan));
    emit();
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
        emergency = { sessionId: emergencyId, state, pose };
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

  function computeSnapshot(): RuntimeSnapshot {
    // 1. 紧急抢焦：显示紧急会话（入场源姿态经 idle 中转，计划内容稳定）。
    if (emergency !== undefined) {
      stopVariantRotation();
      const plan = viaIdlePlan(
        emergency.pose,
        emergency.state,
        loopItem(emergency.state, loopAssetUrl(emergency.state)),
      );
      return {
        focusSessionId: currentFocusSessionId,
        currentState: emergency.state,
        playback: plan,
        focusNonce,
      };
    }

    // 2. poke 惊吓（显示层覆盖，无会话时也可用）。
    if (poke !== undefined) {
      stopVariantRotation();
      if (poke.phase === "entry") {
        const plan = viaIdlePlan(
          poke.sourcePose,
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
        playback: poke.exitPlan ?? [],
        focusNonce,
      };
    }

    // 3. 一次性表演（done/nod-smile/frown-wave）。
    if (performance !== undefined) {
      stopVariantRotation();
      if (performance.phase === "entry") {
        return {
          focusSessionId: currentFocusSessionId,
          currentState: performance.kind,
          playback: performanceEntryPlan(
            performance.kind,
            performance.sourcePose,
          ),
          focusNonce,
        };
      }
      return {
        focusSessionId: currentFocusSessionId,
        currentState: performance.kind,
        playback: performance.exitPlan ?? [],
        focusNonce,
      };
    }

    // 4. 摸鱼彩蛋（并行驻留期间）。
    if (egg !== undefined) {
      stopVariantRotation();
      if (egg.phase === "entry") {
        const plan = viaIdlePlan(
          egg.sourcePose,
          egg.expression,
          loopItem(egg.expression, loopAssetUrl(egg.expression)),
        );
        return {
          focusSessionId: currentFocusSessionId,
          currentState: egg.expression,
          playback: plan,
          focusNonce,
        };
      }
      return {
        focusSessionId: currentFocusSessionId,
        currentState: egg.expression,
        playback: egg.exitPlan ?? [],
        focusNonce,
      };
    }

    // 5. 工作轮换（显示 working；含待整圈边界切出的 done 驻留）。
    if (rotation !== undefined) {
      return {
        focusSessionId: currentFocusSessionId,
        currentState: "working",
        playback: rotation.plan,
        focusNonce,
      };
    }

    // 6. 基础显示：并行驻留 → working（惰性起播工作轮换）。
    if (isParallelHold()) {
      const holdRotation = enterWorkingDisplay();
      if (holdRotation !== undefined) {
        return {
          focusSessionId: currentFocusSessionId,
          currentState: "working",
          playback: holdRotation.plan,
          focusNonce,
        };
      }
    }

    // 7. 基础显示：跟随焦点会话（idle 变体轮换 / working 工作轮换）。
    const entry = focusSessionIdToEntry(currentFocusSessionId);
    if (entry === undefined) {
      return {
        focusSessionId: currentFocusSessionId,
        currentState: IDLE,
        playback: ensureVariantRotation("idle"),
        focusNonce,
      };
    }
    if (entry.lastState === "working") {
      const focusRotation = enterWorkingDisplay();
      if (focusRotation !== undefined) {
        return {
          focusSessionId: currentFocusSessionId,
          currentState: "working",
          playback: focusRotation.plan,
          focusNonce,
        };
      }
    }
    if (entry.lastState === "idle" && isRotatableState("idle")) {
      return {
        focusSessionId: currentFocusSessionId,
        currentState: IDLE,
        playback: ensureVariantRotation("idle"),
        focusNonce,
      };
    }
    // 兜底（permission/error 理论上已被紧急层接管）：直接显示循环。
    return {
      focusSessionId: currentFocusSessionId,
      currentState: entry.lastState,
      playback: [loopItem(entry.lastState, loopAssetUrl(entry.lastState))],
      focusNonce,
    };
  }

  function emit(): void {
    cachedSnapshot = computeSnapshot();
    displayPose = planHeadingPose(cachedSnapshot.playback);
    for (const listener of listeners) listener(cachedSnapshot);
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
    snapshot: ConversationSnapshot,
  ): void {
    // 并行驻留基线必须在**本会话目标态应用之前**采样：第二个会话转入工作
    // 正是发生在本次 processSnapshot 内，事后采样会让 wasParallel 恒等于
    // isHold，上升沿（hold 开始）永远检测不到 → 摸鱼彩蛋从未被调度。
    const wasParallel = isParallelHold();
    const currCore = extractCore(snapshot);
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
    const isHold = isParallelHold();
    if (wasParallel !== isHold) {
      onParallelHoldChanged(isHold);
    }
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

  // 初始同步
  handleListChange();

  // ---------------------------------------------------------------------------
  // tick：焦点会话 working 进入防抖 deadline 判定
  // ---------------------------------------------------------------------------

  function tick(): void {
    if (disposed) return;
    let changed = false;
    if (debounce !== undefined && now() >= debounce.deadline) {
      const { sessionId } = debounce;
      debounce = undefined;
      // 会话最新意图仍为 working 才落（期间若已 done/拒绝，防抖作废）。
      const entry = entries.get(sessionId);
      if (entry !== undefined && entry.pendingTarget === "working") {
        dispatchState(entry, "working");
        changed = true;
      }
    }
    if (changed) {
      reconcileFocus();
      emit();
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
    debounce = undefined;
    clearPerformanceTimer();
    clearPokeTimer();
    clearEggTimers();
    clearRotationTimer();
    clearVariantTimer();
    rotationSegment = undefined;
    for (const entry of entries.values()) {
      entry.unsub?.();
      entry.unsub = undefined;
    }
    entries.clear();
    clearInterval(tickTimer);
    listeners.clear();
  }

  /** 重新评估显示层（变体轮换开关变化时调用，ADR-0013 D7）。 */
  function refresh(): void {
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
    refresh,
  };
}
