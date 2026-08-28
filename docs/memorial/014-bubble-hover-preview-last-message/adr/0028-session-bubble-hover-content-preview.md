# ADR-0028 — 气泡 hover 内容预览：数据源取宿主服务端 `sessionController.inspect`

## 状态

已接受（待实施）。

## 背景

会话气泡列（ADR-0007/0018/0022/0026）当前只显示会话标题与状态点，点击跳转。新需求：**鼠标 hover 会话气泡 → 浮现内容弹框**，显示会话标题 + 该会话全部用户问话（胶囊列表）+ 当前选中问话的完整内容，并支持点击跳转该会话。

要显示"该会话的用户问话"，必须先拿到会话内容。但数据获取在 client 半区遇到硬约束：

1. `sessions.list` 快照的 `SessionSummary` 只有元数据（id/title/running/completed 等），**无消息内容**；
2. client 半区读会话内容需 `sessions.binding(id).eventSource` → `uiConversation` → `ChatSnapshot.nodes`，但 `nodes` **只在会话窗口 open（当前选中会话）时有内容**；
3. `sessions.open(id)` = `manager.select(id)` 会**切换当前会话**（副作用：侧边栏高亮跳动、浮层当前会话切换、kept 记账触发）——预览非当前会话时不能靠它拉内容。

## 决策

**D1 — 数据源 = 宿主服务端 `ctx.sessionController.inspect(sessionId)`（host 半区，无副作用）**：

- host 半区 `apply(ctx)` 的 `inject` 追加 `"sessionController"`；
- host 侧调 `ctx.sessionController.inspect(sessionId)`（`api/session-controller/src/index.ts:191-200`，非 @Remote、纯 host 进程内）读会话完整 events；attached 会话直接读 `Session.events`，冷会话经 `inspectApiSession` 持久化读，**不激活 Agent、不切换 current、不改持久化**；
- 从 events 倒序收集全部 `type==='user/message'` 且 `data.source.kind==='user'`（直接用户消息，排除 plugin/notice/recall 合成）的事件，提取 `content` 中 `type==='text'` 的 `text` 拼接，作为「问话胶囊」数据（每条含文本 + 事件 seq，seq 为将来定位留位）；
- host 经既有 `ctx.webServer.register` 注册 `/api/dsh-jx/session/<id>/messages` 之类路由下发，client 半区 hover 时 fetch。

否决的三个替代：
- **client 临时 open(id) 拉窗口再切回**：每次 hover 切当前会话，侧边栏/浮层闪烁、触发 kept 记账、多泡频繁 hover 有竞态；
- **`sessions.search(query)`**：按关键词匹配返回 `snippet`，非「该会话全部问话」，且命中内容不可定位；
- **仅对窗口已 open 的会话显示预览**：不满足「每个气泡都显示问话」的主诉求。

## 后果

- host 半区新增对 `sessionController` 服务依赖（`inject` 追加），`cordis.patch.yml`/构建需确认该服务在宿主 composition 存在（已确认：`bundle/web-app/cordis.patch.yml:85-88`）；
- 新增一条 host 路由 + client 侧 hover fetch（含 debounce 防抖、结果缓存）；
- 点击胶囊跳转 `sessions.open(id)`；会话内**精确定位到某条问话**官方 API 暂无能力，作为已知限制记录（见「附注」），seq 先随胶囊数据下发留待官方开放后补定位；
- 弹框为纯新增 UI（胶囊列 + 详情区），与既有气泡点击/拖拽/保留模式正交；hover 弹框与整盒拖动经 `data-jx-interactive` 分流。

## 附注：定位能力已知限制（调查工单 003）

官方内部 UI 数据层有锚点（`chat-nodes.ts` anchorSeq、`data-chat-anchor-key`），但 `ui-chat` 无「外部指定目标消息后滚动到它」的初始化路径；URL/hash 消息锚点在独立前端仓库；`ctx.sessions.open(id)` 只接受 id。插件**无法**通过现有官方 API 实现「打开会话并滚动到指定问话」。需官方后续开放（如 `ISessions.open` 携带 focus、ui-chat 消费 `viewRequest.focus`、或前端 URL 消息锚点）。本 ADR 先将每条问话的 seq 随胶囊下发，留待定位能力就绪后接线。
