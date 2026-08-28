/**
 * 素材服务路由 — host 半区用 ctx.webServer.register 挂载 `/api/dsh-jx/*` 前缀路由，
 * 从仓库 `assets/` 目录读取本地素材并以正确 Content-Type 返回字节流。
 *
 * 设计约束（工单 02）：
 *   - 素材本体只走文件系统 + HTTP 路由，KV 不存二进制（ADR-0003 后续工单 07 定稿）。
 *   - 路径穿越防护：拒绝含 `..`、null 字节、malformed %-escape 的子路径（400）。
 *   - 仅放行 webp / woff2 / png 三类扩展名；其余返回 404（未知类型不服务）。
 *   - 文件不存在返回 404；非 GET / HEAD 方法返回 405。
 *
 * 路径定位：`assets/` 在仓库根目录。源码运行（vitest 跑 .ts）时本文件位于
 * `src/host/`，相对 `../../assets`；构建产物运行（vite 产出 `lib/index.js`）时
 * 位于 `lib/`，相对 `../assets`。模块加载时按候选路径探测一次并固化。
 *
 * @module dsh-web-ui-jx/host/asset-routes
 */

import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import { parseUrlPathname, resolveSafeSubpath } from "./http-shared.ts";
import { resolveAssetsRoot } from "./paths.ts";

/** 路由前缀（无 trailing slash，符合 webServer.register 的 path 约定）。 */
export const ASSET_ROUTE_PREFIX = "/api/dsh-jx";

/** 扩展名 → Content-Type 映射（仅放行这三类素材）。 */
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".png": "image/png",
});

/** 固化的素材根目录（模块加载时探测一次）。 */
const ASSETS_ROOT = resolveAssetsRoot();

/**
 * 素材路由 handler。读取本地文件并返回字节流；非法路径 / 缺失 / 未知类型分别回 400 / 404 / 404。
 *
 * 不抛错：所有失败路径显式写响应头并 end，webServer 的 per-request 容错不会触发 400 兜底。
 */
async function handleAssetRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // 方法限制：仅 GET / HEAD（HEAD 不返回 body 但回相同 header）。
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }

  // 解析 pathname（webServer 已做过，但 handler 收到原始 req，这里独立解析以拿 query 之外的纯路径）。
  const pathname = parseUrlPathname(req.url);
  if (pathname === null) {
    res.writeHead(400);
    res.end();
    return;
  }

  // 前缀路由也会匹配 `/api/dsh-jx` 自身（无子路径）；无 trailing slash 的子路径视为非法。
  if (!pathname.startsWith(`${ASSET_ROUTE_PREFIX}/`)) {
    res.writeHead(404);
    res.end();
    return;
  }

  const subpath = resolveSafeSubpath(pathname, ASSET_ROUTE_PREFIX, ASSETS_ROOT);
  if (subpath === null) {
    res.writeHead(400);
    res.end();
    return;
  }

  // 扩展名白名单：仅 webp / woff2 / png。未知扩展名（含空）一律 404。
  const ext = extname(subpath).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (contentType === undefined) {
    res.writeHead(404);
    res.end();
    return;
  }

  const filePath = join(ASSETS_ROOT, subpath);
  try {
    // ETag 取自 size + mtime：素材会随修复/重生成原地更新（同名同 URL），
    // 曾用 `immutable, max-age=86400` 强缓存导致浏览器最长 24h 看不到新字节
    // （2026-08-22 白偏红修复踩坑）。改为每次复验（max-age=0, must-revalidate），
    // 未变化回 304 零载荷，已变化即取新字节。
    const [data, st] = await Promise.all([readFile(filePath), stat(filePath)]);
    const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
    const cacheHeaders: Record<string, string> = {
      "cache-control": "public, max-age=0, must-revalidate",
      etag,
    };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, cacheHeaders);
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": String(data.length),
      ...cacheHeaders,
    });
    if (req.method === "HEAD") {
      res.end();
    } else {
      res.end(data);
    }
  } catch (err: unknown) {
    // ENOENT → 404；其他读错误（权限等）→ 500，不暴露内部细节。
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(500);
    res.end();
  }
}

/**
 * 在给定 context 上注册 `/api/dsh-jx/*` 素材路由。返回 disposer（同步调用，内部 await 由
 * cordis effect 托管）。fiber 卸载时自动清理路由，apply 与测试共用此入口。
 *
 * @param ctx - 已注入 `webServer` 服务的 cordis context。
 * @returns 同步 disposer；调用即卸载路由（忽略内部 promise，调用方无需 await）。
 */
export function registerAssetRoutes(ctx: Context): () => void {
  const dispose = ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: ASSET_ROUTE_PREFIX,
        handler: handleAssetRequest,
      }),
    "dsh-jx: /api/dsh-jx/* asset routes",
  );
  return () => {
    void dispose();
  };
}

/** 测试可见的素材根目录（仅用于断言，不参与运行时路由逻辑）。 */
export const __ASSETS_ROOT_FOR_TEST = ASSETS_ROOT;
