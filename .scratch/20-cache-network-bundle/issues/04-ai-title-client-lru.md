# ai-title 客户端 LRU + 按 entry TTL

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 客户端缓存有界、TTL 不再被最后一次响应全局覆写；并发悬浮同一会话不重复发请求。

**验收标准：**

- [x] `dynamic-title` 缓存加 LRU 上限（无界 Map 加淘汰）
- [x] `ttlMs` 改为按 entry 存储（消除闭包级全局覆写）
- [x] 补 in-flight Promise 去重
- [x] `dynamic-title.test.ts` 扩展 LRU / 按 entry TTL 用例；全量测试全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 实施（2026-08-30，工单 20-04，M3）：`dynamic-title.ts` 的 `createDynamicTitleStore` 新增 `maxEntries`（LRU 淘汰，默认 50，Map 首个键即最久未用；reuse/skip 触达时移到末尾避免误淘汰）；去掉闭包级全局 `ttlMs` 覆写，改为 `entryTtlMs(entry)` 按 entry 的 `refreshIntervalMs` 作 TTL（无条目回落 `defaultTtlMs`）；补按 `${sessionId}::${updatedAt}` 的 in-flight Promise 去重。测试：LRU 有界淘汰最久未用、LRU 按最近使用淘汰（reuse 触达不优先淘汰）、按 entry TTL 各会话独立不全局覆写、in-flight 并发共享单次 transport。dynamic-title.test.ts 28 项全绿；全量 596 项 + build + verify 22 项全绿。
- 来源：PRD 20 候选 M4（客户端部分）；证据见 memorial 017 archived `index.html`（dynamic-title.ts:333 无界 Map；:402 ttlMs 全局覆写；:336-411 无 in-flight 去重）。
- 既有 TTL 15min + 节流 30s 已存在，本次只补「有界」与「按 entry」。
