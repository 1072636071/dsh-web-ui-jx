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

/** 全部实例的跨标签页同步回调（storage 事件按 key 分发）. */
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
