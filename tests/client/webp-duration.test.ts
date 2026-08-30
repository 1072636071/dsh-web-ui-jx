/**
 * webp-duration 纯逻辑测试（工单 01/02 验收，seam：素材字节 → 动画总时长）。
 *
 * seam：parseWebpDurationMs（输入字节输出时长，纯函数）+ loadWebpDurationMs
 * （URL → 时长，带缓存与失败回退）。不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（素材重组后 34 素材；ADR-0023 移除 welcome 三件套后）：
 *   - 合成字节：帧时长累加、单帧、空帧（非动画）、非法容器、截断 chunk。
 *   - 真实素材（assets/character/，2026-08-23 重组后）：
 *     循环素材 14 个 = 8 经典态 × 9916ms（idle/thinking/reading/permission/
 *     error/done/nod-smile/frown-wave，148 帧 × 67ms pingpong 烘焙）
 *     + 3 表情循环（happy 7524 / angry 6204 / surprised 5214，33ms 帧）
 *     + 3 idle 变体 × 4958ms（74 帧 × 67ms，loops=1；2026-08-24 openCodeMM
 *       方式重转后 5.06s 源 @14.925fps 抽出 74 帧）；
 *     过渡段 20 个 = 6 × 766ms（表情边 33ms × 23 帧）
 *     + 8 × 3484ms（标准经典边 67×44 + 536 定格）
 *     + 6 × 5494ms（长经典边 67×74 + 536 定格）。
 *   - 加载缓存：同 URL 只 fetch 一次；解析失败/网络失败回退 null 且不重复请求。
 */

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import durationManifest from "../../assets/manifest.json";
import {
  parseWebpDurationMs,
  loadWebpDurationMs,
  clearDurationCache,
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
// parseWebpDurationMs：真实素材回归（welcome 移除后 34 个，实测为准）
// ---------------------------------------------------------------------------

describe("parseWebpDurationMs: 现有 34 素材回归（ADR-0016 素材重组 + ADR-0023）", () => {
  const assetsDir = resolve("assets/character");
  const files = readdirSync(assetsDir)
    .filter((f) => f.toLowerCase().endsWith(".webp"))
    .sort();
  const transitions = files.filter((f) => f.startsWith("transition-"));
  const loops = files.filter((f) => !f.startsWith("transition-"));

  it("素材总数 = 34（14 循环素材 + 20 过渡段）", () => {
    expect(files).toHaveLength(34);
    expect(loops).toHaveLength(14);
    expect(transitions).toHaveLength(20);
  });

  it("循环素材：8 经典态 pingpong 烘焙 9916ms；3 表情各异；3 idle 变体 4958ms", () => {
    const classicPingpong: Record<string, number> = {
      // 148 帧 × 67ms（--pingpong-classic 烘焙，端点不重复）
      idle: 9916,
      thinking: 9916,
      reading: 9916,
      permission: 9916,
      error: 9916,
      done: 9916,
      "nod-smile": 9916, // 新转码循环体（工单 01）
      "frown-wave": 9916, // 新转码循环体（工单 01）
    };
    const exprLoops: Record<string, number> = {
      // memorial 008 整段倒放烘焙后的单圈时长
      happy: 7524, // 228 帧 × 33ms
      angry: 6204, // 188 帧 × 33ms
      surprised: 5214, // 158 帧 × 33ms
    };
    for (const [name, ms] of Object.entries(classicPingpong)) {
      const f = `${name}.webp`;
      const bytes = readFileSync(join(assetsDir, f));
      expect(
        parseWebpDurationMs(new Uint8Array(bytes)),
        `循环素材 ${f}`,
      ).toBe(ms);
    }
    for (const [name, ms] of Object.entries(exprLoops)) {
      const f = `${name}.webp`;
      const bytes = readFileSync(join(assetsDir, f));
      expect(
        parseWebpDurationMs(new Uint8Array(bytes)),
        `循环素材 ${f}`,
      ).toBe(ms);
    }
    // idle 变体：74 帧 × 67ms，loops=1（播完定格中性姿；openCodeMM 方式重转）
    for (const name of ["idle-v2", "idle-v3", "idle-v4"]) {
      const f = `${name}.webp`;
      const bytes = readFileSync(join(assetsDir, f));
      expect(
        parseWebpDurationMs(new Uint8Array(bytes)),
        `变体 ${f}`,
      ).toBe(4958);
    }
  });

  it("过渡段 20 个：三档（6 × 766ms + 8 × 3484ms + 6 × 5494ms）", () => {
    const counts: Record<number, number> = {};
    for (const f of transitions) {
      const bytes = readFileSync(join(assetsDir, f));
      const dur = parseWebpDurationMs(new Uint8Array(bytes));
      expect(dur, `过渡段 ${f}`).toBeGreaterThan(0);
      if (dur !== null) counts[dur] = (counts[dur] ?? 0) + 1;
    }
    expect(counts).toEqual({ 766: 6, 3484: 8, 5494: 6 });
  });

  it("抽样过渡段：idle-thinking 3484ms 型 / reading-idle 5494ms 型 / idle-surprised 766ms 型", () => {
    const t1 = readFileSync(join(assetsDir, "transition-idle-thinking.webp"));
    expect(parseWebpDurationMs(new Uint8Array(t1))).toBe(3484);
    const t2 = readFileSync(join(assetsDir, "transition-reading-idle.webp"));
    expect(parseWebpDurationMs(new Uint8Array(t2))).toBe(5494);
    const t3 = readFileSync(join(assetsDir, "transition-idle-surprised.webp"));
    expect(parseWebpDurationMs(new Uint8Array(t3))).toBe(766);
  });
});

// ---------------------------------------------------------------------------
// loadWebpDurationMs：URL 加载 + 缓存 + 失败回退
// ---------------------------------------------------------------------------

describe("loadWebpDurationMs: 加载与缓存", () => {
  beforeEach(() => clearDurationCache());

  it("成功：解析真实时长，同 URL 只 fetch 一次", async () => {
    // 用不在 manifest 的合成路径走 fetch + 解析 + 缓存路径（manifest 命中另测）。
    let calls = 0;
    const fetcher = async (): Promise<Uint8Array> => {
      calls += 1;
      return makeAnimatedWebp([67, 67, 536]);
    };
    const url = "/api/dsh-jx/character/not-in-manifest.webp";
    expect(loadWebpDurationMs(url, fetcher)).toBeDefined();
    const d1 = await loadWebpDurationMs(url, fetcher);
    const d2 = await loadWebpDurationMs(url, fetcher);
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

// ---------------------------------------------------------------------------
// 工单 20-01：时长 manifest 优先 + 缺项回落
// ---------------------------------------------------------------------------

describe("loadWebpDurationMs: manifest 优先（工单 20-01）", () => {
  beforeEach(() => clearDurationCache());

  it("manifest 命中：零 fetcher 调用直接返回时长（零整文件下载）", async () => {
    let calls = 0;
    const fetcher = async (): Promise<Uint8Array> => {
      calls += 1;
      throw new Error("manifest 命中不该 fetch");
    };
    const d = await loadWebpDurationMs("/api/dsh-jx/character/idle.webp", fetcher);
    expect(d).toBe(durationManifest["character/idle.webp"]);
    expect(d).toBe(9916);
    expect(calls).toBe(0);
  });

  it("manifest 缺项：回落原解析逻辑（fetcher 真实调用）", async () => {
    const fetcher = async (): Promise<Uint8Array> => makeAnimatedWebp([67, 536]);
    const d = await loadWebpDurationMs(
      "/api/dsh-jx/character/transition-missing.webp",
      fetcher,
    );
    expect(d).toBe(603);
  });

  it("非素材路由 URL（不在 manifest 作用域）→ 回落原解析", async () => {
    const fetcher = async (): Promise<Uint8Array> => makeAnimatedWebp([2000]);
    expect(await loadWebpDurationMs("http://x/own.webp", fetcher)).toBe(2000);
  });

  it("manifest 与运行时解析一一一致（锁定生成脚本不失配）", () => {
    const assetsDir = resolve("assets/character");
    for (const [key, ms] of Object.entries(durationManifest)) {
      const fileName = key.replace(/^character\//, "");
      const bytes = readFileSync(join(assetsDir, fileName));
      expect(parseWebpDurationMs(new Uint8Array(bytes)), key).toBe(ms);
    }
  });

  it("manifest 覆盖全部既有素材（34 个字符态/过渡段 webp）", () => {
    const assetsDir = resolve("assets/character");
    const files = readdirSync(assetsDir)
      .filter((f) => f.toLowerCase().endsWith(".webp"))
      .sort();
    const manifest = durationManifest as Record<string, number>;
    expect(Object.keys(manifest).length).toBe(files.length);
    for (const f of files) {
      expect(manifest[`character/${f}`], f).toBeTypeOf("number");
    }
  });

  it("clearDurationCache 清理实时解析缓存后重新请求", async () => {
    let calls = 0;
    const fetcher = async (): Promise<Uint8Array> => {
      calls += 1;
      return makeAnimatedWebp([100]);
    };
    const url = "/xd/synthetic-t.webp" + Math.random();
    expect(await loadWebpDurationMs(url, fetcher)).toBe(100);
    expect(calls).toBe(1);
    clearDurationCache();
    expect(await loadWebpDurationMs(url, fetcher)).toBe(100);
    expect(calls).toBe(2);
  });
});