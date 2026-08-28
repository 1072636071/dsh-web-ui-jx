# 01 — host 问话数据提取与路由

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 从任意会话日志提取全部直接用户问话并对外可用——这是气泡内容弹框的数据地基：新增 `collectUserMessages(events)` 纯函数（输入宿主会话事件数组，输出 `UserPrompt[]`，每条 `{seq, text}`），host `inject` 追加 `sessionController`，注册 `/api/dsh-jx/session/<id>/messages` 路由（调 `ctx.sessionController.inspect(sessionId)` 无副作用读会话事件 → `collectUserMessages` → JSON `{title, prompts}`）。兼容 attached + 冷会话，不切换当前焦点。

**验收标准：**

- [x] `collectUserMessages` 单测通过：过滤 `type==='user/message'` 且 `source.kind==='user'`（排除 plugin/notice/recall 合成）；多 text block 拼接；image 等非文本忽略；空事件/无问话退化输入返回空列表；seq 透传
- [x] `/api/dsh-jx/session/<id>/messages` 路由可用：curl/浏览器请求返回该会话全部直接用户问话 JSON（含 title + prompts）；不存在的会话返回合理错误
- [x] 调路由**不**改变当前会话焦点/不触发 kept 记账（无副作用）
- [x] 冷会话（未打开/重启后）也能返回问话（inspect 持久化 fallback）
- [x] 单测对齐 `tests/host/asset-routes.test.ts` / `import-api.test.ts` 先例

## 评论

实施备注（2026-08-28）：
- 提取顺序钉死为**时序正序**（末条恒为最新），PRD/ADR「倒序」措辞已勘误同步——「默认展开最后一个胶囊」不变量依赖此方向。
- 双层 payload 护栏：`MAX_USER_PROMPTS=100`（保尾丢头）+ `MAX_PROMPT_TEXT_CHARS=8000`（超长截断加省略号），落实 PRD 补充说明「条数上限由实施定」。
- 路由 title 由 `session/title` 事件 latest-wins 折叠；无 title 事件返回 null，client 回落气泡自身标题。
- `inspect` 抛错（会话不存在/不可读，异常形状不可靠区分）统一 404 JSON；id 非法 400 且不打入 inspect。
- 已知信任缺口（审查记录）：冷会话测试以 fake inspect 接线证明，持久化 fallback 正确性依赖宿主 `inspectApiSession` 契约（ADR-0028 D1），本仓不可测。
