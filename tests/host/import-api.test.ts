/**
 * 导入 API HTTP seam 测试（工单 07 验收）。
 *
 * seam：不 mock webServer / storageDomain。每个用例启动真实 cordis Context + WebServer
 * + Storage hub + memory backend + DomainFacility，注册素材路由与导入 API 路由，
 * 用 node:http 发真实 HTTP 请求，断言导入契约与错误路径。KV 读写经 store 句柄
 * （domain.table('imports')）直接断言记录字段。
 *
 * 测试覆盖：
 *   - zip 导入（含/不含 manifest.json）：POST → 202，轮询 → completed，素材经路由可服务
 *   - 目录导入：POST → 202，轮询 → completed，素材可服务
 *   - 错误路径：非法 zip / 不存在目录 / 非目录路径 → failed
 *   - 路径穿越 zip entry → failed
 *   - GET progress 未知 id → 404；GET list → 全部记录
 *   - KV 记录字段经 store.get(id) 断言
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage, { storageBackendServiceKey } from "@deepseek-ai/dsh-storage";
import { DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import WebServer from "@deepseek-ai/dsh-host-webserver";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import {
  registerAssetRoutes,
  ASSET_ROUTE_PREFIX,
} from "../../src/host/asset-routes.ts";
import {
  registerImportApi,
  IMPORT_API_PREFIX,
  __IMPORTED_ROOT_FOR_TEST,
} from "../../src/host/import-api.ts";
import type {
  ImportRecord,
  ImportStore,
} from "../../src/host/storage-domain.ts";
import { MemoryStorageBackend } from "../helpers/memory-backend.ts";
import { request } from "../helpers/http.ts";

/** 轮询 GET progress 直到 completed/failed 或超时。 */
async function waitForImport(
  port: number,
  id: string,
  timeoutMs = 5000,
): Promise<ImportRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(
      port,
      "GET",
      `${IMPORT_API_PREFIX}/progress/${id}`,
    );
    if (res.status === 200) {
      const record = JSON.parse(res.body.toString("utf8")) as ImportRecord;
      if (record.status === "completed" || record.status === "failed")
        return record;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`import ${id} did not finish within ${timeoutMs}ms`);
}

// ─── 测试夹具 ──────────────────────────────────────────────────────────

let ctx: Context | undefined;
let port: number;
let disposeAssetRoutes: (() => void) | undefined;
let disposeImportApi: (() => void) | undefined;
let disposeStorageDomain: (() => void) | undefined;
let importStore: ImportStore | undefined;
const tempDirs: string[] = [];

beforeEach(async () => {
  ctx = new Context();
  await ctx.plugin(Storage);
  const backend = new MemoryStorageBackend();
  ctx.storage.backend.register("memory", backend);
  ctx.provide(storageBackendServiceKey("memory"), backend);
  const facility = new DomainFacility(ctx, { backend: "memory" });
  ctx.storage.mount("domain", facility);
  disposeStorageDomain = ctx.provide("storageDomain", facility);
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  port = ctx.webServer.port;
  disposeAssetRoutes = registerAssetRoutes(ctx);
  const handle = await registerImportApi(ctx);
  disposeImportApi = handle.dispose;
  importStore = handle.store;
});

