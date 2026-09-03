/**
 * user-name-setting — 个性化问候用户名（ADR-0034 校验 / ADR-0036 存储）。
 *
 * 深化动机（架构审查候选者 3 同族）：用户名持久化此前无落点；本模块把它收敛为
 * 「持久化 + 校验 + 响应式」三件套，供 SettingsCard 输入与 HeroHeadline 渲染
 * 共用，单一事实源。
 *
 * 存储（ADR-0036）：client 侧 `createPersistentSetting`（localStorage，来自
 * dsh-session-bubble 工厂），键名进 `STORAGE_KEYS` 单点（`jx-user-name`）；
 * 不走 host settings 分节，绕开 memory 模式（远端浏览器）host settings 不可写的
 * 问题。存储的是已校验/剥离后的干净值；空串表示「无名」。
 *
 * 校验（ADR-0034 D4）：trim 后非空才有效；上限 16 字符；剥离控制字符与换行；
 * 非法输入在输入行内提示且不写入（见 `validateUserName`）。校验为纯函数、可单测。
 *
 * 响应式（快照 store 模式）：镜像 `overlay-position.ts`——`getSnapshot` 稳定引用
 * + `subscribe`，供 `useSyncExternalStore` 订阅。字符串值不变时引用恒等
 * （`useSyncExternalStore` 按 `Object.is` 比较，字符串按值），无需额外缓存层。
 *
 * @module dsh-web-ui-jx/client
 */

import {
  createPersistentSetting,
  STORAGE_KEYS,
} from "../../packages/dsh-session-bubble/src/index.ts";

/** 用户名长度上限（ADR-0034 D4）. */
export const MAX_USER_NAME_LENGTH = 16;

/** 控制字符 + 换行 + DEL 剥离正则（\n \r \t 均落入 \x00–\x1F 范围）. */
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/g;

/**
 * 剥离控制字符与换行 + trim（ADR-0034 D4 的「剥离」半段，纯函数）。
 *
 * 不钳制长度——长度校验由 `validateUserName` 承担。emoji / CJK / 空白以外的
 * 可见字符一律保留；\u200B 之类零宽空格属控制范围，一并剥离。
 *
 * @param raw - 原始输入。
 * @returns 去控制字符并 trim 后的字符串（可能为空）。
 */
export function sanitizeUserName(raw: string): string {
  return raw.replace(CONTROL_CHARS_RE, "").trim();
}

/** 校验结果：空（清空名字，不报错，回落不带名问候）. */
export interface UserNameEmpty {
  status: "empty";
}
/** 校验结果：有效，value 为已剥离 + trim 的干净值. */
export interface UserNameValid {
  status: "valid";
  value: string;
}
/** 校验结果：超长，非法，不写入（调用方行内提示）. */
export interface UserNameTooLong {
  status: "too-long";
  max: number;
}
/** 校验结果联合. */
export type UserNameValidation =
  | UserNameEmpty
  | UserNameValid
  | UserNameTooLong;

/**
 * 校验用户名输入（ADR-0034 D4，纯函数）。
 *
 * 流程：先剥离控制字符与换行 + trim；空 → `empty`（清空名字、不报错，hero 回落
 * 不带名）；超 16 字 → `too-long`（非法输入，调用方行内提示、不写入）；否则
 * `valid`（带干净值供写入）。
 *
 * @param raw - 原始输入。
 * @returns 校验结果；`valid` 时携带已净化值。
 */
export function validateUserName(raw: string): UserNameValidation {
  const sanitized = sanitizeUserName(raw);
  if (sanitized.length === 0) return { status: "empty" };
  if (sanitized.length > MAX_USER_NAME_LENGTH) {
    return { status: "too-long", max: MAX_USER_NAME_LENGTH };
  }
  return { status: "valid", value: sanitized };
}

/** 用户名持久化实例（模块级单例，ADR-0036 / 工厂单例约束）. */
const userNameSetting = createPersistentSetting<string>(STORAGE_KEYS.userName, {
  default: "",
});

/** 用户名快照 store（响应式，useSyncExternalStore 友好）. */
export interface UserNameStore {
  /** 取当前用户名快照（已校验/剥离后的存储值；空串表示无名）. */
  getSnapshot(): string;
  /** 订阅变化；返回取消订阅函数. */
  subscribe(listener: () => void): () => void;
  /**
   * 提交用户名输入：经 `validateUserName` 校验后落地。
   *
   * - `empty` → 写空串（清空，hero 回落不带名）。
   * - `too-long` → 不写入，返回结果供调用方行内提示。
   * - `valid` → 写入已净化值，返回结果。
   *
   * @param raw - 原始输入。
   * @returns 校验结果（调用方可据 `too-long` 行内提示）。
   */
  commit(raw: string): UserNameValidation;
}

/** 用户名快照 store 单例（SettingsCard 与 HeroHeadline 共享此实例）. */
export const userNameStore: UserNameStore = {
  getSnapshot: () => userNameSetting.get(),
  subscribe: (listener) => userNameSetting.subscribe(() => listener()),
  commit(raw) {
    const result = validateUserName(raw);
    if (result.status !== "too-long") {
      // empty / valid 均写入（empty 写空串 = 显式清空，并通知订阅者）。
      userNameSetting.set(result.status === "valid" ? result.value : "");
    }
    return result;
  },
};
