# host 重启路由与自愈重启器

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** `POST /api/dsh-jx/restart` 端点可用且行为正确——POST 回 `200 {ok:true}`、非 POST 回 `405`；真实 trigger 时宿主优雅退出，并被内置自愈看守以相同的 `execPath + argv + cwd` 自动重新拉起；路由 seam 可注入假 trigger 来测试走线而不真正重启测试进程。

**验收标准：**

- [ ] 新 host 路由 `POST /api/dsh-jx/restart`：POST → `200 {ok:true}`；GET/其他 → `405`（allow: POST）。
- [ ] 重启触发走线：POST 后先回 200，再派分离（`detached` + `unref`）的自愈看守进程（内联脚本，继承宿主控制台），随后调 `ctx.appExit(0)` 优雅停机；宿主无 `appExit` 时回退 `process.exit(0)`。
- [ ] 自愈看守等父进程退出（`process.kill(pid,0)` ESRCH）后用相同 `execPath + argv.slice(1) + cwd` 重起宿主，随后自身退出。
- [ ] 路由与重启副作用分离：`buildRestarterScript` 为纯函数、`registerRestartRoute` 的 `trigger` 可注入——路由测试用假 trigger 验证 200/405 且不真重启。
- [ ] 路由经 `ctx.effect` 托管满足 ADR-0017 可重入（热重载无残留）。
- [ ] host 路由测试通过：`buildRestarterScript` 单测 + 路由 200/405（假 trigger）。

## 评论

（评论与对话历史追加于此，新内容置于最前。）