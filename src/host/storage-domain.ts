/**
 * 导入元数据 KV domain — 用 `ctx.storageDomain`（zod 声明式 domain）记录导入状态、
 * 来源路径与 manifest。素材本体走文件系统（`assets/imported/<id>/`），KV 只存元数据
 * （ADR-0003：素材二进制不进 KV）。
 *
 * domain name: `dsh_jx_import`（匹配 `UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/`）
 * table: `imports`（key = importId, value = ImportRecord）
 *
 * 生命周期：`openImportStore(ctx)` 打开 domain 并经 `ctx.effect` 注册 disposer，
 * fiber 卸载时自动关闭。domain 单例 open（重复 open 抛 `already-open`）。
 *
 * @module dsh-web-ui-jx/host/storage-domain
 */

import { z } from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import type { Context } from "@deepseek-ai/cordis";

// ─── zod schemas（durable boundary validator）──────────────────────────

/** 放行的素材扩展名（与素材路由白名单一致：webp / woff2 / png）。 */
const assetTypeSchema = z.enum(["webp", "woff2", "png"]);

/** 一条素材清单条目：相对 `assets/` 的路径、字节大小、类型。 */
const assetEntrySchema = z.object({
  /** 相对 assets/ 的 POSIX 路径，如 `imported/<id>/character/foo.webp`。 */
  path: z.string(),
  /** 字节大小（非负整数）。 */
  size: z.number().int().min(0),
  /** 素材类型（扩展名派生）。 */
  type: assetTypeSchema,
});

/** 素材 manifest：导入包内全部素材条目。 */
const assetManifestSchema = z.object({
  assets: z.array(assetEntrySchema),
});

/** 导入状态机：pending → in_progress → completed | failed。 */
const importStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

/** 导入来源类型：zip 上传或本地目录。 */
const importSourceSchema = z.enum(["zip", "directory"]);

/**
 * 一条导入记录（KV value）。KV 只存元数据，不存素材二进制；
 * `manifest.assets` 描述已落地的素材清单，素材本体在 `assets/imported/<id>/`。
 */
const importRecordSchema = z.object({
  /** 导入 id（UUID），同时是 KV key。 */
  id: z.string(),
  /** 来源类型。 */
  sourceType: importSourceSchema,
  /** 来源路径：zip 为原始文件名或 `<upload>`；directory 为原始绝对路径。 */
  sourcePath: z.string(),
  /** 当前状态。 */
  status: importStatusSchema,
  /** 失败原因；仅 status=failed 时存在。 */
  error: z.string().optional(),
  /** 素材清单（落地素材的元数据）。 */
  manifest: assetManifestSchema,
  /** 素材条目数（manifest.assets.length 的冗余，便于查询）。 */
  assetCount: z.number().int().min(0),
  /** 创建时间（ISO-8601）。 */
  createdAt: z.string(),
  /** 最后更新时间（ISO-8601）。 */
  updatedAt: z.string(),
});

// ─── 派生类型 ──────────────────────────────────────────────────────────

export type AssetType = z.infer<typeof assetTypeSchema>;
export type AssetEntry = z.infer<typeof assetEntrySchema>;
export type AssetManifest = z.infer<typeof assetManifestSchema>;
export type ImportStatus = z.infer<typeof importStatusSchema>;
export type ImportSource = z.infer<typeof importSourceSchema>;
export type ImportRecord = z.infer<typeof importRecordSchema>;

// ─── domain spec ──────────────────────────────────────────────────────

/**
 * 导入元数据 domain spec。`defineDomain` 在模块加载时校验 name/version/tables
 * 合规（UNIT_NAME_RE、非负整数版本），misconfiguration 在此处即抛错。
 */
export const IMPORT_DOMAIN_SPEC = defineDomain({
  name: "dsh_jx_import",
  version: 1,
  tables: { imports: domainTable<string, ImportRecord>(importRecordSchema) },
});

// ─── ImportStore 句柄 ─────────────────────────────────────────────────

/**
 * 打开的导入 store：封装 `imports` 表句柄，提供 get/put/entries/keys/size/close。
 * `openImportStore` 经 `ctx.effect` 注册 disposer，fiber 卸载时自动关闭 domain。
 */
export interface ImportStore {
  /** 同步读一条导入记录；不存在返回 undefined。 */
  get(id: string): ImportRecord | undefined;
  /** 异步写一条导入记录（durable）。 */
  put(id: string, record: ImportRecord): Promise<void>;
  /** 快照迭代器 [id, record]。 */
  entries(): IterableIterator<[string, ImportRecord]>;
  /** 快照迭代器 id。 */
  keys(): IterableIterator<string>;
  /** 当前记录数。 */
  readonly size: number;
  /** 关闭 domain（幂等）。 */
  close(): Promise<void>;
}

/**
 * 打开导入 domain 并返回 ImportStore 句柄。domain 经 `ctx.effect` 托管，
 * fiber 卸载时自动 close；调用方通常无需手动 close。
 *
 * @param ctx - 已注入 `storageDomain` 服务的 cordis context。
 * @returns ImportStore 句柄。
 */
export async function openImportStore(ctx: Context): Promise<ImportStore> {
  const domain = await ctx.storageDomain.open(IMPORT_DOMAIN_SPEC);
  ctx.effect(() => () => void domain.close(), "dsh-jx: import domain close");
  const table = domain.table("imports");
  return {
    get: (id) => table.get(id),
    put: (id, record) => table.put(id, record),
    entries: () => table.entries(),
    keys: () => table.keys(),
    get size() {
      return table.size;
    },
    close: () => domain.close(),
  };
}
