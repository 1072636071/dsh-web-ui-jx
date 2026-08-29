import { defineConfig } from "vite";

/**
 * dsh-session-bubble 构建配置 — vite lib mode。
 *
 * - 产物：dist/index.js（ESM）+ dist/index.css（样式独立文件，lib mode 默认抽取）
 * - external：react/react-dom（peerDependencies，宿主提供）+ @deepseek-ai/*（DSH 宿主运行时）
 * - 类型出口：exports[".types"] 指 src（构建期不生成 .d.ts，沿用根包同款模式）
 */
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      fileName: "index",
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      external: [/^react/, /^react-dom/, /^@deepseek-ai\//],
    },
  },
});
