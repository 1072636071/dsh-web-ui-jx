/**
 * session-list-adapter — SDK 会话列表 → 气泡列领域条目的投影适配器。
 *
 * 角色：把 `ISessions.list` 的 `SessionListState`（SDK 形状：ids + byId）投影为
 * `session-bubbles` 纯逻辑层关心的 `SessionListEntry[]`。这是 SDK 形状与领域词汇
 * 之间的**接缝适配器**——`session-bubbles.ts` 保持不依赖 SDK 类型形状（其文件头
 * 声明的契约），SDK 投影集中在本模块，可独立测试。
 *
 * 投影规则（与 ADR-0007 决策 1 / ADR-0018 / ADR-0020 一致）：
 *   - 保持 `ids` 顺序；
 *   - 每条取 sessionId / title / updatedAt / running / completed /
 *     pendingInteraction / parentId / origin；
 *   - `completed` 缺省视为 false；`updatedAt` 缺省视为 0；
 *   - `pendingInteraction` / `parentId` / `origin` 为 undefined 时不落键
 *     （顶层会话，ADR-0018 谱系；对齐 exactOptionalPropertyTypes 纪律）；
 *   - `byId` 缺失的 id 跳过（防御性）。
 *
 * @module dsh-web-ui-jx/client
 */

import type { SessionListState } from "@deepseek-ai/dsh-client-runtime/client";
import type { PendingInteractionKind, SessionListEntry } from "./session-bubbles.ts";

// ---------------------------------------------------------------------------
// 宿主待交互源（uiSession.pendingInteractions）共享词汇
//
// 宿主 SDK 升级后 SessionSummary 移除 pendingInteraction 字段，等待用户交互
// 信号迁至 uiSession.pendingInteractions（会话 id → 待交互条目）。气泡列与
// 角色浮层状态机共用以下结构类型与 kind 过滤（单一事实源）。
// ---------------------------------------------------------------------------

/** 宿主待交互条目（uiSession.pendingInteractions 值的最小结构）。 */
export interface PendingInteractionLike {
  /** 域所有的呈现判别 kind（approval/plan-review/question 之外视为不可见）。 */
  readonly kind: string;
}

/** 宿主待交互快照：会话 id → 待交互条目（ReadonlyMap 结构子集）。 */
export type PendingInteractionsSnapshot = ReadonlyMap<
  string,
  PendingInteractionLike
>;

/** 待交互观察源（对齐宿主 HostObservable 形状：getSnapshot + subscribe）。 */
export interface PendingInteractionsSource {
  getSnapshot(): PendingInteractionsSnapshot;
  subscribe(listener: () => void): () => void;
}

/**
 * 仅宿主侧边栏可见的三种待交互 kind 参与投影（与宿主 ui-workspace 树的
 * visiblePendingKind 对齐）；未知/缺席 kind 返回 undefined。
 */
export function visiblePendingKind(
  kind: string | undefined,
): PendingInteractionKind | undefined {
  switch (kind) {
    case "approval":
    case "plan-review":
    case "question":
      return kind;
    default:
      return undefined;
  }
}

/**
 * 把 SDK SessionListState（ids + byId）投影为气泡列关心的 SessionListEntry[]。
 *
 * 取 sessionId / title / running / completed / pendingInteraction / parentId /
 * origin；保持 ids 顺序。
 *
 * pendingInteraction 双事实源（宿主 SDK 升级适配）：
 *   - 传入 `pendingInteractions`（uiSession.pendingInteractions 快照）时以
 *     Map 为准——可见 kind（approval/plan-review/question）命中才落键，
 *     未命中/未知 kind 一律不落（忽略 summary 遗留字段）；
 *   - 未传 Map 时回退 summary.pendingInteraction 遗留字段（旧宿主兼容）。
 *
 * @param state - sessions.list 快照（SDK store 保证稳定引用）。
 * @param pendingInteractions - 宿主待交互快照（可选，新宿主事实源）。
 * @returns 按 ids 顺序的领域条目列表。
 */
export function deriveSessionListEntries(
  state: SessionListState,
  pendingInteractions?: PendingInteractionsSnapshot,
): readonly SessionListEntry[] {
  const items: SessionListEntry[] = [];
  for (const id of state.ids) {
    const summary = state.byId[id];
    if (summary === undefined) continue;
    const pendingKind =
      pendingInteractions !== undefined
        ? visiblePendingKind(pendingInteractions.get(summary.id)?.kind)
        : summary.pendingInteraction;
    items.push({
      sessionId: summary.id,
      title: summary.title,
      // 工单 16-04：updatedAt 供 AI 动态标题缓存失效判据；缺省防 0。
      updatedAt: summary.updatedAt ?? 0,
      running: summary.running,
      completed: summary.completed ?? false,
      ...(pendingKind !== undefined ? { pendingInteraction: pendingKind } : {}),
      // 谱系透传（ADR-0018 D2/D7）：undefined 缺省不落键。
      ...(summary.parentId !== undefined ? { parentId: summary.parentId } : {}),
      ...(summary.origin !== undefined ? { origin: summary.origin } : {}),
    });
  }
  return items;
}
