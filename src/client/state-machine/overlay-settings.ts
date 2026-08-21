/**
 * overlay-settings — 角色浮层 UI 设置（localStorage 持久化 + 订阅通知）。
 *
 * 当前设置项：
 *   - 显示姜晓状态标签（jx-state-label-visible，默认 true）
 *   - 动作轮换（jx-variant-rotation，默认 true；ADR-0013 D7）
 *
 * 与 overlay-position.ts 类似的轻量 store 模式：
 *   - getter/setter 直接读写 localStorage；
 *   - subscribe 在值变化时通知（同一标签页内 + 跨标签页 storage 事件）。
 *
 * @module dsh-web-ui-jx/client
 */

/** 设置键. */
type SettingsKey = "jx-state-label-visible" | "jx-variant-rotation";

/** 单项布尔设置的内存态 + 订阅集. */
interface BoolSetting {
  value: boolean;
  listeners: Set<(value: boolean) => void>;
}

function readValue(key: SettingsKey, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  return raw === null ? fallback : raw === "true";
}

/** 创建设置项注册表. */
function createSettings(): Record<SettingsKey, BoolSetting> {
  return {
    "jx-state-label-visible": {
      value: readValue("jx-state-label-visible", true),
      listeners: new Set(),
    },
    "jx-variant-rotation": {
      value: readValue("jx-variant-rotation", true),
      listeners: new Set(),
    },
  };
}

const settings = createSettings();

function notify(key: SettingsKey): void {
  const entry = settings[key];
  for (const listener of entry.listeners) listener(entry.value);
}

function setValue(key: SettingsKey, value: boolean): void {
  settings[key].value = value;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, String(value));
  }
  notify(key);
}

function subscribe(
  key: SettingsKey,
  listener: (value: boolean) => void,
): () => void {
  settings[key].listeners.add(listener);
  return () => {
    settings[key].listeners.delete(listener);
  };
}

/** 读取「显示姜晓状态标签」当前值（默认 true）。 */
export function getShowStateLabel(): boolean {
  return settings["jx-state-label-visible"].value;
}

/** 设置「显示姜晓状态标签」并持久化，同时通知所有订阅者。 */
export function setShowStateLabel(visible: boolean): void {
  setValue("jx-state-label-visible", visible);
}

/** 订阅状态标签可见性变化；返回取消订阅函数。 */
export function subscribeShowStateLabel(
  listener: (visible: boolean) => void,
): () => void {
  return subscribe("jx-state-label-visible", listener);
}

/** 读取「动作轮换」当前值（默认 true，ADR-0013 D7）。 */
export function getVariantRotationEnabled(): boolean {
  return settings["jx-variant-rotation"].value;
}

/** 设置「动作轮换」并持久化，同时通知所有订阅者。 */
export function setVariantRotationEnabled(enabled: boolean): void {
  setValue("jx-variant-rotation", enabled);
}

/** 订阅动作轮换开关变化；返回取消订阅函数。 */
export function subscribeVariantRotationEnabled(
  listener: (enabled: boolean) => void,
): () => void {
  return subscribe("jx-variant-rotation", listener);
}

/** 初始化：监听同一标签页 localStorage 变化（保持多实例同步）。 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === null || e.newValue === null) return;
    if (e.key !== "jx-state-label-visible" && e.key !== "jx-variant-rotation") {
      return;
    }
    const key = e.key as SettingsKey;
    const next = e.newValue === "true";
    if (next !== settings[key].value) {
      settings[key].value = next;
      notify(key);
    }
  });
}
