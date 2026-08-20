/**
 * overlay-settings — 角色浮层 UI 设置（localStorage 持久化 + 订阅通知）。
 *
 * 当前设置项：
 *   - 显示姜晓状态标签（jx-state-label-visible，默认 true）
 *
 * 与 overlay-position.ts 类似的轻量 store 模式：
 *   - getShowStateLabel() / setShowStateLabel(value) 直接读写 localStorage；
 *   - subscribeShowStateLabel(listener) 在值变化时通知（同一标签页内）。
 *
 * @module dsh-web-ui-jx/client
 */

const STORAGE_KEY = "jx-state-label-visible";

function readValue(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === null || raw === "true";
}

let currentValue = readValue();
const listeners = new Set<(visible: boolean) => void>();

function notify(): void {
  for (const listener of listeners) listener(currentValue);
}

/** 读取「显示姜晓状态标签」当前值（默认 true）。 */
export function getShowStateLabel(): boolean {
  return currentValue;
}

/** 设置「显示姜晓状态标签」并持久化，同时通知所有订阅者。 */
export function setShowStateLabel(visible: boolean): void {
  currentValue = visible;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, String(visible));
  }
  notify();
}

/** 订阅状态标签可见性变化；返回取消订阅函数。 */
export function subscribeShowStateLabel(
  listener: (visible: boolean) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 初始化：监听同一标签页 localStorage 变化（保持多实例同步）。 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue !== null) {
      const next = e.newValue === "true";
      if (next !== currentValue) {
        currentValue = next;
        notify();
      }
    }
  });
}
