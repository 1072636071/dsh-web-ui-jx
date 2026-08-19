/**
 * session-bubbles 纯逻辑测试（工单 05-session-bubbles，复用 Seam 模式）。
 *
 * seam：输入 items/current/maxVisible，断言输出 visible/moreCount/isCurrent。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（对齐 PRD 测试决策）：
 *   - 过滤：仅 running || completed 入选；idle/已查看不入选；空列表 → 空
 *   - 顺序保持：入选条目按 items 顺序，不重排
 *   - 折叠边界：total ≤ max → 全可见 moreCount=0；total = max+1 → visible=max moreCount=1；
 *     total 大额 → moreCount = total - max
 *   - isCurrent：匹配 current 标记 true；无 current / 不匹配 → false
 *   - maxVisible 边界（1 / 10 / ≤0 / 非整数）
 */

import { describe, expect, it } from "vitest";
import {
  selectBubbleEntries,
  type SessionListEntry,
} from "../../src/client/state-machine/session-bubbles.ts";

// ---------------------------------------------------------------------------
// 辅助构造
// ---------------------------------------------------------------------------

function entry(
  sessionId: string,
  opts: Partial<Pick<SessionListEntry, "title" | "running" | "completed">> = {},
): SessionListEntry {
  return {
    sessionId,
    title: opts.title,
    running: opts.running ?? false,
    completed: opts.completed ?? false,
  };
}

// ---------------------------------------------------------------------------
// 过滤
// ---------------------------------------------------------------------------

