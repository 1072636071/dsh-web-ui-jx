/**
 * 导入 API 路由 — host 半区用 `ctx.webServer.register` 挂载 `/api/dsh-jx/import/*` 路由，
 * 接收 zip 上传与本地目录两种来源，异步执行导入，进度写入 KV domain。
 *
 * 路由契约（prefix `/api/dsh-jx/import`，longest-prefix-wins 优先于素材路由 `/api/dsh-jx`）：
 *   - `POST /api/dsh-jx/import` — 启动导入
 *       · `Content-Type: application/json` + `{ source: 'directory', path: <abs> }` → 目录导入
 *       · `Content-Type: application/octet-stream` + `?source=zip` → zip 导入（raw body = zip 字节）
 *       · 返回 `202` + `{ importId }`；导入异步执行，进度经 GET 查询
 *   - `GET /api/dsh-jx/import/progress/:id` — 查询导入进度，`200` + ImportRecord 或 `404`
 *   - `GET /api/dsh-jx/import/list` — 列出全部导入记录，`200` + `{ imports: ImportRecord[] }`
 *
 * 导入流程：生成 importId → KV 写 in_progress → 响应 202 → 后台解压/复制到
 * `assets/imported/<importId>/` → KV 写 completed+manifest 或 failed+error。
 * 素材本体落文件系统，经素材路由 `/api/dsh-jx/imported/<id>/*` 可服务；KV 只存元数据。
 *
 * @module dsh-web-ui-jx/host/import-api
 */

import { randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  rm,
  cp,
} from "node:fs/promises";
import { join, posix, isAbsolute, dirname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import AdmZip from "adm-zip";
import {
  openImportStore,
  type ImportStore,
  type ImportRecord,
  type AssetEntry,
  type AssetType,
  type ImportSource,
} from "./storage-domain.ts";
import { resolveAssetsRoot } from "./paths.ts";

/** 导入 API 路由前缀（比素材路由 `/api/dsh-jx` 更长，longest-prefix-wins 优先匹配）。 */
export const IMPORT_API_PREFIX = "/api/dsh-jx/import";

/** 放行的素材扩展名 → 类型（与素材路由白名单一致）。 */
const EXT_TO_TYPE: Readonly<Record<string, AssetType>> = Object.freeze({
  ".webp": "webp",
  ".woff2": "woff2",
  ".png": "png",
});

/** POST body 大小上限（100 MB，zip 包通常远小于此）。 */
const MAX_BODY_BYTES = 100 * 1024 * 1024;

// ─── assets root 探测（共享实现见 ./paths.ts）────────────────────────────

/** 固化的素材根目录（模块加载时探测一次）。 */
const ASSETS_ROOT = resolveAssetsRoot();

/** 导入素材落地根：`assets/imported/`。 */
const IMPORTED_ROOT = join(ASSETS_ROOT, "imported");

// ─── 辅助函数 ──────────────────────────────────────────────────────────

/** 读取 req body 为 Buffer（带大小限制）。 */
function readBody(
  req: IncomingMessage,
  limit = MAX_BODY_BYTES,
): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;
    req.on("data", (c: Buffer) => {
      if (rejected) return;
      total += c.length;
      if (total > limit) {
        rejected = true;
        req.destroy();
        reject(new Error(`body exceeds ${limit} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!rejected) resolveBody(Buffer.concat(chunks));
    });
    req.on("error", (err) => {
      if (!rejected) reject(err);
    });
  });
}

/** 写 JSON 响应。 */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
  });
  res.end(data);
}

/** 当前 ISO-8601 时间戳。 */
function now(): string {
  return new Date().toISOString();
}

/**
 * 校验 zip 内 / 目录内的相对路径安全（路径穿越防御）。
 * 拒绝：绝对路径、含 `..` 段、含 null 字节、以 `/` 开头。
 *
 * 与 `asset-routes.ts#resolveSafeSubpath` 的关系：两者都做路径穿越防御但语义不同。
 * 本函数更精确（`segments.some(s => s === '..')` 只拒绝 `..` 段，允许 `foo..bar`），
 * 用于 zip entry 与目录遍历；`resolveSafeSubpath` 更严格（拒绝任何字面 `..`），
 * 用于素材路由的纵深防御。差异是有意的，详见 `src/host/paths.ts` 注释。
 */
function isSafeRelativePath(p: string): boolean {
  if (p.includes("\0")) return false;
  if (isAbsolute(p)) return false;
  const normalized = p.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return false;
  const segments = normalized.split("/");
  if (segments.some((s) => s === "..")) return false;
  return true;
}

/** 从扩展名推断素材类型；非白名单返回 undefined。 */
function inferAssetType(filePath: string): AssetType | undefined {
  const ext = posix.extname(filePath).toLowerCase();
  return EXT_TO_TYPE[ext];
}

/**
 * 遍历目录，收集所有 webp/woff2/png 文件的 AssetEntry。
 * path 为相对 assets/ 的 POSIX 路径（`<relPrefix>/<相对路径>`）。
 */
async function collectAssetsFromDir(
  baseDir: string,
  relPrefix: string,
): Promise<AssetEntry[]> {
  const entries: AssetEntry[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const childAbs = join(dir, item.name);
      const childRel = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory()) {
        await walk(childAbs, childRel);
      } else if (item.isFile()) {
        const type = inferAssetType(childRel);
        if (type === undefined) continue;
        const st = await stat(childAbs);
        entries.push({
          path: `${relPrefix}/${childRel}`.replace(/\\/g, "/"),
          size: st.size,
          type,
        });
      }
    }
  }
  await walk(baseDir, "");
  return entries;
}

/** 解析 manifest.json（若存在）；返回素材条目或 null（无 manifest / 解析失败）。 */
async function parseManifestFile(
  manifestPath: string,
  relPrefix: string,
): Promise<AssetEntry[] | null> {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as {
      assets?: Array<{ path: string; size: number; type: string }>;
    };
    if (!Array.isArray(parsed.assets)) return null;
    return parsed.assets
      .filter(
        (a) =>
          typeof a.path === "string" &&
          typeof a.size === "number" &&
          typeof a.type === "string",
      )
      .map((a) => ({
        path: `${relPrefix}/${a.path}`.replace(/\\/g, "/"),
        size: a.size,
        type: a.type as AssetType,
      }));
  } catch {
    return null;
  }
}

// ─── 导入任务实现 ──────────────────────────────────────────────────────

/**
 * 执行 zip 导入：解压到 targetDir，解析 manifest，返回素材条目。
 * 路径穿越防御：zip 内 entryName 含 `..` 段 / 绝对路径 / null 字节一律拒绝。
 * 仅提取白名单素材（webp/woff2/png）与 manifest.json；其余跳过。
 */
async function runZipImport(
  zipBuffer: Buffer,
  targetDir: string,
  relPrefix: string,
): Promise<AssetEntry[]> {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  await mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    const name = entry.entryName;
    // 跳过目录条目（以 / 结尾）
    if (name.endsWith("/")) continue;
    if (!isSafeRelativePath(name)) {
      throw new Error(`unsafe zip entry path: ${name}`);
    }
    const baseName = posix.basename(name);
    const data = entry.getData();
    if (baseName === "manifest.json") {
      const dest = join(targetDir, name);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, data);
      continue;
    }
    const type = inferAssetType(name);
    if (type === undefined) continue;
    const dest = join(targetDir, name);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, data);
  }

  // manifest.json 优先；否则从落地目录推断
  const manifestPath = join(targetDir, "manifest.json");
  const fromManifest = await parseManifestFile(manifestPath, relPrefix);
  if (fromManifest !== null) return fromManifest;
  return collectAssetsFromDir(targetDir, relPrefix);
}

/**
 * 执行目录导入：复制素材到 targetDir，解析 manifest，返回素材条目。
 * 源目录必须存在且为目录。
 */
async function runDirectoryImport(
  sourceDir: string,
  targetDir: string,
  relPrefix: string,
): Promise<AssetEntry[]> {
  const st = await stat(sourceDir);
  if (!st.isDirectory()) {
    throw new Error(`source path is not a directory: ${sourceDir}`);
  }
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true, force: true });

  const manifestPath = join(targetDir, "manifest.json");
  const fromManifest = await parseManifestFile(manifestPath, relPrefix);
  if (fromManifest !== null) return fromManifest;
  return collectAssetsFromDir(targetDir, relPrefix);
}

/**
 * 后台执行导入任务：importFn 解压/复制 → KV 写 completed+manifest 或 failed+error。
 * fire-and-forget：调用方不 await；失败写 KV failed，不抛出。失败时清理 targetDir 保持原子性。
 */
