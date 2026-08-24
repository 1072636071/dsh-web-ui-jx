/**
 * playback-cursor — 播放游标（纯逻辑）：「计划进 → 可见项出」的推进决策。
 *
 * 职责（ADR-0016 决策 D1，工单 08-permission-anim-visible/01）：
 *   1. 结构等价门槛：新播放计划与上一计划**长度相同且各项 kind/url 逐项相同**
 *      ⇒ 视为同一计划，沿用当前进度；否则归零从新计划首段重播。
 *      必须结构比较而非裸引用比较——runtime 显示层（poke/彩蛋/并行驻留分支）
 *      每次都重建计划数组（新引用、同内容），裸引用会误判为换计划。
 *   2. 过渡段推进：按素材真实时长推进到下一项；循环态驻留不动。
 *      时长经 resolveDuration 缓存（异步解析回填）；未命中缓存时先按
 *      回退默认值起推进定时器（与既有 UI 行为一致：兜底先行、真时替换）。
 *
 * 渲染契约（ADR-0016 后果）：计划的**内容**是推进的唯一身份——任何层想强制
 * 重播一段相同计划，必须改变计划内容（如加 nonce 项），不能依赖重建数组。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。UI 经 useSyncExternalStore 订阅。
 *
 * ## 时间接缝（与 overlay-session-runtime 的差异说明）
 *
 * runtime（overlay-session-runtime）统一「注入 `now()` 截止时刻 + `__tick()` 扫描」，
 * **无真实 `setTimeout`**，测试推进 now + `__tick()` 驱动全部时间。本模块则用
 * **真实 `setTimeout`** 排程推进，注入 `now()` 仅用于 `resolveDuration` 重排时的
 * 锚定一致性，测试经 `vi.useFakeTimers` 驱动。二者并存是有意的分工，**不是缺陷**：
 *
 *   - runtime 是全浮层状态调度（防抖/彩蛋/poke/轮换，跨会话、长周期 2–5min），
 *     需要单一可注入时钟在测试里整体推进；
 *   - cursor 是 UI 侧每播放项的局部推进（当前可见项，时长 800ms–6s），真实
 *     `setTimeout` 即足够，fake timers 测试直接、无状态泄漏。
 *
 * 维护提醒：新增时间相关行为时，先判断它属于「浮层状态调度」（走 runtime 的
 * 注入时钟）还是「单个播放项的推进」（走 cursor 的 setTimeout），不要混用。
 *
 * @module dsh-web-ui-jx/client
 */

import {
  DEFAULT_TRANSITION_DURATION_MS,
  loopAssetUrl,
  type PlaybackItem,
} from "./overlay-state-machine.ts";

/** 首个计划到达前的兜底可见项（idle 循环态）。 */
const IDLE_FALLBACK: PlaybackItem = {
  kind: "loop",
  state: "idle",
  url: loopAssetUrl("idle"),
};

// ---------------------------------------------------------------------------
// 播放计划结构等价
// ---------------------------------------------------------------------------

/**
 * 判断两个播放计划是否结构等价：长度相同且各项 kind/url 逐项相同。
 *
 * 等价 ⇒ 同一计划（沿用播放进度）；不等 ⇒ 换计划（归零重播）。
 */
