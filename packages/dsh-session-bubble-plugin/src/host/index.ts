/**
 * dsh-session-bubble-plugin host half — 最小空实现。
 *
 * 调研结论（工单 05，host 半区必需性）：DSH bundle 插件经 cordis 以
 * `exports "."` 加载 host 半区（profile bundle 层 insert），即使薄壳不注册
 * 任何 host 侧功能，保留最小 host 入口保证 cordis 可加载、挂载配置可解析；
 * 若去掉 host 半区则 cordis 无 bundle 加载入口，插件无法挂载。
 * 全部功能在 browser 半区（'./client' 入口）：气泡列渲染。
 *
 * 安装：`dsh plugin --profile web add link:<repo>/dsh-session-bubble-plugin`。
 * @module dsh-session-bubble-plugin
 */

import type { Context } from "@deepseek-ai/cordis";

/** Stable cordis plugin name（匹配 cordis.patch.yml 的 insert id）. */
export const name = "dsh-session-bubble-plugin";

/** 薄壳无 host 侧服务依赖. */
export const inject: string[] = [];

/**
 * Host plugin body — 无 host 侧行为（气泡渲染在 browser 半区）。
 *
 * @param _ctx - cordis host root context（本插件不使用）.
 */
export function apply(_ctx: Context): void {
  // 无 host 侧行为：薄壳保持最小化（ADR-0029 D9），不注册路由/API。
}
