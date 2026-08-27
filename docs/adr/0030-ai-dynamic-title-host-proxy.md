# ADR-0030 — 会话气泡详情窗：AI 动态标题走 host 直连 + transport 抽象

**状态:** 已接受 + 已实施（2026-08-27，工单 16-01/03/04 落地：库 `dynamic-title.ts` transport 抽象 + host `ai-title-route.ts` 路由 + settings/credentials 接线；全量测试与 build/verify 全绿）
**关联:** ADR-0007（会话气泡列）、ADR-0029（气泡库 + 薄壳插件）、ADR-0028（跨刷新留存）

## 背景

会话气泡列新增 hover 详情窗（书页卡片意象）：会话标题 + AI 动态标题 + 最后一条
用户消息 + 最后一条模型消息。数据源已确认：非 current 会话经 `session.history`
RPC（宿主 apiproxy，纯读取不启动 Agent）拉尾页。核心分叉是 **AI 动态标题的
大模型调用方**——浏览器直连外部 LLM API 撞 CORS、key 明文存 localStorage
不安全。

## 决策

1. **AI 动态标题走 host 半区 Node 直连用户 endpoint**（OpenAI 兼容协议）：
   气泡库定义 `DynamicTitleTransport` 接口，默认实现经 host 半区路由
   `/api/dsh-jx/ai-title`（`ctx.webServer.register`），Node 侧 fetch 用户配置的
   endpoint，客户端只传消息上下文。
2. **配置复用宿主原生体系**：endpoint/model/重刷频率注册宿主 `settings`
   分节（免费获得宿主 Web UI 设置页）；API key 存 `credentials`
   （`ctx.credentials`，引用/值分离、每操作解析、换 key 零重启）。
3. **触发重刷 = 事件驱动失效 + 悬停时缓存过期才生成**：会话有更新（列表
   updatedAt/消息变化）标记缓存脏；悬停时若脏或 TTL 过期则生成；生成间可配
   最小节流间隔；平时不轮询。
4. **详情窗数据获取也走 transport 抽象**：库不直接绑定 DSH 网络层，默认 DSH
   实现用 `ctx.connection.api.sessions.history`；薄壳插件与本插件消费同一库。
5. **否决注册 LLM adapter 走宿主模型体系**：动态标题是一次性小请求，走统一
   词汇表 + `llm/stream` 调用链路重、无公开单发请求入口，且 adapter 路由唯一
   性有冲突风险。保留为未来演进方向（打通宿主模型目录/发现）。

## 后果

- 浏览器无 CORS 问题；key 不落前端；配置 UI 走宿主设置页免费获得。
- 气泡库需要 host 侧能力（一个极简路由 + settings/credentials 接线），薄壳
  插件 host 半区同样注册。
- 若朋友环境非 DSH 或无 host 半区，可换 `DynamicTitleTransport` 实现（库侧
  API 保持稳定）。

## 否决替代

- **客户端直接 fetch**：CORS 大概率失败，key 明文暴露。
- **注册 LLM adapter 走 `llm/stream`**：调用链路重、无公开单发入口、路由
  唯一性冲突风险；留给未来打通模型目录。
- **复用宿主 `dsh-session-title`**：面向「会话标题」（确定性回退），不是
  「AI 一句话动态描述」，且不可配置自定义 API。
