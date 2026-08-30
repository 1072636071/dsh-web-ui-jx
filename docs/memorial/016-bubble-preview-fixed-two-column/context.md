# Memorial 016 — 气泡浮动弹窗框：固定尺寸 + 三列（问答案对照）布局

状态：已完成
创建：2026-08-30
回写：ADR-0032 已同步 `docs/adr/0032-*.md`（已接受·待实施）；CONTEXT.md 已更新「气泡内容弹框」并新增「问话摘要行」「问答案配对」术语。
关联：ADR-0031 / memorial 014-bubble-hover-preview-last-message（气泡内容弹框现状）

## 诉求（用户原话）

> 气泡的浮动弹窗框，固定高度和宽度，因为高度不固定，会抖动。然后分为两列
> 左边一列是标题，和会话简略，右边一列是用户会话的详情。

拆解：
1. 弹框固定高度 + 固定宽度（现状只有宽度固定 POPUP_WIDTH_PX=280，高度是 maxHeight=260 → 随内容伸缩 → 抖动）。
2. 改为两列布局：
   - 左列：标题 + 会话简略
   - 右列：用户会话的详情

## 追问记录

- [2026-08-30] **Q1 — 左列「会话简略」指什么？** → 用户选方案1：左列 = 标题 + 问话摘要竖排列表；右列 = 选中问话的完整详情。即把现有「胶囊行 + 详情区」从上下改左右，语义/逻辑层复用。
- [2026-08-30] **新需求（用户追加）** — 想看到会话里 LLM 最后/最新的回复。
  - 事实核查（src/host/session-messages.ts）：`collectUserMessages` 仅入选 `type==='user/message'` 且 `source.kind==='user'` 的直接问话，响应 `{title, prompts}` **不含 assistant 回复**。要看回复须扩 host 数据层（提取 assistant 事件），属新增能力。

- [2026-08-30] **Q3 — 三列内容与联动？** → 方案1：左=标题+问话摘要列表 / 中=选中问话全文 / 右=该问话对应 LLM 回复；左列选中态统一驱动中、右两列。（Q2 亦按「严格配对」收敛）
- [2026-08-30] **调查结果（宿主事件 schema，自查 E:/work/sp/deepseek-harness）**：
  - 回复事件 `type==='assistant/message'`，`data={turn,step,message,usage?,interrupted?}`，文本在 `data.message.content[]` 中 `type==='text'` 块（`source.kind==='model'`）。
  - 与问话**不对称**：`user/message` 文本在 `data.content`；`assistant/message` 文本在 `data.message.content`。
  - 配对规则：第 N 问的回复 = 其后、下一条真人问话（`user/message` 且 `source.kind==='user'`）前，最后一条非空文本 `assistant/message`（跳过 tool-call 前言/空 content/注入 context）。`seq` 全局单调可扫描。
  - host `finalAssistantOutput`（subagent 包）只给会话全局最后回复，per-turn 需自写 fold。
- [2026-08-30] **Q4 — 固定尺寸 + 列宽？** → 方案1：560×320，左:中:右=160:200:200；用户附言「其他你也自己决策」。

## 决策汇总

- D1 布局方向：弹框由竖排三段改为**三列**——左列标题+问话摘要列表，中列选中问话全文，右列对应 LLM 回复。
- D2 三列联动：左列选中态（hover/latch，默认最后一条）统一驱动中列问题全文与右列配对回复。
- D3 数据契约扩展：host 响应 prompts 每条 `{seq, text, reply}`；`reply` = 该问话配对的最后一条非空 assistant 文本（无则 null）。
- D4 固定几何（Q4 方案1）：`POPUP_WIDTH_PX=560`、新增 `POPUP_HEIGHT_PX=320`（替换 `POPUP_MAX_HEIGHT_PX`，作固定 height）；三列：左列固定 160px、中/右列 `minmax(0,1fr)` 等分剩余（160/200/200 为 560 三等分粗略意图，计入 padding/gap/边框后中右取等分 ≈179）。抖动根治 = `maxHeight`→固定 `height`，内容不足留白、列内 `overflow-y:auto` 滚动。定位纯函数按固定 height 钳制。
- D5 左列形态（自主决策）：横排 wrap 胶囊 + 「+N/收起」折叠 → **竖排可滚动单行摘要列表**（每行一条，单行省略号）。竖排滚动天然替代 +N 折叠，移除折叠 chip。选中态金描边沿用 `capsuleActive`；hover/click 跳转/键盘 focus/latch 全保留；打开时把选中（默认最后一条）滚入可见。
- D6 边界态（自主决策）：`reply=null` → 右列占位「暂无回复」（弱化色）；问/答超长 → 各自列内滚动；加载中/失败/无问话占位横跨中右两内容列。子智能体回复属独立子会话，父 `inspect().events` 不含，本弹框不覆盖（记入 ADR 附注）。

## 待澄清

（已全部澄清）

## 实施与验证（2026-08-30）

4 工单全部 `done`，commit `da1a974`。落地：host `collectUserMessages→collectConversation`（逐问配对 `reply`，`MAX_USER_PROMPTS→MAX_TURNS`、新增 `MAX_REPLY_TEXT_CHARS`）；client 弹框固定 560×320（`maxHeight→height` 根治抖动）三列问答对照，移除 +N 折叠（`foldCapsules/capsuleLayout` 退场），词汇对齐 CONTEXT（`onSummaryHover`/`SUMMARY_MAX_CHARS`/`.summaryActive`）。

- typecheck 无新增错误（3 处为未改动文件既有基线）；全量 576 测试通过；`build`+`verify` 21/21 绿。
- 两轴代码审查（标准/spec）复审无发现项。
- 运行时验证：重启 :3080 host（detached）后真实会话 `/api/dsh-jx/session/<id>/messages` 每条 prompt 附配对 `reply`（样例 1271 字符）；浏览器 hover 见固定尺寸三列、切换不抖动、右列显示 LLM 回复——用户已确认良好。
