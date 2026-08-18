import type { Plugin } from "vite";
import { defineConfig, type UserConfig } from "vite";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

/**
 * 客户端 bundle 的模块表注册 id —— 必须是包名（graph row id），与
 * deepseek-harness 的 `ClientModuleRegistry` 扫描产物一致。
 */
const CLIENT_ID = "dsh-web-ui-jx";

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
 * 注入，避免宿主只加载单个 client.js 时丢失样式（宿主不知道独立 .css 文件）。
 * 同时把 host 期望的闭包工厂包裹（window.__ModuleLoader__.load）统一在本插件内完成：
 *   - 关闭 rollup 的 banner/intro/footer（它们会被 esbuild / rollup 重命名内部变量，破坏
 *     `return module.exports`），改为在 generateBundle 对最终产物文本做确定性的整体包裹。
 *   - 先为外置依赖（react 等）经注入 require 解析的 CJS 产物补上 `module`/`exports` 变量，
 *     再按宿主 `ClientModuleRegistry` 期望把整段注册到 `window.__ModuleLoader__`。
 *   - 把 vite 抽取出的 .css 资产合并并以 <style data-plugin> 注入（loader 卸载按 data-plugin 清理）。
 */
function inlineClientCss(): Plugin {
  return {
    name: "dsh-web-ui-jx-inline-css",
    apply: "build",
    generateBundle(_outputOptions, bundle) {
      const chunk = bundle["client.js"];
      if (!chunk || chunk.type !== "chunk") return;
      // 先为外置依赖（react 等）经注入 require 解析的 CJS 产物补上 `module`/`exports`
      // 变量，再按宿主 `ClientModuleRegistry` 期望把整段注册到 window.__ModuleLoader__。
      // 注意：vite 把抽取的 .css 走独立管线写盘、不进入 rollup bundle，故 CSS 在
      // closeBundle 里读盘再注入。
      chunk.code =
        `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {\n` +
        "  var module = { exports: {} }; var exports = module.exports;\n" +
        chunk.code.replace(/^'use strict';\s*/, "") +
        "\n  return module.exports; } });";
    },
    async closeBundle() {
      const jsPath = resolvePath(process.cwd(), "lib/client.js");
      const cssPath = resolvePath(process.cwd(), "lib/client.css");
      if (!existsSync(jsPath)) return;
      let js = await readFile(jsPath, "utf8");
      // 幂等：同一产物只注入一次。
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
 * dsh-web-ui-jx 构建配置：产出 host/client 双半区产物。
 *
 * - host 半区：src/host/index.ts → lib/index.js（Node ESM，对应 exports "."）
 * - client 半区：src/client/index.ts → lib/client.js（浏览器 ESM，对应 exports "./client"）
 *
 * 两半区均 external react 与 @deepseek-ai/* 宿主包 —— 这些在运行时由宿主
 * 进程/浏览器壳提供，不打包进插件产物。
 *
 * `vite build` 一次只接受单配置对象，故用 `--mode` 切换半区：
 *   - 默认（mode=production）：构建 host 半区，emptyOutDir 清空 lib/
 *   - `--mode client`：构建 client 半区，emptyOutDir: false 追加写入
 * package.json 的 build 脚本串联两次调用产出双半区。
 *
 * external 列表包含三类：
 *   - react / react-dom：peerDependencies，由宿主浏览器壳提供
 *   - @deepseek-ai/*：宿主 cordis / dsh-* 运行时，由宿主进程提供
 *   - node:* / node 内置模块：host 半区用 fs/path/url/crypto 等 Node API，
 *     运行时由宿主 Node 进程提供，不应被 vite 浏览器兼容化空模块化
 *     （否则 vite 报 "X is not exported by __vite-browser-external"）
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
    outDir: "lib",
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
    outDir: "lib",
    emptyOutDir: false,
    target: "esnext",
    sourcemap: false,
    // 关闭压缩：语言层最小编译（TS/JSX），不做变量重命名，保证 generateBundle
    // 里对产物文本的整体包裹（window.__ModuleLoader__.load）引用到的 `module`
    // `exports` 变量名保持确定。包裹与 CSS 内联均由 inlineClientCss 插件完成。
    minify: false,
    rollupOptions: {
      external,
      output: {
        // 固定产物名：宿主从 /plugins/<id>/client.js 拉取并执行。
        entryFileNames: "client.js",
      },
    },
  },
  // 包裹与 CSS 内联插件：必须放顶层 plugins（Vite 没有 build.plugins）。
  plugins: [inlineClientCss()],
};

export default defineConfig(({ mode }) =>
  mode === "client" ? clientConfig : hostConfig,
);
