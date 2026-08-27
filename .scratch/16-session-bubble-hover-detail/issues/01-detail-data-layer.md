# 工单 01 — 详情窗数据层（预览提取 + 缓存 + transport）

**Status:** resolved

**Blocked by:** 15-04（组件与样式迁移入库，库 v1 完整）

**构建内容：** 详情窗数据层就绪——库可拉取任意会话的最后用户/助手消息（`session.history` 尾页，纯读取不启动 Agent），带缓存/失效/in-flight 去重，全部纯逻辑可单测。用户视角暂无 UI，但库的预览 API 可用。

**验收标准：**

- [x] 库导出预览提取纯函数：尾页事件序列 → 最后用户消息/最后模型消息；空日志、纯工具尾、in-flight partial 回退正确
- [x] 缓存策略（TTL 15s / 会话 updatedAt 失效 / in-flight 去重）单测通过
- [x] 数据 transport 接口定义 + DSH 默认实现（经 connection.api 调 history RPC）接线
- [x] 单测覆盖外部行为，不测 DOM/网络时序

## 答案

2026-08-27 完成。

- `packages/dsh-session-bubble/src/detail/detail-data.ts`：`extractPreview`（预览提取纯函数）/ `PreviewTransport` 接口 / `createDshPreviewTransport`（DSH 默认，经 `connection.api.sessions.history` 尾页）/ `createPreviewCache`（TTL 15s + updatedAt 失效 + in-flight 去重）。
- 修复：移除 `resultOf` 运行时导入（`@deepseek-ai/dsh-client-connection/client` 引用 `window`，node 测试环境不可导入）→ 内联 `response.result` 解包；库只保留 `import type`，运行时零 DOM 依赖。`session-list-adapter` 补投影 `updatedAt`（16-04 缓存失效判据）。
- 库 `index.ts` 导出 detail 模块；`package.json` 补 peerDependencies（`@deepseek-ai/dsh-client-connection` / `dsh-client-runtime` / `dsh-session`）。
- 测试：`detail-data.test.ts` 全绿（node 环境）。

## 评论

- 来源：PRD 16 D3/D4/D7（数据获取/范围库化）+ ADR-0030。
- Seam：复用气泡库纯逻辑层，新 seam 数 = 0。
