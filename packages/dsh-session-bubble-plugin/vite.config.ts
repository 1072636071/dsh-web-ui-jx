import type { Plugin } from "vite";
import { defineConfig, type UserConfig } from "vite";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

/**
 * 客户端 bundle 的模块表注册 id —— 必须是包名（graph row id），与
 * deepseek-harness 的 `ClientModuleRegistry` 扫描产物一致。
 */
const CLIENT_ID = "dsh-session-bubble-plugin";

/** 生成一段在 factory 执行时注入 <style> 的 JS 片段（loader 卸载时按 data-plugin 清理）。 */
function cssInjectionSnippet(css: string): string {
  return [
    "(function () {",
    "  var style = document.createElement(\"style\");",
    `  style.setAttribute("data-plugin", ${JSON.stringify(CLIENT_ID)});`,
    `  style.setAttribute("data-plugin-css", ${JSON.stringify(CLIENT_ID)});`,
    `  style.textContent = ${JSON.stringify(css)};`,
    "  document.head.appendChild(style);",
    "})();",
  ].join("\n");
}

/**
 * 把 vite lib 模式抽取出的 .css 资产内联进 client.js，并以 <style data-plugin>
 * 注入（薄壳同样走单 client.js 加载链路，宿主不加载独立 .css）。
 * 包裹逻辑与根插件一致：关闭 minify，generateBundle 对产物做确定性的
 * `window.__ModuleLoader__.load` 整体包裹，closeBundle 读盘内联 CSS。
 */
function inlineClientCss(): Plugin {
  return {
    name: "dsh-session-bubble-plugin-inline-css",
    apply: "build",
    generateBundle(_outputOptions, bundle) {
      const chunk = bundle["client.js"];
      if (!chunk || chunk.type !== "chunk") return;
      chunk.code =
        `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {\n` +
        "  var module = { exports: {} }; var exports = module.exports;\n" +
        chunk.code.replace(/^'use strict';\s*/, "") +
        "\n  return module.exports; } });";
    },
    async closeBundle() {
      const jsPath = resolvePath(process.cwd(), "dist/client.js");
      const cssPath = resolvePath(process.cwd(), "dist/client.css");
      if (!existsSync(jsPath)) return;
      let js = await readFile(jsPath, "utf8");
      if (!js.includes(cssInjectionSnippet("").trim().split("\n")[0])) {
        let css = "";
        if (existsSync(cssPath)) css = await readFile(cssPath, "utf8");
        if (css) {
          const marker = "  var module = { exports: {} }; var exports = module.exports;\n";
          js = js.replace(marker, marker + cssInjectionSnippet(css).split("\n").map((l) => "  " + l).join("\n") + "\n");
          await writeFile(jsPath, js);
          await unlink(cssPath);
        }
      }
    },
  };
}

/**
 * dsh-session-bubble-plugin 构建配置：产出 host/client 双半区产物。
 *
 * - host 半区：src/host/index.ts → dist/index.js（Node ESM，exports "."，
 *   最小空实现，保证 cordis bundle 加载入口存在）
 * - client 半区：src/client/index.ts → dist/client.js（浏览器 CJS 包裹 +
 *   CSS 内联，exports "./client"）
 *
 * external：react/react-dom（宿主浏览器壳提供）、@deepseek-ai/*（宿主
 * cordis/dsh 运行时）、node 内置（host 半区）。库 dsh-session-bubble 以
 * 相对路径源码被 vite 直接打包进产物（ADR-0029 D11：开发期零发布依赖）。
 */
const external = [
  /^react/,
  /^react-dom/,
  /^@deepseek-ai\//,
  /^node:/,
  "fs",
  "path",
  "url",
  "crypto",
  "zlib",
  "http",
  "stream",
  "util",
  "buffer",
  "events",
];

const hostConfig: UserConfig = {
  build: {
    lib: {
      entry: "src/host/index.ts",
      fileName: "index",
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: { external },
  },
};

const clientConfig: UserConfig = {
  build: {
    lib: {
      entry: "src/client/index.ts",
      fileName: "client",
      formats: ["cjs"],
    },
    outDir: "dist",
    emptyOutDir: false,
    target: "esnext",
    sourcemap: false,
    minify: false,
    rollupOptions: {
      external,
      output: {
        entryFileNames: "client.js",
      },
    },
  },
  plugins: [inlineClientCss()],
};

export default defineConfig(({ mode }) =>
  mode === "client" ? clientConfig : hostConfig,
);
