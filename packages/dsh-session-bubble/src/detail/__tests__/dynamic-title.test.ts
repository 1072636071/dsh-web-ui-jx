/**
 * dynamic-title 单元测试（工单 16-03 / 16-04）。
 *
 * 测试外部行为：提示词组装有界 / 响应解析 / transport 错误回退 / 刷新判定
 * （脏/TTL 触发、节流抑制、未配置短路）；不测 DOM、网络时序。
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildDynamicTitlePrompt,
  createDshDynamicTitleTransport,
  createDynamicTitleStore,
  decideTitleRefresh,
  parseDynamicTitleResponse,
  type DynamicTitleInput,
  type DynamicTitleResult,
  type DynamicTitleTransport,
} from "../dynamic-title.ts";

// ---------------------------------------------------------------------------
// 提示词组装（有界）
// ---------------------------------------------------------------------------

describe("buildDynamicTitlePrompt", () => {
  it("包含标题与最后用户消息上下文", () => {
    const prompt = buildDynamicTitlePrompt({ title: "修复登录 bug", lastUserText: "把报错发我" });
    expect(prompt).toContain("修复登录 bug");
    expect(prompt).toContain("把报错发我");
    expect(prompt).toContain("一句话动态标题");
  });

  it("空最后消息给占位行", () => {
    const prompt = buildDynamicTitlePrompt({ title: "t", lastUserText: "" });
    expect(prompt).toContain("（暂无用户消息）");
  });

  it("超长上下文被护栏截断（有界）", () => {
    const prompt = buildDynamicTitlePrompt(
      { title: "x".repeat(200), lastUserText: "y".repeat(500) },
      { maxTitleChars: 20, maxLastMessageChars: 30 },
    );
    expect(prompt).toContain("x".repeat(20));
    expect(prompt).not.toContain("x".repeat(21));
    expect(prompt).toContain("y".repeat(30));
    expect(prompt).not.toContain("y".repeat(31));
    expect(prompt.length).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// 响应解析
// ---------------------------------------------------------------------------

describe("parseDynamicTitleResponse", () => {
  it("解析成功标题并截断护栏", () => {
    const parsed = parseDynamicTitleResponse(
      { title: `  ${"在重构状态机".repeat(10)}  `, refreshIntervalMs: 60_000 },
      { maxTitleLength: 12 },
    );
    expect(parsed).toEqual({ kind: "configured", title: "在重构状态机".repeat(2), refreshIntervalMs: 60_000 });
  });

  it("未配置响应 → unconfigured", () => {
    expect(parseDynamicTitleResponse({ enabled: false, refreshIntervalMs: 300_000 })).toEqual({
      kind: "unconfigured",
      refreshIntervalMs: 300_000,
    });
  });

  it("错误/非法形状 → undefined", () => {
    expect(parseDynamicTitleResponse({ error: "boom" })).toBeUndefined();
    expect(parseDynamicTitleResponse(null)).toBeUndefined();
    expect(parseDynamicTitleResponse(42)).toBeUndefined();
    expect(parseDynamicTitleResponse({ title: "   " })).toBeUndefined();
  });

  it("缺 refreshIntervalMs 回落默认", () => {
    const parsed = parseDynamicTitleResponse({ title: "ok" });
    expect(parsed?.kind).toBe("configured");
    expect(parsed?.refreshIntervalMs).toBe(5 * 60_000);
  });
});

// ---------------------------------------------------------------------------
// 刷新判定（脏/TTL/节流/未配置短路）
// ---------------------------------------------------------------------------

describe("decideTitleRefresh", () => {
  const base = {
    configured: undefined,
    dirty: false,
    cachedTitle: undefined,
    lastAttemptAt: undefined,
    ttlMs: 15 * 60_000,
    minIntervalMs: 30_000,
    now: 1_000_000,
  };

  it("未探测过 → generate", () => {
    expect(decideTitleRefresh(base)).toBe("generate");
  });

  it("会话变脏 → generate（未节流）", () => {
    expect(
      decideTitleRefresh({
        ...base,
        configured: true,
        dirty: true,
        cachedTitle: "old",
        lastAttemptAt: base.now - 60_000,
      }),
    ).toBe("generate");
  });

  it("TTL 内且会话未更新 → reuse", () => {
    expect(
      decideTitleRefresh({
        ...base,
        configured: true,
        cachedTitle: "title",
        lastAttemptAt: base.now - 5_000,
      }),
    ).toBe("reuse");
  });

  it("TTL 过期且会话未更新 → generate", () => {
    expect(
      decideTitleRefresh({
        ...base,
        configured: true,
        cachedTitle: "title",
        lastAttemptAt: base.now - 16 * 60_000,
      }),
    ).toBe("generate");
  });

  it("节流间隔内且会话变脏 → 有缓存复用、无缓存跳过（抑制）", () => {
    expect(
      decideTitleRefresh({
        ...base,
        configured: true,
        dirty: true,
        cachedTitle: "old",
        lastAttemptAt: base.now - 1_000,
      }),
    ).toBe("reuse");
    expect(
      decideTitleRefresh({
        ...base,
        dirty: true,
        lastAttemptAt: base.now - 1_000,
      }),
    ).toBe("skip");
  });

  it("未配 API 且会话未更新 → skip（短路）", () => {
    expect(
      decideTitleRefresh({
        ...base,
        configured: false,
        cachedTitle: "",
        lastAttemptAt: base.now - 1_000,
      }),
    ).toBe("skip");
  });

  it("未配 API 但会话变脏 → 允许重探测（可能刚配置）", () => {
    expect(
      decideTitleRefresh({
        ...base,
        configured: false,
        dirty: true,
        lastAttemptAt: base.now - 60_000,
      }),
    ).toBe("generate");
  });

  it("未配 API 会话变脏但节流内 → skip", () => {
    expect(
      decideTitleRefresh({
        ...base,
        configured: false,
        dirty: true,
        lastAttemptAt: base.now - 1_000,
      }),
    ).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// DSH 默认 transport（错误回退）
// ---------------------------------------------------------------------------

describe("createDshDynamicTitleTransport", () => {
  const input: DynamicTitleInput = {
    sessionId: "s1",
    title: "t",
    updatedAt: 1,
    lastUserText: "u",
  };

  it("成功响应返回 configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: "在重构状态机", refreshIntervalMs: 60_000 }),
    });
    const transport = createDshDynamicTitleTransport({ fetchImpl });
    const result = await transport.generateTitle(input);
    expect(result).toEqual({ kind: "configured", title: "在重构状态机", refreshIntervalMs: 60_000 });
    // 请求体含上下文、不含 key
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.lastUserText).toBe("u");
    expect(body.title).toBe("t");
    expect("apiKey" in body).toBe(false);
  });

  it("未配置响应返回 unconfigured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, refreshIntervalMs: 300_000 }),
    });
    const transport = createDshDynamicTitleTransport({ fetchImpl });
    expect(await transport.generateTitle(input)).toEqual({
      kind: "unconfigured",
      refreshIntervalMs: 300_000,
    });
  });

  it("非 2xx / 异常 → undefined（静默降级）", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const transport = createDshDynamicTitleTransport({ fetchImpl });
    expect(await transport.generateTitle(input)).toBeUndefined();
  });

  it("网络异常 → undefined", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const transport = createDshDynamicTitleTransport({ fetchImpl });
    expect(await transport.generateTitle(input)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 缓存/节流 store（工单 16-04）
// ---------------------------------------------------------------------------

describe("createDynamicTitleStore", () => {
  const mkInput = (overrides: Partial<DynamicTitleInput> = {}): DynamicTitleInput => ({
    sessionId: "s1",
    title: "t",
    updatedAt: 1,
    lastUserText: "u",
    ...overrides,
  });

  function fakeTransport(): DynamicTitleTransport & { calls: number } {
    let calls = 0;
    return {
      get calls() {
        return calls;
      },
      async generateTitle(input) {
        calls++;
        return { kind: "configured", title: `标题-${input.updatedAt}`, refreshIntervalMs: 60_000 } as DynamicTitleResult;
      },
    };
  }

  it("同会话悬停复用缓存、不重复打 transport", async () => {
    const inner = fakeTransport();
    const store = createDynamicTitleStore(inner, { ttlMs: 60_000, now: () => 1_000 });
    const first = await store.generateTitle(mkInput());
    expect(first?.kind).toBe("configured");
    expect(inner.calls).toBe(1);
    const second = await store.generateTitle(mkInput());
    expect(second?.kind).toBe("configured");
    expect(inner.calls).toBe(1);
  });

  it("updatedAt 变化使缓存失效 → 重生成", async () => {
    let clock = 1_000;
    const inner = fakeTransport();
    const store = createDynamicTitleStore(inner, { ttlMs: 60_000, now: () => clock });
    await store.generateTitle(mkInput());
    // 越过节流窗口，会话更新 → 重生成
    clock = 100_000;
    const refreshed = await store.generateTitle(mkInput({ updatedAt: 2 }));
    expect(refreshed?.kind).toBe("configured");
    expect(inner.calls).toBe(2);
  });

  it("updatedAt 变化但节流窗口内 → 复用旧标题（不重打 transport）", async () => {
    const inner = fakeTransport();
    const store = createDynamicTitleStore(inner, { ttlMs: 60_000, now: () => 1_000 });
    await store.generateTitle(mkInput());
    const throttled = await store.generateTitle(mkInput({ updatedAt: 2 }));
    expect(throttled?.kind).toBe("configured");
    expect(inner.calls).toBe(1);
  });

  it("未配置短路：返回 unconfigured，不重复打 transport", async () => {
    let calls = 0;
    const inner: DynamicTitleTransport = {
      async generateTitle() {
        calls++;
        return { kind: "unconfigured", refreshIntervalMs: 300_000 };
      },
    };
    const store = createDynamicTitleStore(inner, { ttlMs: 60_000, now: () => 1_000 });
    const first = await store.generateTitle(mkInput());
    expect(first?.kind).toBe("unconfigured");
    const second = await store.generateTitle(mkInput());
    expect(second?.kind).toBe("unconfigured");
    expect(calls).toBe(1);
  });

  it("传输失败不覆盖状态、有旧缓存继续展示", async () => {
    let clock = 1_000;
    let fail = false;
    const inner: DynamicTitleTransport = {
      async generateTitle(input) {
        if (fail) throw new Error("network");
        return { kind: "configured", title: "旧标题", refreshIntervalMs: 60_000 };
      },
    };
    const store = createDynamicTitleStore(inner, { ttlMs: 60_000, now: () => clock });
    const first = await store.generateTitle(mkInput());
    expect(first?.kind).toBe("configured");
    clock = 100_000;
    fail = true;
    const degraded = await store.generateTitle(mkInput({ updatedAt: 2 }));
    // 失败后仍展示旧缓存
    expect(degraded?.kind).toBe("configured");
    expect(degraded).toMatchObject({ title: "旧标题" });
  });
});
