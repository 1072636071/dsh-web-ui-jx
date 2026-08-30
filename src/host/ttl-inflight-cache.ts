/**
 * 短 TTL + in-flight 去重的模块级结果缓存（host 半区共享，工单 20-02 / 20-03）。
 *
 * 抽象「按 key 的结果缓存 + 并发去重」这一对高度重复的结构，供 host 路由缓存复用。
 * 能力：
 *   - `get/set`：按 key 短 TTL 缓存（命中未过期返回；过期即视为 miss）；
 *   - `pending/setPending/clearPending`：in-flight Promise 去重（同 key 并发共享
 *     一次计算）；
 *   - `invalidate(key?)`：失效缓存与 in-flight（ADR-0017 清理入口 + 手动联动失效）；
 *   - 条目上限（LRU 淘汰，默认 1000）——host 缓存同样有界，不随 key churn 单调膨胀。
 *
 * 时钟经 `now` 注入（默认 Date.now），测试可注入以控制 TTL 过期。
 *
 * @module dsh-web-ui-jx/host
 */

/** 共享缓存选项. */
export interface TtlInflightCacheOptions {
  /** 缓存 TTL ms。 */
  readonly ttlMs: number;
  /** 条目上限（LRU 淘汰；Map 首个键即最久未用）；默认 1000. */
  readonly maxEntries?: number;
  /** 时钟（默认 Date.now；测试可注入控制过期）. */
  readonly now?: () => number;
}

/** 共享缓存实例. */
export interface TtlInflightCache<TPayload> {
  /** 命中未过期缓存返回载荷；未命中/过期返回 undefined（调用方计算后 set）. */
  readonly get: (key: string) => TPayload | undefined;
  /** 写入/更新缓存，并 LRU 淘汰超出上限的最久未用条目。 */
  readonly set: (key: string, value: TPayload) => void;
  /** 返回该 key 的 in-flight promise（无则 undefined，调用方注册后即共享）. */
  readonly pending: (key: string) => Promise<TPayload> | undefined;
  /** 注册该 key 的计算中 promise（供并发请求共享）。 */
  readonly setPending: (key: string, promise: Promise<TPayload>) => void;
  /** 结束该 key 的 in-flight（finally 调用）。 */
  readonly clearPending: (key: string) => void;
  /** 失效单个 key 或全部（key 缺省清空；ADR-0017 清理入口）. */
  readonly invalidate: (key?: string) => void;
}

/** 实例化一个短 TTL + in-flight 去重的结果缓存。 */
export function createTtlInflightCache<TPayload>(
  options: TtlInflightCacheOptions,
): TtlInflightCache<TPayload> {
  const ttlMs = options.ttlMs;
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 1000;
  const cache = new Map<string, { expiresAt: number; value: TPayload }>();
  const inflight = new Map<string, Promise<TPayload>>();

  return {
    get(key) {
      const entry = cache.get(key);
      return entry !== undefined && entry.expiresAt > now()
        ? entry.value
        : undefined;
    },
    set(key, value) {
      cache.delete(key);
      cache.set(key, { expiresAt: now() + ttlMs, value });
      while (cache.size > maxEntries) {
        const oldest = cache.keys().next();
        if (oldest.done) break;
        cache.delete(oldest.value);
      }
    },
    pending(key) {
      return inflight.get(key);
    },
    setPending(key, promise) {
      inflight.set(key, promise);
    },
    clearPending(key) {
      inflight.delete(key);
    },
    invalidate(key) {
      if (key === undefined) {
        cache.clear();
        inflight.clear();
        return;
      }
      cache.delete(key);
      inflight.delete(key);
    },
  };
}