import { defineConfig, type UserConfig } from "vite";

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
      formats: ["es"],
    },
    outDir: "lib",
    emptyOutDir: false,
    target: "esnext",
    rollupOptions: { external },
  },
};

export default defineConfig(({ mode }) =>
  mode === "client" ? clientConfig : hostConfig,
);
