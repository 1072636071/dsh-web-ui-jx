/**
 * session-bubble-keep-config — 保留模式配置（ADR-0022 D6，工单 01）。
 *
 * localStorage 持久化（jx-bubble-keep-* 命名轨，跨页面刷新记忆是诉求核心
 * 价值，ADR-0022 D1）：
 *   - jx-bubble-keep-enabled：总开关①「查看后保留气泡」（默认开）。关 =
 *     完全回到现状（点击即跳转即消失，无记账无投影差异）。
 *   - jx-bubble-keep-archive-enabled：开关②「拖拽归档会话」（默认开）。
 *     本片只定存取位、不做 UI 接线（工单 03）。
 *   - jx-bubble-keep-kept：单击保留记账集合（JSON string[]）。
 *   - jx-bubble-keep-dismissed：收起区记账集合（JSON string[]；手势归
 *     工单 02，本片先立集合与裁剪纪律）。
 *   - jx-bubble-keep-seen：完成见闻集（ADR-0028 决策 1，JSON string[]）——
 *     SDK completed 位是连接内活事实、刷新即失忆，跨刷新留存由本集合承担。
 *
 * 容错对齐 skin.ts / session-bubbles-config.ts：读失败回落默认（开关默认
 * 开、集合回落空集）、写失败静默（仅本次会话生效）。
 *
 * 轻量 store 对齐 session-bubbles-config.ts / overlay-settings.ts：
 *   - 布尔快照为原始值，天然稳定引用；
 *   - 集合快照必须是稳定引用——值变化才换新 Set 引用并 notify
 *    （useSyncExternalStore 按 getSnapshot 引用判定重渲染）；
 *   - prune* 仅当确有删除才写 localStorage 并通知（切断「items 变化 →
 *     prune → notify → 重渲染」的潜在写循环）。
 *
 * 审查 N8：kept/dismissed 两套平行「快照+订阅+add/remove+prune」四件套
 * 收拢为 makeIdSetStore(key) 工厂——单一实现两实例，导出面不变。
 * 审查 N7：原 deleteKept（零调用方 Speculative Generality）未随泛化迁入——
 * kept 的移除路径只有惰性裁剪 pruneKept；未来若需显式移除再按需引入。
 *
 * @module dsh-web-ui-jx/client
 */

/** 总开关①键名. */
const KEEP_ENABLED_KEY = "jx-bubble-keep-enabled";

/** 开关②键名（拖拽归档；工单 03 接线 UI）. */
const ARCHIVE_ENABLED_KEY = "jx-bubble-keep-archive-enabled";

/** kept 记账集合键名. */
const KEPT_KEY = "jx-bubble-keep-kept";

/** dismissed 记账集合键名. */
const DISMISSED_KEY = "jx-bubble-keep-dismissed";

/**
 * 完成见闻集键名（ADR-0028 决策 1/D-seen2）：客户端持久记账的完成态集合——
 * SDK completed 位是连接内活事实、刷新即失忆，跨刷新留存由本集合承担。
 */
const SEEN_KEY = "jx-bubble-keep-seen";

/** 共享空集（读失败/缺省回落，保持稳定引用）. */
const EMPTY_ID_SET: ReadonlySet<string> = new Set();

// ---------------------------------------------------------------------------
// localStorage 容错读写（读失败回落默认、写失败静默——对齐 skin.ts 模式）
// ---------------------------------------------------------------------------

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return fallback; // 脏数据回落默认
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // localStorage 不可用，静默忽略（仅本次会话生效）。
  }
}

/**
 * 读记账集合：JSON string[]；键缺失/解析失败/形状不符回落空集，
 * 数组内非字符串元素逐个忽略（脏数据容错）。
 */
function readIdSet(key: string): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY_ID_SET;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return EMPTY_ID_SET;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_ID_SET;
    const out = new Set<string>();
    for (const v of parsed) {
      if (typeof v === "string" && v.length > 0) out.add(v);
    }
    return out;
  } catch {
    return EMPTY_ID_SET;
  }
}

