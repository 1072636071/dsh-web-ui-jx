/**
 * session-bubbles-config — 会话气泡数量上限配置（ADR-0007 决策 5）。
 *
 * 读写 localStorage('jx-max-session-bubbles')，默认 5，钳制 [1,10]。
 * 容错对齐 skin.ts / overlay-position.ts：读失败回落默认、写失败静默忽略。
 *
 * @module dsh-web-ui-jx/client
 */

/** localStorage 键名（对齐 jx-skin / jx-fx / jx-overlay-pos 命名）. */
const STORAGE_KEY = "jx-max-session-bubbles";

/** 默认上限（ADR-0007 决策 5）. */
export const DEFAULT_MAX_SESSION_BUBBLES = 5;

/** 上限下界. */
export const MIN_MAX_SESSION_BUBBLES = 1;

/** 上限上界. */
export const MAX_MAX_SESSION_BUBBLES = 10;

/**
 * 把任意值钳制到 [1,10] 整数。
 *
 * @param value - 待钳制值。
 * @returns 钳制后的整数（1..10）。
 */
export function clampMaxSessionBubbles(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_SESSION_BUBBLES;
  const rounded = Math.round(value);
  return Math.min(
    MAX_MAX_SESSION_BUBBLES,
    Math.max(MIN_MAX_SESSION_BUBBLES, rounded),
  );
}

/**
 * 读取会话气泡数量上限。
 *
 * 容错：localStorage 不可用、键缺失、解析失败、越界均回落默认 5。
 * 对齐 skin.ts 的 try/catch 静默忽略模式。
 *
 * @returns 钳制到 [1,10] 的上限值。
 */
export function getMaxSessionBubbles(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_MAX_SESSION_BUBBLES;
    const parsed = Number(raw);
    return clampMaxSessionBubbles(parsed);
  } catch {
    return DEFAULT_MAX_SESSION_BUBBLES;
  }
}

/**
 * 写入会话气泡数量上限。
 *
 * 钳制到 [1,10] 后写入 localStorage。容错：localStorage 不可用时静默忽略。
 * 写入后通知订阅者（SessionBubbleList 即时生效，ADR-0007 决策 5「上限变化即时生效」）。
 *
 * @param value - 待写入值（越界自动钳制）。
 * @returns 钳制后实际写入的值（供调用方即时更新视图状态）。
 */
export function setMaxSessionBubbles(value: number): number {
  const clamped = clampMaxSessionBubbles(value);
  try {
    localStorage.setItem(STORAGE_KEY, String(clamped));
  } catch {
    // localStorage 不可用，静默忽略（仅本次会话生效）。
  }
  notifyMaxSessionBubbles(clamped);
  return clamped;
}

// ---------------------------------------------------------------------------
// 轻量 store（供 SessionBubbleList useSyncExternalStore 订阅，即时生效）
// ---------------------------------------------------------------------------

let cachedMax = getMaxSessionBubbles();
const maxListeners = new Set<() => void>();

function notifyMaxSessionBubbles(value: number): void {
  if (value === cachedMax) return;
  cachedMax = value;
  for (const listener of maxListeners) listener();
}

/**
 * 订阅上限变化（供 useSyncExternalStore）。
 *
 * @param listener - 变化回调。
 * @returns 取消订阅函数。
 */
export function subscribeMaxSessionBubbles(listener: () => void): () => void {
  maxListeners.add(listener);
  return () => {
    maxListeners.delete(listener);
  };
}

/**
 * 取当前上限快照（供 useSyncExternalStore，稳定值语义）。
 *
 * @returns 钳制到 [1,10] 的上限值。
 */
export function getMaxSessionBubblesSnapshot(): number {
  return cachedMax;
}
