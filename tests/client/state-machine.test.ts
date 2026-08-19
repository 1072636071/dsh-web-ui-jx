/**
 * 角色浮层状态机纯逻辑测试（工单 05 验收，seam 2）。
 *
 * seam 2：输入意图断言输出（当前态、过渡序列、落入的循环态）。
 * 纯逻辑测试，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖：
 *   - 36 过渡边确认（命名模式 + from-to 映射 + 无重复）。
 *   - 10 循环态互通：每对 (A, B) A≠B，dispatch switch to B 后 currentState=B，
 *     playback 末尾是 loop-B。
 *   - 过渡只播一次：playback 里 transition 项不重复，loop 项只有一个在末尾。
 *   - 直接过渡 vs idle 中转：有直接过渡段的切换 playback=[transition, loop]；
 *     无直接过渡段的切换 playback=[transition-A-idle, transition-idle-B, loop-B]。
 *   - 状态机行为：初始态、相同态不通知、subscribe/unsubscribe、连续切换。
 *   - 宿主事件接入口：每个方法 dispatch 对应意图。
 */

import { describe, expect, it } from "vitest";
import {
  createOverlayStateMachine,
  createHostEventAdapter,
  planSwitch,
  hasTransitionEdge,
  OVERLAY_STATES,
  TRANSITION_EDGES,
  loopAssetUrl,
  transitionAssetUrl,
  type OverlayState,
  type StateMachineSnapshot,
  type PlaybackItem,
  type TransitionPlaybackItem,
  type LoopPlaybackItem,
} from "../../src/client/state-machine/overlay-state-machine.ts";

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/** 取 playback 里的 transition 项. */
function transitionsOf(
  playback: readonly PlaybackItem[],
): TransitionPlaybackItem[] {
  return playback.filter(
    (p): p is TransitionPlaybackItem => p.kind === "transition",
  );
}

/** 取 playback 里的 loop 项. */
function loopsOf(playback: readonly PlaybackItem[]): LoopPlaybackItem[] {
  return playback.filter((p): p is LoopPlaybackItem => p.kind === "loop");
}

/** 取 playback 末尾的 loop 项（落入的循环态）. */
function finalLoopOf(
  playback: readonly PlaybackItem[],
): LoopPlaybackItem | undefined {
  const last = playback[playback.length - 1];
  return last && last.kind === "loop" ? last : undefined;
}

// ---------------------------------------------------------------------------
// 36 过渡边确认
// ---------------------------------------------------------------------------

