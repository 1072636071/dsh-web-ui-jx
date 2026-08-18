import { defineConfig } from "vitest/config";

/**
 * vitest 配置 — host 半区测试在 Node 环境跑（启动真实 webServer、发真实 HTTP 请求）。
 *
 * client 半区测试（后续工单 05 状态机等）默认也走 node environment；若后续需要 DOM，
 * 可在具体测试文件顶部用 `// @vitest-environment jsdom` 覆盖，无需改全局配置。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 路由 handler 用 node:http / node:fs/promises，Node 内置即可，无需额外 polyfill。
    globals: false,
  },
  esbuild: {
    // 测试 import 源码用 .ts 扩展名（allowImportingTsExtensions），esbuild 直接处理。
    target: "esnext",
  },
});
