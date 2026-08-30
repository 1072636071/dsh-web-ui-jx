# ADR-0032 — 气泡内容弹框：固定几何 + 三列问答案对照

状态：已接受（待实施）
日期：2026-08-30
关联：ADR-0031（气泡内容弹框现状）、ADR-0028（host 无副作用读问话）

## 背景

气泡 hover 内容弹框（ADR-0031）现状：竖排三段（标题 / 问话胶囊行 / 选中问话详情），宽固定 `POPUP_WIDTH_PX=280`，高为 `maxHeight=260`。两个问题：

1. **高度抖动**：`maxHeight` 使盒子随内容伸缩，切换不同问话（长短不一）时高度反复变化 → 视觉抖动。
2. **只见问不见答**：弹框仅展示用户问话（host 路由 `collectUserMessages` 过滤 `type==='user/message'`），看不到 LLM 对每条问话的回复。

## 决策

### 1. 固定几何（根治抖动）

`maxHeight` → 固定 `height`。新增常量 `POPUP_HEIGHT_PX=320` 替换 `POPUP_MAX_HEIGHT_PX`，经组件 inline style 注入 `height`（非 `max-height`）。宽度 `POPUP_WIDTH_PX=560`。定位纯函数 `computePopupPlacement` 按固定 height 钳制。内容不足时留白，超出各列 `overflow-y:auto` 列内滚动——尺寸恒定，切换不再抖动。

### 2. 三列布局，选中态统一驱动

弹框体改三列横排（外框固定 560×320，`box-sizing: border-box`，扣 padding/gap 后内容框约 518px）：
- **左列（固定 160px）**：顶部会话标题，下方为**竖排可滚动单行摘要列表**——每行一条问话摘要（单行省略号），替代原横排 wrap 胶囊 + 「+N/收起」折叠 chip（竖排滚动天然替代折叠）。
- **中列 / 右列（各 `minmax(0,1fr)`，等分左列之外的剩余宽度 ≈179px）**：中列 = 选中问话的完整原文，右列 = 该问话配对的 LLM 回复全文。（原设计的 200/200 是 560 三等分的粗略值；计入 padding/gap/边框后中右两列取等分剩余，视觉比例不变。）

左列选中态（hover 切换、latch 保持、默认最后一条 = 最新一轮）统一驱动中、右两列。金描边选中样式为 `.summaryActive`（与气泡列 `.current` 同轨）；点击行仍走原 `onOpenSession` 跳转。

### 3. 数据契约扩展：逐问配对回复

host 响应由 `{title, prompts:[{seq,text}]}` 扩展为 `{title, prompts:[{seq,text,reply}]}`，`reply: string | null`。

**配对规则**：第 N 条问话的 `reply` = 该 `user/message` 事件之后、下一条**真人**问话（`user/message` 且 `data.source.kind==='user'`）之前，最后一条**非空文本** `assistant/message` 的 `text` 拼接；无则 `null`。

关键 schema 事实（宿主 `packages/core/session/src/types.ts`）：
- `assistant/message` 文本在 `data.message.content[]`（`block.type==='text'`），**与 `user/message` 的 `data.content` 不对称**。
- 跳过 tool-call 前言（含 `tool-call` 块的中间 assistant 消息）、`content.length===0` 的空消息、注入型 `user/message`（`source.kind!=='user'`）。
- `seq` 全局单调，扫描配对成立。

client 侧 `PromptLike` / `SessionPreviewData` / `parsePreviewResponse` 相应加 `reply`（防御：缺省/非法回落 null，旧响应无 reply 字段仍可用）。

## 被否决的替代方案

1. **仅返回会话全局最后一条回复**（复用 host `finalAssistantOutput`）——改动最小，但翻历史问话时右列答案与选中问题对不上号，问答割裂。否决。
2. **回复堆叠在中列下方（两列布局）**——省一列宽度，但长问答挤在同一列双向滚动易迷失；三列对照阅读性更好。
3. **保留 maxHeight 靠 JS 记忆上次高度**——治标，首帧与不同会话间仍跳。否决。
4. **纳入子智能体（subagent）回复**——子智能体输出在独立子会话，父 `inspect().events` 仅通过 subagent 工具的 `tool/result` 体现，非 `assistant/message`。本次不覆盖，属已知边界。

## 影响

- host：`collectUserMessages` → 新配对 fold（或 `collectConversation`）+ 路由响应加 `reply`；对应 host 单测。
- client：`SessionBubblePopup` DOM 三列化、CSS module 重写几何与列样式、`session-bubble-preview.ts` 常量与类型、`foldCapsules/capsuleLayout` 折叠路径退场（保留纯函数或删除需评估测试）。
- 视口：更宽（560）更常触发左/右翻转与钳制，现有 `computePopupPlacement` 已覆盖。
- 主题/reduced-motion/portal 挂载/data-jx-interactive 约定不变。
