# inspect 短 TTL 缓存 + in-flight 去重

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 悬浮预览高频打开同一会话时不重复全量读日志——`session-messages` 按 `sessionId` 加短 TTL 缓存 + in-flight Promise 去重；缓存随 archived / retention 变更联动失效，不退回已排除/已归档会话的陈旧数据。

**验收标准：**

- [x] `session-messages` 按 `sessionId` 短 TTL 缓存 + in-flight 去重落地
- [x] 缓存随 archived / retention 变更失效（ADR-0028 记账语义护栏）
- [x] 相关测试补缓存命中 / 失效 / in-flight 合并
- [x] 全量测试 + build + verify 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 实施（2026-08-30，工单 20-02，M3）：`src/host/session-messages.ts` 按 `sessionId` 加短 TTL 缓存（1s）+ in-flight 去重；缓存命中直接回 `{title,prompts}`、并发同会话共享一次 `inspect`；`inspect` 抛错（归档/移除后不可读）即丢弃该会话缓存、后续一律 404，不退回陈旧数据；`clearSessionMessagesCache()` 清理入口接入路由 disposer（ADR-0017）。缓存复用共享抽象 `src/host/ttl-inflight-cache.ts`（短 TTL + in-flight 去重 + LRU 上限，条目上限 256），host 缓存有界不单调膨胀。**偏差记录**：host 半区注入面无归档/retention 订阅 seam（归档权威在 client `workspaces`，ADR-0028），故「随 archived/retention 失效」落地为两层自足护栏——短 TTL（1s）把归档后陈旧窗口压到接近失效 + inspect 不可读即弃缓存不返回陈旧数据，不新增 host 服务契约。测试：缓存命中单次 inspect、TTL 过期重读、in-flight 并发合并、归档不可读丢弃缓存后 404、按 sessionId 隔离。session-messages-route.test.ts 13 项全绿；全量 596 项 + build + verify 22 项全绿；code-review 一轮修复后重审通过。
- 来源：PRD 20 候选 M3；证据见 memorial 017 archived `index.html`（session-messages.ts:274 直接 inspect，全文件无 cache/inflight）。
- 触及 ADR-0028：缓存必须与 archived/retention 联动失效。
