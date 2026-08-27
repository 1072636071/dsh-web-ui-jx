# Memorial 015 — 会话气泡悬浮详情窗口

> 状态：已完成（2026-08-27 收尾，C1-C5 全绿；回写 CONTEXT.md 已执行，ADR-0030 已在全局 docs/adr/）
> 创建：2026-08-27
> 实施：2026-08-27 工单 16-01~05 全部 resolved——库 `detail-data.ts`/`dynamic-title.ts` 纯逻辑层 + `SessionBubbleDetail` 书页卡片 + `SessionBubbleList` hover 状态机 + host `ai-title-route.ts` 路由 + settings/credentials 接线；全量测试 497 绿、build/verify 21 项绿（人工视觉/实装验证见工单 05 待办）。

## 诉求（用户原话）

> 然后还有一个新需求，就是鼠标浮动到会话气泡上，会有一个详情窗口出现。
> 详情窗口标题是会话标题
> 子标题是一个ai分析的动态标题-大模型的话可以配置API，然后可以配置动态标题的触发重刷机制，频率等等，
> 然后一行是最后一次用户发给会话的消息
> 还有一行是当前会话，模型最新的一些动态，和会话中最后的模型消息一样。
> 整个详情窗口我希望做成书一样的感觉。 各种消息都显示前部分，多余截断就行了

## 追问记录

### 2026-08-27 — 调查结果（代码侦查，非用户结论）

详情窗口数据源侦查（SDK `@deepseek-ai/dsh-client-runtime/client`）：

| 事实 | 结论 |
| --- | --- |
| `SessionSummary`（sessions.list 行）字段 | id/title/displayTitle/cwd/agentPreset/parentId/origin/running/pendingInteraction/completed/blank/updatedAt/projectionValues——**无消息内容字段** |
| `ConversationSnapshot`（对话节点） | 只在**已打开（staged = current）的会话**有数据流；非当前会话未实例化无消息 |
| `ISessions` | 无「读任意会话消息」方法；`binding(id)` 纯解析不打开窗口；`search()` 只能按关键词返回 `{sessionId, snippet}` |
| `SessionProjectionMap`（projectionValues） | 空接口靠宿主扩展，目前仅确认 title 键；投影是宿主计算推送，插件无法新增键 |
| host 半区能力 | 仅 `ctx.webServer.register` + `ctx.storageDomain`，无会话日志读取 API |

**核心约束（初判）**：非当前/未打开会话的消息内容，客户端侧无直接读取路径。

### 2026-08-27 — 侦查结论 2（宿主 deepseek-harness 源码，数据源已解决）

**数据源路径已确认可行**：
- 宿主 apiproxy 有 **`session.history` RPC**：`history({ sessionId, beforeSeq?, maxMessages? }) → { events: HistoryEntry[]; hasMore; projections }`。注释明确"Reading history … **never resumes or publishes an Agent**"——纯读取，不改变 current、不启动 Agent。`maxMessages` 控制消息数（可只取尾页 1-N 条），尾页还带 in-flight partial（未定稿消息，正好作"正在生成"动态）。
- `HistoryEntry = { event: SessionEvent; view?: ToolEventView }`，`SessionEvent` 为判别联合事件流（含 user 消息 / assistant 消息 / tool 事件），尾页可提取**最后一条用户消息**与**最后一条助手消息**。
- 客户端调用路径：**`ctx.connection.api.sessions.history(...)`**（`ctx.connection: ConnectionHandle` 由 connection 插件 `ctx.provide('connection')` 提供，`IApiClient` 有 `.sessions` namespace，含 search/history 等 RPC）。`ISessions` 未暴露 history，但 `ctx.connection.api` 可用。
- 备选：current 会话可用 `ConversationSnapshot`（实时订阅，零 RPC）；其余会话走 history RPC + 客户端缓存。

