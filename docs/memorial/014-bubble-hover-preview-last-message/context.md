# Memorial 014 — 气泡浮动弹窗显示最后问话 + hover 放大 + 点击跳转

**状态**：已完成（grill + 回写完成，待实施）
**创建**：2026-08-28
**slug**：bubble-hover-preview-last-message

---

## 诉求

用户原话：

> 发现问题：气泡的浮动弹窗，还是暂无内容呢，不能和官方走一样的接口么？
> 然后也是做一个小点点，默认显示最后一次的问话，超长可以截断。
> 鼠标划过，对应的问话，点点变大，文字变成这些点点的问话的内容。
> 点击这些小点点，可以去对应的区域。

## 追问记录

### Q1 — 浮动弹窗现状（2026-08-28）

**问**：代码库中并无浮动弹窗实现（搜索「暂无内容」只命中素材面板「暂无已导入素材包」），你所指「浮动弹窗」是什么？
**答**：用户选「**官方 UI 的弹窗**」——在 DeepSeek 官方 UI 里看到鼠标划过会话列表时有个显示内容的浮层，希望我们也做同样的。
**小结** → 这是**新功能**，非已存在但空。目标 = 复刻官方「会话 hover 显示内容浮层」的效果。

### Q2 — 点点与问话的对应关系（2026-08-28）

**问**：「小点点」（复数）+「对应的问话」+「去对应的区域」——钉死点点与问话/会话的对应关系。
**答**：用户选「**一个气泡一个点**」——每个会话气泡 = 一个点点；点点默认显示该会话最后一次问话（截断）；hover 放大显示对应问话内容；点击跳转到该会话。多个气泡 = 多个点点。
**小结** → 数据模型：每会话取最后一条用户问话（`kind==='user'` 的最后一条）作为点点默认文案；hover 放大显示。

### Q3 — 数据获取技术路线（2026-08-28）

**问**：client 半区读非当前会话内容需切换 current（副作用）；host 半区有 `sessionController.inspect` 无副作用接口，兼容冷会话。数据源走哪条？
**答**：用户选「**host 接口 + inspect**」——host 半区注入 `sessionController`，调 `inspect(sessionId)` 无副作用读会话日志，倒序找最后一条直接用户消息（`type==='user/message'` 且 `source.kind==='user'`），提取 text block；经现有 `webServer.register` 注册 `/api/dsh-jx` 路由下发，client 半区 hover 时 fetch。兼容冷会话，不切换当前焦点。

### Q4 — 点点形态（2026-08-28）

**问**：点点如何融入现有气泡（气泡主文案显示 title）？
**答**：用户自由描述——「**鼠标浮动到会话气泡上出现会话内容弹框，弹框里有会话标题，标题下面弄一些标签点，默认展开最后一个标签点**」。
**小结** → 形态根本修正：不是点点替代 title，而是 **hover 会话气泡 → 浮现内容弹框**（tooltip 浮层）；弹框内 = 会话标题 + 标题下一排「标签点」（多标签点 = 该会话的多轮用户问话）；**默认展开最后一个标签点**（显示最后一条问话）；hover 某标签点 → 该点点放大显示对应问话内容；点击标签点 → 跳到对应区域。

### Q5 — 标签点数量（2026-08-28）

**问**：弹框标题下的一排标签点展示几条问话？
**答**：用户选「**全部问话**」——展示该会话的全部用户问话（每条 = 一个标签点）；可能很多，超长折叠（如超出数量折叠成「+N」）。
**小结** → host 接口需返回该会话**全部直接用户消息**（不设上限），client 侧超长折叠。

### Q6 — 点击标签点跳转目标（2026-08-28）

**问**：点击标签点后跳转哪里？
**答**：用户选「**跳到该会话对应问话位置**」——点击某标签点 → `sessions.open(id)` 跳到该会话，并**定位到那条问话所在的对话位置**（需会话内滚动定位能力）。
**小结** → 需评估「会话打开后定位滚动到指定问话」的可行性。

### Q7 — 点击标签点跳转替代（2026-08-28）

**问**：官方 API 无法「打开会话并滚动定位到具体问话」，可接受替代？
**答**：用户选「**跳到会话，定位留待官方**」——点击标签点 = `sessions.open(id)` 跳到该会话（能跳，无法滚动定位）；会话内精确定位留待官方开放接口后补。

### Q8 — 标签点视觉与展开效果（2026-08-28）

**问**：弹框里一排标签点的视觉与「展开」效果哪种贴合描述？
**答**：用户选「**标签胶囊可展开**」——标签点是**文字胶囊**（显示该条问话的截断摘要）；默认展开最后一个 = 该胶囊显示完整问话；hover 某胶囊 → 放大显示对应完整问话。

