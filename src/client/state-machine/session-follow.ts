/**
 * session-follow — 会话状态跟随：把 cordis `sessions` 服务的快照联动到角色状态机。
 *
 * 数据源唯一：`ctx.sessions`（ISessions）的订阅式快照，而非 DOM / 事件总线 / 轮询。
 * 机制（对齐参考项目 dsh-web-ui/skins/jiangxiao/character-follow.ts 的判定式）：
 *   1. 订阅 `sessions.list` 跟踪 current 会话 id，current 变化时重挂监听。
 *   2. 对 current 会话 `binding(id).session.subscribe` 读 ConversationSnapshot。
 *   3. 只取 7 个核心字段（running / partial / runningCalls / pending /
 *      promptError / lastAgentError / openError），差分成归一化事件。
 *   4. 按优先级把事件驱动到 overlayStateMachine（经 HostEventAdapter）。
 *
 * 映射判定式（高 → 低）：
 *   error > permission > working > replying > thinking > done(边沿) > idle
 * reading 由 thinking 持续 >= READING_THRESHOLD_MS 无可见 chunk 推导；
 * done 驻留 DONE_HOLD_MS 后回 idle。
 *
 * 纯快照差分、不依赖投影 key，规避宿主版本漂移；无 sessions 时静默空转（浮层保持 idle）。
 *
 * @module dsh-web-ui-jx/client
 */

import type {
  ConversationSnapshot,
  ISessions,
  SessionId,
} from "@deepseek-ai/dsh-client-runtime/client";
import {
  createHostEventAdapter,
  overlayStateMachine,
  type OverlayState,
} from "./overlay-state-machine.ts";

/** thinking 持续多久（无可见 chunk）判为 reading（ms）。 */
export const READING_THRESHOLD_MS = 8000;

/** done 态驻留多久后回 idle（ms）。 */
export const DONE_HOLD_MS = 4000;

/** 无会话时浮层停留的初始态。 */
const IDLE: OverlayState = "idle";

/**
 * 仅取差分关心的核心字段，与 SDK 类型解耦（SDK 字段形状多变，映射到这里固化）。
 */
interface SnapshotCore {
  /** running 位。 */
  readonly running: boolean;
  /** partial 是否含可见 text/reasoning chunk。 */
  readonly hasVisibleChunk: boolean;
  /** runningCalls 数量。 */
  readonly runningCallsCount: number;
  /** 是否有 pending（approval/question）。 */
  readonly pending: boolean;
  /** 是否有 error（promptError/lastAgentError/openError）。 */
  readonly hasError: boolean;
}

/** 判定 partial 是否含可见 chunk（匹配参考项目的 hasVisiblePartialChunk）。 */
function hasVisiblePartialChunk(snapshot: ConversationSnapshot): boolean {
  const partial = snapshot.partial;
  if (partial === null) return false;
  for (const block of partial.blocks) {
    if (block.kind === "text" && block.text.length > 0) return true;
    if (block.kind === "reasoning" && block.text.length > 0) return true;
  }
  return false;
}

/** 从 ConversationSnapshot 提取核心字段。 */
export function extractCore(snapshot: ConversationSnapshot): SnapshotCore {
  return {
    running: snapshot.running,
    hasVisibleChunk: hasVisiblePartialChunk(snapshot),
    runningCallsCount: snapshot.runningCalls.length,
    pending: snapshot.pending.length > 0,
    hasError:
      snapshot.promptError !== null ||
      snapshot.lastAgentError !== null ||
      snapshot.openError !== null,
  };
}

/** 判定核心快照是否为 idle 兜底态。 */
function isIdleCore(c: SnapshotCore): boolean {
  return (
    !c.running &&
    !c.hasVisibleChunk &&
    c.runningCallsCount === 0 &&
    !c.pending &&
    !c.hasError
  );
}

/**
 * 快照差分 → 目标角色态（单值，按优先级裁决）。
 *
 * 参考 reference diffEvents 的优先级表，但现有状态机是直接 switch，故收敛
 * 为"每次差分只产出一个最高优先级的目标态"。
 *
 * @param prev - 上一次核心快照（null 表示初次/切换会话）。
 * @param curr - 当前核心快照。
 * @returns 目标角色态；null 表示无变化（继续当前态）。
 */
export function diffTarget(
  prev: SnapshotCore | null,
  curr: SnapshotCore,
): OverlayState | null {
  // 1. error 最高优先
  if (curr.hasError && (prev === null || !prev.hasError)) return "error";
  // 2. permission
  if (curr.pending && (prev === null || !prev.pending)) return "permission";
  // 3. working
  if (curr.runningCallsCount > 0 && (prev === null || prev.runningCallsCount === 0)) {
    return "working";
  }
  // 4. replying（可见 chunk 出现）
  if (curr.hasVisibleChunk && (prev === null || !prev.hasVisibleChunk)) {
    return "replying";
  }
  // 5. thinking（running && 无 chunk，新轮次）
  if (
    curr.running &&
    !curr.hasVisibleChunk &&
    (prev === null || !prev.running || prev.hasVisibleChunk)
  ) {
    return "thinking";
  }
  // 6. done 边沿（running true→false，无 error/pending）
  if (
    prev !== null &&
    prev.running &&
    !curr.running &&
    !curr.hasError &&
    !curr.pending
  ) {
    return "done";
  }
  // 7. idle 兜底
  if (isIdleCore(curr) && (prev === null || !isIdleCore(prev))) return "idle";
  return null;
}

