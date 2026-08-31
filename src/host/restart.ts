/**
 * host 半区 — 一键重启 DSH 宿主路由（memorial 017）。
 *
 * 目标：浏览器 client 半区设置卡里点「重启 DSH」，让改动后的 host 半区
 * （`src/host/*`，打包进 `lib/index.js`）新构建在宿主进程重启后生效，无需
 * 手动从终端重起。
 *
 * 核心约束：**浏览器按钮无法直接重启承载它的宿主 Node 进程**。宿主进程需
 * 由外部监督者拉起并在退出后重启，否则"自我重启"不可能。当前开发环境为裸跑
 * （无 nodemon / dev runner），故本模块内置一个**自愈重启器**（D-2/M1）：
 *   1. `buildRestarterScript` 生成一段内联 `node -e` 看守脚本（纯函数，可单测）；
 *   2. 触发时先 `spawn` 这个分离看守进程（`detached + unref`，继承宿主
 *      stdout/stderr 以保留调试输出到同一控制台），再 `ctx.appExit(0)` 优雅停机；
 *   3. 看守进程轮询父进程存活（`process.kill(pid, 0)`，ESRCH = 已退出），父死即
 *      用相同的 `execPath + argv + cwd` 重新拉起宿主，实现自动重启。
 *
 * 路由：`POST /api/dsh-jx/restart`（D-3）——方法非 POST → 405；POST → 先回
 * `200 {ok:true}`，再派看守进程，随后唤退出（宿主无 `appExit` 时回退
 * `process.exit(0)`）。
 *
 * 可测性（D-6）：重启副作用抽成可注入 `trigger`，路由接线与自愈脚本分离——host
 * 路由测试用假 trigger 验证 200 / 405，不真正重启测试进程；`buildRestarterScript`
 * 单独纯函数单测。模式对齐 `registerAssetRoutes` / `registerAiTitleRoute`
 * （`ctx.effect` 托管，ADR-0017 可重入——热重载无残留）。
 *
 * @module dsh-web-ui-jx/host/restart
 */

import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import { writeJson } from "./http-shared.ts";

/** 重启路由前缀（比素材路由 `/api/dsh-jx` 更长，longest-prefix-wins 优先匹配）. */
export const RESTART_ROUTE_PREFIX = "/api/dsh-jx/restart";

/** 看守轮询父进程存活的时间间隔（ms）. */
const POLL_INTERVAL_MS = 300;

/** 派看守进程后延迟优雅退出（ms），给 HTTP 200 响应留出落网时间. */
const EXIT_DELAY_MS = 300;

/** 重建宿主启动所需的进程快照（自愈看守的输入）. */
export interface RestartMeta {
  /** 宿主进程 PID（看守据此等待其退出）. */
  pid: number;
  /** `process.execPath`（node 可执行文件绝对路径）. */
  execPath: string;
  /** `process.argv.slice(1)`（宿主原始启动参数，含脚本路径与后续参数）. */
  argv: string[];
  /** `process.cwd()`（重启后回到同一工作目录）. */
  cwd: string;
}

/** 生成随包之外的内联 `node -e` 看守脚本：等父死 → 用原启动方式重起宿主. */
export function buildRestarterScript(meta: RestartMeta): string {
  return [
    "const { spawn } = require('node:child_process');",
    `const parentPid = ${meta.pid};`,
    `const exec = ${JSON.stringify(meta.execPath)};`,
    `const argv = ${JSON.stringify(meta.argv)};`,
    `const cwd = ${JSON.stringify(meta.cwd)};`,
    "(function poll() {",
    "  let alive = true;",
    "  try { process.kill(parentPid, 0); }",
    "  catch (e) { if (e && e.code === 'ESRCH') alive = false; }",
    "  if (!alive) {",
    "    try { const child = spawn(exec, argv, { cwd, stdio: 'inherit' }); child.unref(); }",
    "    catch (e) { /* 重起失败仍结束看守，避免僵尸进程 */ }",
    "    finally { process.exit(0); }",
    "    return;",
    "  }",
    `  setTimeout(poll, ${POLL_INTERVAL_MS});`,
    "})();",
  ].join("\n");
}

/**
 * 派代理-看守进程：`spawn(node -e script)`，`detached + unref` 使其脱离宿主
 * 独立存活，`stdio: ['ignore','inherit','inherit']` 继承宿主控制台以保留重起
 * 后宿主的调试输出。返回子进程句柄（调用方可 unref 或测试断言）。
 */
export function spawnRestartWatcher(
  meta: RestartMeta,
): ReturnType<typeof spawn> {
  const child = spawn(process.execPath, ["-e", buildRestarterScript(meta)], {
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.unref();
  return child;
}

/** 可注入的重启执行器签名：route 测试用假实现验证接线，不真触发重启. */
export type RestartTrigger = (meta: RestartMeta) => void;

/** 默认重启执行器：派看守进程 → 延时唤优雅退出（无 appExit 时回退 process.exit）. */
export function createDefaultRestartTrigger(
  appExit: ((code?: number) => void) | undefined,
): RestartTrigger {
  return (meta) => {
    spawnRestartWatcher(meta);
    setTimeout(() => {
      if (typeof appExit === "function") {
        appExit(0);
      } else {
        process.exit(0);
      }
    }, EXIT_DELAY_MS);
  };
}

/**
 * 处理 `POST /api/dsh-jx/restart`。方法限制仅 POST（GET → 405）。POST 先写
 * `200 {ok:true}` 让浏览器确认命令已收，再派看守并唤退出。所有失败路径
 * 显式写响应（对齐素材路由防御性风格）。
 *
 * @param req - 请求（含 method / url）。
 * @param res - 响应。
 * @param trigger - 重启执行器（默认 createDefaultRestartTrigger）。
 */
function handleRestartRequest(
  req: IncomingMessage,
  res: ServerResponse,
  trigger: RestartTrigger,
): void {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }
  writeJson(res, 200, { ok: true });
  const meta: RestartMeta = {
    pid: process.pid,
    execPath: process.execPath,
    argv: process.argv.slice(1),
    cwd: process.cwd(),
  };
  trigger(meta);
}

/**
 * 在给定 context 上注册 `POST /api/dsh-jx/restart` 路由。模式对齐
 * `registerAiTitleRoute`：`ctx.effect` 托管，fiber 卸载自动清理（ADR-0017
 * 可重入——热重载无残留）。
 *
 * @param ctx - 已注入 `webServer` 的 cordis context（appExit 为非 service 的
 *   launcher 提供值，经 `ctx.get` 读取，缺失则回退 `process.exit`）。
 * @param deps - 可选注入 `trigger`（测试用）；默认 createDefaultRestartTrigger。
 * @returns 同步 disposer；调用即卸载路由。
 */
export function registerRestartRoute(
  ctx: Context,
  deps: { trigger?: RestartTrigger } = {},
): () => void {
  const appExit = ctx.get("appExit") as ((code?: number) => void) | undefined;
  const trigger =
    deps.trigger ?? createDefaultRestartTrigger(appExit);
  return ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: RESTART_ROUTE_PREFIX,
        handler: (req, res) => handleRestartRequest(req, res, trigger),
      }),
    "dsh-jx: /api/dsh-jx/restart route",
  );
}
