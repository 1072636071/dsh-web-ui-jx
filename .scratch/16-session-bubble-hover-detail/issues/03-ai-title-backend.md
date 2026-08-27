# 工单 03 — AI 动态标题后端链路（host 直连 + 配置）

**Status:** resolved

**Blocked by:** 15-04（组件与样式迁移入库，库 v1 完整）

**构建内容：** AI 动态标题后端链路可用——库的 `DynamicTitleTransport` 接口 + DSH 默认实现（host 半区路由按 OpenAI 兼容协议 fetch 用户 endpoint）；endpoint/model/频率注册宿主设置分节（免费获得设置页），API key 存凭据体系（引用/值分离、换 key 零重启）。配置好后可生成标题文本（暂无悬停 UI 触发）。

**验收标准：**

- [x] 库导出 `DynamicTitleTransport` 接口（generateTitle）与 DSH 默认实现（host 路由）
- [x] host 侧 ai-title 路由按 OpenAI 兼容协议 fetch 用户 endpoint，错误/超时降级，浏览器端零 key 暴露
- [x] settings 分节注册（endpoint/model/重刷频率），宿主 Web UI 设置页可见
- [x] credentials 存取 API key（resolve 每操作解析、换 key 零重启）
- [x] transport 单测（提示词组装有界、错误回退）通过

## 答案

2026-08-27 完成。

- 库 `packages/dsh-session-bubble/src/detail/dynamic-title.ts`：
  - `DynamicTitleTransport` 接口（`generateTitle`）+ DSH 默认实现 `createDshDynamicTitleTransport`（POST `/api/dsh-jx/ai-title`，超时 10s，浏览器零 key）。
  - 纯函数 `buildDynamicTitlePrompt`（提示词有界：标题 40 字 / 最后消息 120 字护栏）、`parseDynamicTitleResponse`（OpenAI 兼容 `choices[0].message.content`，截断护栏 60 字）。
  - `decideTitleRefresh` / `createDynamicTitleStore`（16-04 刷新判定纯逻辑 + 缓存/节流包装器）。
  - `index.ts` 导出；库零新增运行时外部依赖。
- host 半区 `src/host/ai-title-route.ts`：
  - `registerAiTitleRoute(ctx)`：settings 分节 `dsh-jx.aiTitle`（enabled/baseURL/model/apiKeyEnv/refreshIntervalMin）+ 路由 `/api/dsh-jx/ai-title`（webServer prefix 注册）。
  - 契约：200 `{ title, refreshIntervalMs }` / 200 `{ enabled: false, refreshIntervalMs }`（未配置）/ 200 `{ error }`（LLM 失败，静默降级）；非 POST 405、非法 body 400。
  - API key 经 `ctx.credentials.resolve(credentialRef(apiKeyEnv))` 每操作解析（引用/值分离、换 key 零重启）；`ctx.webServer` + `settings` + `credentials` 注入根 host。
- 测试：库 `dynamic-title.test.ts` 24 项 + host `tests/host/ai-title-route.test.ts` 8 项全绿（真实 HTTP seam + mock fetch，断言 URL 归一化/Bearer key/降级路径）。

## 评论

- 来源：PRD 16 D1/D2 + ADR-0030。否决走 LLM adapter（调用链路重/无单发入口/路由冲突）。
