/**
 * session-follow — 会话状态跟随差分推导（纯函数，供 overlay-session-runtime 复用）。
 *
 * ADR-0016 四态收敛后，差分输出从细分工作态收敛为五目标 + 表演触发：
 *   - error 上升沿 → switch error（硬切）；
 *   - pending 上升沿 → switch permission（硬切）；
 *   - pending 下降沿 + running 继续 → perform nod-smile（批准后回 working）；
 *   - pending 下降沿 + running 终止 → perform frown-wave（拒绝后回 idle）；
 *   - running 上升沿（含工具调用/可见输出/无输出思考，统一映射）→ switch working；
 *   - running 下降沿（无 error/pending）→ perform done（收工表演后回 idle）；
 *   - 全静 → switch idle。
 *
 * READING_THRESHOLD_MS（thinking 8s 推导 reading）废弃——reading 不再是事件
 * 目标，仅是 working 显示层轮换素材（ADR-0016 决策 4）。
 *
 * 批准/拒绝启发式：pending 下降沿后 running 是否继续区分；宿主若提供显式
 * 拒绝信号优先采用（实现期验证，见 runtime 注释）。
 *
 * @module dsh-web-ui-jx/client
 */

import type { OverlayState } from "./overlay-state-machine.ts";

/**
 * 新版宿主 `SessionSnapshot` 的结构子集——插件只消费这些字段。
 *
 * 宿主 SDK 升级后（session-controller 拆分），会话快照移除了
 * `partial` / `runningCalls` / `pending` 字段：可见 chunk 与工具调用
 * 计数不再有快照级来源（降级为常量，ADR-0014 时间启发式保留机制但
 * 输入恒 0）；pending 信号迁至 `uiSession.pendingInteractions`，由
 * 调用方按会话 id 注入本函数。类型只保留结构子集，使旧 SDK 类型
 * （ConversationSnapshot）与新宿主运行时形状均可赋值。
 */
export interface SessionSnapshotLike {
  /** running 位。 */
  readonly running: boolean;
  /** send/stop 失败（在场即错误）。 */
  readonly promptError: unknown;
  /** 历史窗口打开失败（在场即错误）。 */
  readonly openError: unknown;
  /** 最近 agent 错误（非空即错误）。 */
  readonly lastAgentError: string | null;
}

/** 差分可触发的一次性表演（done/nod-smile/frown-wave；welcome 已随 ADR-0023 移除）. */
export type DiffPerformance = "done" | "nod-smile" | "frown-wave";

/** 差分推导结果：循环态切换 / 一次性表演触发 / 无变化. */
export type DiffOutcome =
  | { readonly kind: "switch"; readonly target: OverlayState }
  | { readonly kind: "perform"; readonly performance: DiffPerformance }
  | null;

/**
 * 仅取差分关心的核心字段，与 SDK 类型解耦（SDK 字段形状多变，映射到这里固化）。
 */
export interface SnapshotCore {
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

/** 旧版宿主 ConversationSnapshot 的可选遗留字段（新宿主已移除，防御性读取）。 */
interface LegacySnapshotFields {
  readonly partial?: {
    readonly blocks?: readonly { readonly kind: string; readonly text: string }[];
  } | null;
  readonly runningCalls?: readonly unknown[];
  readonly pending?: readonly unknown[];
}

/** 判定遗留 partial 是否含可见 chunk（旧宿主来源；字段缺席即 false）。 */
function legacyHasVisibleChunk(legacy: LegacySnapshotFields): boolean {
  const partial = legacy.partial;
  if (partial == null || partial.blocks === undefined) return false;
  for (const block of partial.blocks) {
    if (block.kind === "text" && block.text.length > 0) return true;
    if (block.kind === "reasoning" && block.text.length > 0) return true;
  }
  return false;
}

/**
 * 从宿主会话快照提取核心字段；pending 由外部待交互源注入（缺省 false）。
 *
 * 双宿主兼容：新宿主（SessionSnapshot）只有 running/错误字段，pending 全靠
 * 注入、partial/runningCalls 恒缺席（降级为 false/0，ADR-0014 时间启发式
 * 随之静默——审批等待由注入快路径承载）；旧宿主（ConversationSnapshot）
 * 仍带 partial/runningCalls/pending 遗留字段，防御性读取继续生效。
 */
export function extractCore(
  snapshot: SessionSnapshotLike & LegacySnapshotFields,
  pending = false,
): SnapshotCore {
  const legacy = snapshot;
  return {
    running: snapshot.running,
    hasVisibleChunk: legacyHasVisibleChunk(legacy),
    runningCallsCount: legacy.runningCalls?.length ?? 0,
    pending: pending || (legacy.pending !== undefined && legacy.pending.length > 0),
    hasError:
      snapshot.promptError != null ||
      snapshot.lastAgentError != null ||
      snapshot.openError != null,
  };
}

/** 判定核心快照是否为全静（idle 兜底）态。 */
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
 * 快照差分 → 目标（循环态切换或表演触发，单值，按优先级裁决）。
 *
 * 优先级（高 → 低）：error 上升沿 > permission 上升沿 > permission 下降沿
 * （批准/拒绝表演）> running 下降沿（done 表演）> error 下降沿（错误恢复）
 * > working 上升沿 > idle 兜底。
 *
 * @param prev - 上一次核心快照（null 表示初次/切换会话）。
 * @param curr - 当前核心快照。
 * @returns 差分结果；null 表示无变化（继续当前态）。
 */
export function diffTarget(
  prev: SnapshotCore | null,
  curr: SnapshotCore,
): DiffOutcome {
  // 1. error 上升沿（硬切，不防抖）
  if (curr.hasError && (prev === null || !prev.hasError)) {
    return { kind: "switch", target: "error" };
  }
  // 2. permission 上升沿（硬切，不防抖）
  if (curr.pending && (prev === null || !prev.pending)) {
    return { kind: "switch", target: "permission" };
  }
  // 3. permission 下降沿：批准/拒绝启发式——running 继续 = 批准（nod-smile
  //    表演后回 working）；running 终止 = 拒绝（frown-wave 表演后回 idle）。
  //    error 仍在场时跳过（紧急态优先，角色停在 error）。
  if (prev !== null && prev.pending && !curr.pending && !curr.hasError) {
    return {
      kind: "perform",
      performance: curr.running ? "nod-smile" : "frown-wave",
    };
  }
  // 4. running 下降沿（无 error/pending）→ done 表演
  if (
    prev !== null &&
    prev.running &&
    !curr.running &&
    !curr.hasError &&
    !curr.pending
  ) {
    return { kind: "perform", performance: "done" };
  }
  // 5. error 下降沿（错误恢复）：回合仍在进行 → working（运行中统一映射）；
  //    恢复时已在等审批 → permission。避免错误清偿后角色卡在 error。
  if (prev !== null && prev.hasError && !curr.hasError) {
    if (curr.pending) return { kind: "switch", target: "permission" };
    if (curr.running) return { kind: "switch", target: "working" };
  }
  // 6. working 上升沿：运行中（有工具调用/有可见输出/无输出思考中）统一映射
  //    working（进入防抖约 2000ms，由 runtime 承担）。
  if (curr.running && !curr.hasError && !curr.pending &&
    (prev === null || !prev.running)) {
    return { kind: "switch", target: "working" };
  }
  // 7. 全静兜底 → idle（回落防抖约 2000ms，由 runtime 承担）
  if (isIdleCore(curr) && (prev === null || !isIdleCore(prev))) {
    return { kind: "switch", target: "idle" };
  }
  return null;
}
