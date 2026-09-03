# 会话气泡详情窗预览对接新版历史 API

**Status:** done

**Blocked by:** 03

**构建内容：** 详情窗的会话预览提取仍可用——基于新版 session-history API 与类型（`SessionEventLikeEntry` / `SessionHistoryRecord`），替代旧 `HistoryEntry`/`IApiClient`。

**验收标准：**

- [ ] `api.sessions.history` 调用与新版返回形状匹配（`response.result` / 事件序列解析正确）
- [ ] 预览提取（用户/助手消息、assistant/chunk 判断）改用新版历史条目类型
- [ ] 不再从 @deepseek-ai/dsh-client-connection 导入已移除的 HistoryEntry/IApiClient
- [ ] `npm run typecheck` 与相关 detail/session 用例通过

## 评论

参考新版 dsh-api-session-controller/origination README：`SessionHistoryRecord` 含 raw `SessionWireEvent` 或 packed `ChunkRowEvent`；客户端保留为 `SessionEventLikeEntry`；`SessionControlStream` 说明 follow-history 打开/补齐/重连语义。证据：detail-data.ts 的 createDshPreviewTransport 调用点。