/**
 * http-shared 共享件测试（17-05）：writeJson / parseUrlPathname / 路径穿越防御
 * 纯函数直测——此前这些逻辑只能经 HTTP seam 间接测，收敛后获得接口级测试面。
 */

import { describe, expect, it } from "vitest";
import type { ServerResponse } from "node:http";
import { join, relative } from "node:path";
import {
  isSafeRelativePath,
  parseUrlPathname,
  resolveSafeSubpath,
  writeJson,
} from "../../src/host/http-shared.ts";

/** 构造最小 mock ServerResponse（捕获 writeHead / end 参数）。 */
function mockRes() {
  const state: {
    status: number;
    headers: Record<string, unknown>;
    body: string;
  } = { status: 0, headers: {}, body: "" };
  const res = {
    writeHead(status: number, headers?: Record<string, unknown>) {
      state.status = status;
      state.headers = headers ?? {};
    },
    end(data?: unknown) {
      state.body = Buffer.isBuffer(data)
        ? data.toString("utf8")
        : String(data ?? "");
    },
  } as unknown as ServerResponse;
  return { res, state };
}

describe("http-shared: writeJson", () => {
  it("写 JSON 响应：status + content-type + content-length + body", () => {
    const { res, state } = mockRes();
    writeJson(res, 202, { importId: "abc" });

    const expected = Buffer.from(JSON.stringify({ importId: "abc" }), "utf8");
    expect(state.status).toBe(202);
    expect(state.headers["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(state.headers["content-length"]).toBe(String(expected.length));
    expect(state.body).toBe(expected.toString("utf8"));
  });

  it("空 body / 嵌套结构均正确序列化", () => {
    const { res, state } = mockRes();
    writeJson(res, 200, { imports: [] });
    expect(state.status).toBe(200);
    expect(state.body).toBe(JSON.stringify({ imports: [] }));
  });
});

describe("http-shared: parseUrlPathname", () => {
  it("解析 pathname（不含 query）", () => {
    expect(parseUrlPathname("/api/dsh-jx/a.webp?x=1")).toBe(
      "/api/dsh-jx/a.webp",
    );
    expect(parseUrlPathname("/")).toBe("/");
  });

  it("空 / 非法 URL → null", () => {
    expect(parseUrlPathname(undefined)).toBe("/");
    expect(parseUrlPathname("http://bad url")).toBeNull();
  });
});

describe("http-shared: resolveSafeSubpath", () => {
  const ROOT = "/data/assets";
  const PREFIX = "/api/dsh-jx";

  it("合法子路径 → 安全相对路径", () => {
    // 相对路径分隔符随平台（win 反斜杠 / posix 斜杠），用 node:path 计算期望。
    const sub = resolveSafeSubpath(
      "/api/dsh-jx/character/idle.webp",
      PREFIX,
      ROOT,
    );
    expect(sub).not.toBeNull();
    expect(relative(ROOT, join(ROOT, "character/idle.webp"))).toBe(sub);

    const spaced = resolveSafeSubpath("/api/dsh-jx/a%20b/x.webp", PREFIX, ROOT);
    expect(spaced).not.toBeNull();
    expect(relative(ROOT, join(ROOT, "a b/x.webp"))).toBe(spaced);
  });

  it("malformed %-escape → null", () => {
    expect(resolveSafeSubpath("/api/dsh-jx/%zz", PREFIX, ROOT)).toBeNull();
  });

  it("null 字节（%00 解码）→ null", () => {
    expect(resolveSafeSubpath("/api/dsh-jx/a%00.webp", PREFIX, ROOT)).toBeNull();
  });

  it("字面 ..（含 foo..bar）→ null（纵深防御）", () => {
    expect(
      resolveSafeSubpath("/api/dsh-jx/../package.json", PREFIX, ROOT),
    ).toBeNull();
    expect(
      resolveSafeSubpath("/api/dsh-jx/a/../../etc/passwd", PREFIX, ROOT),
    ).toBeNull();
    expect(
      resolveSafeSubpath("/api/dsh-jx/foo..bar.webp", PREFIX, ROOT),
    ).toBeNull();
  });

  it("normalize 边界逃逸（绝对路径越界）→ null", () => {
    // 无字面 `..` 但 join 后落在根外：POSIX 下 `/etc/passwd` 覆盖 base；
    // Windows 下盘符路径 `C:\foo` 为绝对路径。均被边界检查拒绝。
    const posixAbs = resolveSafeSubpath("/api/dsh-jx//etc/passwd", PREFIX, ROOT);
    const winAbs = resolveSafeSubpath("/api/dsh-jx/C:%5Cfoo", PREFIX, ROOT);
    if (process.platform === "win32") {
      expect(winAbs).toBeNull();
    } else {
      expect(posixAbs).toBeNull();
    }
  });
});

describe("http-shared: isSafeRelativePath", () => {
  it("合法相对路径 → true（允许字面 `..` 非段，如 foo..bar）", () => {
    expect(isSafeRelativePath("character/idle.webp")).toBe(true);
    expect(isSafeRelativePath("a/foo..bar.webp")).toBe(true);
  });

  it("拒绝：绝对路径 / .. 段 / null 字节 / 斜杠开头", () => {
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("a/../b")).toBe(false);
    expect(isSafeRelativePath("../secret")).toBe(false);
    expect(isSafeRelativePath("a\0b")).toBe(false);
  });

  it("反斜杠归一化后仍拒绝 .. 段", () => {
    expect(isSafeRelativePath("a\\..\\b")).toBe(false);
  });
});
