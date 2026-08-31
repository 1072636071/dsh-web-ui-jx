# Memorial 017-dsh-restart-button

状态：已完成

## 诉求

用户原话：

> 做一个一键重启DSH的按钮。放在配置栏里就行了。因为在调试DSH的时候，要时不时的重启DSH确认修改结果。

## 追问记录

### 2026-08-31 调研基线（代码库内事实，非结论）

- 本插件双半区：host 半区（`src/host/index.ts`，Node 进程，注册 `/api/dsh-jx/*` 路由）+ client 半区（`src/client/index.ts`，浏览器，注入侧边栏入口 `SidebarEntry` + 设置卡 `SettingsCard`）。
- 「设置卡」= `SettingsCard`（`src/client/components/SettingsCard.tsx`）：四个可折叠 section（皮肤/特效/角色/管理）+ 底部「重置浮层位置」按钮。
- DSH 宿主运行时是**独立仓库** `E:\work\sp\deepseek-harness`（`@deepseek-ai/dsh-root`），本插件作为 bundle 装进它。CONTEXT.md「宿主生态」登记。
- **技术约束**：浏览器 client 半区的按钮无法直接重启承载它的 host Node 进程；宿主进程需由外部监督者（dsh CLI / dev runner / nodemon 等）拉起并在退出后重启，否则无法"自我重启"。
- 已存在 client 半区热重载机制（ADR-0017「插件重载」）：client-hmr `rebuilt` 帧 → 作废模块 → 重拉 bundle → 重跑 `apply()`，不刷新页面。这只覆盖 client 半区改动，不覆盖 host 半区改动（host 改动需重启进程）。
- 设置卡 UI 模式：开关（toggle）+ 滑杆 + 底部次要按钮（resetBtn）。语义令牌 `--dsw-alias-* / --dsw-specific-* / --jx-*`，双主题由 L2 remap 自动处理，无颜色字面量。

### 2026-08-31 宿主机制查证（deepseek-harness 仓库内事实）

- DSH 宿主 host 半区可注入/调用 `ctx.appExit(code)`（launcher 提供的**有界优雅退出回调**，非服务；`packages/boot/cmdline` 拥有 launcher 契约）。CLI `profile-boot.ts` 把 `exit: code => void shutdown.shutdown(code)` 接入。有信号/SIGTERM = 监督者常规停止、退出码 0 的处理。
- `ctx.appExit` 只负责**优雅停机**，不会自我重启进程；进程能否活过来取决于是否处于外部监督者（nodemon / dev runner / 进程管理）之下。
- CLI boot 存在 `patchReload === 'live'` 的 live-reload 机制（`profile-boot.ts`）：可整体 dispose 配置树并重组——但用于 profile/配置层热更，不等于宿主进程重启。
- client 半区已有 HMR（ADR-0017「插件重载」）：`rebuilt` 帧 → 作废模块 → 重拉 bundle → 重跑 `apply()`，不刷新页面、不重启进程，**只覆盖 client 半区**。

### 问题 1（核心）：「重启 DSH」的确切含义与当前调试链路？

「重启 DSH」在本插件上下文里可落在不同粒度，工程可行性与覆盖范围差异巨大，必须先对齐。

**问题 1 已答（用户）：按路线 A 实现——按钮触发后自动重启宿主进程。**

## 决策汇总

- D-1（已定）：按钮用于**重启宿主 DSH 进程**（路线 A），目标是在改动 `src/host` 后半区代码后，一次点击让新构建生效。
- D-2（已定，M1）：浏览器裸跑环境 → **插件内置自愈重启器**。触发时先 `spawn` 分离看守进程，等宿主优雅退出后用相同 `execPath + argv` + 原 cwd 重新拉起，无需外部监督者。
- D-3（已定）：host 新增 `POST /api/dsh-jx/restart` 路由。handler：方法非 POST → 405；POST → 先回 `200 {ok:true}`，再派自愈重启器，随后调 `ctx.appExit(0)`（宿主无 appExit 时回退 `process.exit(0)`）。
- D-4（已定）：client 侧在 `SettingsCard` 底部 `resetRow` 行加「重启 DSH」按钮，复用 `.resetBtn` 次要按钮样式；点击 `fetch("/api/dsh-jx/restart", { method:"POST" })`。**不加确认弹窗**（调试需高频点击，重启不丢数据，误点代价 = 一次重启）。
- D-5（已定）：自愈脚本由 host **内联 `-e` 生成**（`buildRestarterScript` 纯函数，可单测），不新增随包文件；轮询父进程存活（`process.kill(pid,0)`），父死即 `spawn(execPath, argv, {cwd})` 重起。
- D-6（已定）：重启逻辑依赖可注入（`trigger`），路由接线与自愈脚本分离，便于在 host 路由测试里用假 trigger 验证 200/405，而不真正重启测试进程。

## 待澄清

（已空）