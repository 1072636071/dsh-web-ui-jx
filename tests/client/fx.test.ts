/**
 * fx/index.ts 聚合器测试（applyFx / setFxEnabled / getFxState）。
 *
 * 环境：jsdom + 可控 matchMedia 桩 + Element.animate 桩（fall 启动需要）。
 * 生产模块的 reducedMotionMq 在首次 applyFx 时挂监听，桩的 change 事件可手动
 * 派发以覆盖「进入/离开 prefers-reduced-motion」两条路径。
 *
 * 覆盖：
 *   - applyFx 默认全开：html 上全部 fx-* 类，getFxState 全 true
 *   - applyFx 读取 localStorage 部分状态（缺失字段回退默认开）
 *   - setFxEnabled 单类开关：移除/恢复类 + 持久化 + getFxState 反映，其余不受影响
 *   - prefers-reduced-motion：reduce 下全关（不覆盖 localStorage 意图）；
 *     离开恢复存储状态；再次进入再次全关
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stopFall } from "../../src/client/fx/fall.ts";
import { stopWarp } from "../../src/client/fx/warp.ts";
import {
  applyFx,
  FX_NAMES,
  getFxState,
  setFxEnabled,
  type FxState,
} from "../../src/client/fx/index.ts";

// ---------------------------------------------------------------------------
// 可控 matchMedia 桩（reduced-motion 判定 + change 监听）
// ---------------------------------------------------------------------------

let mqMatches = false;
type MqChangeHandler = (e: MediaQueryListEvent) => void;
const mqChangeHandlers = new Set<MqChangeHandler>();

const stubMql = {
  get matches(): boolean {
    return mqMatches;
  },
  media: "(prefers-reduced-motion: reduce)",
  onchange: null,
  addEventListener(_type: string, cb: MqChangeHandler): void {
    mqChangeHandlers.add(cb);
  },
  removeEventListener(_type: string, cb: MqChangeHandler): void {
    mqChangeHandlers.delete(cb);
  },
  addListener(cb: MqChangeHandler): void {
    mqChangeHandlers.add(cb);
  },
  removeListener(cb: MqChangeHandler): void {
    mqChangeHandlers.delete(cb);
  },
  dispatchEvent(): boolean {
    return false;
  },
};

/** 派发 media query change（模拟系统 reduced-motion 开关）。 */
function emitMqChange(matches: boolean): void {
  for (const cb of mqChangeHandlers) {
    cb({ matches } as MediaQueryListEvent);
  }
}

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => stubMql,
  });
} else {
  window.matchMedia = (() => stubMql) as typeof window.matchMedia;
}

// jsdom 缺口补齐：最小 Web Animations API 桩（startFall 路径需要）。
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.animate !== "function"
) {
  (Element.prototype as unknown as {
    animate: () => { cancel(): void };
  }).animate = () => ({ cancel: () => {} });
}

// ---------------------------------------------------------------------------
// 辅助断言
// ---------------------------------------------------------------------------

function htmlHasFxClass(cls: string): boolean {
  return document.documentElement.classList.contains(cls);
}

function allOff(): FxState {
  return { shimmer: false, fall: false, grain: false, warp: false, micro: false };
}

beforeEach(() => {
  mqMatches = false;
  window.localStorage.clear();
  document.documentElement.className = "";
});

afterEach(() => {
  stopFall();
  stopWarp();
  document.documentElement.className = "";
  document.querySelector("[data-jx-fx-fall]")?.remove();
  document.querySelector("[data-jx-fx-warp]")?.remove();
  mqMatches = false;
});

// ---------------------------------------------------------------------------
// applyFx 初始化
// ---------------------------------------------------------------------------

describe("applyFx: 初始化", () => {
  it("默认全开：html 上全部 fx-* 类，getFxState 全 true", () => {
    const state = applyFx();
    for (const name of FX_NAMES) {
      expect(htmlHasFxClass(`fx-${name}`)).toBe(true);
    }
    expect(state).toEqual(getFxState());
  });

  it("读取 localStorage 部分状态（缺失字段回退默认开）", () => {
    window.localStorage.setItem("jx-fx", JSON.stringify({ shimmer: false }));
    const state = applyFx();
    expect(state.shimmer).toBe(false);
    expect(state.fall).toBe(true);
    expect(htmlHasFxClass("fx-shimmer")).toBe(false);
    expect(htmlHasFxClass("fx-fall")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setFxEnabled 单类开关
// ---------------------------------------------------------------------------

describe("setFxEnabled: 单类开关", () => {
  it("关闭单个特效：移除类 + 持久化 + getFxState 反映，其余不受影响", () => {
    applyFx(); // 全开基线
    setFxEnabled("warp", false);

    expect(htmlHasFxClass("fx-warp")).toBe(false);
    expect(htmlHasFxClass("fx-shimmer")).toBe(true);

    const stored = JSON.parse(
      window.localStorage.getItem("jx-fx") ?? "{}",
    ) as Record<string, unknown>;
    expect(stored.warp).toBe(false);

    expect(getFxState().warp).toBe(false);
    expect(getFxState().shimmer).toBe(true);
  });

  it("重新打开单个特效：恢复对应类", () => {
    applyFx();
    setFxEnabled("grain", false);
    expect(htmlHasFxClass("fx-grain")).toBe(false);

    setFxEnabled("grain", true);
    expect(htmlHasFxClass("fx-grain")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prefers-reduced-motion
// ---------------------------------------------------------------------------

describe("applyFx: prefers-reduced-motion", () => {
  it("reduce 下全关（不覆盖 localStorage 意图）", () => {
    window.localStorage.setItem("jx-fx", JSON.stringify({ shimmer: false }));
    mqMatches = true;

    const state = applyFx();
    expect(state).toEqual(allOff());
    expect(getFxState()).toEqual(allOff());

    // localStorage 意图保留（reduce 仅抑制生效，不抹掉用户开关）。
    const stored = JSON.parse(
      window.localStorage.getItem("jx-fx") ?? "{}",
    ) as Record<string, unknown>;
    expect(stored.shimmer).toBe(false);
  });

  it("离开 reduce：恢复存储状态；再次进入：再次全关", () => {
    window.localStorage.setItem("jx-fx", JSON.stringify({ shimmer: false }));
    mqMatches = true;
    applyFx(); // 全关并挂 change 监听
    expect(htmlHasFxClass("fx-shimmer")).toBe(false);

    mqMatches = false;
    emitMqChange(false); // 离开 reduce
    expect(htmlHasFxClass("fx-shimmer")).toBe(false); // 存储意图 shimmer 关
    expect(htmlHasFxClass("fx-fall")).toBe(true); // 其余默认开

    mqMatches = true;
    emitMqChange(true); // 再次进入 reduce
    expect(htmlHasFxClass("fx-shimmer")).toBe(false);
    expect(htmlHasFxClass("fx-fall")).toBe(false);
  });
});
