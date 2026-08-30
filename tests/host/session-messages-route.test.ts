/**
 * 会话问话路由 HTTP seam 测试（工单 01 验收）。
 *
 * seam 模式对齐 tests/host/asset-routes.test.ts：真实 cordis Context + WebServer
 * （OS 分配端口）+ node:http 真实请求；sessionController 用 ctx.provide 注入
 * fake（inspect 按计划返回 {meta, events} 或对未知 id 抛错）——断言的是路由的
 * 外部可观察行为（状态码 + JSON 契约），不 mock webServer 内部。
 *
 * 覆盖：
 *   - GET /api/dsh-jx/session/<id>/messages → 200 + {title, prompts}；
 *   - title 折叠：取最新 `session/title` 事件的 data.title（log-backed 权威），
 *     无 title 事件 → null；
 *   - prompts 载荷经 collectConversation（过滤/配对语义由纯函数测试覆盖，
 *     此处只断言接线透传，含配对 reply）；
 *   - inspect 抛错（会话不存在/不可读）→ 404 + JSON error；
 *   - 方法限制：非 GET → 405；
 *   - 路径形状：不匹配 `/messages` 结尾等 → 404；
 *   - id 解码防御：malformed %-escape / 空 / null 字节 → 400；
 *   - 无副作用护栏：fake inspect 为纯读（路由只调用 inspect 一次、不改任何
 *     可观察宿主状态）。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import WebServer from "@deepseek-ai/dsh-host-webserver";
import {
  registerSessionMessagesRoute,
  SESSION_MESSAGES_PREFIX,
  type HostSessionEventLike,
  type SessionControllerLike,
} from "../../src/host/session-messages.ts";
import { request } from "../helpers/http.ts";

// ---------------------------------------------------------------------------
// 夹具：真实 Context + WebServer + fake sessionController
// ---------------------------------------------------------------------------

let ctx: Context | undefined;
let port: number;
let disposeRoute: (() => void) | undefined;
let disposeFake: (() => void) | undefined;
let inspectCalls: string[];
let inspectImpl: (
  id: string,
) => Promise<{ meta: unknown; events: HostSessionEventLike[] }>;

/** 直接用户问话事件（测试构造器）. */
function userMsg(seq: number, text: string): HostSessionEventLike {
  return {
    type: "user/message",
    seq,
    data: { source: { kind: "user" }, content: [{ type: "text", text }] },
  };
}

/** assistant 回复事件（文本在 data.message.content）. */
function assistantMsg(seq: number, text: string): HostSessionEventLike {
  return {
    type: "assistant/message",
    seq,
    data: { message: { source: { kind: "model" }, content: [{ type: "text", text }] } },
  };
}

/** session/title 事件（log-backed 标题，latest-wins）. */
function titleEvent(seq: number, title: string): HostSessionEventLike {
  return { type: "session/title", seq, data: { title } };
}

beforeEach(async () => {
  ctx = new Context();
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  port = ctx.webServer.port;
  inspectCalls = [];
  inspectImpl = async () => ({ meta: { id: "s1" }, events: [] });
  const fake: SessionControllerLike = {
    inspect: (sessionId: string) => {
      inspectCalls.push(sessionId);
      return inspectImpl(sessionId);
    },
  };
  disposeFake = ctx.provide("sessionController", fake);
  disposeRoute = registerSessionMessagesRoute(ctx);
});

afterEach(async () => {
  disposeRoute?.();
  disposeRoute = undefined;
  disposeFake?.();
  disposeFake = undefined;
  await ctx?.fiber.dispose();
  ctx = undefined;
});

/** 发 GET 并解析 JSON body。 */
async function getJson(
  path: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await request(port, "GET", path);
  return {
    status: res.status,
    json: JSON.parse(res.body.toString("utf8")) as Record<string, unknown>,
  };
}

