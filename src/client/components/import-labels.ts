/**
 * 导入面板/列表共享标签函数 — 消除 ImportPanel.tsx 与 AssetList.tsx 的重复实现。
 *
 * `statusLabel` 带 `style` 参数：`'full'` 用于进度框（详细，如"已完成"），
 * `'short'` 用于 badge（简短，如"完成"）。两组件原本各写一份字面量不同，
 * 此处统一为带样式参数的单函数。
 *
 * @module dsh-web-ui-jx/client/components/import-labels
 */

import type { ImportSource, ImportStatus } from "../types.ts";

/**
 * 状态中文标签。
 * @param status - 导入状态。
 * @param style - `'full'`（详细，默认）用于进度框；`'short'`（简短）用于 badge。
 * @returns 中文标签字符串。
 */
export function statusLabel(
  status: ImportStatus,
  style: "full" | "short" = "full",
): string {
  if (style === "full") {
    switch (status) {
      case "pending":
        return "等待中";
      case "in_progress":
        return "导入中";
      case "completed":
        return "已完成";
      case "failed":
        return "失败";
    }
  }
  switch (status) {
    case "pending":
      return "等待";
    case "in_progress":
      return "导入中";
    case "completed":
      return "完成";
    case "failed":
      return "失败";
  }
}

/**
 * 来源 badge 标签。
 * @param source - 导入来源。
 * @returns `'zip'` 或 `'目录'`。
 */
export function sourceLabel(source: ImportSource): string {
  return source === "zip" ? "zip" : "目录";
}
