/**
 * session-bubbles-config — 会话气泡数量上限配置（ADR-0007 决策 5）。
 *
 * 读写 localStorage('jx-max-session-bubbles')，默认 10，钳制 [1,10]。
 *
 * 架构审查候选者 3 起：持久化 / 订阅 / 跨标签页同步统一由
 * `persistent-setting.ts` 工厂承载（此前本模块缺失跨标签页同步，与
 * overlay-settings 不一致）；钳制在 parse 中完成，越界 / 非法输入回落默认。
 *
 * @module dsh-web-ui-jx/client
 */

import { createPersistentSetting } from "./persistent-setting.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";

/** 默认上限（ADR-0007 决策 5，后调整为 10）. */
export const DEFAULT_MAX_SESSION_BUBBLES = 10;

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

/** 解析持久化值：数字解析 + 钳制；非法输入回落默认（工厂语义）. */
function parseMax(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_SESSION_BUBBLES;
  return clampMaxSessionBubbles(parsed);
}

/** 上限设置实例（工厂承载持久化 / 订阅 / 跨标签页同步）. */
const maxSessionBubbles = createPersistentSetting<number>(
  STORAGE_KEYS.maxSessionBubbles,
  {
  parse: parseMax,
  default: DEFAULT_MAX_SESSION_BUBBLES,
});

/**
 * 读取会话气泡数量上限。
 *
 * 容错：localStorage 不可用、键缺失、解析失败、越界均回落默认 10（工厂语义）。
 *
 * @returns 钳制到 [1,10] 的上限值。
 */
export function getMaxSessionBubbles(): number {
  return maxSessionBubbles.get();
}

/**
 * 写入会话气泡数量上限。
 *
 * 钳制到 [1,10] 后写入 localStorage（不可用时静默忽略）并通知订阅者
 * （SessionBubbleList 即时生效，ADR-0007 决策 5「上限变化即时生效」）。
 *
 * @param value - 待写入值（越界自动钳制）。
 * @returns 钳制后实际写入的值（供调用方即时更新视图状态）。
 */
export function setMaxSessionBubbles(value: number): number {
  const clamped = clampMaxSessionBubbles(value);
  maxSessionBubbles.set(clamped);
  return clamped;
}

// ---------------------------------------------------------------------------
// 订阅 / 快照（直接桥接工厂：number 原始值天然稳定，无第二层 store）
// ---------------------------------------------------------------------------

/**
 * 订阅上限变化（供 useSyncExternalStore；工厂值参订阅桥接为零参）。
 *
 * @param listener - 变化回调。
 * @returns 取消订阅函数。
 */
export function subscribeMaxSessionBubbles(listener: () => void): () => void {
  return maxSessionBubbles.subscribe(() => listener());
}

/**
 * 取当前上限快照（供 useSyncExternalStore，number 原始值稳定语义）。
 *
 * @returns 钳制到 [1,10] 的上限值。
 */
export function getMaxSessionBubblesSnapshot(): number {
  return maxSessionBubbles.get();
}