/** session-follow 选项。 */
export interface AttachSessionFollowOptions {
  /** inscriptions：welcome 是否驻留后再回 idle（跳过，保持 idle 即可，避免突兀欢迎）。 */
  now?: () => number;
  /** 是否在启动时进入一次 welcome（默认 false，保持安静）。 */
  initialWelcome?: boolean;
}

/**
 * 附加会话状态跟随：订阅 sessions，把快照差分驱动到 overlayStateMachine。
 *
 * 订阅均在返回的 dispose 中释放，无泄漏。reading 超时 / done 驻留用内部
 * setInterval tick 驱动（每 1s 检查一次，对齐参考项目的时间驱动方式）。
 *
 * @param sessions - ctx.sessions 服务。
 * @param opts - 选项。
 * @returns dispose 函数。
 */
export function attachSessionFollow(
  sessions: ISessions,
  opts?: AttachSessionFollowOptions,
): () => void {
  const adapter = createHostEventAdapter(overlayStateMachine);
  const now = opts?.now ?? (() => Date.now());

  let lastState: OverlayState = opts?.initialWelcome === true ? "welcome" : IDLE;
  let thinkingSince: number | undefined;
  let doneSince: number | undefined;
  let prevCore: SnapshotCore | null = null;
  let lastCurrent: SessionId | undefined;
  let sessionUnsub: (() => void) | undefined;
  const disposers: Array<() => void> = [];

  /** 切到目标态（去重；idle 不派发 welcome 驻留外的多余切换）。 */
  function setState(state: OverlayState): void {
    if (state === lastState) return;
    lastState = state;

    // 状态进入边界维护时序元数据（非 reducer 内，见文件头说明）。
    if (state === "thinking") thinkingSince = now();
    else if (state === "done") doneSince = now();

    // 经 adapter 派发到状态机。
    switch (state) {
      case "idle":
        adapter.onAssistantIdle();
        break;
      case "thinking":
        adapter.onAssistantThinking();
        break;
      case "reading":
        adapter.onAssistantReading();
        break;
      case "replying":
        adapter.onAssistantReplying();
        break;
      case "working":
        adapter.onAssistantWorking();
        break;
      case "error":
        adapter.onAssistantError();
        break;
      case "welcome":
        adapter.onAssistantWelcome();
        break;
      case "done":
        adapter.onAssistantDone();
        break;
      case "permission":
        adapter.onAssistantPermission();
        break;
      case "listening":
        adapter.onAssistantListening();
        break;
    }
  }

  /** 处理一次快照。 */
  function processSnapshot(snapshot: ConversationSnapshot): void {
    const currCore = extractCore(snapshot);
    const target = diffTarget(prevCore, currCore);

    // 离开展开/工作态时清 reading 计时（有 chunk 或结束）。
    if (currCore.hasVisibleChunk || !currCore.running) thinkingSince = undefined;

    if (target !== null) setState(target);
    prevCore = currCore;
  }

  /** 挂到 current 会话（先释放旧订阅）。 */
  function attachCurrent(id: SessionId | undefined): void {
    sessionUnsub?.();
    sessionUnsub = undefined;
    prevCore = null;
    if (id === undefined) {
      setState(IDLE);
      return;
    }
    const binding = sessions.binding(id);
    if (binding === undefined) return;
    sessionUnsub = binding.session.subscribe(() => {
      processSnapshot(binding.session.getSnapshot());
    });
    setState(IDLE); // 切换会话重置为 idle，避免残留上一态
    processSnapshot(binding.session.getSnapshot());
  }

  // 跟踪 current 会话变化。
  const listUnsub = sessions.list.subscribe(() => {
    const list = sessions.list.getSnapshot();
    if (list.current !== lastCurrent) {
      lastCurrent = list.current;
      attachCurrent(list.current);
    }
  });
  disposers.push(listUnsub);

  // 初始附加。
  const initialList = sessions.list.getSnapshot();
  lastCurrent = initialList.current;
  attachCurrent(initialList.current);

  // tick：drives thinking→reading 超时、done→idle 驻留。
  const tickTimer = setInterval(() => {
    if (lastState === "thinking" && thinkingSince !== undefined) {
      if (now() - thinkingSince >= READING_THRESHOLD_MS) {
        thinkingSince = undefined;
        adapter.onAssistantReading();
        lastState = "reading";
      }
    } else if (lastState === "done" && doneSince !== undefined) {
      if (now() - doneSince >= DONE_HOLD_MS) {
        doneSince = undefined;
        adapter.onAssistantIdle();
        lastState = IDLE;
      }
    }
  }, 1000);

  return () => {
    sessionUnsub?.();
    sessionUnsub = undefined;
    for (const d of disposers.splice(0)) d();
    clearInterval(tickTimer);
  };
}