### Q9 — 展开布局（2026-08-28）

**问**：胶囊展开后完整问话文字显示在哪里？
**答**：用户选「**胶囊 + 详情区**」——弹框分两层：上方一排胶囊（始终紧凑，显示问话摘要），下方一个问话详情区显示当前选中/hover 胶囊对应的完整问话。

### 事实查证（grill 启动前自查，2026-08-28）

- 气泡列组件 `SessionBubbleList.tsx`（浮层左侧竖排会话气泡，点击跳转，ADR-0007/0018/0022/0026）。
- 气泡列数据源 = `sessions.list` 快照的 `SessionSummary`（仅 id/title/running/completed/pendingInteraction 等元数据，**无会话内容/问话**）。
- 官方接口（SDK 可拿会话内容）：`ctx.sessions.binding(id).eventSource` → `uiConversation.binding(...).target('chat')` → `ChatSnapshot.nodes`；`UserMessageNode`（`kind:'user'`）含最后问话。约束：client 半区窗口仅在 open（当前选中会话）时有内容，读非当前会话需切 current（副作用）。

### 调查结果 · DSH 宿主官方机制（2026-08-28，调查委派闭环）

**工单**：`sub-task/001-official-content-preview.md`。**结论+来源已回写，状态已完成，三验通过。**

1. **官方侧边栏不显示「最后消息预览」**：`ui-workspace/rows/Rows.tsx` 的 `SessionNodeItem` 每行只显示状态点 + `displayTitle` + 相对时间 + 操作菜单；hover 浮层 `SessionHoverContent` 也只显示标题/时间/状态，**无消息预览**。`SessionSummary` 无 title/lastMessage/snippet 字段；`snippet` 仅存在于搜索结果的 `SessionSearchItem`。→ 我们做的 hover 问话预览是**官方都没有的新功能**。
2. **官方读会话内容路径**：`ctx.sessions.binding(id).eventSource` → `ctx.uiConversation.binding(binding).target('chat')` → `ChatSnapshot.nodes`。**不是** `binding.session.getSnapshot()`（那只是 `SessionSnapshot` 生命周期，无 nodes）。
3. **client 半区硬约束**：`ChatSnapshot.nodes` 只在会话**窗口 open** 后有内容；open 跟随 `list.current`——只有当前选中会话才拉窗口。`sessions.open(id)` 会**切换当前会话**（副作用）。client 半区**无**「不切换 current 读任意会话最后消息」接口。
4. **唯一能拿「内容片段」的批量通道** = `sessions.search(query)`，按关键词匹配返回 `snippet`，**非「最后一条」**。
5. **最后一条用户问话**无现成 selector，需自写。

**结论**：client 半区遇硬约束；host 半区有专门的无副作用接口（见调查 #2）。

### 调查结果 · 宿主服务端读会话内容能力（2026-08-28，调查委派闭环）

**工单**：`sub-task/002-host-session-read.md`。**结论+来源已回写，状态已完成，三验通过。**

1. **宿主服务端暴露按 sessionId 读会话内容的能力**：`SessionController`（`api/session-controller/src/index.ts`，类 83-393 行，typert Remote service 命名空间 `session`，宿主 composition 已加载——`bundle/web-app/cordis.patch.yml:85-88`）。
2. **关键接口 `inspect(sessionId, signal?)`**（`index.ts:191-200`，**非 @Remote、纯 host 进程内、无副作用**）：返回 `{ meta, events }`；attached 会话直接读 `Session.events` 全文，冷会话经 `inspectApiSession`（`agent.ts:114-127`，走 `ctx.sessionQuery.observeSession`）持久化读取。**不激活 Agent、不切换 current、不改持久化**。
3. **「最后一条用户问话」提取**：`events` 倒序找最后一条 `type==='user/message'` 且 `data.source.kind==='user'`（直接用户消息，排除 plugin/notice/recall 合成）的事件，取 `content` 中 `type==='text'` 的 `text` 拼接（`core/session/src/types.ts:249`；`llm/llm/src/message.ts` `UserMessage`；`source.kind==='user'` 过滤照抄官方 controller 构造器 `index.ts:158`）。
4. **插件接线**：host 半区 `apply(ctx)` 的 `inject` 数组加 `"sessionController"`，即可 `ctx.sessionController.inspect(...)`；再经既有 `ctx.webServer.register` 注册一条 HTTP 路由（如 `/api/dsh-jx/session/<id>/last-message`），client 半区 hover 时 fetch。`inspect` 兼容 attached + 冷会话，自动 fallback。

