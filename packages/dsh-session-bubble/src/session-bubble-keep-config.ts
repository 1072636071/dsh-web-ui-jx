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
 * 架构优化（17-02）起：持久化由 `persistent-setting.ts` 工厂承载——布尔走
 * `createPersistentBoolSetting`、集合走 `createPersistentIdSetSetting`，本模块
 * 退化为纯声明层（实例 + 薄委托，导出面不变），顺带获得跨标签页同步：其他
 * 标签页修改保留模式时本页即时生效。
 *
 * 语义保留（均由工厂构造器原生提供）：
 *   - 开关 set 幂等：值未变化时不写盘、不通知。
 *   - 集合 add/remove 幂等；prune 惰性裁剪仅确有删除才写盘并通知；
 *     写失败静默（仅本次会话生效）。
 *   - 集合快照值不变时引用稳定（useSyncExternalStore 按引用判定重渲染）。
 *
 * @module dsh-web-ui-jx/client
 */

import { STORAGE_KEYS } from "./storage-keys.ts";
import {
  createPersistentBoolSetting,
  createPersistentIdSetSetting,
} from "./persistent-setting.ts";

// ---------------------------------------------------------------------------
// 声明层：布尔开关（工厂承载持久化 / 订阅 / 跨标签页同步）
// ---------------------------------------------------------------------------

/** 总开关①「查看后保留气泡」实例（默认开）。 */
const keepEnabled = createPersistentBoolSetting(
  STORAGE_KEYS.keepEnabled,
  true,
);

/** 开关②「拖拽归档会话」实例（默认开；本片只定存取位，UI 接线归工单 03）。 */
const archiveDragEnabled = createPersistentBoolSetting(
  STORAGE_KEYS.archiveDragEnabled,
  true,
);

/** 读取总开关①当前值（默认开）。 */
export function getKeepEnabled(): boolean {
  return keepEnabled.get();
}

/**
 * 写入总开关①并持久化。幂等：值未变化时不写盘、不通知。
 * 关闭 = 投影层忽略全部记账集合（完全回到现状），集合本身保留不清除——
 * 重新打开后记忆恢复（ADR-0022 用户故事 4/6）。
 */
export function setKeepEnabled(enabled: boolean): void {
  if (enabled === keepEnabled.get()) return;
  keepEnabled.set(enabled);
}

/** 订阅总开关①变化（供 useSyncExternalStore）；返回取消订阅函数。 */
export function subscribeKeepEnabled(listener: () => void): () => void {
  return keepEnabled.subscribe(() => listener());
}

/** 取总开关①快照（原始布尔，稳定引用语义）。 */
export function getKeepEnabledSnapshot(): boolean {
  return keepEnabled.get();
}

/** 读取开关②当前值（默认开）。 */
export function getArchiveDragEnabled(): boolean {
  return archiveDragEnabled.get();
}

/** 写入开关②并持久化。幂等：值未变化时不写盘、不通知。 */
export function setArchiveDragEnabled(enabled: boolean): void {
  if (enabled === archiveDragEnabled.get()) return;
  archiveDragEnabled.set(enabled);
}

/** 订阅开关②变化（供 useSyncExternalStore）；返回取消订阅函数。 */
export function subscribeArchiveDragEnabled(listener: () => void): () => void {
  return archiveDragEnabled.subscribe(() => listener());
}

/** 取开关②快照（原始布尔，稳定引用语义）。 */
export function getArchiveDragEnabledSnapshot(): boolean {
  return archiveDragEnabled.get();
}

// ---------------------------------------------------------------------------
// 声明层：id 集合记账（kept / dismissed / seen）
// ---------------------------------------------------------------------------

/** kept 记账集合（单击保留）——工厂 id 集合实例。 */
const keptStore = createPersistentIdSetSetting(STORAGE_KEYS.kept);

/** dismissed 记账集合（收起区）——工厂 id 集合实例。 */
const dismissedStore = createPersistentIdSetSetting(STORAGE_KEYS.dismissed);

/** 完成见闻集（ADR-0028 决策 1/D-seen2）——工厂 id 集合实例。 */
const seenStore = createPersistentIdSetSetting(STORAGE_KEYS.seen);

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
