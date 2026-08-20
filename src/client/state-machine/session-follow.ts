/**
 * session-follow — 会话状态跟随差分推导（纯函数，供 overlay-session-runtime 复用）。
 *
 * ADR-0008 起，多会话适配由 overlay-session-runtime 承担（每会话一个状态机实例 +
 * binding.session 订阅）。本模块只保留差分推导的纯函数（extractCore / diffTarget）
 * 与阈值常量，被 runtime 按会话接线复用。原 attachSessionFollow 单会话跟随逻辑
 * 已被 runtime 替换移除（无残留双路径）。
 *
 * 映射判定式（高 → 低）：
 *   error > permission > working > replying > thinking > done(边沿) > idle
 * reading 由 thinking 持续 >= READING_THRESHOLD_MS 无可见 chunk 推导；
 * done 驻留 DONE_HOLD_MS 后回 idle（runtime 内 tick 驱动）。
 *
 * @module dsh-web-ui-jx/client
 */

import type { ConversationSnapshot } from "@deepseek-ai/dsh-client-runtime/client";
import type { OverlayState } from "./overlay-state-machine.ts";

/** thinking 持续多久（无可见 chunk）判为 reading（ms）。 */
export const READING_THRESHOLD_MS = 8000;

/** done 态驻留多久后回 idle（ms）。 */
export const DONE_HOLD_MS = 4000;

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