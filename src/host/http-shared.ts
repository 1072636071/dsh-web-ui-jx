/**
 * host 半区 HTTP 共享件 — JSON 响应 / URL 解析 / 路径穿越防御单点。
 *
 * 收敛来源（架构优化 17-05）：
 *   - `writeJson`：`import-api.ts` 与 `ai-title-route.ts` 各一份逐字重复。
 *   - `parseUrlPathname`：`asset-routes.ts` 与 `import-api.ts` 各一份。
 *   - 路径穿越防御两函数：说明在 `paths.ts`、实现分别在 `asset-routes.ts` 与
 *     `import-api.ts`——「差异是有意」的文档与实现分离，理解「host 如何安全
 *     响应」要跳三文件。收敛后说明与实现同文件，且纯函数可直测。
 *
 * 两个防御函数的差异是有意的：
 *   - `resolveSafeSubpath`（素材路由纵深防御）：接收完整 URL pathname，
 *     slice 掉前缀 + decode + 字面 `..` 检查（`includes('..')`，拒绝
 *     `foo..bar`）+ normalize 后边界检查。返回相对路径或 null。字面 `..`
 *     检查是纵深防御，asset-routes.test.ts 有用例显式依赖（`foo..bar.webp` → 400）。
 *   - `isSafeRelativePath`（zip entry 与目录遍历）：接收已 decode 的相对路径，
 *     检查 null 字节 + 绝对路径 + `..` 段（`segments.some(s => s === '..')`，
 *     允许 `foo..bar`）+ 反斜杠归一化。返回 boolean。
 *   两者检查 `..` 的严格度不同（字面包含 vs 段相等）是有意的：素材路由更严格
 *   （拒绝任何字面 `..`），导入路径更精确（只拒绝 `..` 段）。
 *
 * @module dsh-web-ui-jx/host/http-shared
 */

import { isAbsolute, join, normalize, relative } from "node:path";
import type { ServerResponse } from "node:http";

/** 写 JSON 响应（统一 content-type / content-length）。 */
export function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
  });
  res.end(data);
}

/** 解析 URL pathname（不含 query）；非法 URL 返回 null。 */
export function parseUrlPathname(url: string | undefined): string | null {
  try {
    return new URL(url ?? "/", "http://x").pathname;
  } catch {
    return null;
  }
}

/**
 * 解析并校验素材路由子路径，返回相对 assetsRoot 的安全相对路径；非法返回 null。
 *
 * 校验顺序：decode → null 字节 → `..` 段 → 边界检查（normalize 后仍在
 * assetsRoot 内）。任一失败返回 null，由调用方决定状态码（路径穿越类统一 400）。
 *
 * @param pathname - URL pathname（不含 query）。
 * @param prefix - 路由前缀（如 `/api/dsh-jx`）。
 * @param assetsRoot - 素材根目录绝对路径。
 * @returns 相对 assetsRoot 的安全相对路径，或 null（非法）。
 */
export function resolveSafeSubpath(
  pathname: string,
  prefix: string,
  assetsRoot: string,
): string | null {
  // slice 掉前缀与斜杠得到子路径编码段。
  const encodedSub = pathname.slice(prefix.length + 1);
  let subpath: string;
  try {
    subpath = decodeURIComponent(encodedSub);
  } catch {
    // malformed %-escape
    return null;
  }
  // null 字节与 `..` 段一律拒绝（路径穿越防御）。`..` 字面检查覆盖 %2e%2e 解码后的形态。
  if (subpath.includes("\0") || subpath.includes("..")) return null;
  // normalize 后再次确认仍在 assetsRoot 内（纵深防御，覆盖 Windows 盘符 / 绝对路径等边界）。
  const resolved = normalize(join(assetsRoot, subpath));
  const rel = relative(assetsRoot, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel;
}

/**
 * 校验 zip 内 / 目录内的相对路径安全（路径穿越防御）。
 * 拒绝：绝对路径、含 `..` 段、含 null 字节、以 `/` 开头。
 *
 * @param p - 已 decode 的相对路径。
 * @returns true = 安全。
 */
export function isSafeRelativePath(p: string): boolean {
  if (p.includes("\0")) return false;
  if (isAbsolute(p)) return false;
  const normalized = p.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return false;
  const segments = normalized.split("/");
  if (segments.some((s) => s === "..")) return false;
  return true;
}
