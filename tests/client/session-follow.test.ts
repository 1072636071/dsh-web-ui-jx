/**
 * session-follow 纯函数测试：diffTarget 差分推导。
 *
 * 重点覆盖 permission（pending）的上升沿与**下降沿**：
 *   - 上升沿（请求授权）→ "permission"（既有行为）。
 *   - 下降沿（授权完成/拒绝/问题回答）必须补一个目标态——否则工具调用计数、
 *     running 等其余字段无上升沿时返回 null，角色会在授权完成后一直停在
 *     「要权限」动画上（回归：授权完毕动画还在要权限）。
 *
 * @module dsh-web-ui-jx/client
 */

import { describe, expect, it } from "vitest";
import { diffTarget, type SnapshotCore } from "../../src/client/state-machine/session-follow.ts";

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

describe("diffTarget: permission 上升沿（既有行为）", () => {
  it("初次快照 pending=true → permission", () => {
    expect(diffTarget(null, core({ pending: true }))).toBe("permission");
  });

  it("pending false→true → permission", () => {
    const prev = core({ running: true, runningCallsCount: 1 });
    const curr = core({ running: true, runningCallsCount: 1, pending: true });
    expect(diffTarget(prev, curr)).toBe("permission");
  });
});

describe("diffTarget: permission 下降沿（授权完成必须补目标态）", () => {
  it("授权通过、工具调用继续（runningCalls 不变 >0）→ working（回归主场景）", () => {
    const prev = core({
      running: true,
      runningCallsCount: 1,
      pending: true,
    });
    const curr = core({
      running: true,
      runningCallsCount: 1,
      pending: false,
    });
    expect(diffTarget(prev, curr)).toBe("working");
  });

  it("问题回答后模型继续输出（running + 可见 chunk）→ replying", () => {
    const prev = core({
      running: true,
      hasVisibleChunk: true,
      pending: true,
    });
    const curr = core({
      running: true,
      hasVisibleChunk: true,
      pending: false,
    });
    expect(diffTarget(prev, curr)).toBe("replying");
  });

  it("授权后会话继续但暂无工具与输出 → thinking", () => {
    const prev = core({ running: true, pending: true });
    const curr = core({ running: true, pending: false });
    expect(diffTarget(prev, curr)).toBe("thinking");
  });

  it("拒绝/中止导致回合结束（running 落 false）→ done", () => {
    const prev = core({ running: true, runningCallsCount: 1, pending: true });
    const curr = core({ running: false, runningCallsCount: 1, pending: false });
    expect(diffTarget(prev, curr)).toBe("done");
  });

  it("pending 下降沿同时 error 在场 → error 优先", () => {
    const prev = core({ running: true, pending: true });
    const curr = core({ running: false, pending: false, hasError: true });
    expect(diffTarget(prev, curr)).toBe("error");
  });

  it("无下降沿时其余字段不变仍返回 null（不误报）", () => {
    const prev = core({ running: true, runningCallsCount: 1 });
    const curr = core({ running: true, runningCallsCount: 1 });
    expect(diffTarget(prev, curr)).toBe(null);
  });
});
