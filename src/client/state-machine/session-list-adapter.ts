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
 *   - 每条取 sessionId / title / running / completed / pendingInteraction /
 *     parentId / origin；
 *   - `completed` 缺省视为 false；
 *   - `pendingInteraction` / `parentId` / `origin` 为 undefined 时不落键
 *     （顶层会话，ADR-0018 谱系；对齐 exactOptionalPropertyTypes 纪律）；
 *   - `byId` 缺失的 id 跳过（防御性）。
 *
 * @module dsh-web-ui-jx/client
 */

import type { SessionListState } from "@deepseek-ai/dsh-client-runtime/client";
import type { SessionListEntry } from "./session-bubbles.ts";

/**
 * 把 SDK SessionListState（ids + byId）投影为气泡列关心的 SessionListEntry[]。
 *
 * 取 sessionId / title / running / completed / pendingInteraction / parentId /
 * origin；保持 ids 顺序。
 *
 * @param state - sessions.list 快照（SDK store 保证稳定引用）。
 * @returns 按 ids 顺序的领域条目列表。
 */
export function deriveSessionListEntries(
  state: SessionListState,
): readonly SessionListEntry[] {
  const items: SessionListEntry[] = [];
  for (const id of state.ids) {
    const summary = state.byId[id];
    if (summary === undefined) continue;
    items.push({
      sessionId: summary.id,
      title: summary.title,
      running: summary.running,
      completed: summary.completed ?? false,
      // SDK PendingInteractionStatus 与纯逻辑层字面量联合同形状（ADR-0020）。
      ...(summary.pendingInteraction !== undefined
        ? { pendingInteraction: summary.pendingInteraction }
        : {}),
      // 谱系透传（ADR-0018 D2/D7）：undefined 缺省不落键。
      ...(summary.parentId !== undefined ? { parentId: summary.parentId } : {}),
      ...(summary.origin !== undefined ? { origin: summary.origin } : {}),
    });
  }
  return items;
}
