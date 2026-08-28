# 调查工单 001 — 官方 UI 会话内容预览机制

**状态**：已完成
**创建**：2026-08-28
**完成**：2026-08-28

---

## 任务描述

DSH 宿主仓库 `D:\work\space\deepseek-harness`。我们想在插件中实现「鼠标划过会话气泡显示该会话最后一次用户问话预览」，需要搞清官方 UI 是怎么拿到会话内容的。

## 明确问题

1. 官方侧边栏会话列表每行显示什么？是否有「最后消息预览」？
2. 官方读取具体会话内容（ConversationSnapshot/nodes/UserMessageNode）的接口路径？
3. 是否只有在会话 open（openState==='open'）时 nodes 才有内容？`sessions.open(id)` 是否切换当前会话？有没有不切换 current 也能读任意会话内容的方法？
4. 提取「最后一条用户消息」有无现成辅助函数？

## 期望产出

每问题结论 + 关键文件绝对路径 + 行号 + 代码片段。

---

## 结论（code-explorer 调研，2026-08-28）

1. **官方侧边栏无「最后消息预览」**：`ui-workspace/src/client/rows/Rows.tsx` `SessionNodeItem`（361-483）每行只显示状态点 + `displayTitle` + 相对时间；hover 浮层 `SessionHoverContent`（283-299）也只显示标题/时间/状态。`SessionSummary`（`api/session-controller/src/types.ts` 153-163）无 title/lastMessage/snippet 字段；`snippet` 仅在搜索结果的 `SessionSearchItem`（165-169）。

2. **官方读会话内容路径**：`ctx.sessions.binding(id).eventSource`（`SessionBinding.eventSource` 是消息窗口）→ `ctx.uiConversation.binding(binding).target('chat')` → `ChatSnapshot.nodes`。官方 `ui-chat/src/client/apply.ts`（60-66）。**不是** `binding.session.getSnapshot()`（那是 `SessionSnapshot`，只有生命周期/queue/control，无 nodes，见 `contract/snapshot.ts` 59-83）。

3. **nodes 只在 open 后有内容**：窗口打开 ⟺ 会话在 stage（当前选中），`service.ts` `followCurrent()`（516-537）跟随 `list.current`。`sessions.open(id)` = `manager.select(id)`（manager.ts 165-182）会**切换当前会话**（副作用）。`binding(id).eventSource` 对 cold 会话恒空（`contract/events.ts` `MutableSessionEventSource` 初始 `leaf([])`）。**官方无「不切换 current 读任意会话」的公开接口**；`sessions.search(query)` 是唯一批量内容通道，但按关键词返回匹配 `snippet`，非「最后一条」。

4. **无现成 selector**：官方内部 `ui-chat/src/client/conversation-nodes/turn-navigation.ts` `promptText(node)`（21-24，`kind==='user'` 过滤 + text block 拼接）与 `turnNavigationItem()`（53-71，`filter(kind==='user').findLast()`）为参考模式，但私有未导出。需插件自写。

## 来源

- `D:\work\space\deepseek-harness\packages\client\ui-workspace\src\client\rows\Rows.tsx`
- `D:\work\space\deepseek-harness\packages\api\session-controller\src\types.ts`
- `D:\work\space\deepseek-harness\packages\api\session-controller\src\client\sessions\{service.ts, manager.ts, session.ts}`
- `D:\work\space\deepseek-harness\packages\api\session-controller\src\client\contract\{snapshot.ts, events.ts}`
- `D:\work\space\deepseek-harness\packages\client\ui-chat\src\client\{apply.ts, conversation-nodes\turn-navigation.ts}`
- `D:\work\space\deepseek-harness\packages\client\ui-conversation\src\client\{contract\records.ts, conversation\assembly.ts}`