async function executeImport(
  store: ImportStore,
  importId: string,
  source: ImportSource,
  sourcePath: string,
  startedAt: string,
  targetDir: string,
  importFn: () => Promise<AssetEntry[]>,
): Promise<void> {
  try {
    const assets = await importFn();
    const record: ImportRecord = {
      id: importId,
      sourceType: source,
      sourcePath,
      status: "completed",
      manifest: { assets },
      assetCount: assets.length,
      createdAt: startedAt,
      updatedAt: now(),
    };
    await store.put(importId, record);
  } catch (err) {
    // 兜底日志：确保错误至少有日志（即使后续 KV 写入也失败，错误不致静默丢失）。
    // fire-and-forget 调用方不 await，若无日志则错误完全静默。
    console.error("[dsh-jx] import failed", err);
    // 清理已落地的部分文件，保持原子性
    try {
      await rm(targetDir, { recursive: true, force: true });
    } catch {
      // 清理失败不影响错误记录
    }
    const record: ImportRecord = {
      id: importId,
      sourceType: source,
      sourcePath,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      manifest: { assets: [] },
      assetCount: 0,
      createdAt: startedAt,
      updatedAt: now(),
    };
    try {
      await store.put(importId, record);
    } catch (putErr) {
      // KV 写入也失败：原始错误已由上方 console.error 记录，此处补 put 失败日志。
      console.error("[dsh-jx] import failed: KV put also failed", putErr);
    }
  }
}

// ─── 路由 handler ──────────────────────────────────────────────────────

/** POST /api/dsh-jx/import — 启动导入，返回 202 + { importId }。 */
async function handleStartImport(
  req: IncomingMessage,
  res: ServerResponse,
  store: ImportStore,
): Promise<void> {
  const contentType = (req.headers["content-type"] ?? "").toLowerCase();
  const url = new URL(req.url ?? "/", "http://x");
  const sourceQuery = url.searchParams.get("source");

  let source: ImportSource;
  let sourcePath: string;
  let importFn: () => Promise<AssetEntry[]>;

  if (contentType.includes("application/json") || sourceQuery === "directory") {
    // 目录导入：JSON body { source: 'directory', path: string }
    const body = await readBody(req);
    let parsed: { source?: string; path?: string };
    try {
      parsed = JSON.parse(body.toString("utf8")) as {
        source?: string;
        path?: string;
      };
    } catch {
      writeJson(res, 400, { error: "invalid JSON body" });
      return;
    }
    if (
      parsed.source !== "directory" ||
      typeof parsed.path !== "string" ||
      parsed.path.length === 0
    ) {
      writeJson(res, 400, {
        error: 'expected { source: "directory", path: string }',
      });
      return;
    }
    source = "directory";
    sourcePath = parsed.path;
    const importId = randomUUID();
    const targetDir = join(IMPORTED_ROOT, importId);
    const relPrefix = `imported/${importId}`;
    importFn = () => runDirectoryImport(parsed.path!, targetDir, relPrefix);
    await startAndRespond(
      store,
      importId,
      source,
      sourcePath,
      targetDir,
      importFn,
      res,
    );
    return;
  }

  if (
    contentType.includes("application/octet-stream") ||
    sourceQuery === "zip"
  ) {
    // zip 导入：raw body = zip 字节
    const zipBuffer = await readBody(req);
    if (zipBuffer.length === 0) {
      writeJson(res, 400, { error: "empty zip body" });
      return;
    }
    source = "zip";
    const filename = url.searchParams.get("filename") ?? "<upload>";
    sourcePath = filename;
    const importId = randomUUID();
    const targetDir = join(IMPORTED_ROOT, importId);
    const relPrefix = `imported/${importId}`;
    importFn = () => runZipImport(zipBuffer, targetDir, relPrefix);
    await startAndRespond(
      store,
      importId,
      source,
      sourcePath,
      targetDir,
      importFn,
      res,
    );
    return;
  }

  writeJson(res, 400, {
    error:
      'unsupported content-type; use application/json + {source:"directory",path} or application/octet-stream + ?source=zip',
  });
}

/**
 * 写 KV in_progress，响应 202 + importId，fire-and-forget executeImport。
 */
