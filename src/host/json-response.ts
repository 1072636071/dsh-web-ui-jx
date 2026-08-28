/**
 * host HTTP JSON 响应小工具 — `/api/dsh-jx/*` 各路由共用的 writeJson。
 *
 * 源自 import-api.ts 的私有实现（审查 Duplicated Code 项上收为共享模块）：
 * 统一 content-type/charset/content-length 头写法，避免各路由复制粘贴漂移。
 *
 * @module dsh-web-ui-jx/host/json-response
 */

import type { ServerResponse } from "node:http";

/** 写 JSON 响应（序列化 body 并带 content-type/charset/content-length 头）。 */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
  });
  res.end(data);
}