describe("overlay-state-machine: 36 过渡边", () => {
  it("TRANSITION_EDGES 恰好 36 条", () => {
    expect(TRANSITION_EDGES).toHaveLength(36);
  });

  it("每条边对应素材 URL 命名模式 transition-{from}-{to}.webp", () => {
    for (const [from, to] of TRANSITION_EDGES) {
      expect(transitionAssetUrl(from, to)).toBe(
        `/api/dsh-jx/character/transition-${from}-${to}.webp`,
      );
    }
  });

  it("无重复边", () => {
    const keys = new Set(TRANSITION_EDGES.map(([f, t]) => `${f}|${t}`));
    expect(keys.size).toBe(36);
  });

  it("idle 与其他 9 循环态双向互通（18 边）", () => {
    const others = OVERLAY_STATES.filter((s) => s !== "idle");
    for (const s of others) {
      expect(hasTransitionEdge("idle", s)).toBe(true);
      expect(hasTransitionEdge(s, "idle")).toBe(true);
    }
  });

  it("thinking ↔ replying 直接过渡（2 边）", () => {
    expect(hasTransitionEdge("thinking", "replying")).toBe(true);
    expect(hasTransitionEdge("replying", "thinking")).toBe(true);
  });

  it("thinking → reading 无直接过渡（需中转）", () => {
    expect(hasTransitionEdge("thinking", "reading")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// planSwitch：切换计划构造
// ---------------------------------------------------------------------------

describe("planSwitch: 切换计划构造", () => {
  it("from === to：只播 loop，无过渡", () => {
    for (const s of OVERLAY_STATES) {
      const plan = planSwitch(s, s);
      expect(plan).toHaveLength(1);
      expect(plan[0].kind).toBe("loop");
      if (plan[0].kind === "loop") {
        expect(plan[0].state).toBe(s);
        expect(plan[0].url).toBe(loopAssetUrl(s));
      }
    }
  });

  it("直接过渡存在：[transition-from-to, loop-to]", () => {
    const plan = planSwitch("idle", "thinking");
    expect(plan).toHaveLength(2);
    expect(plan[0].kind).toBe("transition");
    expect(plan[1].kind).toBe("loop");
    if (plan[0].kind === "transition") {
      expect(plan[0].from).toBe("idle");
      expect(plan[0].to).toBe("thinking");
      expect(plan[0].url).toBe(transitionAssetUrl("idle", "thinking"));
    }
    if (plan[1].kind === "loop") expect(plan[1].state).toBe("thinking");
  });

  it("thinking → replying 直接过渡（非 idle 路径）", () => {
    const plan = planSwitch("thinking", "replying");
    expect(plan).toHaveLength(2);
    if (plan[0].kind === "transition") {
      expect(plan[0].from).toBe("thinking");
      expect(plan[0].to).toBe("replying");
    }
  });

  it("无直接过渡：经 idle 中转 [transition-from-idle, transition-idle-to, loop-to]", () => {
    expect(hasTransitionEdge("thinking", "reading")).toBe(false);
    const plan = planSwitch("thinking", "reading");
    expect(plan).toHaveLength(3);
    expect(plan[0].kind).toBe("transition");
    expect(plan[1].kind).toBe("transition");
    expect(plan[2].kind).toBe("loop");
    if (plan[0].kind === "transition") {
      expect(plan[0].from).toBe("thinking");
      expect(plan[0].to).toBe("idle");
      expect(plan[0].url).toBe(transitionAssetUrl("thinking", "idle"));
    }
    if (plan[1].kind === "transition") {
      expect(plan[1].from).toBe("idle");
      expect(plan[1].to).toBe("reading");
      expect(plan[1].url).toBe(transitionAssetUrl("idle", "reading"));
    }
    if (plan[2].kind === "loop") expect(plan[2].state).toBe("reading");
  });

  it("中转的两段过渡都实际存在（素材可达）", () => {
    // 对所有需中转的对，验证 transition-from-idle 与 transition-idle-to 都存在
    for (const from of OVERLAY_STATES) {
      for (const to of OVERLAY_STATES) {
        if (from === to || hasTransitionEdge(from, to)) continue;
        // 需中转
        expect(hasTransitionEdge(from, "idle")).toBe(true);
        expect(hasTransitionEdge("idle", to)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 10 循环态互通 + 过渡只播一次
// ---------------------------------------------------------------------------

describe("createOverlayStateMachine: 10 循环态互通", () => {
  it("每对 (A,B) A≠B：dispatch switch to B 后 currentState=B，playback 末尾 loop-B", () => {
    for (const from of OVERLAY_STATES) {
      for (const to of OVERLAY_STATES) {
        if (from === to) continue;
        const sm = createOverlayStateMachine(from);
        sm.dispatch({ type: "switch", target: to });
        const snap = sm.getSnapshot();
        expect(snap.currentState).toBe(to);
        const finalLoop = finalLoopOf(snap.playback);
        expect(
          finalLoop,
          `from=${from} to=${to} 应落入 loop-${to}`,
        ).toBeDefined();
        expect(finalLoop?.state).toBe(to);
      }
    }
  });

  it("10 态两两组合（90 对 A≠B）全部可达", () => {
    let count = 0;
    for (const from of OVERLAY_STATES) {
      for (const to of OVERLAY_STATES) {
        if (from === to) continue;
        count++;
        const sm = createOverlayStateMachine(from);
        sm.dispatch({ type: "switch", target: to });
        expect(sm.getSnapshot().currentState).toBe(to);
      }
    }
    expect(count).toBe(90); // 10*9
  });
});

describe("createOverlayStateMachine: 过渡只播一次", () => {
  it("playback 里 transition 项不重复（每条边至多出现一次）", () => {
    for (const from of OVERLAY_STATES) {
      for (const to of OVERLAY_STATES) {
        if (from === to) continue;
        const sm = createOverlayStateMachine(from);
        sm.dispatch({ type: "switch", target: to });
        const ts = transitionsOf(sm.getSnapshot().playback);
        const keys = new Set(ts.map((t) => `${t.from}|${t.to}`));
        expect(keys.size, `from=${from} to=${to} transition 不应重复`).toBe(
          ts.length,
        );
      }
    }
  });

  it("playback 里 loop 项只有一个在末尾", () => {
    for (const from of OVERLAY_STATES) {
      for (const to of OVERLAY_STATES) {
        if (from === to) continue;
        const sm = createOverlayStateMachine(from);
        sm.dispatch({ type: "switch", target: to });
        const pb = sm.getSnapshot().playback;
        const loops = loopsOf(pb);
        expect(loops, `from=${from} to=${to} 应只有一个 loop`).toHaveLength(1);
        expect(pb[pb.length - 1].kind).toBe("loop");
      }
    }
  });

  it("playback 长度为 1（无过渡）或 2（直接过渡）或 3（中转）", () => {
    for (const from of OVERLAY_STATES) {
      for (const to of OVERLAY_STATES) {
        if (from === to) continue;
        const sm = createOverlayStateMachine(from);
        sm.dispatch({ type: "switch", target: to });
        const len = sm.getSnapshot().playback.length;
        expect(len, `from=${from} to=${to}`).toBeGreaterThanOrEqual(2);
        expect(len, `from=${from} to=${to}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 状态机行为
// ---------------------------------------------------------------------------

describe("createOverlayStateMachine: 行为", () => {
  it("初始态为指定态，playback=[loop-initial]", () => {
    const sm = createOverlayStateMachine("thinking");
    const snap = sm.getSnapshot();
    expect(snap.currentState).toBe("thinking");
    expect(snap.playback).toHaveLength(1);
    expect(snap.playback[0].kind).toBe("loop");
  });

  it("默认初始态为 idle", () => {
    const sm = createOverlayStateMachine();
    expect(sm.getSnapshot().currentState).toBe("idle");
  });

  it("dispatch 相同态不通知、不变化", () => {
    const sm = createOverlayStateMachine("idle");
    let calls = 0;
    sm.subscribe(() => calls++);
    sm.dispatch({ type: "switch", target: "idle" });
    expect(calls).toBe(0);
    expect(sm.getSnapshot().currentState).toBe("idle");
  });

  it("dispatch 不同态通知 listener", () => {
    const sm = createOverlayStateMachine("idle");
    const snaps: StateMachineSnapshot[] = [];
    sm.subscribe((s) => snaps.push(s));
    sm.dispatch({ type: "switch", target: "thinking" });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].currentState).toBe("thinking");
  });

  it("subscribe 返回取消订阅函数", () => {
    const sm = createOverlayStateMachine("idle");
    let calls = 0;
    const unsub = sm.subscribe(() => calls++);
    sm.dispatch({ type: "switch", target: "thinking" });
    expect(calls).toBe(1);
    unsub();
    sm.dispatch({ type: "switch", target: "reading" });
    expect(calls).toBe(1); // 取消后不再通知
  });

  it("多个 listener 各自独立通知", () => {
    const sm = createOverlayStateMachine("idle");
    let a = 0;
    let b = 0;
    const unA = sm.subscribe(() => a++);
    const unB = sm.subscribe(() => b++);
    sm.dispatch({ type: "switch", target: "thinking" });
    expect(a).toBe(1);
    expect(b).toBe(1);
    unA();
    sm.dispatch({ type: "switch", target: "reading" });
    expect(a).toBe(1);
    expect(b).toBe(2);
    unB();
  });

  it("连续切换：每次 dispatch 重置 playback 为新计划", () => {
    const sm = createOverlayStateMachine("idle");
    sm.dispatch({ type: "switch", target: "thinking" });
    expect(sm.getSnapshot().currentState).toBe("thinking");
    expect(finalLoopOf(sm.getSnapshot().playback)?.state).toBe("thinking");

    sm.dispatch({ type: "switch", target: "error" });
    expect(sm.getSnapshot().currentState).toBe("error");
    expect(finalLoopOf(sm.getSnapshot().playback)?.state).toBe("error");
    // thinking → error 无直接过渡，经 idle 中转，playback 长度 3
    expect(sm.getSnapshot().playback).toHaveLength(3);
  });

  it("切回 idle：从任意态都有直接过渡段", () => {
    for (const from of OVERLAY_STATES) {
      if (from === "idle") continue;
      const sm = createOverlayStateMachine(from);
      sm.dispatch({ type: "switch", target: "idle" });
      // 所有循环态都有 X-idle 直接过渡，playback 长度 2
      expect(sm.getSnapshot().playback).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// 宿主事件接入口
// ---------------------------------------------------------------------------

describe("createHostEventAdapter: 宿主事件接入口", () => {
  it("每个方法 dispatch 对应的 switch 意图", () => {
    const sm = createOverlayStateMachine("idle");
    const adapter = createHostEventAdapter(sm);

    adapter.onAssistantThinking();
    expect(sm.getSnapshot().currentState).toBe("thinking");

    adapter.onAssistantReading();
    expect(sm.getSnapshot().currentState).toBe("reading");

    adapter.onAssistantReplying();
    expect(sm.getSnapshot().currentState).toBe("replying");

    adapter.onAssistantWorking();
    expect(sm.getSnapshot().currentState).toBe("working");

    adapter.onAssistantError();
    expect(sm.getSnapshot().currentState).toBe("error");

    adapter.onAssistantWelcome();
    expect(sm.getSnapshot().currentState).toBe("welcome");

    adapter.onAssistantDone();
    expect(sm.getSnapshot().currentState).toBe("done");

    adapter.onAssistantPermission();
    expect(sm.getSnapshot().currentState).toBe("permission");

    adapter.onAssistantListening();
    expect(sm.getSnapshot().currentState).toBe("listening");

    adapter.onAssistantIdle();
    expect(sm.getSnapshot().currentState).toBe("idle");
  });

  it("adapter 方法调用触发状态机 listener", () => {
    const sm = createOverlayStateMachine("idle");
    const adapter = createHostEventAdapter(sm);
    const snaps: StateMachineSnapshot[] = [];
    sm.subscribe((s) => snaps.push(s));
    adapter.onAssistantWorking();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].currentState).toBe("working");
  });
});

// ---------------------------------------------------------------------------
// 素材 URL 构造
// ---------------------------------------------------------------------------

describe("素材 URL 构造", () => {
  it("loopAssetUrl: /api/dsh-jx/character/{state}.webp", () => {
    expect(loopAssetUrl("idle")).toBe("/api/dsh-jx/character/idle.webp");
    expect(loopAssetUrl("thinking")).toBe(
      "/api/dsh-jx/character/thinking.webp",
    );
  });

  it("transitionAssetUrl: /api/dsh-jx/character/transition-{from}-{to}.webp", () => {
    expect(transitionAssetUrl("idle", "thinking")).toBe(
      "/api/dsh-jx/character/transition-idle-thinking.webp",
    );
    expect(transitionAssetUrl("permission", "nod-smile")).toBe(
      "/api/dsh-jx/character/transition-permission-nod-smile.webp",
    );
  });
});
