# 工单 06 — LLM 客户端适配器抽离

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** OpenAI 兼容 LLM 调用（`callLlm` / `resolveChatCompletionsUrl` / `extractContent`）从 ai-title 路由 handler 抽出为可注入 `LlmClient`（默认 `createOpenAiClient`），解析 / 超时 / URL 归一化独立可测；路由降级可注入假客户端验证（不碰 fetch）。遵循 ADR-0030 D5（不走宿主 llm adapter 注册体系）。无用户可见行为变化。

**验收标准：**

- [ ] 新增 `src/host/llm-client.ts`：`LlmClient` 接口（`chat`）+ `createOpenAiClient({ fetchImpl?, timeoutMs? })`（默认 globalThis.fetch + 10s 超时）
- [ ] `ai-title-route.ts` 改为 `deps.llmClient ?? createOpenAiClient()`；handler 只做 body 解析 / 配置 / 凭据判定 / 响应编排
- [ ] 既有 `tests/host/ai-title-route.test.ts` HTTP seam 测试零改动全绿（默认实现走 globalThis.fetch，stub 仍生效）
- [ ] 新增 `tests/host/llm-client.test.ts`（注入 mock fetch）：URL 归一化（无后缀追加 / 已带后缀原样）、`Authorization: Bearer` 头、非 2xx → undefined、choices 缺失 → undefined、content 去空白 + 60 字护栏、超时中止

## 评论

- 来源：架构优化方案 `docs/architecture-optimization-plan.md` S6（2026-08-28）。
- 不违反 ADR-0030 D5：本地 OpenAI 兼容客户端是既有直连形态的具象，非宿主模型体系。