describe("session-bubbles: 过滤", () => {
  it("仅 running 入选", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { running: false }),
    ];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.map((e) => e.sessionId)).toEqual(["a"]);
    expect(r.moreCount).toBe(0);
  });

  it("仅 completed 入选", () => {
    const items = [
      entry("a", { completed: true }),
      entry("b", { completed: false }),
    ];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.map((e) => e.sessionId)).toEqual(["a"]);
    expect(r.moreCount).toBe(0);
  });

  it("running 与 completed 均入选", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { completed: true }),
      entry("c", { running: true, completed: true }),
    ];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.map((e) => e.sessionId)).toEqual(["a", "b", "c"]);
    expect(r.moreCount).toBe(0);
  });

  it("idle（非 running 非 completed）不入选", () => {
    const items = [
      entry("a", { running: false, completed: false }),
      entry("b", { running: true }),
    ];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.map((e) => e.sessionId)).toEqual(["b"]);
  });

  it("已查看（非 running 非 completed）不入选", () => {
    const items = [
      entry("a", { running: false, completed: false }),
      entry("b", { completed: true }),
    ];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.map((e) => e.sessionId)).toEqual(["b"]);
  });

  it("空列表 → 空 visible、moreCount=0", () => {
    const r = selectBubbleEntries([], undefined, 5);
    expect(r.visible).toEqual([]);
    expect(r.moreCount).toBe(0);
  });

  it("全部 idle → 空 visible、moreCount=0", () => {
    const items = [entry("a"), entry("b"), entry("c")];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible).toEqual([]);
    expect(r.moreCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 顺序保持
// ---------------------------------------------------------------------------

describe("session-bubbles: 顺序保持", () => {
  it("入选条目按 items 顺序，不重排", () => {
    const items = [
      entry("c", { running: true }),
      entry("a", { completed: true }),
      entry("b", { running: true }),
    ];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.map((e) => e.sessionId)).toEqual(["c", "a", "b"]);
  });

  it("折叠后可见条目仍保持原顺序（前 maxVisible 条）", () => {
    const items = [
      entry("c", { running: true }),
      entry("a", { completed: true }),
      entry("b", { running: true }),
      entry("d", { running: true }),
    ];
    const r = selectBubbleEntries(items, undefined, 2);
    expect(r.visible.map((e) => e.sessionId)).toEqual(["c", "a"]);
    expect(r.moreCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 折叠边界
// ---------------------------------------------------------------------------

describe("session-bubbles: 折叠边界", () => {
  const makeItems = (n: number): SessionListEntry[] =>
    Array.from({ length: n }, (_, i) => entry(`s${i}`, { running: true }));

  it("total < max → 全可见、moreCount=0", () => {
    const r = selectBubbleEntries(makeItems(3), undefined, 5);
    expect(r.visible).toHaveLength(3);
    expect(r.moreCount).toBe(0);
  });

  it("total = max → 全可见、moreCount=0", () => {
    const r = selectBubbleEntries(makeItems(5), undefined, 5);
    expect(r.visible).toHaveLength(5);
    expect(r.moreCount).toBe(0);
  });

  it("total = max + 1 → visible=max、moreCount=1", () => {
    const r = selectBubbleEntries(makeItems(6), undefined, 5);
    expect(r.visible).toHaveLength(5);
    expect(r.moreCount).toBe(1);
  });

  it("total 大额 → moreCount = total - max", () => {
    const r = selectBubbleEntries(makeItems(100), undefined, 5);
    expect(r.visible).toHaveLength(5);
    expect(r.moreCount).toBe(95);
  });

  it("max=1 → visible=1、moreCount=total-1", () => {
    const r = selectBubbleEntries(makeItems(8), undefined, 1);
    expect(r.visible).toHaveLength(1);
    expect(r.moreCount).toBe(7);
  });

  it("max=10 → 全可见（total=10）", () => {
    const r = selectBubbleEntries(makeItems(10), undefined, 10);
    expect(r.visible).toHaveLength(10);
    expect(r.moreCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isCurrent
// ---------------------------------------------------------------------------

describe("session-bubbles: isCurrent", () => {
  it("匹配 current 的条目标记 isCurrent=true", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { running: true }),
      entry("c", { running: true }),
    ];
    const r = selectBubbleEntries(items, "b", 5);
    expect(r.visible.map((e) => [e.sessionId, e.isCurrent])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
  });

  it("current 为 undefined → 全部 isCurrent=false", () => {
    const items = [entry("a", { running: true }), entry("b", { running: true })];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.every((e) => e.isCurrent === false)).toBe(true);
  });

  it("current 不在入选条目中 → 全部 isCurrent=false", () => {
    const items = [entry("a", { running: true }), entry("b", { running: true })];
    const r = selectBubbleEntries(items, "zzz", 5);
    expect(r.visible.every((e) => e.isCurrent === false)).toBe(true);
  });

  it("current 在被折叠的条目中 → visible 中无 isCurrent=true", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { running: true }),
      entry("c", { running: true }),
    ];
    const r = selectBubbleEntries(items, "c", 2);
    expect(r.visible.map((e) => [e.sessionId, e.isCurrent])).toEqual([
      ["a", false],
      ["b", false],
    ]);
    expect(r.moreCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// maxVisible 边界
// ---------------------------------------------------------------------------

describe("session-bubbles: maxVisible 边界", () => {
  const items = [
    entry("a", { running: true }),
    entry("b", { running: true }),
    entry("c", { running: true }),
  ];

  it("maxVisible=0 → visible 空、moreCount=total", () => {
    const r = selectBubbleEntries(items, undefined, 0);
    expect(r.visible).toEqual([]);
    expect(r.moreCount).toBe(3);
  });

  it("maxVisible 为负 → visible 空、moreCount=total（钳到 0）", () => {
    const r = selectBubbleEntries(items, undefined, -5);
    expect(r.visible).toEqual([]);
    expect(r.moreCount).toBe(3);
  });

  it("maxVisible 非整数 → 向下取整", () => {
    const r = selectBubbleEntries(items, undefined, 2.7);
    expect(r.visible).toHaveLength(2);
    expect(r.moreCount).toBe(1);
  });

  it("maxVisible 超过 total → 全可见、moreCount=0", () => {
    const r = selectBubbleEntries(items, undefined, 100);
    expect(r.visible).toHaveLength(3);
    expect(r.moreCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// title 透传
// ---------------------------------------------------------------------------

describe("session-bubbles: title 透传", () => {
  it("title 按原值透传（含 undefined）", () => {
    const items = [
      entry("a", { running: true, title: "会话A" }),
      entry("b", { running: true, title: undefined }),
    ];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.map((e) => e.title)).toEqual(["会话A", undefined]);
  });

  it("running/completed 标志透传", () => {
    const items = [
      entry("a", { running: true, completed: false }),
      entry("b", { running: false, completed: true }),
    ];
    const r = selectBubbleEntries(items, undefined, 5);
    expect(r.visible.map((e) => [e.running, e.completed])).toEqual([
      [true, false],
      [false, true],
    ]);
  });
});
