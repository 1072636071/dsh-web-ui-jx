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
 *
 * 用法：`node scripts/verify-release.mjs`
 * 退出码：0=全部通过，1=至少一项失败
 *
 * @module verify-release
 */

import { existsSync, statSync, readdirSync } from "node:fs";
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
const libClientCss = join(projectRoot, "lib", "client.css");

check("lib/index.js（host 半区）存在且非空", () =>
  nonEmptyFile(libIndex)
    ? `${(statSync(libIndex).size / 1024).toFixed(1)} KB`
    : false,
);
check("lib/client.js（client 半区）存在且非空", () =>
  nonEmptyFile(libClient)
    ? `${(statSync(libClient).size / 1024).toFixed(1)} KB`
    : false,
);
check("lib/client.css（client 样式）存在且非空", () =>
  nonEmptyFile(libClientCss)
    ? `${(statSync(libClientCss).size / 1024).toFixed(1)} KB`
    : false,
);

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
