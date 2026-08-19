/**
 * session-bubbles — 会话气泡列纯逻辑模块（ADR-0007）。
 *
 * 工单 05-session-bubbles：角色浮层会话气泡列的可测地基。
 *
 * 提供：
 *   - selectBubbleEntries：过滤（running || completed）→ 保持列表顺序 →
 *     截取前 maxVisible 为 visible，返回 { visible, moreCount }。
 *     每条输出携带 isCurrent（sessionId === current）。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React、不依赖 SDK 类型。DOM 薄壳在
 * SessionBubbleList 组件。对齐 state-machine / overlay-position 单例模式。
 *
 * @module dsh-web-ui-jx/client
 */

// ---------------------------------------------------------------------------
// 输入/输出类型（与 SDK 解耦：只取气泡列关心的字段）
// ---------------------------------------------------------------------------

/** 会话 id（与 SDK SessionId 同语义，此处用 string 别名解耦）. */
export type SessionId = string;

/**
 * 输入条目：从 SDK SessionSummary 投影出的气泡列关心字段。
 *
 * 由 SessionBubbleList 从 `sessions.list` 快照的 `ids` + `byId` 派生，
 * 纯逻辑模块不依赖 SDK 类型形状。
 */
export interface SessionListEntry {
  /** 会话 id. */
  readonly sessionId: SessionId;
  /** 会话标题（无 title 时为 undefined，气泡回落 sessionId 截断）. */
  readonly title: string | undefined;
  /** 是否运行中（running === true）. */
  readonly running: boolean;
  /** 是否已结束未查看（completed === true）. */
  readonly completed: boolean;
}

/**
 * 输出条目：过滤 + isCurrent 标记后的气泡条目。
 *
 * visible 数组的元素；每条携带 isCurrent 供组件高亮当前会话气泡。
 */
export interface BubbleEntry extends SessionListEntry {
  /** 是否为当前会话（sessionId === current）. */
  readonly isCurrent: boolean;
}

/** selectBubbleEntries 返回值. */
export interface SelectBubbleEntriesResult {
  /** 可见气泡条目（前 maxVisible 条，保持列表顺序）. */
  readonly visible: readonly BubbleEntry[];
  /** 折叠数量（超出 maxVisible 的条目数，moreCount = max(0, total - maxVisible)）. */
  readonly moreCount: number;
}

/** 无 title 时 sessionId 截断长度（ADR-0007 决策 2 回落）. */
export const SID_FALLBACK_MAX_LEN = 12;

/**
 * 气泡显示标题：有 title 用 title，无 title 回落 sessionId 截断（ADR-0007 决策 2）。
 *
 * 纯函数，供组件与测试共享。
 *
 * @param entry - 气泡条目。
 * @returns 显示标题。
 */
export function displayTitle(entry: BubbleEntry): string {
  if (entry.title !== undefined && entry.title.length > 0) return entry.title;
  return entry.sessionId.length > SID_FALLBACK_MAX_LEN
    ? entry.sessionId.slice(0, SID_FALLBACK_MAX_LEN)
    : entry.sessionId;
}

// ---------------------------------------------------------------------------
// 过滤 + 折叠 + isCurrent（纯函数，ADR-0007 决策 1/5）
// ---------------------------------------------------------------------------

/**
 * 过滤 running || completed 的会话，保持列表顺序，截取前 maxVisible 为 visible，
 * 超出部分计为 moreCount；每条携带 isCurrent。
 *
 * ADR-0007 决策 1：气泡范围 = `running === true` 或 `completed === true` 的会话。
 * 其余（idle / 已查看）不入选。
 *
 * 顺序保持：入选条目按 items 原顺序排列，不重排（ADR-0007 决策 3 自下而上生长，
 * 列表顺序第一个在底部）。
 *
 * 折叠：total ≤ maxVisible → 全可见且 moreCount = 0；
 *       total > maxVisible → visible = 前 maxVisible 条，moreCount = total - maxVisible。
 *
 * isCurrent：sessionId === current 的条目标记 true；current 为 undefined 或不匹配 → false。
 *
 * maxVisible 边界：纯函数按传入值计算，越界值（< 0 等）由配置模块钳制；
 *   maxVisible ≤ 0 时 visible 为空、moreCount = total（全部折叠）。
 *
 * @param items - 会话列表条目（从 sessions.list 派生）。
 * @param current - 当前会话 id（undefined 表示无当前会话）。
 * @param maxVisible - 可见气泡上限。
 * @returns { visible, moreCount }。
 */
export function selectBubbleEntries(
  items: readonly SessionListEntry[],
  current: SessionId | undefined,
  maxVisible: number,
): SelectBubbleEntriesResult {
  const filtered: BubbleEntry[] = [];
  for (const item of items) {
    if (!item.running && !item.completed) continue;
    filtered.push({
      sessionId: item.sessionId,
      title: item.title,
      running: item.running,
      completed: item.completed,
      isCurrent: item.sessionId === current,
    });
  }
  const total = filtered.length;
  const visibleCount = Math.min(Math.max(0, Math.floor(maxVisible)), total);
  const visible = filtered.slice(0, visibleCount);
  const moreCount = Math.max(0, total - visibleCount);
  return { visible, moreCount };
}
