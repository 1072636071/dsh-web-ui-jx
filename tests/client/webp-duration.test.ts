/**
 * webp-duration 纯逻辑测试（工单 01 验收，seam：素材字节 → 动画总时长）。
 *
 * seam：parseWebpDurationMs（输入字节输出时长，纯函数）+ loadWebpDurationMs
 * （URL → 时长，带缓存与失败回退）。不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖：
 *   - 合成字节：帧时长累加、单帧、空帧（非动画）、非法容器、截断 chunk。
 *   - 真实素材（assets/character/）：46 个全量解析，过渡段两档（16 × 3484ms /
 *     20 × 5494ms），循环态 10 × 5025ms（权威值来自 sub-task/002 调查结论）。
 *   - 加载缓存：同 URL 只 fetch 一次；解析失败/网络失败回退 null 且不重复请求。
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parseWebpDurationMs,
  loadWebpDurationMs,
} from "../../src/client/webp-duration.ts";

// ---------------------------------------------------------------------------
// 合成 webp 字节构造（RIFF/WEBP + VP8X(animated) + ANIM + ANMF×n）
// ---------------------------------------------------------------------------

/** 24-bit LE. */
function u24(buf: Buffer, off: number, value: number): void {
  buf[off] = value & 0xff;
  buf[off + 1] = (value >> 8) & 0xff;
  buf[off + 2] = (value >> 16) & 0xff;
}

/** 构造动画 webp：每帧时长为 frames 数组元素（ms）。 */
function makeAnimatedWebp(frames: readonly number[]): Uint8Array {
  const chunks: Buffer[] = [];
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x02; // 动画标志
  chunks.push(
    Buffer.concat([Buffer.from("VP8X", "latin1"), u32be(10), vp8x]),
  );
  const anim = Buffer.alloc(6); // bg(4) + loopCount(2)
  anim.writeUInt16LE(0, 4);
  chunks.push(Buffer.concat([Buffer.from("ANIM", "latin1"), u32be(6), anim]));
  for (const dur of frames) {
    const payload = Buffer.alloc(16); // x(3) y(3) w(3) h(3) dur(3) flags(1)
    u24(payload, 12, dur);
    chunks.push(
      Buffer.concat([Buffer.from("ANMF", "latin1"), u32be(16), payload]),
    );
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "latin1");
  return new Uint8Array(Buffer.concat([header, body]));
}

function u32be(len: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(len, 0);
  return b;
}

// ---------------------------------------------------------------------------
// parseWebpDurationMs：合成字节
// ---------------------------------------------------------------------------

