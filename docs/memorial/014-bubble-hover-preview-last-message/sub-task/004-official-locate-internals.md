# 调查工单 004 — 官方「会话内精准定位」的实现机制与插件不可复用原因（深挖）

**状态**：已完成
**创建**：2026-08-28
**完成**：2026-08-28
**前置**：工单 003（判定「不可行」）；本工单回答「官方内部到底怎么做、门为什么关着、开哪扇门最省」
**回写**（2026-08-28 用户确认「不竞争了」）：结论摘要已记入 `.scratch/14-session-bubble-content-preview/research-official-locate.md` 与 PRD「超出范围」；ADR-0028 附注升级为 003+004 合并版。`turnTail` 暗道**明确不采用**。

---

## 结论

### 1. 官方那套「锚点」不是定位功能，是视口稳定机制

- `anchorSeq`（number）= 节点的可排序渲染位置（源自 durable event 的 seq），**只用于排序与检测 prepend**（`chat-nodes.ts:10`；`ChatView.tsx:307,411` 首行 seq 变小=头部插入了旧消息）。
- 真正被消费的锚是 `anchorKey`（string）= 节点稳定 key，渲染成 DOM 属性 `data-chat-anchor-key`（`ChatNodeSeat.tsx:204`）。user 行的 key 含**消息 id 而非 seq**（`conversation.ts:275-277`、`message.ts:42-46`），seq 只挂在 `node.anchorSeq`（`message.ts:82`）。
- 锚定算法：`querySelectorAll('[data-chat-anchor-key]:not([hidden])')` 线性遍历**已渲染行**（`ChatView.tsx:32-37`，非 IntersectionObserver），按 `flowTop` 视口差值补偿 `scrollTop`（`:66-68,391-392`）。**只能命中已渲染 DOM 行，不触发加载/翻页。**

### 2. 锚点机制仅有的三个消费方，全是「保持位置」而非「跳过去」

1. 同页面重开会话还原滚动位：`chatScroll.read()`（`ChatView.tsx:384-400`）——存储是 `apply.ts:82` 的**纯内存闭包 Map**，不落任何 storage，跨页面刷新即失，无外部写入口；
2. `loadOlder` prepend 旧消息时视口不跳（`ChatView.tsx:532-546,411-424`）；
3. `TurnNavigator` 组件轨跳 Turn（闭包内 `navigateToTurn`，`ChatView.tsx:549-570`）——产品内唯一主动跳转，仍受「目标行已渲染」限制且不导出。

新打开会话首帧一律 `toBottom()`（`ChatView.tsx:384-400` saved===null 分支）。

### 3. 官方产品自己也没有「搜索结果定位到消息」

侧边栏搜索点击仅 `sessions.open(id)`；`SessionSearchResultItem` 只有 `{sessionId, snippet}` 无 seq（`manager.ts:41-44`）；源码注释明说 "Search navigation opens the session only; **it does not address an event inside the conversation**"（`Rows.tsx:303-304`）。审批/通知点击无定位。**官方把「跳到会话」当作搜索的终点——我们的已知限制与官方产品能力持平，不是插件独有的缺陷。**

### 4. viewRequest：有现成的「跨视图 focus」管线，但 ChatView 不消费

- `openView(view, focus)` 写 `conversationStore.viewRequest`（`stores.ts:24-28`），随 `conversation.view` 槽下发（`ConversationSession.tsx:197-201`）——focus 是 target 自有的不透明标识（`views.ts:9-15`）。
- **唯一消费者是 TrajectoryView**（focus=tool callId，`ui-trajectory/TrajectoryView.tsx:160`）。ChatView 解构 props 里没有 viewRequest（`ChatView.tsx:204-207`）——对它注入没有任何定位效果。
- ChatView 自身只生产：`inspectCall = openView('trajectory', callId)`（`ChatView.tsx:225-227`）。

### 5. URL 通道：零

