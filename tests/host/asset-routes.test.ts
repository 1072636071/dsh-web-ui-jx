/**
 * 素材路由 HTTP seam 测试（工单 02 验收）。
 *
 * seam 1：不 mock webServer。每个用例启动真实 cordis Context + WebServer 插件
 * （OS 分配端口），注册 `/api/dsh-jx/*` 路由后用 `node:http` 发真实 HTTP 请求，
 * 断言响应状态码 / Content-Type / Content-Length / 字节流 magic bytes。
 *
 * 用 `node:http` 而非 `fetch` 发请求：`fetch` 会规范化 URL（折叠 `..`、解码 `%2e`），
 * 无法探测路径穿越防御；`http.request` 原样发送 path 字段，可控且语义明确。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import WebServer from "@deepseek-ai/dsh-host-webserver";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  registerAssetRoutes,
  ASSET_ROUTE_PREFIX,
  __ASSETS_ROOT_FOR_TEST,
} from "../../src/host/asset-routes.ts";
import { request } from "../helpers/http.ts";

let ctx: Context | undefined;
let port: number;
let disposeRoutes: (() => void) | undefined;

beforeEach(async () => {
  ctx = new Context();
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  port = ctx.webServer.port;
  disposeRoutes = registerAssetRoutes(ctx);
});

afterEach(async () => {
  disposeRoutes?.();
  disposeRoutes = undefined;
  await ctx?.fiber.dispose();
  ctx = undefined;
});

describe("dsh-jx asset routes — /api/dsh-jx/* (real HTTP seam)", () => {
  it("serves a character webp with image/webp and RIFF magic bytes", async () => {
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/character/idle.webp`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.headers["content-length"]).toBe(String(res.body.length));
    // 缓存策略（2026-08-22 起）：素材原地更新（同名同 URL），immutable 强缓存
    // 会让浏览器最长 24h 看不到新字节 → 改为每次复验（max-age=0 +
    // must-revalidate）+ 弱 ETag，未变化回 304。
    expect(res.headers["cache-control"]).toContain("max-age=0");
    expect(res.headers["cache-control"]).toContain("must-revalidate");
    expect(typeof res.headers.etag).toBe("string");
    // webp magic: "RIFF"
    expect(res.body.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("revalidates with etag: unchanged asset returns 304 with empty body", async () => {
    const first = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/character/idle.webp`,
    );
    expect(first.status).toBe(200);
    const etag = first.headers.etag;
    expect(typeof etag).toBe("string");

    const second = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/character/idle.webp`,
      undefined,
      { "if-none-match": etag as string },
    );
    expect(second.status).toBe(304);
    expect(second.body.length).toBe(0);
    expect(second.headers["cache-control"]).toContain("must-revalidate");
  });

  it("serves a woff2 font with font/woff2 and wOF2 magic bytes", async () => {
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/fonts/JIANGXIAO_FONT_MASHANZHENG.woff2`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("font/woff2");
    expect(res.headers["content-length"]).toBe(String(res.body.length));
    // woff2 magic: "wOF2"
    expect(res.body.subarray(0, 4).toString("latin1")).toBe("wOF2");
  });

  it("serves a preview png with image/png and \\x89PNG magic bytes", async () => {
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/preview/dark.png`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-length"]).toBe(String(res.body.length));
    // png magic: 0x89 "PNG"
    expect(res.body[0]).toBe(0x89);
    expect(res.body.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("returns the exact bytes from disk (parity with fs.readFile)", async () => {
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/preview/light.png`,
    );
    const onDisk = await readFile(
      join(__ASSETS_ROOT_FOR_TEST, "preview", "light.png"),
    );
    expect(res.status).toBe(200);
    expect(res.body.equals(onDisk)).toBe(true);
  });

  it("returns 404 for a missing asset", async () => {
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/character/nonexistent.webp`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unsupported extension (not in webp/woff2/png whitelist)", async () => {
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/character/idle.txt`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for the bare prefix with no subpath", async () => {
    const res = await request(port, "GET", `${ASSET_ROUTE_PREFIX}/`);
    expect(res.status).toBe(404);
  });

  it("rejects path traversal via %2e%2e encoding (webServer URL normalization → 404)", async () => {
    // WHATWG URL 规范化把 %2e%2e 折叠为 ..，pathname 变为 /api/package.json，
    // 不命中 /api/dsh-jx/ 前缀路由 → 404。路径穿越在 webServer 层即被拒绝。
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/%2e%2e/package.json`,
    );
    expect(res.status).toBe(404);
  });

  it("rejects literal ../ traversal (webServer URL normalization → 404)", async () => {
    // 字面 .. 同样被 URL 规范化折叠，不命中路由 → 404。
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/character/../../package.json`,
    );
    expect(res.status).toBe(404);
  });

  it('rejects a subpath containing ".." segment via handler defense (→ 400)', async () => {
    // foo..bar 不是 .. 段，URL 不折叠，路由命中 handler；
    // handler 的 resolveSafeSubpath 检查 subpath.includes('..') → 400（纵深防御）。
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/foo..bar.webp`,
    );
    expect(res.status).toBe(400);
  });

  it("rejects a null-byte injection with 400", async () => {
    // %00 解码为 \0，URL 不折叠，路由命中 handler 的 null 字节防御 → 400。
    const res = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/character/idle%00.webp`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 405 for non-GET/HEAD methods", async () => {
    const res = await request(
      port,
      "POST",
      `${ASSET_ROUTE_PREFIX}/character/idle.webp`,
    );
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toBe("GET, HEAD");
  });

  it("HEAD returns headers without body", async () => {
    const res = await request(
      port,
      "HEAD",
      `${ASSET_ROUTE_PREFIX}/character/idle.webp`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.headers["content-length"]).toBeDefined();
    expect(res.body.length).toBe(0);
  });
});
