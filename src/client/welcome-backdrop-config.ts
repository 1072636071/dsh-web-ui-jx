/**
 * welcome-backdrop-config — 欢迎背景配置（ADR-0024 D3）。
 *
 * 架构优化（17-03）起：持久化 / 订阅 / 跨标签页同步统一由
 * `persistent-setting.ts` 工厂承载（此前 9 项配置各自裸触 localStorage，缺失
 * 跨标签页同步，与 skin / overlay-settings 不一致）。本模块退化为声明层：9 个
 * 工厂实例（总开关 1 + 不透明度 3 + 区域 alpha 5）+ subscribeBackdrop 桥接
 * （任一实例变化即通知共享订阅者）。
 *
 * 存储格式（既有契约，零迁移）：
 *   - 总开关：'jx-backdrop'（'on'/'off'，默认 on）
 *   - 壁纸不透明度：'jx-backdrop-wall'（0–100 整数，默认 100）
 *   - 面板不透明度：'jx-backdrop-panel'（0–100 整数，默认 50）
 *   - 压暗浓度：'jx-backdrop-veil'（0–100 整数，默认 25）
 *   - 五区域 alpha：'jx-backdrop-sidebar/input/bubble/tip/selector'
 *     （0–100 整数，默认 50）
 *
 * 面板不透明度驱动 L2 的 --jx-panel-alpha（jiangxiao.css 中 --jx-surface-*
 * 以 rgb(R G B / var(--jx-panel-alpha)) 形态消费）；壁纸不透明度驱动背景层
 * 图片元素的 alpha；压暗浓度驱动压纱层（veil）的 alpha。三滑杆仅在总开关
 * 开启时生效（UI 禁用 + 运行时不挂层）。
 *
 * @module dsh-web-ui-jx/client
 */

import { createPersistentSetting } from "../../packages/dsh-session-bubble/src/index.ts";

/** 总开关 localStorage 键名（对齐 jx-skin 命名）。 */
const ENABLED_KEY = "jx-backdrop";

/** 壁纸不透明度 localStorage 键名。 */
const WALL_OPACITY_KEY = "jx-backdrop-wall";

/** 面板不透明度 localStorage 键名。 */
const PANEL_OPACITY_KEY = "jx-backdrop-panel";

/** 压暗浓度 localStorage 键名。 */
const VEIL_OPACITY_KEY = "jx-backdrop-veil";

/** 侧栏区域 alpha localStorage 键名。 */
const SIDEBAR_ALPHA_KEY = "jx-backdrop-sidebar";

/** 输入栏区域 alpha localStorage 键名。 */
const INPUT_ALPHA_KEY = "jx-backdrop-input";

/** 用户气泡区域 alpha localStorage 键名。 */
const BUBBLE_ALPHA_KEY = "jx-backdrop-bubble";

/** 目标/Todo/Queue 卡区域 alpha localStorage 键名。 */
const TIP_ALPHA_KEY = "jx-backdrop-tip";

/** 附件钮区域 alpha localStorage 键名。 */
const SELECTOR_ALPHA_KEY = "jx-backdrop-selector";

/** 总开关默认值（ADR-0024 D3：默认开）。 */
export const DEFAULT_BACKDROP_ENABLED = true;

/** 壁纸不透明度默认值（%，ADR-0024 D3：默认完全不透明以最大化壁纸可见度）。 */
export const DEFAULT_WALL_OPACITY = 100;

/** 面板不透明度默认值（%，ADR-0024 D3：偏透以让壁纸透出）。 */
export const DEFAULT_PANEL_OPACITY = 50;

/** 压暗浓度默认值（%，深色叠暗纱 / 浅色叠白纱，ADR-0024 D3 中间偏淡档）。 */
export const DEFAULT_VEIL_OPACITY = 25;

/** 五区域 alpha 默认值（%，ADR-0025 D4：与全局面板默认一致）。 */
export const DEFAULT_REGION_ALPHA = 50;

/** 不透明度下界（%，0 = 完全透明）。 */
export const MIN_BACKDROP_OPACITY = 0;

