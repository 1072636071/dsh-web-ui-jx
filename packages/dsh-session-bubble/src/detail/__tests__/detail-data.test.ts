/**
 * detail-data 单元测试（工单 16-01）。
 *
 * 测试外部行为：给定 history 事件序列 / 缓存状态 / 配置 →
 * 断言预览结构与缓存策略；不测 DOM、网络时序。
 */

import { describe, expect, it, vi } from "vitest";
import type { ContentBlock, HistoryEntry } from "@deepseek-ai/dsh-client-connection/client";
import {
  createDshPreviewTransport,
  createPreviewCache,
  extractPreview,
  type PreviewTransport,
  type SessionPreview,
} from "../detail-data.ts";

// 构造最小 HistoryEntry 事件（只关心 type / data.content / surfaceOp）
function userMessage(text: string): HistoryEntry {
  return {
    event: {
      type: "user/message",
      seq: 0,
      time: 0,
      data: {
        id: "u1",
        role: "user",
        content: [{ type: "text", text } as ContentBlock],
        source: { kind: "user" },
      },
      surfaceOp: "append",
    },
  } as unknown as HistoryEntry;
}

function assistantMessage(text: string): HistoryEntry {
  return {
    event: {
      type: "assistant/message",
      seq: 0,
      time: 0,
      data: {
        turn: 1,
        step: 0,
        message: {
          id: "a1",
          role: "assistant",
          content: [{ type: "text", text } as ContentBlock],
          source: { kind: "model", provider: "x", model: "x" },
        },
      },
      surfaceOp: "append",
    },
  } as unknown as HistoryEntry;
}

function assistantChunk(text: string): HistoryEntry {
  return {
    event: {
      type: "assistant/chunk",
      seq: 0,
      time: 0,
      data: { turn: 1, step: 0, chunk: { type: "text-delta", index: 0, text } },
    },
  } as unknown as HistoryEntry;
}

function toolResult(text: string): HistoryEntry {
  return {
    event: {
      type: "tool/result",
      seq: 0,
      time: 0,
      data: {
        turn: 1,
        step: 0,
        message: {
          id: "t1",
          role: "tool",
          content: [{ type: "text", text } as ContentBlock],
          source: { kind: "tool" },
        },
      },
      surfaceOp: "append",
    },
  } as unknown as HistoryEntry;
}

const emptyPreview = (sessionId: string, title: string): SessionPreview => ({
  sessionId,
  title,
  lastUserText: "",
  lastAssistantText: "",
  inFlight: false,
  hasHistory: false,
});

describe("extractPreview", () => {
  it("空日志返回空预览", () => {
    const result = extractPreview({ title: "t", entries: [] });
    expect(result.lastUserText).toBe("");
    expect(result.lastAssistantText).toBe("");
    expect(result.inFlight).toBe(false);
    expect(result.hasHistory).toBe(false);
  });

  it("提取最后一条用户消息", () => {
    const result = extractPreview({
      title: "t",
      entries: [userMessage("hello"), assistantMessage("hi"), userMessage("again")],
    });
    expect(result.lastUserText).toBe("again");
    expect(result.lastAssistantText).toBe("hi");
    expect(result.hasHistory).toBe(true);
  });

  it("tool/result 不覆盖模型消息", () => {
    const result = extractPreview({
      title: "t",
      entries: [userMessage("u"), assistantMessage("a"), toolResult("tool")],
    });
    expect(result.lastUserText).toBe("u");
    expect(result.lastAssistantText).toBe("a");
  });

  it("空内容 assistant/message + chunk 视为 in-flight", () => {
    const entries: HistoryEntry[] = [
      userMessage("u"),
      {
        event: {
          type: "assistant/message",
          seq: 0,
          time: 0,
          data: {
            turn: 1,
            step: 0,
            message: {
              id: "a1",
              role: "assistant",
              content: [],
              source: { kind: "model", provider: "x", model: "x" },
            },
          },
          surfaceOp: "append",
        },
      } as unknown as HistoryEntry,
      assistantChunk("par"),
    ];
    const result = extractPreview({ title: "t", entries });
    expect(result.inFlight).toBe(true);
    expect(result.lastAssistantText).toBe("");
  });

  it("图片与工具调用给出占位文本", () => {
    const result = extractPreview({
      title: "t",
      entries: [
        {
          event: {
            type: "user/message",
            seq: 0,
            time: 0,
            data: {
              id: "u1",
              role: "user",
              content: [
                { type: "image", attachment: { id: "a", mediaType: "image/png" } } as unknown as ContentBlock,
                { type: "tool-call", id: "c", name: "calc", arguments: "{}" } as unknown as ContentBlock,
              ],
              source: { kind: "user" },
            },
            surfaceOp: "append",
          },
        } as unknown as HistoryEntry,
      ],
    });
    expect(result.lastUserText).toBe("[图片] 调用工具 calc");
  });
});

describe("createDshPreviewTransport", () => {
  it("业务错误静默降级", async () => {
    const api = {
      sessions: {
        history: vi.fn().mockResolvedValue({
          result: { ok: false, error: { code: "session-not-found", message: "x", details: { sessionId: "s1" } } },
        }),
      },
    } as unknown as Parameters<typeof createDshPreviewTransport>[0];

    const transport = createDshPreviewTransport(api);
    const preview = await transport.fetchPreview({ sessionId: "s1", title: "t", updatedAt: 1 });
    expect(preview).toEqual(emptyPreview("s1", "t"));
  });

  it("异常静默降级", async () => {
    const api = {
      sessions: {
        history: vi.fn().mockRejectedValue(new Error("timeout")),
      },
    } as unknown as Parameters<typeof createDshPreviewTransport>[0];

    const transport = createDshPreviewTransport(api);
    const preview = await transport.fetchPreview({ sessionId: "s2", title: "t", updatedAt: 1 });
    expect(preview).toEqual(emptyPreview("s2", "t"));
  });
});

describe("createPreviewCache", () => {
  it("TTL 内复用缓存、updatedAt 变化失效", async () => {
    let callCount = 0;
    const transport: PreviewTransport = {
      async fetchPreview({ sessionId, title, updatedAt }) {
        callCount++;
        return { sessionId, title, lastUserText: `u-${updatedAt}`, lastAssistantText: "a", inFlight: false, hasHistory: true };
      },
    };
    const cached = createPreviewCache(transport, { ttlMs: 60_000 });

    const first = await cached.fetchPreview({ sessionId: "s1", title: "t", updatedAt: 1 });
    expect(first.lastUserText).toBe("u-1");
    expect(callCount).toBe(1);

    const second = await cached.fetchPreview({ sessionId: "s1", title: "t", updatedAt: 1 });
    expect(second).toBe(first);
    expect(callCount).toBe(1);

    const third = await cached.fetchPreview({ sessionId: "s1", title: "t", updatedAt: 2 });
    expect(third.lastUserText).toBe("u-2");
    expect(callCount).toBe(2);
  });

  it("并发请求只触发一次 transport", async () => {
    let callCount = 0;
    let resolve!: (value: SessionPreview) => void;
    const transport: PreviewTransport = {
      async fetchPreview() {
        callCount++;
        return new Promise((r) => {
          resolve = r;
        });
      },
    };
    const cached = createPreviewCache(transport);

    const a = cached.fetchPreview({ sessionId: "s2", title: "t", updatedAt: 1 });
    const b = cached.fetchPreview({ sessionId: "s2", title: "t", updatedAt: 1 });
    resolve({ sessionId: "s2", title: "t", lastUserText: "u", lastAssistantText: "a", inFlight: false, hasHistory: true });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(callCount).toBe(1);
  });
});
