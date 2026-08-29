/**
 * persistent-setting — 持久化设置工厂（localStorage + 订阅 + 跨标签页同步）。
 *
 * 深化动机（架构审查候选者 3）：「localStorage 持久化 + 订阅通知」这一职责
 * 曾在四处各自实现且互不一致——overlay-settings 有跨标签页同步而
 * session-bubbles-config / skin 没有，容错模式与订阅签名各异。本模块把该职责
 * 收敛为一个深模块：小接口（get / set / subscribe / reload）吸收容错读写、
 * 值解析钳制、跨标签页 storage 同步与订阅通知。四处设置 = 同一工厂的四个实例。
 *
 * 接口契约：
 *   - get()：返回内存缓存值（创建时经 parse 解析持久化值，失败回落 default）。
 *   - set(value)：写 localStorage（失败静默忽略，仅本次会话生效）+ 更新缓存 +
 *     通知订阅者。
 *   - subscribe(listener)：值变化通知（同标签页 set 与跨标签页 storage 事件），
 *     返回取消订阅函数。
 *   - reload()：从 localStorage 重新读取并更新缓存（变化时通知）；初始化/恢复
 *     语义的调用点（applyFx / initSkin）用其保证读到最新持久化值。
 *
 * 跨标签页同步：所有实例共享一个 window 'storage' 监听（惰性挂载一次）；
 * 其他标签页写入本键且解析值 ≠ 当前缓存时更新并通知。
 *
 * 纯工厂模块：不依赖 React；DOM 仅触达 localStorage 与 window 事件。
 *
 * @module dsh-web-ui-jx/client
 */

/** 持久化设置实例（深模块接口：四件套）. */
export interface PersistentSetting<T> {
  /** 读取当前值（内存缓存，创建时已从持久化解析）. */
  get(): T;
  /** 写入新值：持久化（失败静默）+ 更新缓存 + 通知订阅者. */
  set(value: T): void;
  /** 订阅值变化（同标签页 set + 跨标签页 storage 事件）；返回取消订阅函数. */
  subscribe(listener: (value: T) => void): () => void;
  /** 从持久化重读（初始化/恢复用）：更新缓存，变化时通知；返回最新值. */
  reload(): T;
}

/** 工厂选项. */
export interface PersistentSettingOptions<T> {
  /** 序列化为持久化字符串（默认 String）. */
  serialize?: (value: T) => string;
  /** 从持久化字符串解析；返回 undefined 表示解析失败（回落默认值）. */
  parse?: (raw: string) => T | undefined;
  /** 键缺失 / 解析失败时的默认值. */
  default: T;
}

/**
 * 全部实例的跨标签页同步回调（storage 事件按 key 分发）。
 *
 * 约束：工厂实例**只允许模块级单例使用**（一次加载创建一个实例并持续复用）——
 * handler 注册后无移除路径，动态/循环调用工厂会累积回调。现状所有调用点
 * （keep-config / session-bubbles-config / welcome-backdrop-config / skin /
 * overlay-settings）均满足该约束；测试经 vi.resetModules() 每例重建模块，
 * 不累积。
 */
const syncHandlers = new Set<(key: string, newValue: string) => void>();

/** 惰性挂载一次的全局 storage 监听（仅浏览器环境）. */
let storageListenerInstalled = false;

function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === "undefined") return;
  storageListenerInstalled = true;
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === null || e.newValue === null) return;
    for (const handler of syncHandlers) handler(e.key, e.newValue);
  });
}

/**
 * 创建一个持久化设置实例。
 *
 * @param key - localStorage 键名。
 * @param options - 序列化 / 解析 / 默认值。
 * @returns 持久化设置实例（get / set / subscribe / reload）。
 */
export function createPersistentSetting<T>(
  key: string,
  options: PersistentSettingOptions<T>,
): PersistentSetting<T> {
  const serialize = options.serialize ?? ((value: T) => String(value));
  const parse = options.parse ?? ((raw: string) => raw as unknown as T);

  function readStored(): T {
    if (typeof window === "undefined") return options.default;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return options.default;
      const parsed = parse(raw);
      return parsed === undefined ? options.default : parsed;
    } catch {
      return options.default;
    }
  }

  let value = readStored();
  const listeners = new Set<(value: T) => void>();

  function notify(): void {
    for (const listener of listeners) listener(value);
  }

  function get(): T {
    return value;
  }

  function set(next: T): void {
    value = next;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, serialize(next));
      } catch {
        // localStorage 不可用，静默忽略（仅本次会话生效）。
      }
    }
    notify();
  }

  function subscribe(listener: (value: T) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function reload(): T {
    const next = readStored();
    if (next !== value) {
      value = next;
      notify();
    }
    return value;
  }

  // 跨标签页同步：其他标签页写入本键且解析值 ≠ 当前缓存时更新并通知。
  installStorageListener();
  syncHandlers.add((eventKey: string, newValue: string) => {
    if (eventKey !== key) return;
    const parsed = parse(newValue);
    if (parsed === undefined || parsed === value) return;
    value = parsed;
    notify();
  });

  return { get, set, subscribe, reload };
}

