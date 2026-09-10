# 预览提取适配 assistant-stream 事件重构

**Status:** done

**Blocked by:** 01

**构建内容：** 作为 GUI 用户，我希望详情窗仍能正确判断「模型正在生成（in-flight）」并提取最后一条用户/助手文本——旧 `assistant/chunk` 事件与紧凑 `'chunks'` 条目已被上游移除，增量信号改由 `transient`（`AssistantLiveChunkEvent`）承载，落盘尝试改为 `assistant/attempt`。

**验收标准：**

- [x] in-flight 判定改为「序列中存在 `transient` 条目 / `assistant/live-chunk`」，不再依赖已删除的 `assistant/chunk` 与 `'chunks'` 判别式
- [x] 遍历事件前先按 `entry.type === 'event'` 收窄，消除把 `SessionEvent | AssistantLiveChunkEvent` 传入 `textFromEvent` / `isSurfaceEligibleType` 的类型错误
- [x] 详情数据用例里构造的 `SessionEventLikeEntry` mock 按新判别式（`'event' | 'transient'`）重写；相关 detail 测试通过
- [x] 预览语义不回归：`user/message` 更新 lastUserText、`assistant/message` 更新 lastAssistantText、`tool/result` 忽略、空日志/非 surface 尾页返回空文本且非 in-flight

## 评论

**实现记录（本轮）**：改动 `packages/dsh-session-bubble/src/detail/detail-data.ts` —— 删除基于 `assistant/chunk` 的 `isAssistantChunkEvent`，`extractPreview` 循环先 `entry.type==='transient'` 置位并 continue，其后 `entry.event` 自然收窄为持久 `SessionEvent`；局部 `hasChunk`→`hasLiveChunk`。同步 `__tests__/detail-data.test.ts`：`assistantChunk`（旧 `event`/`assistant/chunk`）改为 `assistantLiveChunk`（`transient`/`assistant/live-chunk`），in-flight 用例随之更名。验证：detail 9 用例全过，`npm run typecheck` 由 7 错降到 3（剩余 3 条为 transport 的 `open`/`dispose`，属工单 03）。

原始报错：`event.type === "assistant/chunk"` 与 `entry.type === "chunks"` 两处「类型无交集」；两处把宽化的 `entry.event` 传给窄形参。
