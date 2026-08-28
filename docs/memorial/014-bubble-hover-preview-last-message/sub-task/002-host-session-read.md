# 调查工单 002 — 宿主服务端读会话内容能力

**状态**：已完成
**创建**：2026-08-28
**完成**：2026-08-28

---

## 任务描述

插件 host 半区能否无副作用读取任意指定会话（sessionId）的消息内容——特别是「最后一条用户消息」？

## 明确问题

1. 宿主服务端是否有按 sessionId 读会话消息内容的服务端 API / controller / RPC？
2. 插件 host 半区 apply() 注入什么 context？能否访问宿主服务端会话/消息存储？
3. sessions / session 服务是否存在于 host 半区 context？
4. 若有可行通道，给出调用方式 + 关键文件 + 代码片段。

## 期望产出

结论 + 关键文件绝对路径 + 行号 + 代码片段。

---

## 结论（code-explorer 调研，2026-08-28）

**可行，且存在专门为此设计的无副作用接口。**

1. **宿主服务端暴露按 id 读会话内容能力**：`SessionController`（`api/session-controller/src/index.ts`，类 83-393，typert Remote service 命名空间 `session`），宿主 composition 已加载（`bundle/web-app/cordis.patch.yml:85-88`）。

2. **关键接口 `inspect(sessionId, signal?)`**（`index.ts:191-200`，非 @Remote、纯 host 内部、无副作用）：返回 `{ meta, events }`；attached 会话直接读 `Session.events`，冷会话经 `inspectApiSession`（`agent.ts:114-127`，走 `ctx.sessionQuery.observeSession`）持久化读。不激活 Agent、不切换 current、不改持久化。

3. **最后一条用户问话提取**：events 倒序找最后一条 `type==='user/message'` 且 `data.source.kind==='user'` 事件（`core/session/src/types.ts:249`），取 content 中 `type==='text'` 的 text 拼接。`source.kind==='user'` 过滤照抄官方 controller 构造器 `index.ts:158`。

4. **插件接线**：host `apply(ctx)` 的 `inject` 加 `"sessionController"` → `ctx.sessionController.inspect(...)` → 经既有 `ctx.webServer.register`（`dsh-web-ui-jx/src/host/import-api.ts:577` 模式）注册 HTTP 路由（如 `/api/dsh-jx/session/<id>/last-message`），client 半区 hover 时 fetch。

## 来源

- `D:\work\space\deepseek-harness\packages\api\session-controller\src\index.ts`（inspect 191-200、page 367-370、search 219-222、follow 378-381、source 过滤 158）
- `D:\work\space\deepseek-harness\packages\api\session-controller\src\agent.ts`（inspectApiSession 114-127）
- `D:\work\space\deepseek-harness\packages\api\session-controller\src\history.ts`（SessionHistoryController）
- `D:\work\space\deepseek-harness\packages\core\session\src\index.ts`（SessionStore/ctx.sessions 790、Session.events 557-560）
- `D:\work\space\deepseek-harness\packages\core\session\src\types.ts`（user/message 249、SessionEvent 384-396）
- `D:\work\space\deepseek-harness\packages\llm\llm\src\message.ts`（UserMessage/MessageSource 129-144）
- `D:\work\space\deepseek-harness\packages\bundle\web-app\cordis.patch.yml`（85-88）
- `d:\work\space\dsh-web-ui-jx\src\host\index.ts`（host 半区入口）