function writeIdSet(key: string, ids: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // 写失败静默（内存态已更新，本次会话仍生效）。
  }
}

// ---------------------------------------------------------------------------
// 内存缓存 + 订阅集（轻量 store；模块加载时初始化一次）
// ---------------------------------------------------------------------------

let cachedKeepEnabled = readBool(KEEP_ENABLED_KEY, true);
let cachedArchiveDragEnabled = readBool(ARCHIVE_ENABLED_KEY, true);

const keepListeners = new Set<() => void>();
const archiveListeners = new Set<() => void>();

// ---------------------------------------------------------------------------
// 总开关①「查看后保留气泡」
// ---------------------------------------------------------------------------

/** 读取总开关①当前值（默认开）。 */
export function getKeepEnabled(): boolean {
  return cachedKeepEnabled;
}

/**
 * 写入总开关①并持久化。幂等：值未变化时不写盘、不通知。
 * 关闭 = 投影层忽略全部记账集合（完全回到现状），集合本身保留不清除——
 * 重新打开后记忆恢复（ADR-0022 用户故事 4/6）。
 */
export function setKeepEnabled(enabled: boolean): void {
  if (enabled === cachedKeepEnabled) return;
  cachedKeepEnabled = enabled;
  writeBool(KEEP_ENABLED_KEY, enabled);
  for (const listener of keepListeners) listener();
}

/** 订阅总开关①变化（供 useSyncExternalStore）；返回取消订阅函数。 */
export function subscribeKeepEnabled(listener: () => void): () => void {
  keepListeners.add(listener);
  return () => {
    keepListeners.delete(listener);
  };
}

/** 取总开关①快照（原始布尔，稳定引用语义）。 */
export function getKeepEnabledSnapshot(): boolean {
  return cachedKeepEnabled;
}

// ---------------------------------------------------------------------------
// 开关②「拖拽归档会话」（本片只定存取位，UI 接线归工单 03）
// ---------------------------------------------------------------------------

/** 读取开关②当前值（默认开）。 */
export function getArchiveDragEnabled(): boolean {
  return cachedArchiveDragEnabled;
}

/** 写入开关②并持久化。幂等：值未变化时不写盘、不通知。 */
export function setArchiveDragEnabled(enabled: boolean): void {
  if (enabled === cachedArchiveDragEnabled) return;
  cachedArchiveDragEnabled = enabled;
  writeBool(ARCHIVE_ENABLED_KEY, enabled);
  for (const listener of archiveListeners) listener();
}

/** 订阅开关②变化（供 useSyncExternalStore）；返回取消订阅函数。 */
export function subscribeArchiveDragEnabled(listener: () => void): () => void {
  archiveListeners.add(listener);
  return () => {
    archiveListeners.delete(listener);
  };
}

/** 取开关②快照（原始布尔，稳定引用语义）。 */
export function getArchiveDragEnabledSnapshot(): boolean {
  return cachedArchiveDragEnabled;
}

// ---------------------------------------------------------------------------
// id 集合 store（审查 N8：kept/dismissed 平行四件套的共享工厂实现；
// 变更即换新 Set 引用再通知，prune 仅确有删除才写盘）
// ---------------------------------------------------------------------------

/** 单键 id 集合 store 的实例面（kept 与 dismissed 消费同一实现）. */
interface IdSetStore {
  /** 取快照（ReadonlySet<string>，值不变时引用稳定）. */
  getSnapshot(): ReadonlySet<string>;
  /** 订阅变化（供 useSyncExternalStore）；返回取消订阅函数. */
  subscribe(listener: () => void): () => void;
  /** 记入 id（幂等：已存在时不换引用不通知）. */
  add(id: string): void;
  /** 移出 id（幂等：不存在时无操作）. */
  remove(id: string): void;
  /**
   * 惰性裁剪：只保留 validIds 中的 id。仅在确有删除时写 localStorage 并
   * 通知（防止宿主列表未变时的无效写循环）；返回是否发生了裁剪.
   */
  prune(validIds: ReadonlySet<string>): boolean;
}

