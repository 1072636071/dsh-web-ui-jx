/**
 * overlay-settings — 角色浮层 UI 设置（持久化设置工厂实例）。
 *
 * 当前设置项：
 *   - 显示姜晓状态标签（jx-state-label-visible，默认 true）
 *   - 动作轮换（jx-variant-rotation，默认 true；ADR-0013 D7）
 *
 * 架构审查候选者 3 起：持久化 / 订阅 / 跨标签页同步统一由
 * `persistent-setting.ts` 工厂承载，本模块只声明两个布尔设置实例并导出
 * 既有具名接口（调用方与测试不感知工厂存在）。
 *
 * @module dsh-web-ui-jx/client
 */

import { createPersistentSetting } from "../../../packages/dsh-session-bubble/src/index.ts";

/** 布尔解析：仅接受 "true"/"false"，其余视为解析失败（回落默认值）. */
function parseBool(raw: string): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

/** 「显示姜晓状态标签」设置实例（默认 true）. */
const showStateLabel = createPersistentSetting<boolean>(
  "jx-state-label-visible",
  { parse: parseBool, default: true },
);

/** 「动作轮换」设置实例（默认 true，ADR-0013 D7）. */
const variantRotation = createPersistentSetting<boolean>(
  "jx-variant-rotation",
  { parse: parseBool, default: true },
);

/** 读取「显示姜晓状态标签」当前值（默认 true）。 */
export function getShowStateLabel(): boolean {
  return showStateLabel.get();
}

/** 设置「显示姜晓状态标签」并持久化，同时通知所有订阅者。 */
export function setShowStateLabel(visible: boolean): void {
  showStateLabel.set(visible);
}

/** 订阅状态标签可见性变化；返回取消订阅函数。 */
export function subscribeShowStateLabel(
  listener: (visible: boolean) => void,
): () => void {
  return showStateLabel.subscribe(listener);
}

/** 读取「动作轮换」当前值（默认 true，ADR-0013 D7）。 */
export function getVariantRotationEnabled(): boolean {
  return variantRotation.get();
}

/** 设置「动作轮换」并持久化，同时通知所有订阅者。 */
export function setVariantRotationEnabled(enabled: boolean): void {
  variantRotation.set(enabled);
}

/** 订阅动作轮换开关变化；返回取消订阅函数。 */
export function subscribeVariantRotationEnabled(
  listener: (enabled: boolean) => void,
): () => void {
  return variantRotation.subscribe(listener);
}