**AI 动态标题参考**：宿主 `dsh-session-title`（log-backed + 可选 LLM provider + `SessionTitleAutomaticMode = 'first-prompt'|'all-prompts'` 触发模式）是 host 侧、面向「会话标题」。用户要的是**可配置 API 的 AI 一句话动态标题**（`configuredEndpoint/key/model` + 触发重刷机制 + 频率），实现形态待 grill。

### 2026-08-27 — 官方文档确认（dshx.dev / GitHub docs，用户指示查阅）

**用户凭据（credentials）**：
- API key 走 `ctx.credentials`（`CredentialProvider`）：配置里只存**引用**（如 `OPENAI_API_KEY`），值存提供方 store（env → file → .env 分层），**每操作解析一次、热更新、换 key 零重启**。
- 适配器可声明「可配置提供方目录 + 模型发现」，是 **Web UI 设置页的数据源**。
- 授权流程 `ctx.authorization`（`registerFlow`/`begin`/`cancel`，每 key 单次 in-flight）。

**LLM 接缝（llm-seam）**：
- 插件用 `ctx.llm.registerAdapter([route], new LlmAdapter())` 注册模型提供方，注册是 effect（卸载自动撤销）；**路由唯一**（重复抛 `DUPLICATE_ADAPTER`）。
- `LlmAdapter` 唯一必须实现 `stream(options)`（统一词汇表 ContentBlock：text/reasoning/tool-call/tool-result），做双端翻译。
- `llm/stream` 瀑布事件包裹**每一次**流式模型调用：监听器可读、包裹、短路（测试），**不能改 options**（要换配置去 `agent/request` 瀑布）。

**HTTP 服务器（web-server）**：
- host 半区 `ctx.webServer.register(route)`（exact/prefix，重复抛错，返回 disposer）；**无鉴权**（默认 127.0.0.1，生产由网关/API Gateway 负责）；handler 可保持响应打开（SSE）。
- 与 client 通信：浏览器 HTTP + `/api` 桥接。

**修正方案启示**：AI 动态标题的「配置 API」**可完全复用宿主原生体系**——endpoint/model 存 settings、key 存 credentials、LLM 调用走注册 adapter（或 host 半区 Node 直连用户 endpoint）。不需要自己造 key 存储/配置 UI；但注意 adapter 路由唯一性（选独特路由 id 避免与朋友宿主冲突）。

### 2026-08-27 — Q1 AI 动态标题实现形态 + 触发重刷机制

**Q1**：AI 动态标题的调用方在哪（浏览器直连撞 CORS、key 不安全）。
- 方案 1：host 半区 Node 直连用户 endpoint（endpoint/model 存 settings、key 存 credentials、OpenAI 兼容协议、库侧 `DynamicTitleTransport` 接口抽象）
- 方案 2：注册 LLM adapter 走宿主模型体系（配置目录免费但调用链路重、无公开单发请求入口、adapter 路由唯一性有冲突风险）
- 方案 3：客户端直接 fetch（CORS 死路，否决）

**用户答**：方案 1——host 半区 Node 直连用户 endpoint。

**触发重刷机制**（用户未指定，助手自行决策）：**d+a 组合**——会话有更新（列表 updatedAt/消息变化）时标记动态标题缓存脏；悬停时若缓存脏或 TTL 过期则生成；生成间有可配最小节流间隔（频率可配）。平时不主动轮询。

### 2026-08-27 — Q2 视觉意象

**Q2**："书一样的感觉"具体意象。
- 方案 1：书页卡片（扉页式）——纸感背景（深褐/米白随主题）、顶部书眉区（标题+动态标题如题名页）、左侧细金书脊线、正文排版截断
- 方案 2：现代精装书（书脊+正文页）
- 方案 3：古籍线装感
- 方案 4：书页翻角（狗耳页）

**用户答**：方案 1——书页卡片（扉页式）。**并再次授权：其余决策由助手自行落定。**

### 2026-08-27 — 自行决策（用户授权）

