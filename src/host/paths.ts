/**
 * host 半区共享路径工具 — 素材根目录探测。
 *
 * `resolveAssetsRoot` 由 asset-routes.ts 与 import-api.ts 共用，消除逐字重复。
 *
 * 路径穿越防御函数（`resolveSafeSubpath` / `isSafeRelativePath`）因签名与语义
 * 差异保留各自实现，已收敛到 `http-shared.ts`（差异说明与实现同文件，见
 * `src/host/http-shared.ts` 头部注释）。
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