**结论**：host 半区 + `sessionController.inspect` 即「和官方走一样接口」的准确实现，且无副作用。

### 调查结果 · 会话内定位到指定问话的可行性（2026-08-28，调查委派闭环）

**工单**：`sub-task/003-session-inner-locate.md`。**结论+来源已回写，状态已完成，三验通过。**

1. **官方内部数据层有锚点**（`chat-nodes.ts:10` anchorSeq、`ChatNodeSeat.tsx:204` data-chat-anchor-key、`ChatView.tsx:32` anchorElement 原语），但仅用于滚动位置恢复/分页 prepend/pagingAnchor，**无「外部指定目标消息后滚动到它」的初始化路径**；`ui-chat/src` 不消费 `viewRequest.focus`。
2. **URL/hash 消息锚点不在本仓库**（官方 web 会话路由在独立前端仓库）；会话选择由内存 `sessions.open(id)` 驱动。
3. **官方未向插件暴露定位接口**：`ctx.sessions.open(id)` 只接受 id；`search` 返回 `{sessionId, snippet}` 无 seq/messageId。
4. **判定**：插件**无法**通过现有官方 API 实现「打开会话并滚动到指定问话」。需官方新增接口（`ISessions.open` 携带 focus、ui-chat 消费 `viewRequest.focus`、或前端 URL 消息锚点）。

**结论**：Q6「跳到该会话并定位到对应问话位置」在现有 API 面内**不可行**，已由 Q7 改选「跳到会话、定位留待官方」。

## 决策汇总

| # | 决策 | 状态 | ADR |
|---|------|------|-----|
| D1 | 数据源 = **host 半区 + `ctx.sessionController.inspect(sessionId)`** 无副作用读会话日志，倒序提取全部直接用户问话（`user/message` 且 `source.kind==='user'`，每条含文本 + seq）；host 经 `webServer.register` 注册 `/api/dsh-jx` 路由下发，client hover fetch。兼容冷会话，不切换当前焦点 | 已定 | ADR-0028 |
| D2 | 交互形态 = **hover 会话气泡 → 浮现内容弹框**（tooltip 浮层），弹框 = 会话标题 + 标题下一排文字胶囊 + 问话详情区 | 已定 | — |
| D3 | 胶囊 = 该会话**全部直接用户问话**（每条一个胶囊，显示截断摘要，超长折叠「+N」） | 已定 | — |
| D4 | 默认选中**最后一个胶囊**（详情区显示最后一条问话完整内容）；hover 某胶囊 → 详情区切换为对应完整问话 | 已定 | — |
| D5 | 点击胶囊 = `sessions.open(id)` 跳到该会话；会话内**精确定位留待官方开放接口后补**（官方 API 无此能力） | 已定 | — |
| D6 | 弹框布局 = 上方一排紧凑胶囊 + 下方问话详情区（当前选中/hover 胶囊的完整问话） | 已定 | — |

**ADR-0028 判定（D1）**：满足三条——①难以逆转（新增 host 接口 + client 数据契约 + host inject 依赖 sessionController，牵动构建/发布）；②未来读者会惊讶（为何插件从 host 读会话内容而非用 client `binding`？——因 client 读非当前会话会切换焦点，host `inspect` 无副作用）；③有真替代被否决（client 临时 open 切回、`sessions.search`、仅对已 open 会话降级，均有完整对比）。→ 已建本 memorial `adr/0028-session-bubble-hover-content-preview.md`，收尾时回写全局 `docs/adr/`。

## 待澄清

（已清零——核心诉求 Q1–Q9 全部定案。剩余为实施细节，实施时按既有模式自主决策：弹框逃逸/视口钳制、hover debounce 防抖、胶囊截断长度与折叠阈值、host 路由返回结构、缓存策略、prefers-reduced-motion 降级、深浅主题令牌。）

## 调查工单

- `sub-task/001-official-content-preview.md` — 已完成，含结论+来源
- `sub-task/002-host-session-read.md` — 已完成，含结论+来源
- `sub-task/003-session-inner-locate.md` — 已完成，含结论+来源

## 回写记录

- **CONTEXT.md**（用户确认回写，2026-08-28）：
  - 词汇表新增 2 术语：气泡内容弹框、问话胶囊（均指向 ADR-0028）。
  - 已定决策表新增 ADR-0028 行。
- **ADR 同步**（用户确认同步，2026-08-28）：`adr/0028-session-bubble-hover-content-preview.md` 已复制到全局 `docs/adr/0028-session-bubble-hover-content-preview.md`。