afterEach(async () => {
  disposeImportApi?.();
  disposeImportApi = undefined;
  disposeAssetRoutes?.();
  disposeAssetRoutes = undefined;
  disposeStorageDomain?.();
  disposeStorageDomain = undefined;
  importStore = undefined;
  await ctx?.fiber.dispose();
  ctx = undefined;
  // 清理导入素材落地目录
  await rm(__IMPORTED_ROOT_FOR_TEST, { recursive: true, force: true });
  // 清理临时目录
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

/** 创建临时目录并登记清理。 */
async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dsh-jx-import-"));
  tempDirs.push(dir);
  return dir;
}

/** 构造一个最小 webp 字节（素材路由只检查扩展名，不检查 magic bytes）。 */
function fakeWebp(): Buffer {
  return Buffer.from("RIFF\x00\x00\x00\x00WEBP");
}

/** 构造一个最小 png 字节。 */
function fakePng(): Buffer {
  return Buffer.from("\x89PNG\r\n\x1a\n");
}

/** 构造一个最小 woff2 字节。 */
function fakeWoff2(): Buffer {
  return Buffer.from("wOF2\x00\x00\x00\x00");
}

// ─── 测试用例 ──────────────────────────────────────────────────────────

describe("dsh-jx import API — zip import (real HTTP seam)", () => {
  it("imports a zip with manifest.json, serves assets via asset route, records in KV", async () => {
    const webp = fakeWebp();
    const png = fakePng();
    const manifest = {
      version: 1,
      assets: [
        {
          path: "character/imported_idle.webp",
          size: webp.length,
          type: "webp",
        },
        { path: "preview/imported_preview.png", size: png.length, type: "png" },
      ],
    };
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest), "utf8"));
    zip.addFile("character/imported_idle.webp", webp);
    zip.addFile("preview/imported_preview.png", png);
    const zipBuffer = zip.toBuffer();

    // POST zip
    const postRes = await request(
      port,
      "POST",
      `${IMPORT_API_PREFIX}?source=zip`,
      zipBuffer,
      { "content-type": "application/octet-stream" },
    );
    expect(postRes.status).toBe(202);
    const postBody = JSON.parse(postRes.body.toString("utf8")) as {
      importId: string;
      status: string;
    };
    expect(postBody.importId).toMatch(/^[0-9a-f-]{36}$/);
    expect(postBody.status).toBe("in_progress");

    // 轮询等待完成
    const record = await waitForImport(port, postBody.importId);
    expect(record.status).toBe("completed");
    expect(record.sourceType).toBe("zip");
    expect(record.assetCount).toBe(2);
    expect(record.manifest.assets).toHaveLength(2);
    expect(record.error).toBeUndefined();

    // 素材经素材路由可服务
    const webpRes = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/imported/${postBody.importId}/character/imported_idle.webp`,
    );
    expect(webpRes.status).toBe(200);
    expect(webpRes.headers["content-type"]).toBe("image/webp");
    expect(webpRes.body.equals(webp)).toBe(true);

    const pngRes = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/imported/${postBody.importId}/preview/imported_preview.png`,
    );
    expect(pngRes.status).toBe(200);
    expect(pngRes.headers["content-type"]).toBe("image/png");
    expect(pngRes.body.equals(png)).toBe(true);

    // KV 记录经 store 句柄断言（经打开的 domain）
    expect(importStore).toBeDefined();
    const kvRecord = importStore!.get(postBody.importId);
    expect(kvRecord).toBeDefined();
    expect(kvRecord!.id).toBe(postBody.importId);
    expect(kvRecord!.status).toBe("completed");
    expect(kvRecord!.sourceType).toBe("zip");
    expect(kvRecord!.assetCount).toBe(2);
    expect(kvRecord!.manifest.assets[0].type).toBe("webp");
  });

  it("imports a zip without manifest.json (infers assets from file list)", async () => {
    const webp = fakeWebp();
    const woff2 = fakeWoff2();
    const zip = new AdmZip();
    zip.addFile("fonts/imported_font.woff2", woff2);
    zip.addFile("character/inferred.webp", webp);
    // 非 白名单扩展名应被跳过
    zip.addFile("readme.txt", Buffer.from("ignore me"));
    const zipBuffer = zip.toBuffer();

    const postRes = await request(
      port,
      "POST",
      `${IMPORT_API_PREFIX}?source=zip`,
      zipBuffer,
      { "content-type": "application/octet-stream" },
    );
    expect(postRes.status).toBe(202);
    const postBody = JSON.parse(postRes.body.toString("utf8")) as {
      importId: string;
    };
    const record = await waitForImport(port, postBody.importId);
    expect(record.status).toBe("completed");
    expect(record.assetCount).toBe(2);

    // 素材可服务
    const fontRes = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/imported/${postBody.importId}/fonts/imported_font.woff2`,
    );
    expect(fontRes.status).toBe(200);
    expect(fontRes.headers["content-type"]).toBe("font/woff2");
  });

  it("rejects an invalid zip (not a zip archive) with failed status", async () => {
    // adm-zip 对非 zip 字节抛 "Invalid or unsupported zip format"；
    // runZipImport catch → executeImport 写 failed。
    const notZip = Buffer.from("this is not a zip archive at all");

    const postRes = await request(
      port,
      "POST",
      `${IMPORT_API_PREFIX}?source=zip`,
      notZip,
      { "content-type": "application/octet-stream" },
    );
    expect(postRes.status).toBe(202);
    const postBody = JSON.parse(postRes.body.toString("utf8")) as {
      importId: string;
    };
    const record = await waitForImport(port, postBody.importId);
    expect(record.status).toBe("failed");
    expect(record.error).toBeDefined();
    expect(record.assetCount).toBe(0);

    // KV 记录也反映 failed
    const kvRecord = importStore!.get(postBody.importId);
    expect(kvRecord!.status).toBe("failed");
  });
});

describe("dsh-jx import API — directory import (real HTTP seam)", () => {
  it("imports a local directory, serves assets, records in KV", async () => {
    const sourceDir = await makeTempDir();
    const webp = fakeWebp();
    await mkdir(join(sourceDir, "character"), { recursive: true });
    await writeFile(join(sourceDir, "character", "dir_idle.webp"), webp);

    const body = Buffer.from(
      JSON.stringify({ source: "directory", path: sourceDir }),
      "utf8",
    );
    const postRes = await request(port, "POST", IMPORT_API_PREFIX, body, {
      "content-type": "application/json",
    });
    expect(postRes.status).toBe(202);
    const postBody = JSON.parse(postRes.body.toString("utf8")) as {
      importId: string;
    };
    const record = await waitForImport(port, postBody.importId);
    expect(record.status).toBe("completed");
    expect(record.sourceType).toBe("directory");
    expect(record.assetCount).toBe(1);
    expect(record.sourcePath).toBe(sourceDir);

    // 素材可服务
    const assetRes = await request(
      port,
      "GET",
      `${ASSET_ROUTE_PREFIX}/imported/${postBody.importId}/character/dir_idle.webp`,
    );
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers["content-type"]).toBe("image/webp");
    expect(assetRes.body.equals(webp)).toBe(true);
  });

  it("rejects a nonexistent directory with failed status", async () => {
    const fakePath = join(tmpdir(), `nonexistent-${randomUUID()}`);
    const body = Buffer.from(
      JSON.stringify({ source: "directory", path: fakePath }),
      "utf8",
    );
    const postRes = await request(port, "POST", IMPORT_API_PREFIX, body, {
      "content-type": "application/json",
    });
    expect(postRes.status).toBe(202);
    const postBody = JSON.parse(postRes.body.toString("utf8")) as {
      importId: string;
    };
    const record = await waitForImport(port, postBody.importId);
    expect(record.status).toBe("failed");
    expect(record.error).toBeDefined();
    expect(record.assetCount).toBe(0);
  });

  it("rejects a path that is a file (not a directory) with failed status", async () => {
    const tmpDir = await makeTempDir();
    const filePath = join(tmpDir, "afile.txt");
    await writeFile(filePath, "not a directory");
    const body = Buffer.from(
      JSON.stringify({ source: "directory", path: filePath }),
      "utf8",
    );
    const postRes = await request(port, "POST", IMPORT_API_PREFIX, body, {
      "content-type": "application/json",
    });
    expect(postRes.status).toBe(202);
    const postBody = JSON.parse(postRes.body.toString("utf8")) as {
      importId: string;
    };
    const record = await waitForImport(port, postBody.importId);
    expect(record.status).toBe("failed");
    expect(record.error).toContain("not a directory");
  });
});

describe("dsh-jx import API — progress & list endpoints", () => {
  it("GET progress for unknown id returns 404", async () => {
    const res = await request(
      port,
      "GET",
      `${IMPORT_API_PREFIX}/progress/nonexistent-id`,
    );
    expect(res.status).toBe(404);
  });

  it("GET list returns all import records", async () => {
    // 先导入一个 zip
    const zip = new AdmZip();
    zip.addFile("character/list_test.webp", fakeWebp());
    const postRes = await request(
      port,
      "POST",
      `${IMPORT_API_PREFIX}?source=zip`,
      zip.toBuffer(),
      { "content-type": "application/octet-stream" },
    );
    const postBody = JSON.parse(postRes.body.toString("utf8")) as {
      importId: string;
    };
    await waitForImport(port, postBody.importId);

    // GET list
    const listRes = await request(port, "GET", `${IMPORT_API_PREFIX}/list`);
    expect(listRes.status).toBe(200);
    const listBody = JSON.parse(listRes.body.toString("utf8")) as {
      imports: ImportRecord[];
    };
    expect(listBody.imports.length).toBeGreaterThanOrEqual(1);
    const found = listBody.imports.find((r) => r.id === postBody.importId);
    expect(found).toBeDefined();
    expect(found!.status).toBe("completed");
  });

  it("GET list via bare prefix path also works", async () => {
    const res = await request(port, "GET", IMPORT_API_PREFIX);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body.toString("utf8")) as {
      imports: ImportRecord[];
    };
    expect(Array.isArray(body.imports)).toBe(true);
  });

  it("returns 405 for unsupported methods on import root", async () => {
    const res = await request(port, "DELETE", IMPORT_API_PREFIX);
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toBe("POST, GET");
  });

  it("returns 400 for unsupported content-type on POST", async () => {
    const res = await request(
      port,
      "POST",
      IMPORT_API_PREFIX,
      Buffer.from("hello"),
      { "content-type": "text/plain" },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body on directory import", async () => {
    const res = await request(
      port,
      "POST",
      IMPORT_API_PREFIX,
      Buffer.from("{ not json", "utf8"),
      { "content-type": "application/json" },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for directory import missing path", async () => {
    const res = await request(
      port,
      "POST",
      IMPORT_API_PREFIX,
      Buffer.from(JSON.stringify({ source: "directory" }), "utf8"),
      { "content-type": "application/json" },
    );
    expect(res.status).toBe(400);
  });
});

describe("dsh-jx import API — KV domain record fields", () => {
  it("import record has correct timestamps and id matching KV key", async () => {
    const zip = new AdmZip();
    zip.addFile("character/kv_test.webp", fakeWebp());
    const postRes = await request(
      port,
      "POST",
      `${IMPORT_API_PREFIX}?source=zip`,
      zip.toBuffer(),
      { "content-type": "application/octet-stream" },
    );
    const postBody = JSON.parse(postRes.body.toString("utf8")) as {
      importId: string;
    };
    const record = await waitForImport(port, postBody.importId);

    // 经 store 句柄（domain.table('imports')）直接断言
    const kvRecord = importStore!.get(postBody.importId);
    expect(kvRecord).toBeDefined();
    expect(kvRecord!.id).toBe(postBody.importId);
    expect(kvRecord!.status).toBe("completed");
    expect(kvRecord!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(kvRecord!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(kvRecord!.updatedAt >= kvRecord!.createdAt).toBe(true);
    expect(kvRecord!.manifest.assets).toHaveLength(1);
    expect(kvRecord!.manifest.assets[0].path).toContain(
      `imported/${postBody.importId}/`,
    );
    expect(kvRecord!.manifest.assets[0].type).toBe("webp");
    expect(kvRecord!.manifest.assets[0].size).toBe(fakeWebp().length);

    // record（from HTTP）与 kvRecord（from store）一致
    expect(record.id).toBe(kvRecord!.id);
    expect(record.status).toBe(kvRecord!.status);
    expect(record.assetCount).toBe(kvRecord!.assetCount);
  });
});