/** 不透明度上界（%，100 = 完全不透明）。 */
export const MAX_BACKDROP_OPACITY = 100;

/**
 * 把任意值钳制到 [0,100] 整数（非有限数回落默认）。
 *
 * @param value - 待钳制值。
 * @param fallback - 非有限数时的回落值。
 * @returns 钳制后的整数（0..100）。
 */
export function clampBackdropOpacity(
  value: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return Math.min(
    MAX_BACKDROP_OPACITY,
    Math.max(MIN_BACKDROP_OPACITY, rounded),
  );
}

/** 不透明度 parse（工厂语义：非法/非有限数返回 undefined 回落默认）。 */
function parseOpacity(fallback: number): (raw: string) => number | undefined {
  return (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? clampBackdropOpacity(n, fallback) : undefined;
  };
}

/** 总开关设置实例（"on"/"off" 格式，默认开，ADR-0024 D3）。 */
const backdropEnabled = createPersistentSetting<boolean>(ENABLED_KEY, {
  parse: (raw) => {
    if (raw === "on") return true;
    if (raw === "off") return false;
    return undefined;
  },
  default: DEFAULT_BACKDROP_ENABLED,
});

/** 壁纸不透明度设置实例（%）。 */
const wallOpacity = createPersistentSetting<number>(WALL_OPACITY_KEY, {
  parse: parseOpacity(DEFAULT_WALL_OPACITY),
  default: DEFAULT_WALL_OPACITY,
});

/** 面板不透明度设置实例（%）。 */
const panelOpacity = createPersistentSetting<number>(PANEL_OPACITY_KEY, {
  parse: parseOpacity(DEFAULT_PANEL_OPACITY),
  default: DEFAULT_PANEL_OPACITY,
});

/** 压暗浓度设置实例（%）。 */
const veilOpacity = createPersistentSetting<number>(VEIL_OPACITY_KEY, {
  parse: parseOpacity(DEFAULT_VEIL_OPACITY),
  default: DEFAULT_VEIL_OPACITY,
});

/** 区域 alpha 设置工厂（ADR-0025 D1：五区域共用读写/钳制/通知模式）。 */
function createRegionSetting(key: string) {
  return createPersistentSetting<number>(key, {
    parse: parseOpacity(DEFAULT_REGION_ALPHA),
    default: DEFAULT_REGION_ALPHA,
  });
}

const sidebarAlpha = createRegionSetting(SIDEBAR_ALPHA_KEY);
const inputAlpha = createRegionSetting(INPUT_ALPHA_KEY);
const bubbleAlpha = createRegionSetting(BUBBLE_ALPHA_KEY);
const tipAlpha = createRegionSetting(TIP_ALPHA_KEY);
const selectorAlpha = createRegionSetting(SELECTOR_ALPHA_KEY);

/** 全部设置实例（桥接订阅 / 重读共用）。 */
const ALL_SETTINGS = [
  backdropEnabled,
  wallOpacity,
  panelOpacity,
  veilOpacity,
  sidebarAlpha,
  inputAlpha,
  bubbleAlpha,
  tipAlpha,
  selectorAlpha,
];

// ---------------------------------------------------------------------------
// 配置读写（薄委托至工厂实例；setXxx 保持返回钳制后实际值的既有契约）
// ---------------------------------------------------------------------------

/** 读取欢迎背景总开关（默认开）。 */
export function getBackdropEnabled(): boolean {
  return backdropEnabled.get();
}

/** 写入欢迎背景总开关并持久化（"on"/"off"）。 */
export function setBackdropEnabled(enabled: boolean): void {
  backdropEnabled.set(enabled);
}

/** 读取壁纸不透明度（%，钳制 0–100，默认 100）。 */
export function getWallOpacity(): number {
  return wallOpacity.get();
}

/**
 * 写入壁纸不透明度（越界自动钳制）并持久化。
 *
 * @returns 钳制后实际写入的值（供调用方即时更新视图状态）。
 */
