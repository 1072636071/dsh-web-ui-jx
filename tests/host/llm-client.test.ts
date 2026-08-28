/**
 * llm-client 适配器测试（17-06）：URL 归一化 / Bearer 认证 / 响应解析 / 超时。
 * 经注入 fetchImpl 直测适配器，不经 HTTP seam。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOpenAiClient,
  extractContent,
  resolveChatCompletionsUrl,
} from "../../src/host/llm-client.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("resolveChatCompletionsUrl", () => {
  it("无后缀 → 追加 /chat/completions；去除尾部斜杠", () => {
    expect(resolveChatCompletionsUrl("https://llm.example.com/v1")).toBe(
      "https://llm.example.com/v1/chat/completions",
    );
    expect(resolveChatCompletionsUrl("https://llm.example.com/v1/")).toBe(
      "https://llm.example.com/v1/chat/completions",
    );
  });

  it("已带后缀 → 原样使用（去除空白与尾部斜杠）", () => {
    expect(
      resolveChatCompletionsUrl("https://llm.example.com/chat/completions"),
    ).toBe("https://llm.example.com/chat/completions");
    expect(
      resolveChatCompletionsUrl(" https://llm.example.com/v1/chat/completions/ "),
    ).toBe("https://llm.example.com/v1/chat/completions");
  });
});

describe("extractContent", () => {
  it("提取 choices[0].message.content 并去空白", () => {
    expect(
      extractContent({ choices: [{ message: { content: "  在重构状态机  " } }] }),
    ).toBe("在重构状态机");
  });

  it("60 字护栏截断", () => {
    expect(
      extractContent({ choices: [{ message: { content: "x".repeat(80) } }] }),
    ).toHaveLength(60);
  });

  it("缺 choices / 非对象 / content 非字符串 / 空 → undefined", () => {
    expect(extractContent(null)).toBeUndefined();
    expect(extractContent({})).toBeUndefined();
    expect(extractContent({ choices: [] })).toBeUndefined();
    expect(extractContent({ choices: [{ message: { content: 7 } }] })).toBeUndefined();
    expect(
      extractContent({ choices: [{ message: { content: "   " } }] }),
    ).toBeUndefined();
  });
});

describe("createOpenAiClient", () => {
  function mockFetchResponse(overrides?: Partial<Response>): Response {
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "标题" } }] }),
      ...overrides,
    } as Response;
  }

  it("POST 到归一化 URL + Bearer 认证 + 模型/提示词", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockFetchResponse());
    const client = createOpenAiClient({ fetchImpl });

    const result = await client.chat("你是观察员", {
      baseURL: "https://llm.example.com/v1",
      model: "deepseek-chat",
      apiKey: "sk-123",
    });

    expect(result).toBe("标题");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-123",
    );
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("deepseek-chat");
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "你是观察员",
    });
  });

  it("非 2xx → undefined", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockFetchResponse({ ok: false, status: 500 }));
    const client = createOpenAiClient({ fetchImpl });
    expect(
      await client.chat("p", { baseURL: "http://x", model: "m", apiKey: "k" }),
    ).toBeUndefined();
  });

  it("响应缺 choices → undefined", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockFetchResponse({ json: async () => ({ choices: [] }) }),
      );
    const client = createOpenAiClient({ fetchImpl });
    expect(
      await client.chat("p", { baseURL: "http://x", model: "m", apiKey: "k" }),
    ).toBeUndefined();
  });

  it("fetch 抛错（网络抖动）→ undefined", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network"));
    const client = createOpenAiClient({ fetchImpl });
    expect(
      await client.chat("p", { baseURL: "http://x", model: "m", apiKey: "k" }),
    ).toBeUndefined();
  });

  it("超时中止 → undefined", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("Aborted")),
          );
        }),
    );
    const client = createOpenAiClient({ fetchImpl, timeoutMs: 1000 });

    const pending = client.chat("p", {
      baseURL: "http://x",
      model: "m",
      apiKey: "k",
    });
    const assertion = pending.then((result) =>
      expect(result).toBeUndefined(),
    );
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });
});