function makeIdSetStore(key: string): IdSetStore {
  let snapshot: ReadonlySet<string> = readIdSet(key);
  const listeners = new Set<() => void>();
  const commit = (next: ReadonlySet<string>): void => {
    snapshot = next;
    writeIdSet(key, next);
    for (const listener of listeners) listener();
  };
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

const keptStore = makeIdSetStore(KEPT_KEY);
const dismissedStore = makeIdSetStore(DISMISSED_KEY);
const seenStore = makeIdSetStore(SEEN_KEY);

// ---------------------------------------------------------------------------
// kept 记账集合（单击保留）——薄委托至 keptStore
// ---------------------------------------------------------------------------

/** 取 kept 快照（ReadonlySet<string>，值不变时引用稳定）。 */
export function getKeptSnapshot(): ReadonlySet<string> {
  return keptStore.getSnapshot();
}

/** 订阅 kept 变化（供 useSyncExternalStore）；返回取消订阅函数。 */
export function subscribeKept(listener: () => void): () => void {
  return keptStore.subscribe(listener);
}

/** 记入 kept（幂等：已存在时不换引用不通知）。 */
export function addKept(id: string): void {
  keptStore.add(id);
}

/**
 * 惰性裁剪 kept：只保留 validIds 中的 id。仅在确有删除时写 localStorage 并
 * 通知（防止宿主列表未变时的无效写循环）；返回是否发生了裁剪。
 */
export function pruneKept(validIds: ReadonlySet<string>): boolean {
  return keptStore.prune(validIds);
}

// ---------------------------------------------------------------------------
// dismissed 记账集合（收起区）——薄委托至 dismissedStore
// ---------------------------------------------------------------------------

/** 取 dismissed 快照（ReadonlySet<string>，值不变时引用稳定）。 */
export function getDismissedSnapshot(): ReadonlySet<string> {
  return dismissedStore.getSnapshot();
}

/** 订阅 dismissed 变化（供 useSyncExternalStore）；返回取消订阅函数。 */
export function subscribeDismissed(listener: () => void): () => void {
  return dismissedStore.subscribe(listener);
}

/** 记入 dismissed（幂等：已存在时不换引用不通知）。 */
export function addDismissed(id: string): void {
  dismissedStore.add(id);
}

/** 清除单条 dismissed 记账（收起区可逆语义的恢复路径；幂等）。 */
export function clearDismissed(id: string): void {
  dismissedStore.remove(id);
}

/**
 * 惰性裁剪 dismissed：只保留 validIds 中的 id。仅在确有删除时写 localStorage
 * 并通知；返回是否发生了裁剪。
 */
export function pruneDismissed(validIds: ReadonlySet<string>): boolean {
  return dismissedStore.prune(validIds);
}

// ---------------------------------------------------------------------------
// 完成见闻集（ADR-0028 决策 1/D-seen2）——薄委托至 seenStore
// ---------------------------------------------------------------------------

/** 取见闻集快照（ReadonlySet<string>，值不变时引用稳定）。 */
export function getSeenSnapshot(): ReadonlySet<string> {
  return seenStore.getSnapshot();
}

/** 订阅见闻集变化（供 useSyncExternalStore）；返回取消订阅函数。 */
export function subscribeSeen(listener: () => void): () => void {
  return seenStore.subscribe(listener);
}

/**
 * 记入见闻集（幂等：已存在时不换引用不通知）。记账时机由组件层承担：
 * 投影中观察到条目 completed === true 即提交（D-seen1）。
 */
export function addSeen(id: string): void {
  seenStore.add(id);
}

/**
 * 惰性裁剪见闻集：只保留 validIds 中的 id。仅在确有删除时写 localStorage 并
 * 通知；返回是否发生了裁剪。
 */
export function pruneSeen(validIds: ReadonlySet<string>): boolean {
  return seenStore.prune(validIds);
}
