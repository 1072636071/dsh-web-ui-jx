/**
 * playback-cursor 纯逻辑测试（工单 08-permission-anim-visible/01，ADR-0016）。
 *
 * seam：输入（计划序列 + 异步时长回填 + 虚拟时钟推进）
 * → 断言输出（当前可见项）。
 *
 * 场景来源：grill 会话 prototype 仿真（审批等待期事件滴漏 → 过渡链卡死）。
 */

import { describe, expect, it, vi } from "vitest";
import {
  createPlaybackCursor,
  playbackPlansEqual,
} from "../../src/client/state-machine/playback-cursor.ts";
import type { PlaybackItem } from "../../src/client/state-machine/overlay-state-machine.ts";

/** 构造循环态项。 */
function loop(state: string): PlaybackItem {
  return { kind: "loop", state: state as never, url: `/${state}.webp` };
}

/** 构造过渡段项。 */
function trans(from: string, to: string): PlaybackItem {
  return {
    kind: "transition",
    from: from as never,
    to: to as never,
    url: `/transition-${from}-${to}.webp`,
  };
}

/** permission 两段入场链 + 循环态（与 runtime planSwitch 经 idle 中转同构）。 */
const PERMISSION_ENTRY = [
  trans("thinking", "idle"),
  trans("idle", "permission"),
  loop("permission"),
];

describe("playbackPlansEqual：结构等价门槛", () => {
  it("undefined vs 任意计划 ⇒ 不等价（首计划必须采纳）", () => {
    expect(playbackPlansEqual(undefined, PERMISSION_ENTRY)).toBe(false);
  });

  it("同内容不同引用 ⇒ 等价（runtime 显示层重建数组不得误判换计划）", () => {
    const a = [trans("thinking", "idle"), loop("thinking")];
    const b = [trans("thinking", "idle"), loop("thinking")];
    expect(a).not.toBe(b);
    expect(playbackPlansEqual(a, b)).toBe(true);
  });

  it("长度不同 / 任一项 url 或 kind 不同 ⇒ 不等价", () => {
    expect(
      playbackPlansEqual([loop("idle")], [loop("idle"), loop("working")]),
    ).toBe(false);
    expect(playbackPlansEqual([loop("idle")], [loop("working")])).toBe(false);
    expect(
      playbackPlansEqual([trans("a", "b")], [loop("/transition-a-b.webp" as never) as never]),
    ).toBe(false);
  });
});

