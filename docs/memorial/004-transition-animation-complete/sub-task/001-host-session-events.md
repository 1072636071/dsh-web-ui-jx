# sub-task/001 — 宿主会话事件 API 查证（状态机重新设计前置事实）

**状态**：已完成
**创建**：2026-08-19
**关联**：memorial 004-transition-animation-complete · Q2/Q3 前置事实（焦点仲裁依赖）

## 背景

正在重新设计角色浮层状态机以适配多会话。已有线索：

- ADR-0007 会话气泡点击路径调用 `sessions.open(id)` → 说明宿主某 API 对象上有 `sessions`。
- 宿主仓库 `E:\work\sp\deepseek-harness` 不可访问（E 盘不存在），只能从本仓库 node_modules 查。

## 调查任务

在 `node_modules/@deepseek-ai/` 下查找并回答：

1. **sessions API 形态**：`sessions` 对象来自哪个包？类型定义文件路径？方法清单？
   - `sessions.open(id)` 签名？
   - 是否有 `sessions.on(...)` / 事件订阅？如果有，事件有哪些（新会话/会话关闭/状态变化/焦点变化）？事件 payload 是否带 sessionId？
2. **当前打开会话信号**：宿主是否暴露"当前活动/打开会话"的可订阅信号（如 `sessions.active`、focus 事件、query 接口）？如何监听"用户切到了会话 X"？
3. **per-session 助手状态事件**：是否有每会话独立的助手状态事件（thinking/replying/reading/working/error/welcome/done/permission/listening/idle）？事件是否带 sessionId？还是全局只有一个助手事件流（无会话区分）？
4. **生命周期**：如何得知会话创建/销毁？是否有会话列表查询 API？

## 输出

- 每个问题的结论（带包名 + 类型定义文件路径 + 关键签名）
- 若某 API 不存在，明确写"未找到"
- 对"事件是否带 sessionId"给出决定性结论——这决定状态机 Map 的键来源

## 调查结果

### 结论速览（决定性）

宿主会话事件/信号**全部按 sessionId 分区**，不存在无会话区分的全局助手事件流；客户端**不存在**命名式状态事件（thinking/replying 等），角色状态由会话快照差分推导。状态机 `Map<sessionId, SM>` 的键来源可直接取 `ConversationSnapshot.sessionId`（或 `SessionListState.ids` 枚举会话集合）。

### Q1 sessions API 形态

- 包：`@deepseek-ai/dsh-client-runtime@0.1.0-rc.7`（subpath `client`）。`ctx.sessions` 类型为接口 `ISessions`，实现类 `SessionRuntime`（宿主仓库不可达，本仓库 node_modules 内类型完整）。
- 类型定义文件：
  - `node_modules\@deepseek-ai\dsh-client-runtime\lib\types\client\index.d.ts`（`declare module '@deepseek-ai/cordis'` 注入 `sessions: ISessions`，L108-118）
  - `node_modules\@deepseek-ai\dsh-client-runtime\lib\types\client\contract\sessions.d.ts`（ISessions 接口本体）
  - `node_modules\@deepseek-ai\dsh-client-runtime\lib\types\client\sessions\service.d.ts`（SessionRuntime 实现 + SessionBinding / SessionListState / SessionSummary）
- `sessions.open(id)` 签名：`open(id: SessionId): void` —— 把会话设为 current 的**写命令**（无返回值；未知 id 报错；ADR-0007 气泡点击即调它）。`SessionId` 是 branded string（`node_modules\@deepseek-ai\dsh-session\lib\types\types.d.ts:6`：`export type SessionId = Branded<'SessionId'>`）。
- ISessions 成员清单：`list`（只读快照源）、`currentProvideInfo`、`searchResultLimit`、`open`、`openSubagent`、`subagentAddress`、`setSubagentCatalogOpen`、`refreshSubagents`、`noteAgentPreset`、`clear`、`search`、`fork`、`provide`、`scope`、`scopeOf`、`sessionOf`、`binding`。具体类 `SessionRuntime` 另有 `create/refresh/handleMuxEnvelope/handleHostEnvelope/handleConnected/handleDisconnected`（**不在 ISessions 面上**）。
- **未找到 `sessions.on(...)`**：无 EventEmitter、无声明式事件对象。事件订阅形态是快照订阅（zustand 风格 `ObservableSnapshot`：`getSnapshot()/subscribe(fn)`，`contract/store.d.ts:4-7`）：
  - `sessions.list.subscribe(...)` —— 列表 + current 变化；
  - `sessions.binding(id).session.subscribe(...)` —— 单会话 ConversationSnapshot 变化；
  - `sessions.currentProvideInfo` —— HostObservable（`node_modules\@deepseek-ai\dsh-client-ui-slots\lib\types\renderer.d.ts:31`）。
- 原始事件走 wire 帧（runtime 内部 `handleMuxEnvelope/handleHostEnvelope` 消费，不暴露在 ISessions 面）：
  - MuxFrame（全会话聚合流）：`session/event`（sessionId + 原始 SessionEvent）、`session/subscribed`、`approval/requested|resolved`、`question/requested|resolved`、`session/queue`、`session/jobs`、`session/projection`（sessionId + key + value + seq）、`stream/error` —— `node_modules\@deepseek-ai\dsh-host-apiproxy\lib\types\api\events.d.ts:66-145`；
  - HostFrame（宿主信息流）：`host/session-added`、`host/session-removed`、`host/session-status`（sessionId + running）、`host/agent-error`（sessionId + message）、workspace 系列、`host/remote-event` —— 同文件 L163-212。
