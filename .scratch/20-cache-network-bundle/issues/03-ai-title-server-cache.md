# ai-title 服务端缓存与去重

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 服务端不重复调 LLM——按 `sessionId + updatedAt` 加短 TTL 缓存 + in-flight 去重，同一内容只生成一次标题；未配置 / LLM 失败路径行为不变。

**验收标准：**

- [x] `ai-title-route` 增加按 `sessionId + updatedAt` 的短 TTL 缓存 + in-flight 去重
- [x] `ai-title-route.test.ts` 补服务端缓存命中 / 去重用例
- [x] 未配置 / LLM 失败降级路径与现状一致
- [x] 全量测试 + build + verify 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 实施（2026-08-30，工单 20-03，M3）：`src/host/ai-title-route.ts` 读取 body 的 `sessionId`/`updatedAt`，按 `${sessionId}::${updatedAt}` 加短 TTL 缓存（60s）+ in-flight 去重（复用 `src/host/ttl-inflight-cache.ts`，条目上限 512）；命中直接回缓存标题、同 key 并发共享一次 LLM 调用；未配置 / 凭据缺失 / LLM 失败路径全部不变（失败不缓存）；`clearAiTitleCache()` 清理入口接入路由 disposer（ADR-0017）；`cacheKey` 判空与生成路径合并为单一「计算或共享」分支。测试：同 key 连续请求单次 LLM、updatedAt 变则重生成、in-flight 并发共享、失败不缓存（重试仍真实调用）、缺 sessionId/updatedAt 回落每次调用路径。ai-title-route.test.ts 13 项全绿；全量 596 项 + build + verify 22 项全绿；code-review 一轮修复后重审通过。
- 来源：PRD 20 候选 M4（服务端部分）；证据见 memorial 017 archived `index.html`（ai-title-route.ts:156 llmClient.chat 前无缓存判定；:132 每次 scope.get()）。
- 与 20-04 独立，可同迭代。
