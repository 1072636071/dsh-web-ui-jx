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
        running: true,
        completed: false,
        parentId: undefined,
        origin: undefined,
      },
      {
        sessionId: "s2",
        title: "会话二",
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