async function startAndRespond(
  store: ImportStore,
  importId: string,
  source: ImportSource,
  sourcePath: string,
  targetDir: string,
  importFn: () => Promise<AssetEntry[]>,
  res: ServerResponse,
): Promise<void> {
  const startedAt = now();
  // 写 in_progress（durable）
  const record: ImportRecord = {
    id: importId,
    sourceType: source,
    sourcePath,
    status: "in_progress",
    manifest: { assets: [] },
    assetCount: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  try {
    await store.put(importId, record);
  } catch (err) {
    writeJson(res, 500, {
      error: `failed to write import record: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  // 响应 202 + importId
  writeJson(res, 202, { importId, status: "in_progress" });
  // fire-and-forget 后台导入（不 await）
  void executeImport(
    store,
    importId,
    source,
    sourcePath,
    startedAt,
    targetDir,
    importFn,
  );
}

/** GET /api/dsh-jx/import/progress/:id — 查询导入进度。 */
function handleProgress(
  res: ServerResponse,
  store: ImportStore,
  id: string,
): void {
  const record = store.get(id);
  if (record === undefined) {
    res.writeHead(404);
    res.end();
    return;
  }
  writeJson(res, 200, record);
}

/** GET /api/dsh-jx/import/list — 列出全部导入记录。 */
function handleList(res: ServerResponse, store: ImportStore): void {
  const imports = Array.from(store.entries()).map(([, r]) => r);
  writeJson(res, 200, { imports });
}

/**
 * 导入 API 路由 handler。解析 pathname/method，分发到上述子 handler。
 */
async function handleImportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: ImportStore,
): Promise<void> {
  let pathname: string;
  try {
    pathname = new URL(req.url ?? "/", "http://x").pathname;
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  // 去掉前缀得到子路径（'' 或 '/' 或 '/list' 或 '/progress/<id>'）
  if (!pathname.startsWith(IMPORT_API_PREFIX)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const sub = pathname.slice(IMPORT_API_PREFIX.length);

  if (sub === "" || sub === "/") {
    if (req.method === "POST") {
      await handleStartImport(req, res, store);
      return;
    }
    if (req.method === "GET") {
      handleList(res, store);
      return;
    }
    res.writeHead(405, { allow: "POST, GET" });
    res.end();
    return;
  }

  if (sub === "/list") {
    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET" });
      res.end();
      return;
    }
    handleList(res, store);
    return;
  }

  if (sub.startsWith("/progress/")) {
    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET" });
      res.end();
      return;
    }
    let id: string;
    try {
      id = decodeURIComponent(sub.slice("/progress/".length));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (id.length === 0) {
      res.writeHead(404);
      res.end();
      return;
    }
    handleProgress(res, store, id);
    return;
  }

  res.writeHead(404);
  res.end();
}

// ─── 注册函数 ──────────────────────────────────────────────────────────

/** 导入 API 注册句柄：disposer 卸载路由与 domain；store 供测试经 domain 句柄断言 KV 记录。 */
export interface ImportApiHandle {
  /** 卸载路由并关闭 domain（幂等）。 */
  dispose: () => void;
  /** 打开的 ImportStore 句柄（经 domain.table('imports')），供测试直接读 KV 断言。 */
  store: ImportStore;
}

/**
 * 在给定 context 上注册 `/api/dsh-jx/import/*` 导入 API 路由，打开导入 KV domain。
 *
 * 返回 `{ dispose, store }`：dispose 卸载路由与 domain；store 供测试经 domain 句柄
 * 断言 KV 记录。fiber 卸载时经 `ctx.effect` 自动清理。
 *
 * @param ctx - 已注入 `webServer` 与 `storageDomain` 服务的 cordis context。
 * @returns ImportApiHandle。
 */
export async function registerImportApi(
  ctx: Context,
): Promise<ImportApiHandle> {
  const store = await openImportStore(ctx);
  const disposeRoute = ctx.webServer.register({
    kind: "prefix",
    path: IMPORT_API_PREFIX,
    handler: (req, res) => {
      void handleImportRequest(req, res, store);
    },
  });
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    disposeRoute();
    void store.close();
  };
  ctx.effect(() => dispose, "dsh-jx: /api/dsh-jx/import/* import API");
  return { dispose, store };
}

/** 测试可见的导入素材落地根（仅用于断言，不参与运行时路由逻辑）。 */
export const __IMPORTED_ROOT_FOR_TEST = IMPORTED_ROOT;
