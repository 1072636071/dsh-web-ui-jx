/**
 * client 半区共享类型 — 与 host 半区对齐的领域类型投影。
 *
 * client 不能直接 import host 模块（host 引入 node:fs / node:http / cordis 等
 * Node.js 依赖，会破坏浏览器半区隔离）。故在 client 侧镜像 host 的领域类型定义，
 * 用注释标明对齐关系，由人工保持同步。
 *
 * @module dsh-web-ui-jx/client/types
 */

/**
 * 导入来源类型（与 host `storage-domain.ts#ImportSource` 对齐）。
 * - `zip`：zip 文件上传导入。
 * - `directory`：本地目录路径导入。
 */
export type ImportSource = "zip" | "directory";

/**
 * 导入状态（与 host `storage-domain.ts#ImportStatus` 对齐）。
 * 状态机：pending → in_progress → completed | failed。
 */
export type ImportStatus = "pending" | "in_progress" | "completed" | "failed";
