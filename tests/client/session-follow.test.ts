/**
 * session-follow 纯函数测试：diffTarget 差分推导（工单 02：事件映射收敛）。
 *
 * ADR-0016 D13 收敛后的全分支覆盖：
 *   - error 上升沿 → switch error（硬切）。
 *   - pending 上升沿 → switch permission（硬切）。
 *   - pending 下降沿 + running 继续 → perform nod-smile（批准）；
 *     pending 下降沿 + running 终止 → perform frown-wave（拒绝）；
 *     error 在场时 pending 下降沿跳过（紧急态优先）。
 *   - running 下降沿（无 error/pending）→ perform done。
 *   - error 下降沿（错误恢复）→ running 继续 switch working / 等审批回 permission。
 *   - running 上升沿 → switch working（防抖由 runtime 承担）。
 *   - 全静 → switch idle。
 *
 * @module dsh-web-ui-jx/client
 */

import { describe, expect, it } from "vitest";
import {
  diffTarget,
  extractCore,
  type SessionSnapshotLike,
  type SnapshotCore,
} from "../../src/client/state-machine/session-follow.ts";

/** 构造核心快照（只填差分关心字段）. */
function core(
  opts: {
    running?: boolean;
    hasVisibleChunk?: boolean;
    runningCallsCount?: number;
    pending?: boolean;
    hasError?: boolean;
  } = {},
): SnapshotCore {
  return {
    running: opts.running ?? false,
    hasVisibleChunk: opts.hasVisibleChunk ?? false,
    runningCallsCount: opts.runningCallsCount ?? 0,
    pending: opts.pending ?? false,
    hasError: opts.hasError ?? false,
  };
}

describe("diffTarget: error 上升沿（硬切）", () => {
  it("初次快照 hasError=true → switch error", () => {
    expect(diffTarget(null, core({ hasError: true }))).toEqual({
      kind: "switch",
      target: "error",
    });
  });

  it("hasError false→true → switch error", () => {
    const prev = core({ running: true, runningCallsCount: 1 });
    const curr = core({ running: true, runningCallsCount: 1, hasError: true });
    expect(diffTarget(prev, curr)).toEqual({ kind: "switch", target: "error" });
  });
});

describe("diffTarget: permission 上升沿（硬切）", () => {
  it("初次快照 pending=true → switch permission", () => {
    expect(diffTarget(null, core({ pending: true }))).toEqual({
      kind: "switch",
      target: "permission",
    });
  });

  it("pending false→true → switch permission", () => {
    const prev = core({ running: true, runningCallsCount: 1 });
    const curr = core({ running: true, runningCallsCount: 1, pending: true });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "switch",
      target: "permission",
    });
  });
});

describe("diffTarget: pending 下降沿（批准/拒绝启发式）", () => {
  it("批准（running 继续，工具调用中）→ perform nod-smile", () => {
    const prev = core({ running: true, runningCallsCount: 1, pending: true });
    const curr = core({ running: true, runningCallsCount: 1, pending: false });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "perform",
      performance: "nod-smile",
    });
  });

  it("批准（running 继续，可见输出中）→ perform nod-smile（不再细分 replying）", () => {
    const prev = core({ running: true, hasVisibleChunk: true, pending: true });
    const curr = core({ running: true, hasVisibleChunk: true, pending: false });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "perform",
      performance: "nod-smile",
    });
  });

  it("拒绝/中止（running 终止）→ perform frown-wave", () => {
    const prev = core({ running: true, runningCallsCount: 1, pending: true });
    const curr = core({ running: false, runningCallsCount: 1, pending: false });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "perform",
      performance: "frown-wave",
    });
  });

  it("pending 下降沿同时 error 在场 → 不触发表演（紧急态优先，error 上升沿已先行）", () => {
    const prev = core({ running: true, pending: true });
    const curr = core({ running: false, pending: false, hasError: true });
    expect(diffTarget(prev, curr)).toEqual({ kind: "switch", target: "error" });
  });

  it("error 持续在场时 pending 下降沿 → null（角色停在 error）", () => {
    const prev = core({ running: true, pending: true, hasError: true });
    const curr = core({ running: true, pending: false, hasError: true });
    expect(diffTarget(prev, curr)).toBe(null);
  });
});

describe("diffTarget: running 下降沿 → done 表演", () => {
  it("running true→false（无 error/pending）→ perform done", () => {
    const prev = core({ running: true, runningCallsCount: 1 });
    const curr = core({ running: false, runningCallsCount: 0 });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "perform",
      performance: "done",
    });
  });

  it("running 下降沿 + pending 在场 → 不触发 done", () => {
    const prev = core({ running: true, pending: true });
    const curr = core({ running: false, pending: true });
    expect(diffTarget(prev, curr)).toBe(null);
  });
});

