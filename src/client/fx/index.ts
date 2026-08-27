/**
 * FX 特效系统入口 / 控制器。
 *
 * DESIGN.md §5：五类特效（shimmer/fall/grain/warp/micro）由 `html` 上
 * `fx-*` 类 + `localStorage('jx-fx')` 控制，每类独立开关，默认全开。
 *
 * 控制机制：
 *   - `html` 上 `fx-shimmer`/`fx-fall`/`fx-grain`/`fx-warp`/`fx-micro` 类
 *     控制纯 CSS 特效（shimmer/grain/micro）的生效，warp 的 html 类控制样式生效。
 *   - fall 特效额外需要 JS（Web Animations API），由 startFall/stopFall 驱动。
 *   - warp 特效为鼠标交互驱动（pointermove），由 startWarp/stopWarp 驱动。
 *   - `localStorage('jx-fx')` 存 JSON 如
 *     `{"shimmer":true,"fall":true,"grain":true,"warp":true,"micro":true}`，
 *     applyFx 读取初始化；setFxEnabled 写入并即时生效。
 *
 * 全关判定：`html` 无任何 `fx-*` 类时，fx.css 中所有 `html.fx-*` 选择器不匹配，
 * 无样式生效；fall/warp 装饰层被移除 → 与原版皮肤无差异。
 *
 * prefers-reduced-motion：applyFx 检测到 reduce 时不应用任何 fx-* 类（即使
 * localStorage 有值），并监听变化自动恢复。reduced-motion 不覆盖 localStorage
 * （用户意图保留），仅抑制当前生效。
 *
 * @module dsh-web-ui-jx/client
 */

import { startFall, stopFall } from "./fall.ts";
import { startGrain, stopGrain } from "./grain.ts";
import { startMicro, stopMicro } from "./micro.ts";
import { startShimmer, stopShimmer } from "./shimmer.ts";
import { startWarp, stopWarp } from "./warp.ts";
import { createPersistentSetting } from "../../../packages/dsh-session-bubble/src/index.ts";

/** localStorage 键名. */
const FX_STORAGE_KEY = "jx-fx";

/** 五类特效名称（固定顺序）. */
export const FX_NAMES = [
  "shimmer",
  "fall",
  "grain",
  "warp",
  "micro",
] as const;

/** 特效名称类型. */
export type FxName = (typeof FX_NAMES)[number];

/** 特效开关状态（每类独立 bool）. */
export type FxState = Record<FxName, boolean>;

/** FxName → html 类名映射. */
const FX_CLASS: Record<FxName, string> = {
  shimmer: "fx-shimmer",
  fall: "fx-fall",
  grain: "fx-grain",
  warp: "fx-warp",
  micro: "fx-micro",
};

/** FxName → start 函数映射. */
const FX_START: Record<FxName, () => void> = {
  shimmer: startShimmer,
  fall: startFall,
  grain: startGrain,
  warp: startWarp,
  micro: startMicro,
};

/** FxName → stop 函数映射. */
const FX_STOP: Record<FxName, () => void> = {
  shimmer: stopShimmer,
  fall: stopFall,
  grain: stopGrain,
  warp: stopWarp,
  micro: stopMicro,
};

/** reduced-motion 媒体查询句柄（监听变化用）. */
let reducedMotionMq: MediaQueryList | null = null;
/** reduced-motion 变化监听器（teardownFx 摘除用，匿名函数无法移除）. */
let reducedMotionHandler: ((e: MediaQueryListEvent) => void) | null = null;

/**
 * 返回默认全开状态。
 *
 * DESIGN.md §5：所有特效默认开。
 */
function defaultState(): FxState {
  return { shimmer: true, fall: true, grain: true, warp: true, micro: true };
}

/**
 * 返回全关状态（reduced-motion 或显式全关用）.
 */
function allOffState(): FxState {
  return {
    shimmer: false,
    fall: false,
    grain: false,
    warp: false,
    micro: false,
  };
}

/**
 * 从持久化字符串解析 FX 状态。
 *
 * 容错：JSON 解析失败、字段缺失、类型错误均返回 undefined（工厂回落默认全开）。
 *
 * @returns 解析成功且至少有一个有效字段时返回状态，否则 undefined。
 */
function parseFxState(raw: string): FxState | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<Record<FxName, unknown>>;
    const state = defaultState();
    let valid = false;
    for (const name of FX_NAMES) {
      const v = parsed[name];
      if (typeof v === "boolean") {
        state[name] = v;
        valid = true;
      }
    }
    return valid ? state : undefined;
  } catch {
    return undefined;
  }
}

/**
 * FX 意图状态设置实例（架构审查候选者 3：持久化统一走工厂）。
 *
 * 注意此处持久化的是用户**意图**（reduced-motion 下不覆盖），与
 * getFxState 反射的「实际生效状态」不同。
 */
const fxIntent = createPersistentSetting<FxState>(FX_STORAGE_KEY, {
  serialize: (state) => JSON.stringify(state),
  parse: parseFxState,
  default: defaultState(),
});

