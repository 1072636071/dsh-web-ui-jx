# 会话列表中"未决交互"判断迁移到新版 SessionSummary

**Status:** done

**Blocked by:** 03

**构建内容：** 会话气泡列表项"是否有未决交互"的呈现仍正确——改用新版 `SessionSummary` 中表达 pending 语义的字段。

**验收标准：**

- [ ] 消除对 `SessionSummary.pendingInteraction`（新版不存在）的引用
- [ ] 改用新版 `SessionSummary` 的 pending 相关字段/组合，语义与旧行为一致
- [ ] 列表项派生的 pending 透传逻辑保持
- [ ] `npm run typecheck` 与 session-list-adapter 用例通过

## 评论

新版 `pendingInteraction` 属 `ComposerChainProps`（会话等待用户的业务交互）；`SessionSummary` 有 `pending`（模型选择）等字段，需确认语义最接近者并做映射。证据：session-list-adapter.ts L94。