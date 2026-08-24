// @vitest-environment jsdom
/**
 * CharacterOverlay cross-fade 组件级测试（工单 04 验收，ADR-0016 D15）。
 *
 * seam：mock runtime 快照（手动 emit）→ 断言浮层盒内 img 集合与 underlay 行为。
 * 覆盖：
 *   - url 变化触发 underlay：旧素材底层淡出、新素材上层淡入（img 恒 ≤2）；
 *   - 150ms 内连续再切：underlay 直接替换为最新旧帧；
 *   - 160ms 后 underlay 移除（淡出动画播完）；
 *   - prefers-reduced-motion: reduce 下淡入淡出全关（无 underlay）。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { CharacterOverlay } from "../../src/client/components/CharacterOverlay.tsx";
import type {
  OverlaySessionRuntime,
  RuntimeSnapshot,
} from "../../src/client/state-machine/overlay-session-runtime.ts";
import {
  loopAssetUrl,
  transitionAssetUrl,
} from "../../src/client/state-machine/overlay-state-machine.ts";

// ---------------------------------------------------------------------------
// mock runtime：可控快照 + 手动 emit
// ---------------------------------------------------------------------------

function makeSnapshot(playback: RuntimeSnapshot["playback"]): RuntimeSnapshot {
  return {
    focusSessionId: undefined,
    currentState: "idle",
    playback,
    focusNonce: 0,
  };
}

function createMockRuntime(initial: RuntimeSnapshot) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const runtime: OverlaySessionRuntime = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    poke() {},
    dispose() {},
    __tick() {},
    refresh() {},
  };
  return {
    runtime,
    emit(next: RuntimeSnapshot) {
      snapshot = next;
      for (const l of listeners) l();
    },
  };
}

// ---------------------------------------------------------------------------
// 挂载辅助
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  // jsdom 未实现 matchMedia：stub 初始值 + change 监听
  let reduced = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: (_: string, l: never) => {
      void l;
    },
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (window as unknown as { __setReduced?: boolean }).__setReduced = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (root !== undefined) {
    act(() => root!.unmount());
    root = undefined;
  }
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 渲染浮层并返回盒元素。 */
function mount(runtime: OverlaySessionRuntime): HTMLDivElement {
  root = createRoot(container);
  act(() => {
    root!.render(createElement(CharacterOverlay, { runtime }));
  });
  return container.querySelector("[data-jx-character]") as HTMLDivElement;
}

/** 盒内 img 列表。 */
function imgs(box: HTMLDivElement): HTMLImageElement[] {
  return Array.from(box.querySelectorAll(":scope > img"));
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("CharacterOverlay cross-fade（工单 04 / ADR-0016 D15）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("url 变化触发 underlay：旧素材底层淡出、新素材上层淡入（img ≤2）", () => {
    const { runtime, emit } = createMockRuntime(
      makeSnapshot([{ kind: "loop", state: "idle", url: loopAssetUrl("idle") }]),
    );
    const box = mount(runtime);
    expect(imgs(box)).toHaveLength(1);
    expect(imgs(box)[0]!.src).toContain("idle.webp");

    act(() => {
      emit(
        makeSnapshot([
          {
            kind: "transition",
            from: "idle",
            to: "working",
            url: transitionAssetUrl("idle", "thinking"),
          },
          { kind: "loop", state: "working", url: loopAssetUrl("idle") },
        ]),
      );
    });
    // 计划首项是过渡段：主图立即换新 url；underlay 持旧 idle
    const pair = imgs(box);
    expect(pair).toHaveLength(2);
    const underlay = box.querySelector(".imageUnderlay, [class*='imageUnderlay']");
    expect(underlay).not.toBeNull();
    expect((underlay as HTMLImageElement).src).toContain("idle.webp");
    expect(pair.some((x) => x.src.includes("transition-idle-thinking"))).toBe(
      true,
    );
  });

  it("150ms 内连续再切：underlay 直接替换为最新旧帧，img 恒 ≤2", () => {
    const { runtime, emit } = createMockRuntime(
      makeSnapshot([{ kind: "loop", state: "idle", url: loopAssetUrl("idle") }]),
    );
    const box = mount(runtime);
    // 第一次切换：idle → thinking 过渡段
    act(() => {
      emit(
        makeSnapshot([
          {
            kind: "transition",
            from: "idle",
            to: "thinking",
            url: transitionAssetUrl("idle", "thinking"),
          },
          { kind: "loop", state: "working", url: loopAssetUrl("idle") },
        ]),
      );
    });
    expect(imgs(box)).toHaveLength(2);
    // 150ms 内第二次切换：thinking → reading 过渡段
    act(() => {
      emit(
        makeSnapshot([
          {
            kind: "transition",
            from: "idle",
            to: "reading",
            url: transitionAssetUrl("idle", "reading"),
          },
          { kind: "loop", state: "working", url: loopAssetUrl("idle") },
        ]),
      );
    });
    const pair = imgs(box);
    expect(pair).toHaveLength(2); // 单 underlay 槽位，不叠加
    const underlay = box.querySelector(
      "[class*='imageUnderlay']",
    ) as HTMLImageElement;
    // underlay 已替换为最新旧帧（thinking 过渡段），不是最初的 idle
    expect(underlay.src).toContain("transition-idle-thinking");
    // 主图为最新 url
    expect(
      pair.some((x) => x.src.includes("transition-idle-reading")),
    ).toBe(true);
  });

  it("160ms 后 underlay 移除，回到单 img", () => {
    const { runtime, emit } = createMockRuntime(
      makeSnapshot([{ kind: "loop", state: "idle", url: loopAssetUrl("idle") }]),
    );
    const box = mount(runtime);
    act(() => {
      emit(
        makeSnapshot([
          {
            kind: "transition",
            from: "idle",
            to: "error",
            url: transitionAssetUrl("idle", "error"),
          },
          { kind: "loop", state: "working", url: loopAssetUrl("idle") },
        ]),
      );
    });
    expect(imgs(box)).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(imgs(box)).toHaveLength(1);
    expect(imgs(box)[0]!.src).toContain("transition-idle-error");
  });

  it("prefers-reduced-motion: reduce 下淡入淡出全关（不渲染 underlay）", () => {
    // matchMedia 对 reduce 返回 true
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    const { runtime, emit } = createMockRuntime(
      makeSnapshot([{ kind: "loop", state: "idle", url: loopAssetUrl("idle") }]),
    );
    const box = mount(runtime);
    act(() => {
      emit(
        makeSnapshot([
          {
            kind: "transition",
            from: "idle",
            to: "error",
            url: transitionAssetUrl("idle", "error"),
          },
          { kind: "loop", state: "working", url: loopAssetUrl("idle") },
        ]),
      );
    });
    // reduced-motion：只有主图换 src，无 underlay 层
    expect(imgs(box)).toHaveLength(1);
    expect(box.querySelector("[class*='imageUnderlay']")).toBeNull();
    expect(imgs(box)[0]!.src).toContain("transition-idle-error");
  });
});