describe("diffTarget: error 下降沿（错误恢复）", () => {
  it("恢复时回合继续（running）→ switch working", () => {
    const prev = core({ running: true, hasError: true });
    const curr = core({ running: true, hasError: false });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "switch",
      target: "working",
    });
  });

  it("恢复时已在等审批 → switch permission", () => {
    const prev = core({ running: true, hasError: true, pending: true });
    const curr = core({ running: true, hasError: false, pending: true });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "switch",
      target: "permission",
    });
  });

  it("恢复时全静 → 落全静兜底 switch idle", () => {
    const prev = core({ hasError: true });
    const curr = core({});
    expect(diffTarget(prev, curr)).toEqual({ kind: "switch", target: "idle" });
  });
});

describe("diffTarget: working 上升沿（统一映射）", () => {
  it("初次快照 running=true → switch working", () => {
    expect(diffTarget(null, core({ running: true }))).toEqual({
      kind: "switch",
      target: "working",
    });
  });

  it("running false→true（无工具调用）→ switch working（不再细分 thinking）", () => {
    const prev = core({});
    const curr = core({ running: true });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "switch",
      target: "working",
    });
  });

  it("running false→true（有工具调用）→ switch working", () => {
    const prev = core({});
    const curr = core({ running: true, runningCallsCount: 2 });
    expect(diffTarget(prev, curr)).toEqual({
      kind: "switch",
      target: "working",
    });
  });

  it("可见 chunk 出现但 running 未变 → null（已并入 working，无细分目标）", () => {
    const prev = core({ running: true });
    const curr = core({ running: true, hasVisibleChunk: true });
    expect(diffTarget(prev, curr)).toBe(null);
  });
});

describe("diffTarget: 全静兜底", () => {
  it("初次快照全静 → switch idle", () => {
    expect(diffTarget(null, core({}))).toEqual({
      kind: "switch",
      target: "idle",
    });
  });

  it("prev running → 全静是 running 下降沿（done 表演优先于兜底）", () => {
    expect(diffTarget(core({ running: true }), core({}))).toEqual({
      kind: "perform",
      performance: "done",
    });
  });

  it("无变化返回 null（不误报）", () => {
    const prev = core({ running: true, runningCallsCount: 1 });
    const curr = core({ running: true, runningCallsCount: 1 });
    expect(diffTarget(prev, curr)).toBe(null);
  });

  it("持续全静 → null", () => {
    expect(diffTarget(core({}), core({}))).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// extractCore：新版宿主 SessionSnapshot 形状适配
//（宿主 SDK 升级后 SessionSnapshot 移除 partial/runningCalls/pending 字段；
//  pending 改由 uiSession.pendingInteractions 外部源注入）
// ---------------------------------------------------------------------------

/** 构造新版宿主形状的快照（只含 SessionSnapshot 现存字段）. */
function hostSnapshot(
  opts: {
    running?: boolean;
    promptError?: unknown;
    openError?: unknown;
    lastAgentError?: string | null;
  } = {},
): SessionSnapshotLike {
  return {
    running: opts.running ?? false,
    promptError: opts.promptError ?? null,
    openError: opts.openError ?? null,
    lastAgentError: opts.lastAgentError ?? null,
  };
}

describe("extractCore: 新版宿主 SessionSnapshot 形状", () => {
  it("无 partial/runningCalls/pending 字段的快照不抛错，running 映射", () => {
    expect(extractCore(hostSnapshot({ running: true }))).toEqual({
      running: true,
      hasVisibleChunk: false,
      runningCallsCount: 0,
      pending: false,
      hasError: false,
    });
  });

  it("pending 由外部源注入（true/false 两路）", () => {
    expect(extractCore(hostSnapshot({ running: true }), true).pending).toBe(
      true,
    );
    expect(extractCore(hostSnapshot({ running: true }), false).pending).toBe(
      false,
    );
    expect(extractCore(hostSnapshot({ running: true })).pending).toBe(false);
  });

  it("promptError / openError / lastAgentError 任一在场 → hasError", () => {
    expect(
      extractCore(hostSnapshot({ promptError: { op: "send" } })).hasError,
    ).toBe(true);
    expect(
      extractCore(hostSnapshot({ openError: { code: "x" } })).hasError,
    ).toBe(true);
    expect(
      extractCore(hostSnapshot({ lastAgentError: "boom" })).hasError,
    ).toBe(true);
    expect(extractCore(hostSnapshot()).hasError).toBe(false);
  });

  it("新形状快照驱动 diffTarget：running 上升沿 → switch working（不抛错）", () => {
    const curr = extractCore(hostSnapshot({ running: true }));
    expect(diffTarget(null, curr)).toEqual({ kind: "switch", target: "working" });
  });
});