export function playbackPlansEqual(
  prev: readonly PlaybackItem[] | undefined,
  next: readonly PlaybackItem[],
): boolean {
  if (prev === undefined) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < next.length; i++) {
    const a = prev[i]!;
    const b = next[i]!;
    if (a.kind !== b.kind || a.url !== b.url) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 播放游标
// ---------------------------------------------------------------------------

/** 播放游标实例。 */
export interface PlaybackCursor {
  /**
   * 接收新播放计划：结构等价 ⇒ 沿用进度（幂等）；否则归零并按当前项排程推进。
   * 空计划视为无有效输出，忽略（保留现状）。
   */
  onPlan(plan: readonly PlaybackItem[]): void;
  /**
   * 异步解析完成的素材时长（null = 解析失败，落回退默认值）：
   * 写入缓存；若正等待该 url 的过渡段推进，则以完整新时长重排推进
   * （与既有 UI「兜底先行、真时替换」语义一致）。
   */
  resolveDuration(url: string, durationMs: number | null): void;
  /** 当前应渲染的项（索引钳制到末尾；对象引用稳定，适配 useSyncExternalStore）。 */
  getSnapshot(): PlaybackItem;
  /** 订阅可见项变化；返回取消订阅函数。 */
  subscribe(listener: () => void): () => void;
  /** 释放推进定时器与订阅（组件卸载时调用）。 */
  dispose(): void;
}

/** 创建播放游标的选项。 */
export interface CreatePlaybackCursorOptions {
  /**
   * 时钟注入（测试用）；默认 Date.now。游标内部以 setTimeout 排程推进，
   * 注入时钟仅用于 resolveDuration 重排时的锚定一致性。
   */
  now?: () => number;
}

/**
 * 创建播放游标。
 *
 * @param opts - 选项（now 注入测试）。
 * @returns 播放游标实例。
 */
export function createPlaybackCursor(
  opts?: CreatePlaybackCursorOptions,
): PlaybackCursor {
  const now = opts?.now ?? (() => Date.now());

  let plan: readonly PlaybackItem[] = [];
  let index = 0;
  let advanceTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  /** 正在等待推进的过渡项 url（resolveDuration 重排判定用）。 */
  let waitingUrl: string | undefined = undefined;
  /** 已解析的素材时长缓存（含失败 null，避免重复请求后重复重排）。 */
  const durationCache = new Map<string, number | null>();

  let cachedSnapshot: PlaybackItem | undefined = undefined;
  const listeners = new Set<() => void>();

  function effectiveDuration(url: string): number {
    const cached = durationCache.get(url);
    return cached ?? DEFAULT_TRANSITION_DURATION_MS;
  }

  function clearAdvanceTimer(): void {
    if (advanceTimer !== undefined) {
      clearTimeout(advanceTimer);
      advanceTimer = undefined;
    }
    waitingUrl = undefined;
  }

  function emit(): void {
    const item = currentItem();
    if (item === cachedSnapshot) return;
    cachedSnapshot = item;
    for (const listener of listeners) listener();
  }

  function currentItem(): PlaybackItem {
    if (plan.length === 0) return IDLE_FALLBACK;
    const safeIndex = Math.min(index, plan.length - 1);
    return plan[safeIndex]!;
  }

  /** 为当前项（若是过渡段）排程推进定时器。 */
  function scheduleAdvance(): void {
    clearAdvanceTimer();
    const item = currentItem();
    if (item.kind !== "transition") return; // 循环态驻留，无推进
    waitingUrl = item.url;
    advanceTimer = setTimeout(() => {
      advanceTimer = undefined;
      waitingUrl = undefined;
      index += 1;
      scheduleAdvance(); // 下一项若仍是过渡段则续排
      emit();
    }, effectiveDuration(item.url));
  }

  function onPlan(next: readonly PlaybackItem[]): void {
    if (next.length === 0) return; // 空计划忽略，保留现状
    if (playbackPlansEqual(plan, next)) return; // 同一计划：沿用进度（门槛）
    plan = next;
    index = 0;
    scheduleAdvance();
    emit();
  }

  function resolveDuration(url: string, durationMs: number | null): void {
    durationCache.set(url, durationMs);
    // 仅当正在等待该 url 的过渡推进时重排（完整新时长，自现在起重计）。
    if (waitingUrl !== url) return;
    scheduleAdvance();
  }

  function getSnapshot(): PlaybackItem {
    if (cachedSnapshot === undefined) {
      cachedSnapshot = currentItem();
    }
    return cachedSnapshot;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    clearAdvanceTimer();
    listeners.clear();
  }

  return { onPlan, resolveDuration, getSnapshot, subscribe, dispose };
}
