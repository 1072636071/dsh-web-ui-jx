/**
 * restart 路由（memorial 017 — 一键重启 DSH）测试。
 *
 * 两层：
 *   1. `buildRestarterScript` 纯函数单测——校验生成的内联 `node -e` 看守脚本
 *      载入父进程 PID / execPath / argv / cwd，且能独立编译执行（用真实 node
 *      跑一次，ok 后即退出，不触碰父进程）。
 *   2. 路由 seam——真实 cordis Context + WebServer（OS 分配端口）+ mock
 *      trigger（记录调用、不真派看守/退出）。断言 POST → 200 {ok:true} 且
 *      trigger 收到正确 meta；GET → 405。
 */
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import WebServer from "@deepseek-ai/dsh-host-webserver";
import {
  buildRestarterScript,
  registerRestartRoute,
  RESTART_ROUTE_PREFIX,
  type RestartMeta,
  type RestartTrigger,
} from "../../src/host/restart.ts";
import { request } from "../helpers/http.ts";

let ctx: Context | undefined;
let port: number;
let disposeRoutes: (() => void) | undefined;
/** 记录 route 真正调用的重启 meta（假 trigger，不真派看守/退出）. */
let triggeredMeta: RestartMeta | undefined;

const fakeTrigger: RestartTrigger = (meta) => {
  triggeredMeta = meta;
};

beforeEach(async () => {
  triggeredMeta = undefined;
  ctx = new Context();
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  port = ctx.webServer.port;
  // 注：宿主 Web GUI 未提供 appExit 时，路由应仍可注册（回退 process.exit 路径）。
  disposeRoutes = registerRestartRoute(ctx, { trigger: fakeTrigger });
});

afterEach(async () => {
  disposeRoutes?.();
  disposeRoutes = undefined;
  await ctx?.fiber.dispose();
  ctx = undefined;
  vi.useRealTimers();
});

describe("buildRestarterScript — 内联自愈看守脚本", () => {
  it("载入父 PID / execPath / argv / cwd，且可独立跑通并退出", () => {
    const meta: RestartMeta = {
      pid: 424242,
      execPath: process.execPath,
      argv: ["-e", "// noop"],
      cwd: process.cwd(),
    };
    const script = buildRestarterScript(meta);
    // 关键字段逐项注入
    expect(script).toContain("const parentPid = 424242;");
    expect(script).toContain(JSON.stringify(process.execPath));
    expect(script).toContain("process.kill(parentPid, 0)");
    expect(script).toContain("spawn(exec, argv, { cwd, stdio: 'inherit' })");

    // 独立编译执行：看守对不存在的父 PID（424242）轮询判死 → respawn node -e //noop
    // （空程序）→ process.exit(0)。execFileSync 等其退出——验证语法与生命周期
    // 走向，不会真重启任何东西，亦不会阻塞。
    expect(() => execFileSync(process.execPath, ["-e", script], { timeout: 5000 })).not.toThrow();
  });

  it("父进程存活时看守不重起、只轮询不退出", () => {
    // 用当前存活进程作为父 PID，脚本每次轮询都 alive，不应 respawn/exit——但因脚本
    // 永不退出，这里只校验脚本包含轮询分支结构，避免真实挂起。
    const script = buildRestarterScript({
      pid: process.pid,
      execPath: process.execPath,
      argv: [],
      cwd: process.cwd(),
    });
    expect(script).toContain("if (!alive)");
    expect(script).toContain("setTimeout(poll");
  });
});

describe("dsh-jx restart route — /api/dsh-jx/restart (real HTTP seam)", () => {
  it("POST → 200 {ok:true}，且 trigger 收到当前进程真实 meta（pid/execPath/argv/cwd）", async () => {
    const res = await request(port, "POST", RESTART_ROUTE_PREFIX);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString("utf8"))).toEqual({ ok: true });
    // 假 trigger 收到的是当前测试进程的真实快照（不真退出）
    expect(triggeredMeta).toBeDefined();
    expect(triggeredMeta!.pid).toBe(process.pid);
    expect(triggeredMeta!.execPath).toBe(process.execPath);
    expect(triggeredMeta!.argv).toEqual(process.argv.slice(1));
    expect(triggeredMeta!.cwd).toBe(process.cwd());
  });

  it("GET → 405（仅 POST 允许），且不触发重启", async () => {
    const res = await request(port, "GET", RESTART_ROUTE_PREFIX);
    expect(res.status).toBe(405);
    expect(triggeredMeta).toBeUndefined();
  });
});
