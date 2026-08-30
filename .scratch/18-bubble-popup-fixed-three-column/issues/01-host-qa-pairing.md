# host 问答配对数据层：路由响应每条问话附 LLM 回复

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** hover 弹框的数据地基：/api/dsh-jx/session/<id>/messages 每条用户问话带上其配对的 LLM 最终回复，使弹框有问答数据可显示；切片止于数据端点，curl 即可验证。

**验收标准：**

- [x] collectUserMessages 扩展为逐问配对（如 collectConversation），路由响应每条 prompt 输出 {seq,text,reply}
- [x] reply = 该问话后、下一条真人问话(user/message 且 source.kind==='user')前，最后一条非空 assistant/message 文本；无则 null
- [x] 正确处理文本位置不对称（问话 data.content / 回复 data.message.content），跳过 tool-call 前言、空 content、注入型 user/message
- [x] 回复文本另设长度护栏；MAX_USER_PROMPTS 等既有护栏仍生效；client 未升级前向后兼容不炸
- [x] 新增/扩展 host 纯函数测试覆盖正例与边界，路由测试回归绿

## 评论

- [2026-08-30 · 验收] 运行时验证通过：重启 :3080 host（detached PID 64936）后，真实会话 inspect 读日志，/api/dsh-jx/session/83b3a48e…/messages 每条 prompt 附配对 reply（样例 reply 1271 字符，正确取自 data.message.content）；未知/不可读 id 走结构化 404 JSON（writeJson），证明 collectConversation 路由已加载。collectConversation 单测 + 路由 HTTP 测试全绿。
