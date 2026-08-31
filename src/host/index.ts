/**
 * dsh-web-ui-jx host half — 姜晓插件宿主半区入口。
 *
 * 当前职责：
 *   - 工单 02：用 `ctx.webServer.register` 注册 `/api/dsh-jx/*` 素材路由，
 *     从仓库 `assets/` 读取本地素材并以正确 Content-Type 返回字节流。
 *   - 工单 07：用 `ctx.webServer.register` 注册 `/api/dsh-jx/import/*` 导入 API，
 *     接收 zip / 本地目录两种来源，进度写入 `ctx.storageDomain`（zod 声明式 KV domain）。
 *     素材本体落文件系统（`assets/imported/<id>/`），KV 只存元数据。
 *   - 工单 16-03：用 `ctx.webServer.register` 注册 `/api/dsh-jx/ai-title` 路由，
 *     按 OpenAI 兼容协议直连用户 endpoint 生成会话 AI 动态标题；endpoint/model/
 *     重刷频率注册宿主 settings 分节（`dsh-jx.aiTitle`），API key 存 credentials
 *     （引用/值分离、换 key 零重启），浏览器端零 key 暴露。
 *   - PRD 14 工单 01：用 `ctx.webServer.register` 注册 `/api/dsh-jx/session/<id>/messages`
 *     路由，经宿主 `sessionController.inspect` 无副作用读取会话问话（气泡内容弹框
 *     数据源，ADR-0031）。
 *
 * 浏览器半区（'./client' 入口）注入管理 UI + 角色浮层。
 * 安装：`dsh plugin --profile web add link:<repo>`。
 * @module dsh-web-ui-jx
 */

import type { Context } from "@deepseek-ai/cordis";
import { registerAssetRoutes } from "./asset-routes.ts";
import { registerImportApi } from "./import-api.ts";
import { registerSessionMessagesRoute } from "./session-messages.ts";
import { registerAiTitleRoute } from "./ai-title-route.ts";
import { registerRestartRoute } from "./restart.ts";

/** Stable cordis plugin name（匹配 cordis.patch.yml 的 insert id）. */
export const name = "dsh-jx";

/**
 * 激活前所需的宿主服务：webServer 提供路由注册，storageDomain 提供 KV 元数据存储，
 * sessionController 提供无副作用会话读面（气泡内容弹框数据源，ADR-0031），
 * settings/credentials 供 ai-title 路由读取配置与 API key.
 */
export const inject = [
  "webServer",
  "storageDomain",
  "settings",
  "credentials",
  "sessionController",
];

/**
 * Host plugin body. 注册素材路由（工单 02）、导入 API（工单 07）、会话问话路由
 * （PRD 14 工单 01）与 ai-title 路由（工单 16-03）；路由通过 `ctx.effect` 托管，
 * fiber 卸载时自动清理。导入 API 打开 KV domain（async），故 apply 为 async。
 *
 * @param ctx - cordis host root context（含 ctx.webServer / storageDomain / settings /
 *   credentials / sessionController 服务）。
 */
export async function apply(ctx: Context): Promise<void> {
  registerAssetRoutes(ctx);
  registerSessionMessagesRoute(ctx);
  await registerImportApi(ctx);
  registerAiTitleRoute(ctx);
  registerRestartRoute(ctx);
}
