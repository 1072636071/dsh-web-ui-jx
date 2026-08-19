/**
 * overlay-position 纯逻辑测试（工单 01，复用 Seam 2 模式）。
 *
 * seam：输入位置/视口/尺寸/指针坐标，断言输出位置/会话/快照。纯逻辑，
 * 不依赖 DOM、不依赖 React（vitest node 环境）。持久化函数用内存 mock
 * localStorage（node 环境无 DOM，手动注入 globalThis.localStorage）。
 *
 * 覆盖（对齐工单 01 验收标准）：
 *   - clampToViewport：超左上/右下边界钳到边界内；边界内位置不变
 *   - defaultOverlayPosition：返回右下角（视口 - 尺寸 - 16px 边距）
 *   - 持久化 save→load round-trip；缺省/malformed 回落 null；写失败静默忽略
 *   - 位置 store：getSnapshot 稳定引用、set 写 localStorage + 通知、
 *     subscribe/unsubscribe 正常、reset 清 storage + 回默认 + 通知、setViewport 重钳制
 *   - drag reducer：dragStart 记录起点；dragMove 跟手且钳制；dragEnd 提交；
 *     交互子元素不启动会话
 *   - clampOnResize：输入新视口 → 输出钳制后位置
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clampOnResize,
  clampToViewport,
  clearPosition,
  createOverlayPositionStore,
  DEFAULT_OVERLAY_MARGIN,
  defaultOverlayPosition,
  dragEnd,
  dragMove,
  dragStart,
  loadPosition,
  savePosition,
  type OverlayPosition,
  type OverlaySize,
  type ViewportSize,
} from "../../src/client/state-machine/overlay-position.ts";

// ---------------------------------------------------------------------------
// 内存 mock localStorage（node 环境无 DOM，手动注入）
// ---------------------------------------------------------------------------

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

// ---------------------------------------------------------------------------
// 测试常量
// ---------------------------------------------------------------------------

const VIEWPORT: ViewportSize = { width: 1920, height: 1080 };
const SIZE: OverlaySize = { width: 180, height: 260 };

// ---------------------------------------------------------------------------
// clampToViewport
// ---------------------------------------------------------------------------

describe("overlay-position: clampToViewport", () => {
  it("边界内位置不变", () => {
    const p = { x: 100, y: 200 };
    expect(clampToViewport(p, VIEWPORT, SIZE)).toEqual({ x: 100, y: 200 });
  });

  it("超左上边界（负坐标）钳到 0", () => {
    const p = { x: -50, y: -100 };
    expect(clampToViewport(p, VIEWPORT, SIZE)).toEqual({ x: 0, y: 0 });
  });

  it("超右下边界（> vw-w）钳到 vw-w", () => {
    const p = { x: 2000, y: 1200 };
    expect(clampToViewport(p, VIEWPORT, SIZE)).toEqual({
      x: VIEWPORT.width - SIZE.width,
      y: VIEWPORT.height - SIZE.height,
    });
  });

  it("恰在边界上不变（x=0, y=0）", () => {
    expect(clampToViewport({ x: 0, y: 0 }, VIEWPORT, SIZE)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("恰在边界上不变（x=vw-w, y=vh-h）", () => {
    expect(
      clampToViewport(
        { x: VIEWPORT.width - SIZE.width, y: VIEWPORT.height - SIZE.height },
        VIEWPORT,
        SIZE,
      ),
    ).toEqual({
      x: VIEWPORT.width - SIZE.width,
      y: VIEWPORT.height - SIZE.height,
    });
  });

  it("视口窄于浮层（vw < w）：x 钳到 0", () => {
    const tiny: ViewportSize = { width: 100, height: 200 };
    expect(clampToViewport({ x: 50, y: 50 }, tiny, SIZE)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// defaultOverlayPosition
// ---------------------------------------------------------------------------

describe("overlay-position: defaultOverlayPosition", () => {
  it("返回右下角（视口 - 尺寸 - 16px 边距）", () => {
    expect(defaultOverlayPosition(VIEWPORT, SIZE)).toEqual({
      x: VIEWPORT.width - SIZE.width - DEFAULT_OVERLAY_MARGIN,
      y: VIEWPORT.height - SIZE.height - DEFAULT_OVERLAY_MARGIN,
    });
  });

  it("自定义 margin", () => {
    expect(defaultOverlayPosition(VIEWPORT, SIZE, 32)).toEqual({
      x: VIEWPORT.width - SIZE.width - 32,
      y: VIEWPORT.height - SIZE.height - 32,
    });
  });

  it("视口过小（vw < w+margin）退化为贴左上（不出现负坐标）", () => {
    const tiny: ViewportSize = { width: 100, height: 200 };
    expect(defaultOverlayPosition(tiny, SIZE)).toEqual({ x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// 持久化（loadPosition / savePosition / clearPosition）
// ---------------------------------------------------------------------------

describe("overlay-position: 持久化", () => {
  it("save→load round-trip 一致", () => {
    const p: OverlayPosition = { x: 123, y: 456 };
    savePosition(p);
    expect(loadPosition()).toEqual(p);
  });

  it("load 缺省（无键）返回 null", () => {
    expect(loadPosition()).toBeNull();
  });

  it("load malformed JSON 返回 null", () => {
    store.set("jx-overlay-pos", "{not json");
    expect(loadPosition()).toBeNull();
  });

  it("load 缺字段返回 null", () => {
    store.set("jx-overlay-pos", JSON.stringify({ x: 100 }));
    expect(loadPosition()).toBeNull();
  });

  it("load 字段类型错误返回 null", () => {
    store.set("jx-overlay-pos", JSON.stringify({ x: "a", y: 1 }));
    expect(loadPosition()).toBeNull();
  });

  it("load NaN/Infinity 返回 null", () => {
    store.set(
      "jx-overlay-pos",
      JSON.stringify({ x: NaN, y: 1 }),
    );
    expect(loadPosition()).toBeNull();
    store.set(
      "jx-overlay-pos",
      JSON.stringify({ x: 1, y: Infinity }),
    );
    expect(loadPosition()).toBeNull();
  });

  it("save 写失败静默忽略（不抛错）", () => {
    const orig = (
      globalThis as unknown as { localStorage: { setItem: unknown } }
    ).localStorage.setItem;
    (
      globalThis as unknown as { localStorage: { setItem: () => void } }
    ).localStorage.setItem = () => {
      throw new Error("quota");
    };
    expect(() => savePosition({ x: 1, y: 2 })).not.toThrow();
    (
      globalThis as unknown as { localStorage: { setItem: unknown } }
    ).localStorage.setItem = orig;
  });

  it("load 读失败静默忽略返回 null", () => {
    const orig = (
      globalThis as unknown as { localStorage: { getItem: unknown } }
    ).localStorage.getItem;
    (
      globalThis as unknown as { localStorage: { getItem: () => string } }
    ).localStorage.getItem = () => {
      throw new Error("denied");
    };
    expect(loadPosition()).toBeNull();
    (
      globalThis as unknown as { localStorage: { getItem: unknown } }
    ).localStorage.getItem = orig;
  });

  it("clear 清除键", () => {
    savePosition({ x: 1, y: 2 });
    expect(loadPosition()).not.toBeNull();
    clearPosition();
    expect(loadPosition()).toBeNull();
  });

  it("clear 无键时不抛错", () => {
    expect(() => clearPosition()).not.toThrow();
  });

  it("clear 失败静默忽略（不抛错）", () => {
    const orig = (
      globalThis as unknown as { localStorage: { removeItem: unknown } }
    ).localStorage.removeItem;
    (
      globalThis as unknown as { localStorage: { removeItem: () => void } }
    ).localStorage.removeItem = () => {
      throw new Error("denied");
    };
    expect(() => clearPosition()).not.toThrow();
    (
      globalThis as unknown as { localStorage: { removeItem: unknown } }
    ).localStorage.removeItem = orig;
  });
});

// ---------------------------------------------------------------------------
// drag reducer（dragStart / dragMove / dragEnd）
// ---------------------------------------------------------------------------

describe("overlay-position: dragStart", () => {
  it("记录起点指针与起始位置，active=true", () => {
    const pointer = { x: 100, y: 200 };
    const overlay = { x: 500, y: 600 };
    const r = dragStart(pointer, overlay);
    expect(r.active).toBe(true);
    expect(r.session).toEqual({
      startPointer: pointer,
      startOverlay: overlay,
    });
  });

  it("从交互子元素起（interactive=true）不启动会话", () => {
    const pointer = { x: 100, y: 200 };
    const overlay = { x: 500, y: 600 };
    const r = dragStart(pointer, overlay, true);
    expect(r.active).toBe(false);
    expect(r.session).toBeNull();
  });
});

describe("overlay-position: dragMove", () => {
  it("跟手：指针移动 dx,dy → 浮层移动 dx,dy", () => {
    const session = dragStart({ x: 100, y: 200 }, { x: 500, y: 600 }).session!;
    expect(dragMove(session, { x: 150, y: 230 }, VIEWPORT, SIZE)).toEqual({
      x: 550,
      y: 630,
    });
  });

  it("指针不动 → 浮层不动", () => {
    const session = dragStart({ x: 100, y: 200 }, { x: 500, y: 600 }).session!;
    expect(dragMove(session, { x: 100, y: 200 }, VIEWPORT, SIZE)).toEqual({
      x: 500,
      y: 600,
    });
  });

  it("越界位置被钳回（超左上）", () => {
    const session = dragStart({ x: 100, y: 200 }, { x: 50, y: 50 }).session!;
    expect(dragMove(session, { x: 0, y: 0 }, VIEWPORT, SIZE)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("越界位置被钳回（超右下）", () => {
    const startOverlay = {
      x: VIEWPORT.width - SIZE.width - 100,
      y: VIEWPORT.height - SIZE.height - 100,
    };
    const session = dragStart({ x: 0, y: 0 }, startOverlay).session!;
    expect(dragMove(session, { x: 500, y: 500 }, VIEWPORT, SIZE)).toEqual({
      x: VIEWPORT.width - SIZE.width,
      y: VIEWPORT.height - SIZE.height,
    });
  });
});

describe("overlay-position: dragEnd", () => {
  it("提交钳制后位置（同 dragMove 语义）", () => {
    const session = dragStart({ x: 100, y: 200 }, { x: 500, y: 600 }).session!;
    expect(dragEnd(session, { x: 200, y: 300 }, VIEWPORT, SIZE)).toEqual({
      x: 600,
      y: 700,
    });
  });

  it("提交越界位置被钳回", () => {
    const session = dragStart({ x: 0, y: 0 }, { x: 0, y: 0 }).session!;
    expect(dragEnd(session, { x: -100, y: -100 }, VIEWPORT, SIZE)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// clampOnResize
// ---------------------------------------------------------------------------

describe("overlay-position: clampOnResize", () => {
  it("输入新视口 → 输出钳制后位置", () => {
    const p = { x: 1500, y: 900 };
    const newViewport = { width: 800, height: 600 };
    expect(clampOnResize(p, newViewport, SIZE)).toEqual({
      x: newViewport.width - SIZE.width,
      y: newViewport.height - SIZE.height,
    });
  });

  it("新视口内位置不变", () => {
    const p = { x: 100, y: 100 };
    expect(clampOnResize(p, { width: 800, height: 600 }, SIZE)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it("窗口缩小后浮层不跑到屏幕外（超左上钳回）", () => {
    const p = { x: -50, y: -50 };
    expect(clampOnResize(p, { width: 800, height: 600 }, SIZE)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// 位置 store（createOverlayPositionStore）
// ---------------------------------------------------------------------------

describe("overlay-position: store", () => {
  it("getSnapshot 稳定引用（状态未变时返回同一对象）", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const a = s.getSnapshot();
    const b = s.getSnapshot();
    expect(a).toBe(b);
  });

  it("初始化读持久化位置", () => {
    savePosition({ x: 100, y: 200 });
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    expect(s.getSnapshot()).toEqual({ x: 100, y: 200 });
  });

  it("初始化无持久化则默认右下角", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    expect(s.getSnapshot()).toEqual(defaultOverlayPosition(VIEWPORT, SIZE));
  });

  it("初始化持久化越界位置被钳制", () => {
    savePosition({ x: -100, y: -100 });
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    expect(s.getSnapshot()).toEqual({ x: 0, y: 0 });
  });

  it("set 写 localStorage + 通知订阅者", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const calls: OverlayPosition[] = [];
    s.subscribe((p) => calls.push(p));
    s.set({ x: 100, y: 200 });
    expect(s.getSnapshot()).toEqual({ x: 100, y: 200 });
    expect(loadPosition()).toEqual({ x: 100, y: 200 });
    expect(calls).toEqual([{ x: 100, y: 200 }]);
  });

  it("set 相同位置不通知（不重建引用）", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const before = s.getSnapshot();
    const calls: OverlayPosition[] = [];
    s.subscribe((p) => calls.push(p));
    s.set(before);
    expect(s.getSnapshot()).toBe(before);
    expect(calls).toEqual([]);
  });

  it("move 更新位置 + 通知，不写 localStorage（实时跟手）", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const calls: OverlayPosition[] = [];
    s.subscribe((p) => calls.push(p));
    s.move({ x: 100, y: 200 });
    expect(s.getSnapshot()).toEqual({ x: 100, y: 200 });
    expect(loadPosition()).toBeNull();
    expect(calls).toEqual([{ x: 100, y: 200 }]);
  });

  it("move 相同位置不通知", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const before = s.getSnapshot();
    const calls: OverlayPosition[] = [];
    s.subscribe((p) => calls.push(p));
    s.move(before);
    expect(s.getSnapshot()).toBe(before);
    expect(calls).toEqual([]);
  });

  it("move 后 set 提交持久化（拖动跟手 + pointerup 提交）", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    s.move({ x: 100, y: 200 });
    expect(loadPosition()).toBeNull();
    s.set({ x: 100, y: 200 });
    expect(loadPosition()).toEqual({ x: 100, y: 200 });
  });

  it("subscribe/unsubscribe 正常", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const calls: OverlayPosition[] = [];
    const unsub = s.subscribe((p) => calls.push(p));
    s.set({ x: 10, y: 20 });
    unsub();
    s.set({ x: 30, y: 40 });
    expect(calls).toEqual([{ x: 10, y: 20 }]);
  });

  it("多个订阅者均被通知", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const a: OverlayPosition[] = [];
    const b: OverlayPosition[] = [];
    s.subscribe((p) => a.push(p));
    s.subscribe((p) => b.push(p));
    s.set({ x: 1, y: 2 });
    expect(a).toEqual([{ x: 1, y: 2 }]);
    expect(b).toEqual([{ x: 1, y: 2 }]);
  });

  it("reset 清 storage + 回默认 + 通知", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    s.set({ x: 100, y: 200 });
    expect(loadPosition()).not.toBeNull();
    const calls: OverlayPosition[] = [];
    s.subscribe((p) => calls.push(p));
    s.reset();
    expect(s.getSnapshot()).toEqual(defaultOverlayPosition(VIEWPORT, SIZE));
    expect(loadPosition()).toBeNull();
    expect(calls).toEqual([defaultOverlayPosition(VIEWPORT, SIZE)]);
  });

  it("reset 时已在默认位置不通知", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const calls: OverlayPosition[] = [];
    s.subscribe((p) => calls.push(p));
    s.reset();
    expect(calls).toEqual([]);
  });

  it("setViewport 更新视口 + 重钳制当前位置 + 通知", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    s.set({ x: 1500, y: 900 });
    const calls: OverlayPosition[] = [];
    s.subscribe((p) => calls.push(p));
    const newViewport = { width: 800, height: 600 };
    s.setViewport(newViewport);
    expect(s.getSnapshot()).toEqual({
      x: newViewport.width - SIZE.width,
      y: newViewport.height - SIZE.height,
    });
    expect(calls.length).toBe(1);
  });

  it("setViewport 相同视口不通知", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const calls: OverlayPosition[] = [];
    s.subscribe((p) => calls.push(p));
    s.setViewport(VIEWPORT);
    expect(calls).toEqual([]);
  });

  it("setViewport 后 reset 回新视口的默认位置", () => {
    const s = createOverlayPositionStore({
      viewport: VIEWPORT,
      size: SIZE,
    });
    const newViewport = { width: 800, height: 600 };
    s.setViewport(newViewport);
    s.set({ x: 10, y: 10 });
    s.reset();
    expect(s.getSnapshot()).toEqual(defaultOverlayPosition(newViewport, SIZE));
  });
});
