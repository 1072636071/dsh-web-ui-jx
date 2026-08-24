/**
 * 角色浮层状态机纯逻辑测试（工单 02：四态收敛验收，seam）。
 *
 * seam：输入意图断言输出（当前态、播放计划序列、落入的循环态）。
 * 纯逻辑测试，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（对齐工单 02 验收标准 + ADR-0016）：
 *   - 过渡边 22 条（PRD「20 边」收敛清单的有向展开）+ 弃用边查询返回 false。
 *   - 4 循环态互通：每对 (A, B) A≠B，dispatch switch to B 后 currentState=B，
 *     playback 末尾是 loop-B；working 的 loop url 为轮换素材（默认 thinking）。
 *   - planSwitch：直接过渡不存在（四态间一律经 idle 中转）→ [transition-A-idle,
 *     transition-idle-B, loop-B]；from===to 只播 loop；working 出入场素材注入。
 *   - 状态机行为：初始态、相同态不通知、subscribe/unsubscribe、连续切换。
 *   - 宿主事件接入口：五目标方法（idle/working/permission/error/done）。
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
  workingLoopAssetUrl,
  transitionAssetUrl,
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
// 20 过渡边确认（ADR-0016 D8「20 边」收敛清单；ADR-0023 移除 welcome 两边）
// ---------------------------------------------------------------------------

describe("overlay-state-machine: 20 过渡边（ADR-0016）", () => {
  it("TRANSITION_EDGES 恰好 20 条（有向段）", () => {
    expect(TRANSITION_EDGES).toHaveLength(20);
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
    expect(keys.size).toBe(20);
  });

  it("idle 与 8 端点双向互通（thinking/reading/permission/error/done/surprised/happy/angry，16 边）", () => {
    const endpoints = [
      "thinking",
      "reading",
      "permission",
      "error",
      "done",
      "surprised",
      "happy",
      "angry",
    ] as const;
    for (const s of endpoints) {
      expect(hasTransitionEdge("idle", s)).toBe(true);
      expect(hasTransitionEdge(s, "idle")).toBe(true);
    }
  });

  it("权限反馈链 4 边：permission→nod-smile、nod-smile→idle、permission→frown-wave、frown-wave→idle", () => {
    expect(hasTransitionEdge("permission", "nod-smile")).toBe(true);
    expect(hasTransitionEdge("nod-smile", "idle")).toBe(true);
    expect(hasTransitionEdge("permission", "frown-wave")).toBe(true);
    expect(hasTransitionEdge("frown-wave", "idle")).toBe(true);
  });

  it("弃用边查询返回 false（工单 02 验收）", () => {
    const deprecated: ReadonlyArray<
      readonly [string, string]
    > = [
      ["idle", "working"],
      ["working", "idle"],
      ["idle", "replying"],
      ["replying", "idle"],
      ["thinking", "replying"],
      ["replying", "thinking"],
      ["idle", "listening"],
      ["listening", "idle"],
      ["idle", "shush"],
      ["shush", "idle"],
      ["idle", "shy-smile"],
      ["shy-smile", "idle"],
      ["idle", "cheek-rest"],
      ["cheek-rest", "idle"],
      ["idle", "chin-rest"],
      ["chin-rest", "idle"],
      ["idle", "nod-smile"],
      ["idle", "frown-wave"],
      ["nod-smile", "permission"],
      ["frown-wave", "permission"],
    ];
    for (const [from, to] of deprecated) {
      expect(
        hasTransitionEdge(
          from as Parameters<typeof hasTransitionEdge>[0],
          to as Parameters<typeof hasTransitionEdge>[1],
        ),
        `${from}→${to} 应为弃用边`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// planSwitch：切换计划构造
// ---------------------------------------------------------------------------

describe("planSwitch: 切换计划构造", () => {
  it("from === to：只播 loop，无过渡（working 的 loop url 取入场素材）", () => {
    for (const s of OVERLAY_STATES) {
      const plan = planSwitch(s, s);
      expect(plan).toHaveLength(1);
      expect(plan[0].kind).toBe("loop");
      if (plan[0].kind === "loop") {
        expect(plan[0].state).toBe(s);
        expect(plan[0].url).toBe(
          s === "working" ? workingLoopAssetUrl("thinking") : loopAssetUrl(s),
        );
      }
    }
  });

  it("from === to 且为 working：loop url 取注入的入场素材", () => {
    const plan = planSwitch("working", "working", { workingEnterAsset: "reading" });
    expect(plan).toHaveLength(1);
    if (plan[0].kind === "loop") {
      expect(plan[0].state).toBe("working");
      expect(plan[0].url).toBe(workingLoopAssetUrl("reading"));
    }
  });

  it("非 idle 两两之间无直接边，经 idle 中转 [A→idle, idle→B, loop-B]", () => {
    const pairs: ReadonlyArray<
      readonly ["working" | "permission" | "error",
               "working" | "permission" | "error"]
    > = [
      ["working", "permission"],
      ["working", "error"],
      ["permission", "error"],
    ];
    for (const [from, to] of pairs) {
      for (const [a, b] of [
        [from, to],
        [to, from],
      ] as const) {
        expect(hasTransitionEdge(a, b), `${a}→${b}`).toBe(false);
        const plan = planSwitch(a, b);
        expect(plan, `${a}→${b}`).toHaveLength(3);
        const ts = transitionsOf(plan);
        expect(ts[0].from, `${a}→${b}`).toBe(
          a === "working" ? "thinking" : a,
        );
        expect(ts[0].to).toBe("idle");
        expect(ts[1].from).toBe("idle");
        expect(ts[1].to, `${a}→${b}`).toBe(
          b === "working" ? "thinking" : b,
        );
        expect(finalLoopOf(plan)?.state).toBe(b);
      }
    }
  });

  it("从 idle 出发：紧急态走直达边，working 经轮换素材入场", () => {
    // idle↔permission / idle↔error 是枢纽直达边：[transition-idle-X, loop-X]
    for (const to of ["permission", "error"] as const) {
      expect(hasTransitionEdge("idle", to)).toBe(true);
      const plan = planSwitch("idle", to);
      expect(plan, `idle→${to}`).toHaveLength(2);
      const ts = transitionsOf(plan);
      expect(ts[0].from).toBe("idle");
      expect(ts[0].to).toBe(to);
      expect(finalLoopOf(plan)?.state).toBe(to);
    }
    // idle→working 无直接边（弃用）：经 idle→thinking 入场
    expect(hasTransitionEdge("idle", "working")).toBe(false);
    const planW = planSwitch("idle", "working");
    expect(planW).toHaveLength(2);
    const tsW = transitionsOf(planW);
    expect(tsW[0].url).toBe(transitionAssetUrl("idle", "thinking"));
    if (finalLoopOf(planW) !== undefined) {
      expect(finalLoopOf(planW)?.state).toBe("working");
    }
  });

  it("working 出入场素材注入：thinking 素材切出、reading 素材切入", () => {
    const plan = planSwitch("working", "working", {
      workingExitAsset: "thinking",
      workingEnterAsset: "reading",
    });
    expect(plan).toHaveLength(1); // from === to 无切换
    // 经 idle 中转的 working→permission 用 exitAsset 切出
    const plan2 = planSwitch("working", "permission", {
      workingExitAsset: "reading",
    });
    const ts = transitionsOf(plan2);
    expect(ts[0].from).toBe("reading");
    expect(ts[0].to).toBe("idle");
    // idle→working 用 enterAsset 切入
    const plan3 = planSwitch("idle", "working", {
      workingEnterAsset: "reading",
    });
    const ts3 = transitionsOf(plan3);
    expect(ts3[0].from).toBe("idle");
    expect(ts3[0].to).toBe("reading");
    if (finalLoopOf(plan3) !== undefined) {
      expect(finalLoopOf(plan3)?.url).toBe(workingLoopAssetUrl("reading"));
    }
  });

  it("切回 idle：从任意态经 X→idle 过渡（playback 长度 2）", () => {
    for (const from of ["working", "permission", "error"] as const) {
      const plan = planSwitch(from, "idle");
      expect(plan).toHaveLength(2);
      const ts = transitionsOf(plan);
      expect(ts[0].from, `from=${from}`).toBe(
        from === "working" ? "thinking" : from,
      );
      expect(ts[0].to).toBe("idle");
      expect(finalLoopOf(plan)?.state).toBe("idle");
    }
  });
});

// ---------------------------------------------------------------------------
// 4 循环态互通 + 过渡只播一次
// ---------------------------------------------------------------------------

describe("createOverlayStateMachine: 4 循环态互通", () => {
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

  it("4 态两两组合（12 对 A≠B）全部可达", () => {
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
    expect(count).toBe(12); // 4*3
  });

  it("playback 里 transition 项不重复、loop 项只有一个在末尾", () => {
    for (const from of OVERLAY_STATES) {
      for (const to of OVERLAY_STATES) {
        if (from === to) continue;
        const sm = createOverlayStateMachine(from);
        sm.dispatch({ type: "switch", target: to });
        const pb = sm.getSnapshot().playback;
        const ts = transitionsOf(pb);
        const keys = new Set(ts.map((t) => `${t.from}|${t.to}`));
        expect(keys.size, `from=${from} to=${to}`).toBe(ts.length);
        expect(loopsOf(pb)).toHaveLength(1);
        expect(pb[pb.length - 1].kind).toBe("loop");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 状态机行为
// ---------------------------------------------------------------------------

describe("createOverlayStateMachine: 行为", () => {
  it("初始态为指定态，playback=[loop-initial]", () => {
    const sm = createOverlayStateMachine("working");
    const snap = sm.getSnapshot();
    expect(snap.currentState).toBe("working");
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
    sm.dispatch({ type: "switch", target: "working" });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].currentState).toBe("working");
  });

  it("subscribe 返回取消订阅函数", () => {
    const sm = createOverlayStateMachine("idle");
    let calls = 0;
    const unsub = sm.subscribe(() => calls++);
    sm.dispatch({ type: "switch", target: "working" });
    expect(calls).toBe(1);
    unsub();
    sm.dispatch({ type: "switch", target: "error" });
    expect(calls).toBe(1); // 取消后不再通知
  });

  it("连续切换：每次 dispatch 重置 playback 为新计划（经 idle 中转长度 3）", () => {
    const sm = createOverlayStateMachine("idle");
    sm.dispatch({ type: "switch", target: "working" });
    expect(sm.getSnapshot().currentState).toBe("working");
    expect(finalLoopOf(sm.getSnapshot().playback)?.state).toBe("working");

    sm.dispatch({ type: "switch", target: "error" });
    expect(sm.getSnapshot().currentState).toBe("error");
    expect(finalLoopOf(sm.getSnapshot().playback)?.state).toBe("error");
    // working → error 经 idle 中转（thinking-idle + idle-error + loop），长度 3
    expect(sm.getSnapshot().playback).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 宿主事件接入口（五目标收敛，ADR-0016 决策 12）
// ---------------------------------------------------------------------------

describe("createHostEventAdapter: 宿主事件接入口（五目标）", () => {
  it("每个方法 dispatch 对应的 switch 意图", () => {
    const sm = createOverlayStateMachine("idle");
    const adapter = createHostEventAdapter(sm);

    adapter.onAssistantWorking();
    expect(sm.getSnapshot().currentState).toBe("working");

    adapter.onAssistantPermission();
    expect(sm.getSnapshot().currentState).toBe("permission");

    adapter.onAssistantError();
    expect(sm.getSnapshot().currentState).toBe("error");

    adapter.onAssistantIdle();
    expect(sm.getSnapshot().currentState).toBe("idle");

    // done 目标语义入口：适配器落 idle（表演调度由 runtime 承担）
    adapter.onAssistantDone();
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
  it("loopAssetUrl: /api/dsh-jx/character/{state}.webp（含表演态）", () => {
    expect(loopAssetUrl("idle")).toBe("/api/dsh-jx/character/idle.webp");
    // thinking/reading 为 working 显示层轮换素材（ADR-0016），走 workingLoopAssetUrl。
    expect(workingLoopAssetUrl("thinking")).toBe(
      "/api/dsh-jx/character/thinking.webp",
    );
    expect(loopAssetUrl("surprised")).toBe(
      "/api/dsh-jx/character/surprised.webp",
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
