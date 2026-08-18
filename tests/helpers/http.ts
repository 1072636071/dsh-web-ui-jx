/**
 * 测试共享 HTTP 请求 helper — 消除 asset-routes.test.ts 与 import-api.test.ts 的重复实现。
 *
 * 用 `node:http` 而非 `fetch` 发请求：`fetch` 会规范化 URL（折叠 `..`、解码 `%2e`），
 * 无法探测路径穿越防御；`http.request` 原样发送 path 字段，可控且语义明确。
 *
 * @module dsh-web-ui-jx/tests/helpers/http
 */

import {
  request as httpRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";

/** 原始 HTTP 响应（status + headers + 完整 body Buffer）。 */
export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/**
 * 发原始 HTTP 请求（path 原样发送，不规范化），收完整响应 body。
 *
 * @param port - 目标端口。
 * @param method - HTTP 方法。
 * @param path - 请求路径（原样发送，不规范化）。
 * @param body - 可选请求体（Buffer）；提供时自动设置 content-length。
 * @param headers - 可选额外请求头。
 * @returns 原始响应（status + headers + body）。
 */
export function request(
  port: number,
  method: string,
  path: string,
  body?: Buffer,
  headers?: Record<string, string>,
): Promise<RawResponse> {
  return new Promise((resolveReq, reject) => {
    const allHeaders = { ...(headers ?? {}) };
    if (body !== undefined) {
      allHeaders["content-length"] = String(body.length);
    }
    const options: RequestOptions = {
      host: "127.0.0.1",
      port,
      method,
      path,
      headers: allHeaders,
    };
    const req = httpRequest(options, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolveReq({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
    if (body !== undefined) {
      req.end(body);
    } else {
      req.end();
    }
  });
}