**D3 数据获取**：非 current 会话用 `ctx.connection.api.sessions.history({ sessionId, maxMessages: 3 })` 拉尾页（含 in-flight partial）；模块级内存缓存 `Map<sessionId, {preview, fetchedAt}>` + 15s TTL + 会话列表 `updatedAt` 变化失效 + in-flight 去重（同会话并发悬停只发一次）。current 会话实施时可用 ConversationSnapshot 实时订阅作优化。

**D4 交互触发**：hover 进入延迟 300ms（防误触）、离开延迟 200ms（可移向详情窗）；详情窗贴气泡展开、视口越界自适应换侧；触屏（pointer:coarse）长按 500ms 触发；详情窗内点击可 `sessions.open` 跳转会话；hover 期间气泡 hover 态保持不闪烁。

**D5 截断策略**：消息区 `-webkit-line-clamp: 3` 行截断 + 省略号，另加字符级护栏（防无空格超长串撑爆）；行数可配置。

**D6 范围归属**：详情窗全部进气泡库 `dsh-session-bubble`（`SessionBubbleDetail` 组件 + 数据获取逻辑 + 样式 + token 扩展）；数据获取走库的 `transport` 抽象（默认 DSH 实现用 `ctx.connection.api`）；AI 动态标题走 `DynamicTitleTransport`（默认 host 半区 `/api/dsh-jx/ai-title`）。本插件与薄壳插件消费同一库自动获得。

**D7 AI 动态标题配置**：endpoint/model/频率注册宿主 `settings` 分节（免费获得宿主 Web UI 设置页）；key 存 `credentials`。本插件 SettingsCard 加快捷入口；薄壳插件注册同名 settings 分节（保持最小化，不自定义设置 UI）。

**D8 书页卡片视觉 token**：新增 `--jx-paper-bg`（纸感背景，深色=古褐纸 rgba、浅色=米白）与 `--jx-paper-edge`（纸边光）进 `bubble-theme.css`（含深浅双值随 `data-ds-dark-theme`）；左侧 2px 金线书脊（`--jx-gold`）；AI 动态标题前置小朱砂章点缀（`--jx-seal`，克制使用）；顶部书眉区标题 + 动态副题排版；正文消息 3 行截断。遵守 DESIGN.md 深底浅字/装饰克制纪律。

## 决策汇总

| # | 决策 | 状态 |
| --- | --- | --- |
| D1 | AI 动态标题 = host 半区 Node 直连用户 endpoint（OpenAI 兼容协议）；endpoint/model 存 `settings`、key 存 `credentials`（resolve 热更新）；库侧 `DynamicTitleTransport` 接口抽象，薄壳插件同构。 | 已定 |
| D2 | 触发重刷 = 事件驱动失效 + 悬停时缓存过期才生成（d+a 组合），节流频率可配。 | 已定（助手自决） |
| D3 | 数据获取 = `session.history` 尾页 + 内存缓存 15s TTL + updatedAt 失效 + in-flight 去重；current 会话可走 ConversationSnapshot 优化。 | 已定（助手自决） |
| D4 | 交互 = hover 300ms 进入 / 200ms 离开、视口自适应换侧、触屏长按 500ms、详情窗内可点击跳转、hover 态保持。 | 已定（助手自决） |
| D5 | 截断 = 3 行 line-clamp + 字符护栏，行数可配。 | 已定（助手自决） |
| D6 | 详情窗进气泡库 `dsh-session-bubble`；数据/AI 标题均走 transport 抽象；本插件与薄壳自动获得。 | 已定（助手自决） |
| D7 | AI 动态标题配置 = 宿主 `settings` 分节 + `credentials`；本插件 SettingsCard 快捷入口；薄壳注册同名分节。 | 已定（助手自决） |
| D8 | 书页卡片 token：`--jx-paper-bg`/`--jx-paper-edge` 进 bubble-theme.css；金线书脊 + 朱砂章点缀；深浅双值随主题。 | 已定（助手自决） |

## 待澄清

（无——收尾回写确认见下轮）
