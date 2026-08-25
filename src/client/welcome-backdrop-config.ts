/**
 * welcome-backdrop-config — 欢迎背景配置（ADR-0024 D3）。
 *
 * 四个持久化项，均读写 localStorage('jx-*')，容错对齐 skin.ts /
 * session-bubbles-config.ts：读失败回落默认、写失败静默忽略。
 *   - 总开关：'jx-backdrop'（'on'/'off'，默认 on）
 *   - 壁纸不透明度：'jx-backdrop-wall'（0–100 整数，默认 100）
 *   - 面板不透明度：'jx-backdrop-panel'（0–100 整数，默认 50）
 *   - 压暗浓度：'jx-backdrop-veil'（0–100 整数，默认 25；深色叠暗纱/浅色叠白纱）
 *
 * 面板不透明度驱动 L2 的 --jx-panel-alpha（jiangxiao.css 中 --jx-surface-*
 * 以 rgb(R G B / var(--jx-panel-alpha)) 形态消费）；壁纸不透明度驱动背景层
 * 图片元素的 alpha；压暗浓度驱动压纱层（veil）的 alpha。三滑杆仅在总开关
 * 开启时生效（UI 禁用 + 运行时不挂层）。
 *
 * @module dsh-web-ui-jx/client
 */

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

/**
 * 读取欢迎背景总开关（默认开）。
 *
 * @returns true = 开启。
 */
export function getBackdropEnabled(): boolean {
  try {
    const stored = localStorage.getItem(ENABLED_KEY);
    if (stored === "off") return false;
    if (stored === "on") return true;
  } catch {
    // localStorage 不可用，回退默认。
  }
  return DEFAULT_BACKDROP_ENABLED;
}

/**
 * 写入欢迎背景总开关并持久化。
 *
 * @param enabled - 开/关。
 */
export function setBackdropEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "on" : "off");
  } catch {
    // localStorage 不可用，静默忽略（仅本次会话生效）。
  }
  notifyBackdropListeners();
}

/**
 * 读取壁纸不透明度（%，钳制 0–100，默认 85）。
 *
 * @returns 0–100 整数。
 */
export function getWallOpacity(): number {
  try {
    const raw = localStorage.getItem(WALL_OPACITY_KEY);
    if (raw === null) return DEFAULT_WALL_OPACITY;
    return clampBackdropOpacity(Number(raw), DEFAULT_WALL_OPACITY);
  } catch {
    return DEFAULT_WALL_OPACITY;
  }
}

/**
 * 写入壁纸不透明度（越界自动钳制）并持久化。
 *
 * @param value - 待写入值（%）。
 * @returns 钳制后实际写入的值（供调用方即时更新视图状态）。
 */
export function setWallOpacity(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_WALL_OPACITY);
  try {
    localStorage.setItem(WALL_OPACITY_KEY, String(clamped));
  } catch {
    // localStorage 不可用，静默忽略（仅本次会话生效）。
  }
  notifyBackdropListeners();
  return clamped;
}

/**
 * 读取面板不透明度（%，钳制 0–100，默认 75）。
 *
 * @returns 0–100 整数。
 */
export function getPanelOpacity(): number {
  try {
    const raw = localStorage.getItem(PANEL_OPACITY_KEY);
    if (raw === null) return DEFAULT_PANEL_OPACITY;
    return clampBackdropOpacity(Number(raw), DEFAULT_PANEL_OPACITY);
  } catch {
    return DEFAULT_PANEL_OPACITY;
  }
}

/**
 * 写入面板不透明度（越界自动钳制）并持久化。
 *
 * @param value - 待写入值（%）。
 * @returns 钳制后实际写入的值（供调用方即时更新视图状态）。
 */
export function setPanelOpacity(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_PANEL_OPACITY);
  try {
    localStorage.setItem(PANEL_OPACITY_KEY, String(clamped));
  } catch {
    // localStorage 不可用，静默忽略（仅本次会话生效）。
  }
  notifyBackdropListeners();
  return clamped;
}

/**
 * 读取压暗浓度（%，钳制 0–100，默认 25）。
 *
 * 该值驱动压纱层（veil）的 alpha：深色主题叠暗纱、浅色主题叠白纱，
 * 浓度越高纱越厚、文字对比越强、壁纸越被压暗。
 *
 * @returns 0–100 整数。
 */
