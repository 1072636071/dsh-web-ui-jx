/**
 * host 半区共享路径工具 — 素材根目录探测 + 路径穿越防御共享说明。
 *
 * `resolveAssetsRoot` 由 asset-routes.ts 与 import-api.ts 共用，消除逐字重复。
 *
 * 路径穿越防御函数（`resolveSafeSubpath` / `isSafeRelativePath`）因签名与语义差异
 * 保留各自实现（见下方注释），未统一到本文件：
 *   - `asset-routes.ts#resolveSafeSubpath(pathname)`：接收完整 URL pathname，
 *     slice 掉前缀 + decode + 字面 `..` 检查（`includes('..')`，拒绝 `foo..bar`）+
 *     normalize 后边界检查。返回相对路径或 null。字面 `..` 检查是纵深防御，
 *     asset-routes.test.ts 有用例显式依赖（`foo..bar.webp` → 400）。
 *   - `import-api.ts#isSafeRelativePath(p)`：接收已 decode 的相对路径，
 *     检查 null 字节 + 绝对路径 + `..` 段（`segments.some(s => s === '..')`，
 *     允许 `foo..bar`）+ 反斜杠归一化。返回 boolean。用于 zip entry 与目录遍历。
 *   - 两者检查 `..` 的严格度不同（字面包含 vs 段相等），是有意的差异：
 *     素材路由更严格（拒绝任何字面 `..`），导入路径更精确（只拒绝 `..` 段）。
 *
 * @module dsh-web-ui-jx/host/paths
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 探测素材根目录绝对路径。从 `import.meta.url` 出发尝试源码与构建产物两个候选
 * 位置，命中即固化；都不存在则抛错（插件安装不完整）。
 *
 * 候选位置（本文件位于 `src/host/`，与 asset-routes.ts / import-api.ts 同目录）：
 *   - `src/host` → `<repo>/assets`（dev / test 跑源码）
 *   - `lib` → `<repo>/assets`（vite 构建产物）
 *
 * @returns 素材根目录绝对路径。
 * @throws {Error} 候选路径都不存在时抛错。
 */
export function resolveAssetsRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../assets"), // src/host → <repo>/assets（dev / test 跑源码）
    resolve(here, "../assets"), // lib → <repo>/assets（vite 构建产物）
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `dsh-jx: assets root not found; tried ${candidates.join(", ")}. ` +
      "Ensure the plugin package ships the assets/ directory.",
  );
}
