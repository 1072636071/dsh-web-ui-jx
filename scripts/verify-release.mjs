/**
 * dsh-web-ui-jx 发布前验收脚本（工单 11）。
 *
 * 在 `npm publish` / `npm pack` 之前对发布产物做静态验收，任一关键检查失败
 * 即以非零退出码退出，使 `prepublishOnly` 钩子阻断发布。
 *
 * 检查项：
 *   1. 构建产物：lib/index.js（host 半区）+ lib/client.js（client 半区）存在且非空
 *   2. package.json：name/version/dsh.bundle.patch/exports 字段齐全
 *   3. cordis.patch.yml：存在且非空
 *   4. assets：character/ 下有 webp，fonts/ 下有 woff2，preview/ 下有 png
 *   5. npm pack --dry-run：关键文件全部出现在打包清单中
 *   6. 素材大小报告：assets/ 总大小，异常（0 或 >500MB）告警
 *   7. 双半区体积基线：lib/index.js / lib/client.js 显著增长（>512KB）判体积回归
 *
 * 用法：`node scripts/verify-release.mjs`
 * 退出码：0=全部通过，1=至少一项失败
 *
 * @module verify-release
 */

import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

/** 检查结果聚合，任一 false 则退出码 1. */
const results = [];

/**
 * 单项检查包装器：打印 ✓/✗ 行，把结果推入 results。
 * @param {string} label - 检查项标签
 * @param {() => boolean|string} fn - 检查函数，返回 true 或描述字符串（视为通过），返回 false 视为失败
 */
function check(label, fn) {
  try {
    const out = fn();
    if (out === false) {
      results.push(false);
      console.log(`  ✗ ${label}`);
    } else if (out === true) {
      results.push(true);
      console.log(`  ✓ ${label}`);
    } else {
      results.push(true);
      console.log(`  ✓ ${label} — ${out}`);
    }
  } catch (err) {
    results.push(false);
    console.log(`  ✗ ${label} — ${err.message}`);
  }
}

/** 文件存在且非空。 */
function nonEmptyFile(p) {
  return existsSync(p) && statSync(p).size > 0;
}

/** 递归统计目录总字节大小。 */
function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSizeBytes(full);
    } else if (entry.isFile()) {
      total += statSync(full).size;
    }
  }
  return total;
}

/** 列出目录下指定扩展名的文件数（不递归）。 */
function countByExt(dir, ext) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith(ext)).length;
}

/** 把字节大小格式化为人类可读字符串。 */
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

console.log("dsh-web-ui-jx 发布前验收");
console.log("=".repeat(60));

// ─── 1. 构建产物 ───────────────────────────────────────────────
console.log("\n[1] 构建产物（lib/）");
const libIndex = join(projectRoot, "lib", "index.js");
const libClient = join(projectRoot, "lib", "client.js");