// ---------------------------------------------------------------------------
// 便捷构造器：布尔设置 + id 集合设置
// ---------------------------------------------------------------------------

/** 共享空集（读失败/键缺失回落，保持稳定引用）. */
const EMPTY_ID_SET: ReadonlySet<string> = new Set();

/** 集合相等判定（size + 逐成员）. */
function idSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/** 解析 JSON string[]；非数组/非法 JSON 返回 undefined（调用方回落）。 */
function tryParseIdSet(raw: string): ReadonlySet<string> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const out = new Set<string>();
  for (const v of parsed) {
    if (typeof v === "string" && v.length > 0) out.add(v);
  }
  return out;
}

/** 从 localStorage 读 id 集合；键缺失/解析失败回落共享空集（稳定引用）。 */
function readIdSetFromStorage(key: string): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY_ID_SET;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return EMPTY_ID_SET;
    return tryParseIdSet(raw) ?? EMPTY_ID_SET;
  } catch {
    return EMPTY_ID_SET;
  }
}

/** id 集合设置实例接口（useSyncExternalStore 友好：零参订阅 + 稳定快照）。 */
export interface IdSetSetting {
  /** 取快照（ReadonlySet<string>，值不变时引用稳定）。 */
  getSnapshot(): ReadonlySet<string>;
  /** 订阅变化（供 useSyncExternalStore）；返回取消订阅函数。 */
  subscribe(listener: () => void): () => void;
  /** 记入 id（幂等：已存在时不换引用不通知）。 */
  add(id: string): void;
  /** 移出 id（幂等：不存在时无操作）。 */
  remove(id: string): void;
  /**
   * 惰性裁剪：只保留 validIds 中的 id。仅在确有删除时写 localStorage 并
   * 通知；返回是否发生了裁剪。
   */
  prune(validIds: ReadonlySet<string>): boolean;
}

/**
 * 创建布尔持久化设置实例（"true"/"false" 格式，脏数据回落默认）。
 *
 * @param key - localStorage 键名。
 * @param defaultValue - 键缺失/解析失败时的默认值。
 * @returns 持久化设置实例（get / set / subscribe / reload）。
 */
export function createPersistentBoolSetting(
  key: string,
  defaultValue: boolean,
): PersistentSetting<boolean> {
  return createPersistentSetting<boolean>(key, {
    parse: (raw) => {
      if (raw === "true") return true;
      if (raw === "false") return false;
      return undefined;
    },
    default: defaultValue,
  });
}

/**
 * 创建单键 id 集合持久化设置实例（JSON string[] 格式）。
 *
 * - 快照：值不变时引用稳定（useSyncExternalStore 按引用判定重渲染）。
 * - add/remove 幂等：无变化不写盘不通知。
 * - prune 仅确有删除才写盘并通知（切断「items 变化 → prune → notify → 重渲染」
 *   的潜在写循环）。
 * - 写失败静默（内存态照常推进，仅本次会话生效）。
 * - 跨标签页同步：其他标签页写入本键且集合有变化时整体替换并通知。
 *
 * @param key - localStorage 键名。
 * @returns id 集合设置实例（getSnapshot / subscribe / add / remove / prune）。
 */
export function createPersistentIdSetSetting(key: string): IdSetSetting {
  let snapshot: ReadonlySet<string> = readIdSetFromStorage(key);
  const listeners = new Set<() => void>();

  const commit = (next: ReadonlySet<string>): void => {
    snapshot = next;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // 写失败静默（内存态已更新，本次会话仍生效）。
      }
    }
    for (const listener of listeners) listener();
  };

  // 跨标签页同步：其他标签页写入本键且集合有变化时整体替换并通知。
  installStorageListener();
  syncHandlers.add((eventKey: string, newValue: string) => {
    if (eventKey !== key) return;
    const next = tryParseIdSet(newValue);
    if (next === undefined || idSetsEqual(next, snapshot)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add(id) {
      if (snapshot.has(id)) return;
      const next = new Set(snapshot);
      next.add(id);
      commit(next);
    },
    remove(id) {
      if (!snapshot.has(id)) return;
      const next = new Set(snapshot);
      next.delete(id);
      commit(next);
    },
    prune(validIds) {
      let removed = false;
      const next = new Set<string>();
      for (const id of snapshot) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          removed = true;
        }
      }
      if (!removed) return false;
      commit(next);
      return true;
    },
  };
}
