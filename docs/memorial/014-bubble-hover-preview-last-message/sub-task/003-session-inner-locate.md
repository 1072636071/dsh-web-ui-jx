# 调查工单 003 — 会话内定位到指定问话的可行性

**状态**：已完成
**创建**：2026-08-28
**完成**：2026-08-28

---

## 任务描述

插件点击"会话 + 某条用户消息"锚点时，官方 UI 能否打开该会话并**滚动定位到那条问话位置**？

## 明确问题

1. 官方会话 UI 是否有定位到某条消息的能力？
2. URL 路由/hash 是否携带消息定位？
3. 官方是否暴露面向插件的"打开会话并定位消息"接口？
4. SessionsPort / 公开契约是否有该能力？

## 期望产出

结论 + 关键文件绝对路径 + 行号 + 代码片段，区分"官方内部 UI" vs "外部插件可调用公开接口"。

---

## 结论（code-explorer 调研，2026-08-28）

**官方未向外部插件暴露"打开会话并滚动定位到某条消息"的能力。**

1. **官方内部数据层有锚点，但聊天面板无外部定位路径**：每个 chat 节点带 `anchorSeq`（`ui-chat/src/client/contract/chat-nodes.ts:10`），渲染行写 `data-chat-anchor-key`（`ChatNodeSeat.tsx:204`），内部有 `anchorElement(list, key)` 原语（`ChatView.tsx:32`）。但该锚点仅用于滚动位置保存/恢复（`ChatView.tsx:106-116`）、分页 prepend 保持读者位置（`411-423`）、pagingAnchor 选取（`72`）。**无"收到外部指定目标消息后滚动到它"的初始化路径**；`ui-chat/src` 无读取 `ConversationViewRequest.focus` 的代码。

2. **URL/hash 消息锚点不在本仓库**：官方 web 会话路由在独立前端仓库；本仓库无任何 `location.hash`/`URLSearchParams` 会话锚点解析。会话选择由内存状态 `sessions.open(id)` 驱动。

3. **官方未暴露插件定位接口**：`ctx.sessions.open(id)` 只接受 session id；`ConversationViewRequest.focus` 是内部跨视图聚焦（`ui-conversation/src/client/contract/views.ts:9-15`，用于 chat→trajectory 跳转，`ChatView.tsx:226`），非插件定位 API。

4. **SessionsPort/公开契约无定位能力**：`SessionsPort.open(id)`（`client/runtime/.../contract/sessions-port.d.ts:27-45`）只接受 id；`ISessions` 全部方法无消息定位参数；`search` 返回 `SessionSearchResultItem = { sessionId, snippet }`（`api-catalog.ts:726`）无 seq/messageId，无法定位。

**判定**：插件无法通过现有官方 API 实现"打开会话并滚动到指定问话"。需官方新增接口（如 `ISessions.open` 携带 focus 参数、ui-chat 消费 `viewRequest.focus`、或前端 URL 消息锚点）。

## 来源

- `packages/client/ui-chat/src/client/contract/chat-nodes.ts`（anchorSeq 10）
- `packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx`（data-chat-anchor-key 204）
- `packages/client/ui-chat/src/client/chat/ChatView.tsx`（anchorElement 32、恢复位置 106-116、prepend 411-423、pagingAnchor 72、openView 226）
- `packages/client/ui-chat/src/client/apply.ts`（chatScrollPositions 82、save/read 132-138）
- `packages/client/ui-conversation/src/client/contract/views.ts`（viewRequest.focus 9-15）
- `packages/client/ui-conversation/src/client/apply.ts`（open: sessions.open 238）
- `packages/client/runtime/lib/types/client/contract/sessions-port.d.ts`（27-45）
- `packages/client/runtime/lib/types/client/contract/sessions.d.ts`（ISessions 20-127）
- `extensions/cordis-client-runner/src/client/api-catalog.ts`（726、168-220）