describe("playback-cursor：推进决策", () => {
  it("回归主场景：每秒一次同内容新引用更新持续 30s，permission 入场链仍走完落地", () => {
    vi.useFakeTimers();
    const cursor = createPlaybackCursor();
    cursor.onPlan(PERMISSION_ENTRY.map((p) => ({ ...p })));

    // 模拟审批等待期：每 1s 一次内容相同的计划重建（新引用、同结构）
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(1000);
      cursor.onPlan(PERMISSION_ENTRY.map((p) => ({ ...p })));
    }

    // 若无门槛，索引会被反复归零永远停在第一段；有门槛则已走完两段过渡
    expect(cursor.getSnapshot().kind).toBe("loop");
    expect(cursor.getSnapshot().url).toBe("/permission.webp");
    cursor.dispose();
    vi.useRealTimers();
  });

  it("对照组：零重复更新，两段过渡按真实时长（3484ms×2）走完约 7s 落地", () => {
    vi.useFakeTimers();
    const cursor = createPlaybackCursor();
    cursor.resolveDuration("/transition-thinking-idle.webp", 3484);
    cursor.resolveDuration("/transition-idle-permission.webp", 3484);
    cursor.onPlan(PERMISSION_ENTRY);

    expect(cursor.getSnapshot().url).toBe("/transition-thinking-idle.webp");
    vi.advanceTimersByTime(3484);
    expect(cursor.getSnapshot().url).toBe("/transition-idle-permission.webp");
    vi.advanceTimersByTime(3484);
    expect(cursor.getSnapshot()).toEqual({
      kind: "loop",
      state: "permission",
      url: "/permission.webp",
    });
    // 循环态驻留：继续推时间不再变化
    vi.advanceTimersByTime(60_000);
    expect(cursor.getSnapshot().url).toBe("/permission.webp");
    cursor.dispose();
    vi.useRealTimers();
  });

  it("批准退场：过渡中途换计划 ⇒ 从新计划首段重新推进", () => {
    vi.useFakeTimers();
    const cursor = createPlaybackCursor();
    cursor.onPlan(PERMISSION_ENTRY);
    vi.advanceTimersByTime(1000); // 第一段过渡播到一半

    const exitPlan = [trans("permission", "idle"), loop("replying")];
    cursor.onPlan(exitPlan);
    expect(cursor.getSnapshot().url).toBe("/transition-permission-idle.webp");

    vi.advanceTimersByTime(800); // 未命中缓存 ⇒ 回退默认 800ms 推进
    expect(cursor.getSnapshot().url).toBe("/replying.webp");
    cursor.dispose();
    vi.useRealTimers();
  });

  it("resolveDuration：兜底先行（800ms），真时替换仅作用于正在等待的同 url 过渡段", () => {
    vi.useFakeTimers();
    const cursor = createPlaybackCursor();
    cursor.onPlan([trans("working", "idle"), loop("working")]);

    // 未解析前按回退默认值排程
    vi.advanceTimersByTime(799);
    expect(cursor.getSnapshot().url).toBe("/transition-working-idle.webp");
    cursor.resolveDuration("/transition-working-idle.webp", 5000);
    vi.advanceTimersByTime(1);
    // 重排后按完整真实时长计（自 resolve 起再等 5000ms）
    expect(cursor.getSnapshot().url).toBe("/transition-working-idle.webp");
    vi.advanceTimersByTime(4999);
    expect(cursor.getSnapshot().url).toBe("/working.webp");
    cursor.dispose();
    vi.useRealTimers();
  });

  it("时长缓存生效：第二次播放同 url 过渡段直接用真时长的剩余语义", () => {
    vi.useFakeTimers();
    const cursor = createPlaybackCursor();
    cursor.resolveDuration("/transition-a-b.webp", 2000);

    cursor.onPlan([trans("a", "b"), loop("b")]);
    vi.advanceTimersByTime(1999);
    expect(cursor.getSnapshot().kind).toBe("transition"); // 缓存即时生效，无兜底先行
    vi.advanceTimersByTime(1);
    expect(cursor.getSnapshot().url).toBe("/b.webp");
    cursor.dispose();
    vi.useRealTimers();
  });

  it("解析失败（null）落回退默认值且缓存该结论", () => {
    vi.useFakeTimers();
    const cursor = createPlaybackCursor();
    cursor.onPlan([trans("a", "b"), loop("b")]);
    cursor.resolveDuration("/transition-a-b.webp", null);

    vi.advanceTimersByTime(799);
    expect(cursor.getSnapshot().kind).toBe("transition");
    vi.advanceTimersByTime(1);
    expect(cursor.getSnapshot().url).toBe("/b.webp");
    cursor.dispose();
    vi.useRealTimers();
  });

  it("空计划忽略，保留现状不异常", () => {
    const cursor = createPlaybackCursor();
    cursor.onPlan([loop("idle")]);
    cursor.onPlan([]);
    expect(cursor.getSnapshot().url).toBe("/idle.webp");
    cursor.dispose();
  });

  it("订阅：仅可见项真正变化时通知；同内容重复 onPlan 不通知", () => {
    vi.useFakeTimers();
    const cursor = createPlaybackCursor();
    let changes = 0;
    cursor.subscribe(() => (changes += 1));

    cursor.onPlan(PERMISSION_ENTRY);
    expect(changes).toBe(1); // 首次采纳
    cursor.onPlan(PERMISSION_ENTRY.map((p) => ({ ...p })));
    expect(changes).toBe(1); // 结构等价：不通知

    vi.advanceTimersByTime(800); // 回退时长推进第一段
    expect(changes).toBe(2);
    vi.advanceTimersByTime(800); // 推进第二段
    expect(changes).toBe(3);
    cursor.dispose();
    vi.useRealTimers();
  });
});
