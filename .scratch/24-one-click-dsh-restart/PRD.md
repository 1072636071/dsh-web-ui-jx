# PRD 24 — 一键重启 DSH

Status: ready-for-agent

## 问题陈述

开发者在调试本插件（`dsh-web-ui-jx`）时，一旦修改了 host 半区代码（`src/host/*`），必须**手动重启整个 DSH 宿主进程**，新的构建（`lib/index.js`）才会加载生效。每次都要跑到终端敲一遍重启命令，频繁且易忘。而浏览器里的 client 半区按钮无法直接重启承载它的宿主 Node 进程——这个核心限制缺少一个一键解决侵入宿主托管生命周期的入口。

## 解决方案

在设置卡底部新增一个「重启 DSH」按钮。点击后：
1. client 按 `POST /api/dsh-jx/restart` 调宿主；
2. host 先回 `200 {ok:true}`，再派一个**分离的自愈看守进程**；
3. 随后发起优雅停机（`ctx.appExit(0)`；宿主未提供 `appExit` 时回退 `process.exit(0)`）；
4. 自愈看守等父进程退出后，用相同的 `execPath + argv + cwd` 把宿主**自动重新拉起**。

关键在设计约束：浏览器按钮无法重启承载它的宿主进程（宿主需外部监督者）。当前为裸跑环境，故自身托管"看守 → 等待父死 → 重生"闭环，实现真正的"自动重启"而不依赖 nodemon/dev runner。

## 用户故事

1. 作为插件开发者，我想要在设置卡里一次性点「重启 DSH」，以便改动 `src/host` 半区代码后无需手动跑终端命令就能让新构建生效。
2. 作为插件开发者，我想要点一下按钮就能看到宿主在退出后**自动重新拉起**，以便裸跑环境下也能完成"重启确认改动"的连续调试循环。
3. 作为插件开发者，我想要把重启入口放在设置卡（配置栏）里，以便与既有皮肤/特效/角色等设置统一收纳、不占宿主主视图。
4. 作为插件开发者，我想要点击后宿主立刻给浏览器确认（`200 {ok:true}`），以便前端不产生"请求失败"的假报错，即使进程随即退出。
5. 作为插件开发者，我想要重启时**保留原始的启动方式**（`execPath + argv`）与**同一工作目录**（`cwd`），以便重起的宿主与手动起的行为一致。
6. 作为插件开发者，我想要自愈看守继承宿主的控制台输出，以便重起后宿主的日志仍出现在同一个终端里，不丢调试信息。
7. 作为插件开发者，我想要非 POST 请求被明确拒绝（405），以便该入口只允许预期语义、不会被误 GET 触发。
8. 作为测试编写者，我想要 host 重启逻辑可注入（假 trigger），以便验证路由接线（200/405）而不真的重启测试进程。
9. 作为测试编写者，我想要自愈脚本是一个纯函数，以便不执行真实进程也能单测脚本内容与生命周期走向。
10. 作为插件开发者的协作者，我想要一份词汇表记录「一键重启DSH」「自愈重启器」的命名与"为什么"，以便未来读者理解这个看似越权的自托管机制。

## 实现决策

- 双半区接线：client（`SettingsCard`）按钮 → `fetch("POST /api/dsh-jx/restart")`；host 新增 `POST /api/dsh-jx/restart` 路由。
- 路由行为（`handleRestartRequest`）：方法非 POST → `405`；POST → `writeJson(200, {ok:true})`，再调重启执行器。
- 自愈重启器（M1）：host 触发时 `spawn` 一个**分离（`detached:true` + `unref`）**的内联 `node -e` 看守进程，`stdio: ["ignore","inherit","inherit"]` 继承宿主控制台；看守轮询父 PID（`process.kill(pid,0)`，`ESRCH` = 已退出），父死即以捕获的 `execPath + process.argv.slice(1) + cwd` 重起宿主（`spawn(exec, argv, { cwd, stdio:'inherit' })`），随后自身退出。
- 停止：触发后延迟 `ctx.appExit(0)`（约 300ms，给 `200` 响应落网时间）；宿主无 `appExit`（非 launcher 契约环境）时回退 `process.exit(0)`。
- 可测性 seam：路由与重启副作用分离——`registerRestartRoute(ctx, { trigger })` 的 `trigger` 可注入（默认 `createDefaultRestartTrigger`）；`buildRestarterScript(meta)` 为纯函数单测脚本；`spawnRestartWatcher(meta)` 派看守进程。
- 脚本用地：`buildRestarterScript` 生成内联脚本，**不新增随包文件**。路由经 `ctx.effect` 托管，满足 ADR-0017 可重入（热重载无残留）。
- UI：按钮置于设置卡底部 `resetRow`（「重启 DSH」与「重置浮层位置」并列），复用 `.resetBtn` 次要按钮样式 + `.resetDivider` 分隔；语义令牌 `--dsw-alias-*`，无颜色字面量。
- **不加确认弹窗**：调试需高频点击，重启不丢数据，误点代价 = 一次重启。

## 测试决策

- seam：单一最高层 = host 路由 + 可注入 `trigger`（真实 Cordis `Context` + `WebServer`（OS 分配端口）的 HTTP seam，测试断言 200/405 且用假 `trigger` 记录调用、不真派看守/退出）；`buildRestarterScript` 为纯函数 seam。
- 好测试的标准：只测外部行为——HTTP 状态码 / body / 路由调用是否携带正确 meta；不跑真重启（避免在测试进程里退出宿主）。
- 被测模块：`restart-route.test.ts`——①`buildRestarterScript` 载入 PID/execPath/argv/cwd 且可独立编译运行退出；②POST → `200 {ok:true}` 且收到的 meta = 当前测试进程真实 `pid/execPath/argv.slice(1)/cwd`；③GET → `405` 且不触发。
- 先例：对齐既有 host 路由测试——`ai-title-route.test.ts` / `session-messages-route.test.ts` / `import-api.test.ts`（真实 HTTP seam + 注入 mock 服务），与 `tests/helpers/http.ts` 的原生 `http.request` helper。
- SettingsCard 按钮为薄壳（`fetch` + 静默 catch），由既有 `settings-card.test.ts` 组件渲染测试覆盖其存在性。

## 超出范围

- 不实现 client 半区热重载（已由 ADR-0017「插件重载」HMR 承担）。
- 不依赖/不要求外部监督者（nodemon/dev runner）——自愈重启器是裸跑兜底，不与其协作，也不处理已套监督者时的重复拉起。
- 不提供 UI 确认弹窗、进度、失败提示（静默）。
- 不覆盖跨平台信号完备性（如 Windows 进程亲缘/服务包装），只保证开发态裸跑可行。
- 不记录 ADR（功能易回退，不满足"难以逆转"，决策留 memorial 017 与 CONTEXT.md 词汇表）。

## 补充说明

- 词汇表登记（CONTEXT.md「项目定位」）：「一键重启DSH」「自愈重启器」，含"为什么浏览器按钮无法自启宿主 → 看守-重生闭环"。
- 术语/业文档：memorial `docs/memorial/archived/017-dsh-restart-button/` 完整记录 grill 过程与决策 D-1~D-6。
- 构建/验收：`npm run build` 双半区 + `npm run verify`（24 项）须通过。