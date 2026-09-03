/**
 * greeting-enabled — 个性化问候总开关（ADR-0036 附带决策 D8）。
 *
 * 深化动机（本工单）：「是否启用个性化问候」此前无落点；本模块把它收敛为
 * 「持久化 + 响应式」双件套，供 SettingsCard 开关、HeroHeadline 渲染判定、
 * 与新建会话台词判定三处共用，单一事实源。
 *
 * 存储（ADR-0036 D8/D10）：client 侧 `createPersistentSetting`（localStorage，
 * 来自 dsh-session-bubble 工厂），键名进 `STORAGE_KEYS` 单点（`jx-greeting-enabled`）；
 * 默认开（开 = 个性化问候生效）。
 *
 * 响应式（快照 store 模式）：镜像 `overlay-position.ts` / `userNameStore`——
 * `getSnapshot` 稳定引用（布尔值按值相等）+ `subscribe`，供 `useSyncExternalStore`
 * 订阅。开关翻转立即经订阅者反映到 hero 与台词判定。
 *
 * @module dsh-web-ui-jx/client
 */

import {
  createPersistentSetting,
  STORAGE_KEYS,
} from "../../packages/dsh-session-bubble/src/index.ts";

/** 个性化问候总开关持久化实例（模块级单例，ADR-0036 / 工厂单例约束）. */
const greetingEnabledSetting = createPersistentSetting<boolean>(
  STORAGE_KEYS.greetingEnabled,
  {
    serialize: (value) => (value ? "true" : "false"),
    parse: (raw) => {
      if (raw === "true") return true;
      if (raw === "false") return false;
      return undefined; // 脏数据回落默认（开）
    },
    default: true, // 默认开（ADR-0036 D8）
  },
);

/** 个性化问候开关快照 store（响应式，useSyncExternalStore 友好）. */
export interface GreetingEnabledStore {
  /** 取当前开关快照（布尔值，值不变时按 Object.is 恒等）. */
  getSnapshot(): boolean;
  /** 订阅变化；返回取消订阅函数. */
  subscribe(listener: () => void): () => void;
  /** 设置开关（即时生效 + 持久化 + 通知订阅者）. */
  set(enabled: boolean): void;
}

/** 个性化问候开关快照 store 单例（SettingsCard / HeroHeadline / 台词判定共享）. */
export const greetingEnabledStore: GreetingEnabledStore = {
  getSnapshot: () => greetingEnabledSetting.get(),
  subscribe: (listener) => greetingEnabledSetting.subscribe(() => listener()),
  set(enabled: boolean) {
    greetingEnabledSetting.set(enabled);
  },
};

/** 读取个性化问候开关（便捷只读入口）. */
export function getGreetingEnabled(): boolean {
  return greetingEnabledSetting.get();
}

/** 设置个性化问候开关（便捷写入入口，即时生效 + 持久化）. */
export function setGreetingEnabled(enabled: boolean): void {
  greetingEnabledSetting.set(enabled);
}