/**
 * 检测 prefers-reduced-motion: reduce.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 根据 state 在 document.documentElement 上增删 fx-* 类。
 */
function applyClasses(state: FxState): void {
  const html = document.documentElement;
  for (const name of FX_NAMES) {
    html.classList.toggle(FX_CLASS[name], state[name]);
  }
}

/**
 * 启动/停止需要 JS 的特效（fall）。
 *
 * 纯 CSS 特效（shimmer/grain/micro）由 html 类切换自动生效，
 * 无需 JS 调度；但为统一接口，对所有特效调用 start/stop（纯 CSS 的为 noop）。
 */
function syncJsEffects(state: FxState): void {
  for (const name of FX_NAMES) {
    if (state[name]) {
      FX_START[name]();
    } else {
      FX_STOP[name]();
    }
  }
}

/**
 * 初始化 FX 特效系统。
 *
 * 流程：
 *   1. 读 localStorage('jx-fx')，无值则默认全开。
 *   2. 若 prefers-reduced-motion: reduce，强制全关（不覆盖 localStorage）。
 *   3. 在 html 上设置/移除 fx-* 类。
 *   4. 启动需要 JS 的特效（fall）。
 *   5. 监听 reduced-motion 变化：进入 reduce 全关，离开恢复 localStorage 状态。
 *
 * 幂等：重复调用安全（reduced-motion 监听器只挂一次）。
 *
 * @returns 当前生效的 FX 状态。
 */
export function applyFx(): FxState {
  let state = { ...fxIntent.reload() };
  if (prefersReducedMotion()) {
    state = allOffState();
  }
  applyClasses(state);
  syncJsEffects(state);

  // 监听 reduced-motion 变化（只挂一次；句柄存模块变量供 teardownFx 摘除）
  if (!reducedMotionMq) {
    reducedMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionHandler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        // 进入 reduce：全关，但不覆盖 localStorage
        const off = allOffState();
        applyClasses(off);
        syncJsEffects(off);
      } else {
        // 离开 reduce：恢复 localStorage 状态（无值则默认全开）
        const restored = { ...fxIntent.reload() };
        applyClasses(restored);
        syncJsEffects(restored);
      }
    };
    reducedMotionMq.addEventListener("change", reducedMotionHandler);
  }

  return state;
}

/**
 * 卸载 FX 特效系统（ADR-0017 可重入约束的清理半区）。
 *
 * 停止需要 JS 的特效（fall/warp 移除 body 直挂装饰层容器与 window 指针监听）、
 * 移除 html 上的 fx-* 类、摘除 reduced-motion 监听。供 ctx.effect 清理器调用：
 * HMR 重载/插件卸载时，旧模块实例的装饰层与事件闭包不残留——否则每次重载
 * 叠加一层装饰层（与 ADR-0017 修复的孤儿浮层同族缺陷）。
 *
 * localStorage 用户意图保留（重载后新 applyFx 按原键恢复）。
 */
export function teardownFx(): void {
  syncJsEffects(allOffState());
  applyClasses(allOffState());
  if (reducedMotionMq !== null && reducedMotionHandler !== null) {
    reducedMotionMq.removeEventListener("change", reducedMotionHandler);
  }
  reducedMotionMq = null;
  reducedMotionHandler = null;
}

/**
 * 设置单类特效开关并即时生效。
 *
 * 写入 localStorage（持久化用户意图），增删 html 类，启动/停止对应 JS 特效。
 * 在 prefers-reduced-motion: reduce 下，仍写 localStorage（保留意图），但
 * html 类不应用（fx.css 的媒体查询会抑制样式，fall 的 JS 启动会被 reduced-motion
 * 判定跳过——此处为简化，reduced-motion 下 setFxEnabled 仍会尝试应用，但
 * fx.css 媒体查询保证纯 CSS 特效不生效；fall 的 JS 在 reduced-motion 下
 * 也应不启动）。
 *
 * @param name - 特效名称。
 * @param enabled - 开/关。
 * @returns 更新后的完整状态。
 */
export function setFxEnabled(name: FxName, enabled: boolean): FxState {
  // 从持久化意图状态读当前意图（不从 html 类读，因为 reduced-motion 下 html 类全无）
  const stored = { ...fxIntent.reload() };
  stored[name] = enabled;
  fxIntent.set(stored);

  // reduced-motion 下不实际生效（仅持久化意图）
  if (prefersReducedMotion()) {
    return stored;
  }

  applyClasses(stored);
  if (enabled) {
    FX_START[name]();
  } else {
    FX_STOP[name]();
  }
  return stored;
}

/**
 * 读取当前生效的 FX 状态（从 html 类反射）。
 *
 * 与 setFxEnabled 返回的"意图状态"不同：reduced-motion 下 html 类全无，
 * getFxState 返回全关（反映实际生效状态）。
 *
 * @returns 当前 html 上 fx-* 类的反射状态。
 */
export function getFxState(): FxState {
  const html = document.documentElement;
  const state = allOffState();
  for (const name of FX_NAMES) {
    state[name] = html.classList.contains(FX_CLASS[name]);
  }
  return state;
}