export function getVeilOpacity(): number {
  try {
    const raw = localStorage.getItem(VEIL_OPACITY_KEY);
    if (raw === null) return DEFAULT_VEIL_OPACITY;
    return clampBackdropOpacity(Number(raw), DEFAULT_VEIL_OPACITY);
  } catch {
    return DEFAULT_VEIL_OPACITY;
  }
}

/**
 * 写入压暗浓度（越界自动钳制）并持久化。
 *
 * @param value - 待写入值（%）。
 * @returns 钳制后实际写入的值（供调用方即时更新视图状态）。
 */
export function setVeilOpacity(value: number): number {
  const clamped = clampBackdropOpacity(value, DEFAULT_VEIL_OPACITY);
  try {
    localStorage.setItem(VEIL_OPACITY_KEY, String(clamped));
  } catch {
    // localStorage 不可用，静默忽略（仅本次会话生效）。
  }
  notifyBackdropListeners();
  return clamped;
}

/**
 * 区域 alpha 存储工厂（ADR-0025 D1）：五区域共用同一读写/钳制/通知模式，
 * 消除十函数同构重复（审查意见 Duplicated Code）。
 *
 * @param key - localStorage 键名。
 * @returns `[read, write]`：读回钳制后的 0–100 整数；写持久化并通知订阅者，
 *   返回实际写入值。
 */
function createRegionAlphaStore(key: string): [() => number, (value: number) => number] {
  const read = (): number => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return DEFAULT_REGION_ALPHA;
      return clampBackdropOpacity(Number(raw), DEFAULT_REGION_ALPHA);
    } catch {
      return DEFAULT_REGION_ALPHA;
    }
  };
  const write = (value: number): number => {
    const clamped = clampBackdropOpacity(value, DEFAULT_REGION_ALPHA);
    try {
      localStorage.setItem(key, String(clamped));
    } catch {
      // localStorage 不可用，静默忽略（仅本次会话生效）。
    }
    notifyBackdropListeners();
    return clamped;
  };
  return [read, write];
}

const [readSidebarAlpha, writeSidebarAlpha] = createRegionAlphaStore(SIDEBAR_ALPHA_KEY);
const [readInputAlpha, writeInputAlpha] = createRegionAlphaStore(INPUT_ALPHA_KEY);
const [readBubbleAlpha, writeBubbleAlpha] = createRegionAlphaStore(BUBBLE_ALPHA_KEY);
const [readTipAlpha, writeTipAlpha] = createRegionAlphaStore(TIP_ALPHA_KEY);
const [readSelectorAlpha, writeSelectorAlpha] = createRegionAlphaStore(SELECTOR_ALPHA_KEY);

/** 读取侧栏区域 alpha（%，钳制 0–100，默认 50）。 */
export function getSidebarAlpha(): number {
  return readSidebarAlpha();
}

/** 写入侧栏区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setSidebarAlpha(value: number): number {
  return writeSidebarAlpha(value);
}

/** 读取输入栏区域 alpha（%，钳制 0–100，默认 50）。 */
export function getInputAlpha(): number {
  return readInputAlpha();
}

/** 写入输入栏区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setInputAlpha(value: number): number {
  return writeInputAlpha(value);
}

/** 读取用户气泡区域 alpha（%，钳制 0–100，默认 50）。 */
export function getBubbleAlpha(): number {
  return readBubbleAlpha();
}

/** 写入用户气泡区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setBubbleAlpha(value: number): number {
  return writeBubbleAlpha(value);
}

/** 读取目标/Todo/Queue 卡区域 alpha（%，钳制 0–100，默认 50）。 */
export function getTipAlpha(): number {
  return readTipAlpha();
}

/** 写入目标/Todo/Queue 卡区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setTipAlpha(value: number): number {
  return writeTipAlpha(value);
}

/** 读取附件钮区域 alpha（%，钳制 0–100，默认 50）。 */
export function getSelectorAlpha(): number {
  return readSelectorAlpha();
}

/** 写入附件钮区域 alpha（越界钳制）并持久化，返回实际写入值。 */
export function setSelectorAlpha(value: number): number {
  return writeSelectorAlpha(value);
}

// ---------------------------------------------------------------------------
// 轻量 store（背景层 runtime 与 SettingsCard 订阅，任一配置项变化即通知）
// ---------------------------------------------------------------------------

const backdropListeners = new Set<() => void>();

/** 通知所有订阅者（配置写入后调用；订阅方自行重读快照）。 */
function notifyBackdropListeners(): void {
  for (const listener of backdropListeners) listener();
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
