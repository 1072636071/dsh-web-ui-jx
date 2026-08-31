/**
 * session-list-adapter 纯逻辑测试（SDK 会话列表 → 领域条目的投影）。
 *
 * seam：输入 SDK 形状 SessionListState（ids + byId），断言输出 SessionListEntry[]。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）；SDK 仅为类型，运行期
 * 用普通对象构造输入。
 *
 * 覆盖（对齐 SessionBubbleList 派生逻辑的既有行为 + ADR-0018 谱系字段）：
 *   - 按 ids 顺序投影，只取 sessionId/title/running/completed/parentId/origin
 *   - completed / parentId / origin 缺省 → false / undefined / undefined
 *   - byId 缺失的 id 跳过
 *   - 空列表 → 空
 */

import { describe, expect, it } from "vitest";
import { deriveSessionListEntries } from "../session-list-adapter.ts";

// ---------------------------------------------------------------------------
// 辅助构造 SDK 形状输入（类型见 @deepseek-ai/dsh-client-runtime/client）
// ---------------------------------------------------------------------------

interface FakeSummary {
  id: string;
  title?: string;
  updatedAt?: number;
  running: boolean;
  completed?: boolean;
  parentId?: string;
  origin?: "subagent";
}

function listState(
  summaries: FakeSummary[],
  opts: { extraId?: string } = {},
): {
  ids: string[];
  byId: Record<string, FakeSummary>;
} {
  const ids = summaries.map((s) => s.id);
  if (opts.extraId) ids.push(opts.extraId);
  const byId: Record<string, FakeSummary> = {};
  for (const s of summaries) byId[s.id] = s;
  return { ids, byId };
}

// ---------------------------------------------------------------------------
// 投影规则
// ---------------------------------------------------------------------------

describe("session-list-adapter: 投影", () => {
  it("按 ids 顺序投影，只取关心字段（含谱系字段，ADR-0018）", () => {
    const state = listState([
      { id: "s1", title: "会话一", running: true },
      {
        id: "s2",
        title: "会话二",
        running: false,
        completed: true,
        parentId: "s1",
        origin: "subagent",
      },
    ]);
    const out = deriveSessionListEntries(state as never);
    expect(out).toEqual([
      {
        sessionId: "s1",
        title: "会话一",
        updatedAt: 0,
        running: true,
        completed: false,
        parentId: undefined,
        origin: undefined,
      },
      {
        sessionId: "s2",
        title: "会话二",
        updatedAt: 0,
        running: false,
        completed: true,
        parentId: "s1",
        origin: "subagent",
      },
    ]);
  });

  it("completed 缺省 → false", () => {
    const state = listState([{ id: "s1", running: true }]);
    const out = deriveSessionListEntries(state as never);
    expect(out[0]?.completed).toBe(false);
  });

  it("byId 缺失的 id 跳过（防御性）", () => {
    const state = listState([{ id: "s1", running: true }], {
      extraId: "ghost",
    });
    const out = deriveSessionListEntries(state as never);
    expect(out.map((e) => e.sessionId)).toEqual(["s1"]);
  });

  it("空列表 → 空", () => {
    const out = deriveSessionListEntries({ ids: [], byId: {} } as never);
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 待交互源投影（宿主 SDK 升级后 pendingInteraction 迁至 uiSession.pendingInteractions）
// ---------------------------------------------------------------------------

describe("session-list-adapter: 待交互源投影（pendingInteractions Map）", () => {
  it("Map 命中 → pendingInteraction 落键（approval/plan-review/question）", () => {
    const state = listState([
      { id: "s1", running: true },
      { id: "s2", running: true },
      { id: "s3", running: false },
    ]);
    const pending = new Map([
      ["s1", { kind: "approval" }],
      ["s2", { kind: "question" }],
      ["s3", { kind: "plan-review" }],
    ]);
    const out = deriveSessionListEntries(state as never, pending);
    expect(out[0]?.pendingInteraction).toBe("approval");
    expect(out[1]?.pendingInteraction).toBe("question");
    expect(out[2]?.pendingInteraction).toBe("plan-review");
  });

  it("Map 未命中 / 未知 kind → 不落 pendingInteraction 键", () => {
    const state = listState([
      { id: "s1", running: true },
      { id: "s2", running: true },
    ]);
    const pending = new Map([["s2", { kind: "some-future-domain" }]]);
    const out = deriveSessionListEntries(state as never, pending);
    expect(out[0]?.pendingInteraction).toBeUndefined();
    expect(out[1]?.pendingInteraction).toBeUndefined();
  });

  it("Map 在场时以 Map 为准（忽略 summary 遗留 pendingInteraction 字段）", () => {
    const state = listState([{ id: "s1", running: true }]);
    // 旧宿主字段在场但 Map 未命中 → 以 Map（新事实源）为准
    (state.byId.s1 as Record<string, unknown>).pendingInteraction = "approval";
    const out = deriveSessionListEntries(state as never, new Map());
    expect(out[0]?.pendingInteraction).toBeUndefined();
  });

  it("未传 Map → 回退 summary 遗留字段（旧宿主兼容）", () => {
    const state = listState([{ id: "s1", running: true }]);
    (state.byId.s1 as Record<string, unknown>).pendingInteraction = "question";
    const out = deriveSessionListEntries(state as never);
    expect(out[0]?.pendingInteraction).toBe("question");
  });
});