describe("dsh-jx session messages route — GET /api/dsh-jx/session/<id>/messages", () => {
  it("返回 200 + {title, prompts}：问答按序透传（含配对 reply），title 取最新 session/title 事件", async () => {
    inspectImpl = async () => ({
      meta: { id: "abc" },
      events: [
        userMsg(1, "第一问"),
        titleEvent(2, "旧标题"),
        { type: "assistant/message", seq: 3, data: {} }, // malformed 回复：无 message → 不崩、reply 保持 null
        userMsg(4, "第二问"),
        assistantMsg(5, "第二问答复"),
        titleEvent(6, "最新标题"),
      ],
    });
    const { status, json } = await getJson(
      `${SESSION_MESSAGES_PREFIX}/abc/messages`,
    );
    expect(status).toBe(200);
    expect(json.title).toBe("最新标题");
    expect(json.prompts).toEqual([
      { seq: 1, text: "第一问", reply: null },
      { seq: 4, text: "第二问", reply: "第二问答复" },
    ]);
    expect(inspectCalls).toEqual(["abc"]);
  });

  it("无 session/title 事件时 title 为 null（client 回落气泡自身标题）", async () => {
    inspectImpl = async () => ({
      meta: { id: "abc" },
      events: [userMsg(1, "只有一问")],
    });
    const { status, json } = await getJson(
      `${SESSION_MESSAGES_PREFIX}/abc/messages`,
    );
    expect(status).toBe(200);
    expect(json.title).toBeNull();
    expect(json.prompts).toEqual([{ seq: 1, text: "只有一问", reply: null }]);
  });

  it("冷会话同契约：inspect 由宿主内部 fallback 持久化读，路由不感知（返回即预览）", async () => {
    // fake 无法区分 attached/冷会话——inspect 契约一致即是「冷会话可预览」的
    // 接线证明（inspect 语义本身由宿主保证，见 ADR-0028 D1）。
    inspectImpl = async () => ({
      meta: { id: "cold-1" },
      events: [userMsg(9, "冷会话问话")],
    });
    const { status, json } = await getJson(
      `${SESSION_MESSAGES_PREFIX}/cold-1/messages`,
    );
    expect(status).toBe(200);
    expect(json.prompts).toEqual([{ seq: 9, text: "冷会话问话", reply: null }]);
  });

  it("inspect 抛错（会话不存在/不可读）→ 404 + JSON error", async () => {
    inspectImpl = async () => {
      throw new Error("session not found");
    };
    const res = await request(
      port,
      "GET",
      `${SESSION_MESSAGES_PREFIX}/ghost/messages`,
    );
    expect(res.status).toBe(404);
    const json = JSON.parse(res.body.toString("utf8")) as Record<string, unknown>;
    expect(typeof json.error).toBe("string");
  });

  it("非 GET 方法 → 405", async () => {
    const res = await request(
      port,
      "POST",
      `${SESSION_MESSAGES_PREFIX}/abc/messages`,
    );
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toBe("GET");
  });

  it("路径形状不匹配（缺 /messages、多余段、裸前缀）→ 404", async () => {
    for (const path of [
      `${SESSION_MESSAGES_PREFIX}/abc`,
      `${SESSION_MESSAGES_PREFIX}/abc/messages/extra`,
      `${SESSION_MESSAGES_PREFIX}/abc/other`,
      `${SESSION_MESSAGES_PREFIX}`,
      `${SESSION_MESSAGES_PREFIX}/`,
    ]) {
      const res = await request(port, "GET", path);
      expect(res.status, path).toBe(404);
    }
  });

  it("id 防御：malformed %-escape / null 字节 → 400；空段被 URL 规范化 → 404；均不调用 inspect", async () => {
    // 空段（`//`）经 WHATWG URL 规范化后不再命中路由形状 → 404（与 asset-routes
    // 先例同源）；%zz 与 %00 不折叠、命中 handler 的解码/字节防御 → 400。
    const cases: Array<[string, number]> = [
      [`${SESSION_MESSAGES_PREFIX}/%zz/messages`, 400],
      [`${SESSION_MESSAGES_PREFIX}//messages`, 404],
      [`${SESSION_MESSAGES_PREFIX}/a%00b/messages`, 400],
    ];
    for (const [path, expected] of cases) {
      const res = await request(port, "GET", path);
      expect(res.status, path).toBe(expected);
    }
    expect(inspectCalls).toEqual([]);
  });

  it("超长 id → 400（合理边界，不打入 inspect）", async () => {
    const longId = "x".repeat(300);
    const res = await request(
      port,
      "GET",
      `${SESSION_MESSAGES_PREFIX}/${longId}/messages`,
    );
    expect(res.status).toBe(400);
    expect(inspectCalls).toEqual([]);
  });
});