check("lib/index.js（host 半区）存在且非空", () =>
  nonEmptyFile(libIndex)
    ? `${(statSync(libIndex).size / 1024).toFixed(1)} KB`
    : false,
);
// S7/工单 18-04 验收固化：host 半区为纯 Node 代码，不得出现 react 家族包引用
// （组件 / hooks / JSX runtime / react-dom）。库纯逻辑（buildDynamicTitlePrompt 等）
// 经库包 `sideEffects: false` 与 host 的 react external 双重保证 tree-shake 干净；
// 若出现则发布被阻断，避免 React 组件混入 Node 半区、体积失控。
check("lib/index.js（host 半区）无 React 包引用", () => {
  if (!nonEmptyFile(libIndex)) return false;
  const js = readFileSync(libIndex, "utf8");
  // 覆盖 ESM `from "react"` / `from 'react/jsx-runtime'` / `from "react-dom"` 与
  // CJS `require("react")` 形态——react 家族包名：恰好 `react`、`react/` 子路径、
  // `react-dom`/`react-is`（不匹配任意 `react-*` 前缀包，避免误报）。只检查非
  // 注释行（minified 产物本无注释，防御性排除以免误报）。
  const reactImport =
    /(?:from|require\(\s*)[\s'"]react(?:\/|-(?:dom|is)|[\s'"])/;
  const hasReactImport = js
    .split(/\r?\n/)
    .some((line) => !line.trimStart().startsWith("//") && reactImport.test(line));
  return hasReactImport ? false : true;
});
check("lib/client.js（client 半区）存在且非空", () =>
  nonEmptyFile(libClient)
    ? `${(statSync(libClient).size / 1024).toFixed(1)} KB`
    : false,
);
// client 样式由 vite 的 inlineClientCss 插件内联进 client.js（以
// <style data-plugin-css> 注入），构建后不保留独立 client.css 文件。
// 验收改为确认 client.js 内含 data-plugin-css 注入标记。
check("lib/client.js 已内联 client 样式（含 data-plugin-css 注入）", () => {
  if (!nonEmptyFile(libClient)) return false;
  const js = readFileSync(libClient, "utf8");
  return js.includes("data-plugin-css")
    ? `${(statSync(libClient).size / 1024).toFixed(1)} KB 内联`
    : false;
});

// ─── 2. package.json 字段 ─────────────────────────────────────
console.log("\n[2] package.json 字段");
const pkgPath = join(projectRoot, "package.json");
const pkgActual = JSON.parse(await readFile(pkgPath, "utf8"));

check("name = dsh-web-ui-jx", () => pkgActual.name === "dsh-web-ui-jx");
check(
  "version 存在",
  () => typeof pkgActual.version === "string" && pkgActual.version.length > 0,
);
check("main 指向 lib/index.js", () => pkgActual.main === "lib/index.js");
check('exports["."] 与 exports["./client"] 齐全', () => {
  const e = pkgActual.exports;
  return !!(
    e &&
    e["."] &&
    e["."]?.default &&
    e["./client"] &&
    e["./client"]?.default
  );
});
check(
  "dsh.bundle.patch 指向 cordis.patch.yml",
  () => pkgActual.dsh?.bundle?.patch === "./cordis.patch.yml",
);
check(
  "dsh.client.platform = web",
  () => pkgActual.dsh?.client?.platform === "web",
);
check("files 字段含 lib/src/cordis.patch.yml/assets", () => {
  const f = pkgActual.files || [];
  return ["lib", "src", "cordis.patch.yml", "assets"].every((x) =>
    f.includes(x),
  );
});
check("license = Apache-2.0", () => pkgActual.license === "Apache-2.0");

// ─── 3. cordis.patch.yml ──────────────────────────────────────
console.log("\n[3] cordis.patch.yml");
const patchPath = join(projectRoot, "cordis.patch.yml");
check("cordis.patch.yml 存在且非空", () =>
  nonEmptyFile(patchPath) ? `${statSync(patchPath).size} B` : false,
);

// ─── 4. assets 素材 ───────────────────────────────────────────
console.log("\n[4] assets 素材");
const assetsDir = join(projectRoot, "assets");
const charDir = join(assetsDir, "character");
const fontsDir = join(assetsDir, "fonts");
const previewDir = join(assetsDir, "preview");

check("assets/character/ 下有 .webp 文件", () => {
  const n = countByExt(charDir, ".webp");
  return n > 0 ? `${n} 个 webp` : false;
});
check("assets/fonts/ 下有 .woff2 文件", () => {
  const n = countByExt(fontsDir, ".woff2");
  return n > 0 ? `${n} 个 woff2` : false;
});
check("assets/preview/ 下有 .png 文件", () => {
  const n = countByExt(previewDir, ".png");
  return n > 0 ? `${n} 个 png` : false;
});

// ─── 5. npm pack --dry-run ────────────────────────────────────
console.log("\n[5] npm pack --dry-run 关键文件清单");
// npm 把 notice 清单写到 stderr（npm 惯例）。Windows 上 npm 是 .cmd 批处理，
// 需 shell:true 才能解析；用 spawnSync 分别收集 stdout/stderr
const packResult = spawnSync("npm pack --dry-run", {
  cwd: projectRoot,
  encoding: "utf8",
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const packLines = (packResult.stdout || "")
  .split(/\r?\n/)
  .concat((packResult.stderr || "").split(/\r?\n/));

/** 从 npm pack --dry-run 输出里抽出被打包的相对路径清单。 */
function extractPackFiles(lines) {
  // npm 输出形如：
  //   npm notice Tarball Contents
  //   npm notice 5.1MB assets/character/done.webp
  //   npm notice 791B  cordis.patch.yml
  //   npm notice 1.9kB package.json
  //   ...
  // 我们抓取 "npm notice <size> <path>" 行的 path 部分
  const files = [];
  for (const line of lines) {
    const m = line.match(/^npm notice\s+[\d.]+\s*[a-zA-Z]+\s+(.+)$/);
    if (m) files.push(m[1].trim());
  }
  return files;
}

const packedFiles = extractPackFiles(packLines);
const requiredInPack = [
  "package.json",
  "lib/index.js",
  "lib/client.js",
  "cordis.patch.yml",
];
for (const req of requiredInPack) {
  check(`打包含 ${req}`, () => packedFiles.includes(req));
}
// assets 至少有一个文件被打包
check("打包含 assets/ 下至少一个素材", () =>
  packedFiles.some((f) => f.startsWith("assets/"))
    ? `${packedFiles.filter((f) => f.startsWith("assets/")).length} 个 assets 文件`
    : false,
);

// ─── 6. 素材大小报告 ──────────────────────────────────────────
console.log("\n[6] 素材大小报告");
const totalAssetsBytes = existsSync(assetsDir) ? dirSizeBytes(assetsDir) : 0;
check(`assets/ 总大小 ${formatBytes(totalAssetsBytes)}`, () => {
  if (totalAssetsBytes === 0) return false;
  if (totalAssetsBytes > 500 * 1024 * 1024) {
    return `⚠ 超过 500MB（${formatBytes(totalAssetsBytes)}），确认是否随包发布`;
  }
  return true;
});

// ─── 7. 双半区体积基线（工单 20-07：体积回归发布前可感知） ─────────
console.log("\n[7] 双半区产物体积基线");
// 基线（M4 治理后实测，2026-08-30）：
//   lib/index.js   ≈ 178 KB        —— host 半区（库纯逻辑，无 React）
//   lib/client.js  ≈ 139 KB（含内联 CSS，minify=true）—— client 半区
// 阈值取基线约 3× 的宽裕上限（index 178→512、client 139→512 均按磁盘字节，
// 覆盖正常演进 + 未来小幅内联，只拦「倍增量级」的显著回归），不因正常小幅
// 波动作废；超限即失败、阻断发布，提示人工复核是否失手引入大依赖。
const HOST_SIZE_CAP = 512 * 1024;   // lib/index.js：178KB 基线，超 512KB 判回归
const CLIENT_SIZE_CAP = 512 * 1024; // lib/client.js：139KB 基线，超 512KB 判回归
function sizeCapCheck(label, cap, baseLabel) {
  return check(label, () => {
    const path = label.includes("index") ? libIndex : libClient;
    if (!nonEmptyFile(path)) return false;
    const sz = statSync(path).size;
    return sz <= cap
      ? `${formatBytes(sz)}（阈值 ${formatBytes(cap)}，基线 ${baseLabel}）`
      : false;
  });
}
sizeCapCheck("lib/index.js 体积未回归（≤512KB）", HOST_SIZE_CAP, "≈178KB");
sizeCapCheck("lib/client.js 体积未回归（≤512KB）", CLIENT_SIZE_CAP, "≈139KB");

// ─── 汇总 ─────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
const passed = results.filter(Boolean).length;
const failed = results.length - passed;
if (failed === 0) {
  console.log(`✓ 全部 ${passed} 项检查通过`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} 项失败（共 ${results.length} 项）`);
  process.exit(1);
}
