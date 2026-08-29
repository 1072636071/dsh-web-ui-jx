# 调研附档 — 官方「会话内精准定位」机制与不可复用结论

- Feature: `14-session-bubble-content-preview`
- 调研日期：2026-08-28（jxx-research 自由模式，双路并行 + 关键点抽查核验）
- 证据全文：`docs/memorial/014-bubble-hover-preview-last-message/sub-task/004-official-locate-internals.md`（含逐条 文件:行号）
- 本篇：PRD 内结论的完整版（PRD.md 仅留摘要 + 本文件指针）

## 一句话结论

**官方那套 anchor 机制不是「定位到某条消息」的功能，而是「保持视口不动」的滚动稳定机制；官方产品自己也做不到消息级定位（搜索点击只跳会话，源码注释明说）。插件四条潜在通道全部有门无锁可开——本期维持 ADR-0028「留待官方开放接口后补」的判断，不做脆弱暗道。**

## 官方机制真相（锚点 = 视口稳定）

1. `anchorSeq`（源自事件 seq）只用于节点排序与检测 prepend（头部插入旧消息）——`chat-nodes.ts:10`、`ChatView.tsx:307,411`。
2. 实际被消费的锚是 `anchorKey`（渲染为 `data-chat-anchor-key`），查找 = `querySelectorAll` **只在已渲染 DOM 行里线性找**，按 `flowTop` 视口差值补偿 `scrollTop`——`ChatNodeSeat.tsx:204`、`ChatView.tsx:32-37,66-68`。不触发按需加载；锚 key 含消息 id 不含 seq。
3. 锚点仅三个消费方：同页面重开还原滚动位（存储为 `apply.ts:82` 纯内存闭包 Map，不落 storage）、`loadOlder` 翻页防跳、`TurnNavigator` 跳 Turn。**新打开会话一律 `toBottom()`**（`ChatView.tsx:384-400`）。

## 官方产品同样没有消息级定位

侧边栏搜索结果只有 `{sessionId, snippet}` 无 seq，点击仅 `sessions.open(id)`；源码注释："Search navigation opens the session only; **it does not address an event inside the conversation**"（`Rows.tsx:303-304`）。审批/通知点击无定位。跳转能力与我们的弹框胶囊持平。

## 插件四条通道逐条封死（为何不可复用）

| 通道 | 为什么不通 | 证据 |
| --- | --- | --- |
| `sessions.open(id)` 带目标 | 契约就没有第二参数 | `contract/sessions.ts:44` |
| 构造锚 key 直接定位 | key 含消息 id 非 seq、且只查已渲染行，不会触发装载 | `conversation.ts:275-277`、`message.ts:42-46` |
| 写滚动恢复存储 | `chatScroll` 闭包私有、纯内存、不落 storage，无写入口 | `apply.ts:82` |
| `viewRequest` focus 管线 | 整条管线现成，但 **ChatView 不消费**（解构里没有），只被 TrajectoryView 用（focus=tool callId） | `stores.ts:24-28`、`ChatView.tsx:204-207`、`TrajectoryView.tsx:160` |
| URL hash 路由 | 控制台前端路由为零（无 pushState/hash，静态服务器明示无 SPA 回退）；消息 hash 在 chat.deepseek.com 独立产品前端，与本 harness 无关 | `frontend-static/README.md:48,105` |

## 官方开口的最省路径（备官方参考）

1. **ChatView 消费 `viewRequest('chat')`**（~10 行，侵入最小）：管线现成，只缺解构处接上 + seq→key 映射 useEffect；正式暴露面配 `ctx.uiConversation.requestView(sessionId, view, focus)`。
2. `ISessions.open(id, opts?: { focusSeq })`：改契约 + 挂载 effect 优先于 saved 分支。
3. 独立 `scrollToSeq` 服务：改动面最大。
4. URL hash 约定：需凭空造路由，不建议。

我们的数据面已留位：路由返回的每条问话带 `seq`，上述任一口子开启后即可在 `SessionBubblePreview` 直接接线，无需二次改造。

## 曾评估的零改动暗道（明确不采用）

`conversation.chat.turnTail` 链式槽 owner 带 `{turn, seq}`（`slots.ts:24-28,196`），理论可配合 `loadOlder()` 在 turnTail 组件里对自己 `scrollIntoView`。**否决理由：精度只到 Turn 尾部、依赖装载窗口巧合、与官方滚动补偿竞争（用户拍板「不竞争了」）、无完成信号。**属脆弱暗道，维持 ADR-0028 附注判断。