describe("parseWebpDurationMs: 合成字节", () => {
  it("多帧动画：总时长 = 各帧时长累加", () => {
    expect(parseWebpDurationMs(makeAnimatedWebp([67, 67, 536]))).toBe(670);
  });

  it("单帧动画", () => {
    expect(parseWebpDurationMs(makeAnimatedWebp([5000]))).toBe(5000);
  });

  it("常规帧 + 末帧定格（过渡段形态）", () => {
    expect(parseWebpDurationMs(makeAnimatedWebp([67, 67, 67, 536]))).toBe(737);
  });

  it("空帧（无 ANMF）= 非动画/损坏 → null", () => {
    expect(parseWebpDurationMs(makeAnimatedWebp([]))).toBeNull();
  });

  it("非 RIFF/WEBP 容器 → null", () => {
    const junk = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseWebpDurationMs(junk)).toBeNull();
  });

  it("截断 chunk（payload 超出容器）→ null", () => {
    const good = makeAnimatedWebp([67, 67, 536]);
    const truncated = good.slice(0, good.length - 8); // 砍掉末尾 chunk 的一部分
    expect(parseWebpDurationMs(truncated)).toBeNull();
  });

  it("字节过短（< RIFF 头）→ null", () => {
    expect(parseWebpDurationMs(new Uint8Array([0x52, 0x49, 0x46]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseWebpDurationMs：真实素材回归（权威值：sub-task/002 结论）
// ---------------------------------------------------------------------------

describe("parseWebpDurationMs: 现有 46 素材回归", () => {
  const assetsDir = resolve("assets/character");
  const files = readdirSync(assetsDir)
    .filter((f) => f.toLowerCase().endsWith(".webp"))
    .sort();
  const transitions = files.filter((f) => f.startsWith("transition-"));
  const loops = files.filter((f) => !f.startsWith("transition-"));

  it("素材总数 = 46（10 循环态 + 36 过渡段）", () => {
    expect(files).toHaveLength(46);
    expect(loops).toHaveLength(10);
    expect(transitions).toHaveLength(36);
  });

  it("循环态 10 个全为 5025ms/圈", () => {
    for (const f of loops) {
      const bytes = readFileSync(join(assetsDir, f));
      expect(
        parseWebpDurationMs(new Uint8Array(bytes)),
        `循环态 ${f}`,
      ).toBe(5025);
    }
  });

  it("过渡段 36 个只落两档：16 × 3484ms + 20 × 5494ms", () => {
    const counts: Record<number, number> = {};
    for (const f of transitions) {
      const bytes = readFileSync(join(assetsDir, f));
      const dur = parseWebpDurationMs(new Uint8Array(bytes));
      expect(dur, `过渡段 ${f}`).toBeGreaterThan(0);
      if (dur !== null) counts[dur] = (counts[dur] ?? 0) + 1;
    }
    expect(counts).toEqual({ 3484: 16, 5494: 20 });
  });

  it("抽样过渡段：idle-thinking 45 帧型 / reading-idle 75 帧型", () => {
    const t1 = readFileSync(join(assetsDir, "transition-idle-thinking.webp"));
    expect(parseWebpDurationMs(new Uint8Array(t1))).toBe(3484);
    const t2 = readFileSync(join(assetsDir, "transition-reading-idle.webp"));
    expect(parseWebpDurationMs(new Uint8Array(t2))).toBe(5494);
  });
});

// ---------------------------------------------------------------------------
// loadWebpDurationMs：URL 加载 + 缓存 + 失败回退
// ---------------------------------------------------------------------------

describe("loadWebpDurationMs: 加载与缓存", () => {
  it("成功：解析真实时长，同 URL 只 fetch 一次", async () => {
    let calls = 0;
    const fetcher = async (): Promise<Uint8Array> => {
      calls += 1;
      return makeAnimatedWebp([67, 67, 536]);
    };
    const d1 = await loadWebpDurationMs("/api/dsh-jx/character/idle.webp", fetcher);
    const d2 = await loadWebpDurationMs("/api/dsh-jx/character/idle.webp", fetcher);
    expect(d1).toBe(670);
    expect(d2).toBe(670);
    expect(calls).toBe(1);
  });

  it("失败（fetch reject）：返回 null，不重复请求", async () => {
    let calls = 0;
    const fetcher = async (): Promise<Uint8Array> => {
      calls += 1;
      throw new Error("network");
    };
    const d1 = await loadWebpDurationMs("http://x/y.webp", fetcher);
    const d2 = await loadWebpDurationMs("http://x/y.webp", fetcher);
    expect(d1).toBeNull();
    expect(d2).toBeNull();
    expect(calls).toBe(1);
  });

  it("失败（解析不出时长）：返回 null", async () => {
    const fetcher = async (): Promise<Uint8Array> => new Uint8Array([1, 2, 3]);
    expect(await loadWebpDurationMs("http://x/bad.webp", fetcher)).toBeNull();
  });

  it("不同 URL 各自独立解析", async () => {
    const fetcher = async (url: string): Promise<Uint8Array> =>
      makeAnimatedWebp(url.endsWith("a.webp") ? [100] : [200]);
    const a = await loadWebpDurationMs("http://x/a.webp", fetcher);
    const b = await loadWebpDurationMs("http://x/b.webp", fetcher);
    expect(a).toBe(100);
    expect(b).toBe(200);
  });
});