export function setWallOpacity(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_WALL_OPACITY);
  wallOpacity.set(clamped);
  return clamped;
}

/** 读取面板不透明度（%，钳制 0–100，默认 50）。 */
export function getPanelOpacity(): number {
  return panelOpacity.get();
}

/** 写入面板不透明度（越界自动钳制）并持久化，返回实际写入值。 */
export function setPanelOpacity(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_PANEL_OPACITY);
  panelOpacity.set(clamped);
  return clamped;
}

/** 读取压暗浓度（%，钳制 0–100，默认 25）。 */
export function getVeilOpacity(): number {
  return veilOpacity.get();
}

/**
 * 写入压暗浓度（越界自动钳制）并持久化，返回实际写入值。
 *
 * 该值驱动压纱层（veil）的 alpha：深色主题叠暗纱、浅色主题叠白纱，
 * 浓度越高纱越厚、文字对比越强、壁纸越被压暗。
 */
export function setVeilOpacity(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_VEIL_OPACITY);
  veilOpacity.set(clamped);
  return clamped;
}

/** 读取侧栏区域 alpha（%，钳制 0–100，默认 50）。 */
export function getSidebarAlpha(): number {
  return sidebarAlpha.get();
}

/** 写入侧栏区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setSidebarAlpha(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_REGION_ALPHA);
  sidebarAlpha.set(clamped);
  return clamped;
}

/** 读取输入栏区域 alpha（%，钳制 0–100，默认 50）。 */
export function getInputAlpha(): number {
  return inputAlpha.get();
}

/** 写入输入栏区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setInputAlpha(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_REGION_ALPHA);
  inputAlpha.set(clamped);
  return clamped;
}

/** 读取用户气泡区域 alpha（%，钳制 0–100，默认 50）。 */
export function getBubbleAlpha(): number {
  return bubbleAlpha.get();
}

/** 写入用户气泡区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setBubbleAlpha(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_REGION_ALPHA);
  bubbleAlpha.set(clamped);
  return clamped;
}

/** 读取目标/Todo/Queue 卡区域 alpha（%，钳制 0–100，默认 50）。 */
export function getTipAlpha(): number {
  return tipAlpha.get();
}

/** 写入目标/Todo/Queue 卡区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setTipAlpha(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_REGION_ALPHA);
  tipAlpha.set(clamped);
  return clamped;
}

/** 读取附件钮区域 alpha（%，钳制 0–100，默认 50）。 */
export function getSelectorAlpha(): number {
  return selectorAlpha.get();
}

/** 写入附件钮区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setSelectorAlpha(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_REGION_ALPHA);
  selectorAlpha.set(clamped);
  return clamped;
}

// ---------------------------------------------------------------------------
// 轻量 store（背景层 runtime 与 SettingsCard 订阅，任一配置项变化即通知）
// ---------------------------------------------------------------------------

const backdropListeners = new Set<() => void>();

/** 通知所有订阅者（任一设置实例变化后调用；订阅方自行重读快照）。 */
function notifyBackdropListeners(): void {
  for (const listener of backdropListeners) listener();
}

/** 桥接：任一设置实例变化即转发共享订阅者（含跨标签页同步触发的变化）。 */
for (const setting of ALL_SETTINGS) {
  setting.subscribe(notifyBackdropListeners);
}

/**
 * 订阅欢迎背景配置变化（供背景层 runtime 与 useSyncExternalStore）。
 *
 * @param listener - 变化回调。
 * @returns 取消订阅函数。
 */
export function subscribeBackdrop(listener: () => void): () => void {
  backdropListeners.add(listener);
  return () => {
    backdropListeners.delete(listener);
  };
}

/**
 * 从持久化重读全部设置（初始化/恢复语义，对齐 initSkin）。
 *
 * 工厂实例是内存缓存，初始化一次后经 get() 读缓存；本函数供 apply 入口或
 * 测试（清 localStorage 后）重置缓存以对齐持久化状态。
 */
export function reloadBackdropConfig(): void {
  for (const setting of ALL_SETTINGS) {
    setting.reload();
  }
}
