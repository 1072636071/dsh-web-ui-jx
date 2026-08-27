/**
 * ai-title 路由 HTTP seam 测试（工单 16-03 验收）。
 *
 * seam：真实 cordis Context + WebServer（OS 分配端口）+ 注入 mock settings /
 * credentials（仅模拟存储与解析，不 mock webServer）；LLM 调用用全局 fetch
 * mock。断言响应状态码 / JSON body / endpoint URL 归一化 / 失败降级路径。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import WebServer from "@deepseek-ai/dsh-host-webserver";
import { registerAiTitleRoute, AI_TITLE_ROUTE_PREFIX } from "../../src/host/ai-title-route.ts";
import { request } from "../helpers/http.ts";

/** 测试内可变配置（每用例注入 mock settings scope 读取）。 */
let currentConfig: {
  enabled: boolean;
  baseURL: string;
  model: string;
  apiKeyEnv: string;
  refreshIntervalMin: number;
};
/** 测试内可变凭据（mock credentials 读取）。 */
let currentKey: string | undefined;

let ctx: Context | undefined;
let port: number;
let disposeRoutes: (() => void) | undefined;

const mockFetch = vi.fn<typeof fetch>();

function bootstrap(): void {
  ctx = new Context();
  // 在启动 WebServer 前注入 mock 服务（root fiber 运行前可直接提供）。
  ctx.provide("settings", {
    register: () => ({
      get: () => ({ aiTitle: { ...currentConfig } }),
      watch: () => () => {},
      update: async () => {},
      replace: async () => {},
    }),
  } as never);
  ctx.provide("credentials", {
    resolve: async (ref: string) =>
      ref === currentConfig.apiKeyEnv && currentKey !== undefined
        ? { value: currentKey, source: "test" }
        : undefined,
  } as never);
}

beforeEach(async () => {
  vi.useFakeTimers();
  currentConfig = {
    enabled: true,
    baseURL: "https://llm.example.com/v1",
    model: "test-model",
    apiKeyEnv: "TEST_API_KEY",
    refreshIntervalMin: 5,
  };
  currentKey = "sk-test-123";
  mockFetch.mockReset();
  bootstrap();
  await ctx!.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  port = ctx!.webServer.port;
  disposeRoutes = registerAiTitleRoute(ctx!);
});

afterEach(async () => {
  disposeRoutes?.();
  disposeRoutes = undefined;
  await ctx?.fiber.dispose();
  ctx = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function postBody(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf8");
}

describe("dsh-jx ai-title route — /api/dsh-jx/ai-title (real HTTP seam)", () => {
  it("生成成功：200 { title, refreshIntervalMs }，LLM 走 OpenAI 兼容协议", async () => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: " 在重构状态机 " } }],
      }),
    } as Response);

    const res = await request(
      port,
      "POST",
      AI_TITLE_ROUTE_PREFIX,
      postBody({ sessionId: "s1", title: "会话", lastUserText: "帮我重构" }),
      { "content-type": "application/json" },
    );
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body.toString("utf8")) as { title?: string; refreshIntervalMs?: number };
    expect(data.title).toBe("在重构状态机");
    expect(data.refreshIntervalMs).toBe(5 * 60_000);

    // LLM 请求：URL 归一化 + Bearer key + 有界提示词，浏览器零 key 暴露
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test-123");
    const body = JSON.parse(String(init.body)) as { model: string; messages: { role: string; content: string }[] };
    expect(body.model).toBe("test-model");
    expect(body.messages[0].content).toContain("帮我重构");
  });

  it("baseURL 已带 /chat/completions 后缀时不再追加", async () => {
    vi.stubGlobal("fetch", mockFetch);
    currentConfig.baseURL = "https://llm.example.com/chat/completions";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "标题" } }] }),
    } as Response);

    await request(port, "POST", AI_TITLE_ROUTE_PREFIX, postBody({ title: "t", lastUserText: "u" }));
    expect(mockFetch.mock.calls[0][0]).toBe("https://llm.example.com/chat/completions");
  });

  it("开关关闭：200 { enabled: false } 且不调用 LLM", async () => {
    vi.stubGlobal("fetch", mockFetch);
    currentConfig.enabled = false;
    const res = await request(port, "POST", AI_TITLE_ROUTE_PREFIX, postBody({ title: "t", lastUserText: "u" }));
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body.toString("utf8")) as { enabled?: boolean; refreshIntervalMs?: number };
    expect(data.enabled).toBe(false);
    expect(data.refreshIntervalMs).toBe(5 * 60_000);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("凭据缺失：200 { enabled: false } 且不调用 LLM", async () => {
    vi.stubGlobal("fetch", mockFetch);
    currentKey = undefined;
    const res = await request(port, "POST", AI_TITLE_ROUTE_PREFIX, postBody({ title: "t", lastUserText: "u" }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString("utf8"))).toMatchObject({ enabled: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("LLM 失败（非 2xx）：200 { error } 静默降级", async () => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    const res = await request(port, "POST", AI_TITLE_ROUTE_PREFIX, postBody({ title: "t", lastUserText: "u" }));
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body.toString("utf8")) as { error?: string };
    expect(typeof data.error).toBe("string");
  });

  it("LLM 响应无 choices：200 { error }", async () => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    } as Response);
    const res = await request(port, "POST", AI_TITLE_ROUTE_PREFIX, postBody({ title: "t", lastUserText: "u" }));
    expect(JSON.parse(res.body.toString("utf8"))).toMatchObject({ error: "dynamic title generation failed" });
  });

  it("非 POST → 405", async () => {
    const res = await request(port, "GET", AI_TITLE_ROUTE_PREFIX);
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toBe("POST");
  });

  it("空/非法 body → 400", async () => {
    const empty = await request(port, "POST", AI_TITLE_ROUTE_PREFIX);
    expect(empty.status).toBe(400);
    const bad = await request(port, "POST", AI_TITLE_ROUTE_PREFIX, Buffer.from("not-json"));
    expect(bad.status).toBe(400);
  });
});
