# 工单 04 — AI 动态标题 UI + 触发重刷

**Status:** resolved

**Blocked by:** 16-02, 16-03

**构建内容：** 详情窗 AI 动态标题可见——悬停时按需生成（事件失效 + 缓存 + 节流），会话有更新自动失效、下次悬停重刷，未配置 API 时整行隐藏；动态标题以副题样式呈现并前置朱砂章点缀。用户配置 API 后即可在 hover 详情窗看到 AI 一句话动态。

**验收标准：**

- [x] 悬停详情窗时动态标题生成/复用（脏/TTL 判定 + 可配节流间隔），平时不轮询
- [x] 会话有更新（列表 updatedAt/消息变化）使缓存失效、下次悬停重刷
- [x] 未配置 API 时动态标题行整体隐藏（无占位无报错）
- [x] 动态标题以书眉副题样式呈现，前置朱砂章点缀（克制使用）
- [x] 刷新判定纯逻辑单测（脏/TTL 触发、节流抑制、未配置短路）通过

## 答案

2026-08-27 完成。

- 刷新判定纯逻辑（库 `dynamic-title.ts`）：`decideTitleRefresh` —— 未配 API（configured=false）+ 会话未更新 → `skip`（短路隐藏，行级不渲染）；会话变脏允许重探测；TTL 窗口内 `reuse` 缓存；`minIntervalMs` 节流抑制（有缓存复用、无缓存保守跳过）。`createDynamicTitleStore` 每会话记账（state/title/lastAttemptAt/lastUpdatedAt），传输失败不覆盖状态仅推进节流游标，学习 host 返回的重刷频率作 TTL。
- UI（`SessionBubbleDetail`）：副题行 `configured` 显示（朱砂章 + 11px 淡墨副题，40 字护栏），`unconfigured`/无 transport/失败整行隐藏；预览 settle 后再生成（拿 lastUserText 上下文）。
- 客户端接线（`src/client/index.ts`）：`createPreviewCache(createDshPreviewTransport(connection.api))` + `createDynamicTitleStore(createDshDynamicTitleTransport())`，经 CharacterOverlay → SessionBubbleList；connection 缺失时缺省（详情窗仅标题）。
- 测试：`dynamic-title.test.ts` 刷新判定 8 项 + store 6 项全绿（脏/TTL/节流/未配置短路/传输失败回退）。

## 评论

- 来源：PRD 16 D2/D3 + memorial 015 D2（触发重刷 = d+a 组合）。
