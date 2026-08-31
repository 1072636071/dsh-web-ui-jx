# map — 24-one-click-dsh-restart

一键重启 DSH 宿主进程。规格见同目录 `PRD.md`；设计决策与 grill 全过程另见 memorial `docs/memorial/archived/017-dsh-restart-button/`（D-1~D-6，含"为什么浏览器按钮无法自启宿主 → 看守-重生闭环"）。

## 已做决策

- 路线 A：重启宿主进程（非 client HMR / 刷页面）。
- M1 自愈重启器：host 派分离看守 + `ctx.appExit(0)` + 原 `execPath/argv/cwd` 自动重起（裸跑兜底，不依赖外部监督者）。
- `POST /api/dsh-jx/restart`：非 POST 405；POST 回 `200 {ok:true}` 后派看守再停机。
- 设置卡底部「重启 DSH」按钮（不加确认弹窗）。
- 测试 seam：`registerRestartRoute(ctx,{trigger})` 可注入 + `buildRestarterScript` 纯函数；不真重启测试进程。

## 工单

- `issues/01-host-restart-route.md`（无阻塞）
- `issues/02-settings-card-restart-button.md`（阻塞于 01）
- `issues/03-vocab-and-acceptance.md`（阻塞于 02）