- 宿主侧 cordis 事件（`session/created` / `session/disposed` / `session/event` / `session/flush`，`node_modules\@deepseek-ai\dsh-session\lib\types\index.d.ts:44-76`）在**客户端不存在**，也不直接跨线；客户端 cordis Events 仅声明 `slots/changed`、`connection/reset`（client/index.d.ts:93-107）。跨线转发的宿主事件仅白名单 11 个（`API_REMOTE_FORWARDED_EVENTS`，`node_modules\@deepseek-ai\dsh-api-remotes\lib\types\remote-events.d.ts:16`：agent-preset/selected、commands/change、credentials/updated、cordis/request-run、cordis/request-run-resolved、cordis/dynamic-package、cordis/dynamic-retract、cordis/inspect-query、cordis/inspect-query-resolved、llm/adapters-updated、settings/document-updated）——**无任何会话状态类事件**，与状态机无关。

### Q2 当前打开会话信号

- 唯一可订阅的"当前打开会话"信号：`sessions.list` 快照的 `current: SessionId | undefined`（`SessionListState`，service.d.ts:67-85）。监听"用户切到了会话 X" = `sessions.list.subscribe(...)` + 读 `getSnapshot().current`（本仓库 `src/client/state-machine/session-follow.ts:251-257` 正是此用法）。
- **未找到** `sessions.active`、focus 事件或相关 cordis 事件。`host/session-status` 帧只有 running 位，不承载"打开"语义；`current` 是客户端持久化选择（selection cell），`open(id)` 写入后经 list 快照发布。
- 次选信号：`sessions.currentProvideInfo`（渲染层 host 的 provide 束，随 current 变化重发布，service.d.ts:167）。

### Q3 per-session 助手状态事件

- **未找到**命名式 per-session 状态事件（无 `session.on('thinking')` 之类）；也**未找到**全局单助手事件流——客户端没有任何"助手状态"事件类型。thinking/replying/reading/working/error/welcome/done/permission/listening/idle 是角色层**自行从快照推导**的（`session-follow.ts` diffTarget 优先级：error > permission > working > replying > thinking > done(边沿) > idle；reading 由 thinking 超时 8s 推导；welcome 为本地初始态）。
- 每会话状态载体是**快照**：`sessions.binding(id).session`（`SessionFace = ISession & ObservableSnapshot<ConversationSnapshot>`，`contract/session.d.ts:96`）→ `subscribe/getSnapshot`。`ConversationSnapshot`（`sessions/conversation.d.ts:367-417`）**自带 `sessionId` 字段**，相关字段：`running`、`partial`（可见 text/reasoning chunk → replying）、`runningCalls`（→ working）、`pending`（approval/question → permission）、`promptError` / `lastAgentError` / `openError`（→ error）、`openState`、`removed`、`blank`。
- 原始事件级（需要更细粒度时）：MuxFrame `session/event` 帧带 `sessionId` + `SessionEvent`（类型全集 `node_modules\@deepseek-ai\dsh-session\lib\types\types.d.ts:223-354`：turn/start、turn/end、step/start、step/end、user/message、assistant/chunk、assistant/message、tool/call、tool/result、todo/write、request/header、request/context、session/end-seed；`SessionEventMap` 可插件合并扩展）——**全部按 sessionId 分区**。
- **决定性结论：事件/快照全部带 sessionId。** `session/event` 帧有 sessionId 字段；`ConversationSnapshot` 有 sessionId 字段；HostFrame 各帧有 sessionId 字段；list 快照以 id 为键。状态机 `Map<sessionId, SM>` 的键来源直接可用 `snapshot.sessionId`（订阅端从快照取）或 `binding.sessionId` / `list.ids`（枚举会话集合）。

### Q4 生命周期

- 创建：宿主帧 `host/session-added`（sessionId + blank + parentSessionId + origin + cwd + agentPreset，由宿主 `session/created` 触发，events.d.ts:163-171 注释）；客户端主动创建走 `SessionRuntime.create({ workspaceId?, cwd?, sessionId? }) → Promise<SessionId>`（仅具体类，ISessions 面上无此方法）；列表随之增长（list.ids / byId）。
- 销毁：宿主帧 `host/session-removed`（sessionId）；`ConversationSnapshot.removed` 置 true（`sessions/session.d.ts:239-240`）；列表删除该行。
- 列表查询：`sessions.list.getSnapshot()` → `SessionListState { ids, byId: Record<SessionId, SessionSummary>, current, phase: 'pending' | 'ready', subagentsByParent, jobsBySession, currentAddress }`；`SessionSummary`（service.d.ts:30-61）含 id / title / displayTitle / cwd / running / pendingInteraction / completed / blank / updatedAt / projectionValues。另有 `sessions.search(query, signal)`（内容搜索，上限 `searchResultLimit = 20`）。
- 宿主侧类型（仓库不可达，但 node_modules 类型可见）：`@deepseek-ai/dsh-session` 的 `SessionStore`（create / prepare / enter / announce / get / list / fork / flush + 事件 session/created、session/disposed、session/event、session/flush）——客户端看不到这些 cordis 事件，只看到上述 wire 帧。

### 对状态机重新设计的关键含义

- 焦点会话 = `sessions.list.getSnapshot().current`（订阅 list 快照即知用户切焦，无需轮询、无 focus 事件）。
- 每会话状态 = 订阅 `sessions.binding(id).session` 快照做差分（现有 session-follow 机制可逐会话实例化），所有信号天然带 sessionId。
- 不存在"全局单助手事件流"适配问题——所有宿主信号都是会话级。
- 注意：`binding(id)` 对"未在列表 / 未 scope"的会话返回 undefined（service.d.ts:341）；非 current 会话的 binding 需先确认会话在 list 中，`list.ids` 是会话集合的事实来源。
