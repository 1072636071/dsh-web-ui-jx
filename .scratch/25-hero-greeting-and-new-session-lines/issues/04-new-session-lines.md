# 姜晓新建会话台词（blank 检测 + 4 句时段台词）

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 用户切到一个空会话时，姜晓说一句与时段匹配的问候——「大人，晨安。今日有何差遣？(￣▽￣)」等 4 句；同一会话不重复说。

**验收标准：**

- [ ] 复用工单 01 的时段判定纯函数（不写第二份）
- [ ] 4 句台词与 memorial 017「台词草案」定稿逐字一致，经既有台词决策器扩展接入
- [ ] 触发判定：会话列表快照中 current id **变化**且该会话空日志（`SessionSummary.blank`）时触发一次；同一 id 不重复（lastGreetedId）
- [ ] 挂载时若当前已是空会话，补触发一次
- [ ] 「个性化问候」开关关闭时不触发
- [ ] 边界测试：blank 翻转、id 变化、同 id 不重复（fake sessions 双先例沿用）
- [ ] 已知漏检记录在案不修：宿主「New Session reuses a blank one targeting the same workspace」——复用同工作区空白会话时 id 不变，不触发（与 hero 未重新挂载行为一致）
- [ ] `npm run build && npm run verify` 通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）