本仓库 `apps/web` 就是控制台前端（`@deepseek-ai/dsh-web-frontend`）；静态服务器明示「无 History API 路由、无 SPA 回退」（`host/frontend-static/README.md:48,105`）；全 client 无 pushState/hashchange，唯一 URL 读取是 `?fixture` 测试旗标（`connection/src/client/index.ts:144-145`）。工单 003 说的「消息 hash 在独立前端仓库」指 chat.deepseek.com 产品前端，与本 harness 控制台无关。**无任何 window.location 注入面。**

### 6. 插件为何不可复用（四道门锁死的准确表述）

1. `ISessions.open(id)` 契约无第二参数（`contract/sessions.ts:44` → `manager.select` `manager.ts:165-182`）；
2. 锚 key 含消息 id 不含 seq、查询限已渲染 DOM——外部即使拿到 seq 也无法构造查询目标，且不会触发按需加载；
3. `chatScroll` 是插件不可达的闭包（不落 storage，无写入口）；
4. `viewRequest` 通道插件理论可达（store persist `dsh.conversation.<sessionId>` 可水合注入），但 ChatView 不消费它 → 对聊天视图无效；`IConversation` 服务面（`service.ts:34-65`）无 locate 方法。

### 7. 官方最少开哪扇门（侵入度升序）

1. **ChatView 消费 `viewRequest('chat')`**（~10 行）：管线现成，只缺 `ChatView.tsx:204` 解构处把 viewRequest/completeViewRequest 接上 + 一个 seq→key 映射的 useEffect；正式暴露面应为 `ctx.uiConversation.requestView(sessionId, view, focus)`。
2. `ISessions.open(id, opts?: {focusSeq})`：改契约 + ChatView 挂载 effect 优先于 saved 分支。
3. 独立 `scrollToSeq` service：改动面最大。
4. URL hash 约定：现仓库路由为零，需凭空造，不建议。

### 8. 新发现：零官方改动的「半可行」暗道（本期未采用，记录备查）

`conversation.chat.turnTail` 是**插件可注册的链式槽**（`ui-chat/contract/slots.ts:196`），owner 携带 `{turn: TurnLocation, seq, openFile}`（`slots.ts:24-28`；`TurnLocation` 含 turn/start/end 事件，`conversation.ts:75-81`）。理论路径：跳转前把目标问话 seq 存会话级状态 → `sessions.open(id)` →（必要时 `ctx.uiConversation` 绑定面 `loadOlder()`，`service.ts:64`）→ 插件 turnTail 组件发现自己所在 turn 含目标 seq 时对自身 DOM 调 `scrollIntoView`。局限：定位精度是 **Turn 尾部**而非问话行本身、依赖目标 turn 恰被装载、与官方 follow-scroll/prepend 补偿存在竞争、无「已定位」完成信号。**属脆弱暗道，ADR-0028 附注「留待官方开放接口后补」的判断维持不变。**

## 来源

- `packages/client/ui-chat/src/client/contract/chat-nodes.ts:10`、`contract/slots.ts:24-28,120,131-136,196`、`chat/ChatView.tsx:32-37,66-68,204-207,225-227,295,307,384-400,411-424,532-546,549-570,615-618`、`chat/ChatNodeSeat.tsx:145-146,204`、`conversation-nodes/common.ts:40-59`、`conversation-nodes/message.ts:42-46,82`、`conversation-nodes/assistant.ts:349`、`apply.ts:82,115-118,139-145`
- `packages/client/ui-conversation/src/client/stores.ts:14-32`、`contract/views.ts:9-15`、`contract/conversation.ts:75-81,275-277`、`service.ts:64,332-333,375`、`skeleton/ConversationSession.tsx:184,196-201`
- `packages/client/ui-trajectory/src/client/TrajectoryView.tsx:160,513`
- `packages/api/session-controller/src/client/sessions/manager.ts:41-44,165-182`、`sessions/service.ts:225-227,249-251,270-271,534`、`contract/sessions.ts:44`
- `packages/client/ui-workspace/.../rows/Rows.tsx:303-304,311-342`
- `packages/client/store/src/index.ts:139-163,222-227`、`packages/client/connection/src/client/index.ts:144-145`、`apps/web/src/main.ts`、`packages/host/frontend-static/README.md:48,105`
