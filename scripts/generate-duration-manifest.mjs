#!/usr/bin/env node
/**
 * 生成素材时长 manifest — 工单 20-01（构建期固化每素材动画时长，运行时零整文件下载）。
 *
 * 扫描 `assets/character/*.webp`，解析每素材 RIFF/WEBP 动画总时长（ANMF 帧累加，
 * 24-bit LE ms），写入 `assets/manifest.json`：
 *
 *   {
 *     "character/idle.webp": 9916,
 *     "character/transition-idle-thinking.webp": 3484,
 *     ...
 *   }
 *
 * 键 = 相对素材根（`assets/`）的路径（`character/<file>.webp`），与运行时客户端
 * 素材 URL `/api/dsh-jx/<子路径>` 一一对应；值 = 动画总时长 ms（与
 * `parseWebpDurationMs` 语义一致）。解析不出时长的素材（非 webp/非动画/损坏）
 * 不写入 manifest——运行时对缺项静默回落原解析逻辑，行为一致。
 *
 * 用法：`node scripts/generate-duration-manifest.mjs`
 * 接入：`npm run build` 先于两次 vite 构建执行本脚本（见 package.json build）。
 *
 * 本脚本是独立实现（.mjs 不经 vite），故自含一份最小 ANMF 累加解析逻辑，与
 * `src/client/webp-duration.ts` 的 `parseWebpDurationMs` 语义保持一致；防漂移由
 * `tests/client/webp-duration.test.ts` 的「manifest 与运行时解析一一一致」用例锁定。
 *
 * @module generate-duration-manifest
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const characterDir = resolve(__dirname, "../assets/character");
const manifestPath = resolve(__dirname, "../assets/manifest.json");

/** 24-bit LE 读取（ANMF 帧时长字段）. */
function readUInt24(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

/** offset 起 4 字节等于 tag（latin1）否. */
function fourCC(bytes, offset, tag) {
  return (
    bytes[offset] === tag.charCodeAt(0) &&
    bytes[offset + 1] === tag.charCodeAt(1) &&
    bytes[offset + 2] === tag.charCodeAt(2) &&
    bytes[offset + 3] === tag.charCodeAt(3)
  );
}

/** 解析 webp 动画总时长（ms）；非动画/损坏/非容器返回 null. */
function parseWebpDurationMs(buf) {
  if (buf.length < 12) return null;
  if (!fourCC(buf, 0, "RIFF") || !fourCC(buf, 8, "WEBP")) return null;
  const end = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  let offset = 12;
  let totalMs = 0;
  let frames = 0;
  while (offset + 8 <= end) {
    const size = buf.readUInt32LE(offset + 4);
    const payload = offset + 8;
    if (payload + size > end) return null; // 截断 chunk
    if (fourCC(buf, offset, "ANMF")) {
      if (size < 16) return null;
      totalMs += readUInt24(buf, payload + 12);
      frames += 1;
    }
    offset = payload + size + (size & 1);
  }
  return frames > 0 ? totalMs : null;
}

const manifest = {};
for (const file of readdirSync(characterDir)
  .filter((f) => f.toLowerCase().endsWith(".webp"))
  .sort()) {
  const buf = readFileSync(join(characterDir, file));
  const ms = parseWebpDurationMs(buf);
  if (ms === null) continue; // 缺项：运行时回落实时解析
  manifest[`character/${file}`] = ms;
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `dsh-jx: 生成 assets/manifest.json（${Object.keys(manifest).length} 个素材时长）`,
);