# ADR-0018 — 会话气泡列子代理归组（根祖先锚定折叠）

## 状态

已接受（grill 会话定稿，待实施）。

## 背景

`/jxx-grill-with-docs` 这类多代理工作流会在一条主会话下派生大量子代理会话
（subagent sessions）。现行会话气泡列（ADR-0007）是纯平铺模型：

- 一气泡 = 一 `running || completed` 会话，无任何层级概念；
- 顺序 = 宿主列表 `ids` 原顺序，自下而上生长；
- 上限默认 5（可配 1–10），超出折叠为「+N」。

后果：并行子代理高频刷新、在宿主列表中长期霸榜，气泡列常驻满 5 个 +
「+N」；真正重要的根会话（如 grill 主会话）反而被挤进折叠区。

## 事实基础（代码查证）

宿主 SDK（`@deepseek-ai/dsh-client-runtime`）已提供全套谱系数据，插件无需
自行发明判定：

- `SessionSummary.parentId?: SessionId` + `origin?: 'subagent'`：每行自带
  直接父与来源标记（`service.d.ts`）。
- `indexSubagentDescendants(summaries)`：SDK 纯函数先例，沿「不间断
  subagent 谱系链」把后代聚合到每一层祖先名下，返回 `{count,
  runningCount}`（`subagent-lineage.d.ts`）；孤儿子会话无害地留在 map 里。
- 普通 fork **截断传播**：fork 出的会话不是子代理（`origin` 非 `'subagent'`）。
- 官方侧边栏用 `subagentsByParent` 目录 + `openSubagent(address)` 做子会话
  目录菜单（宿主生态承认并消费此谱系的先例）。
- 插件现状 `deriveItems()`（`SessionBubbleList.tsx`）只取
  `id/title/running/completed`，谱系字段完全未读。

## 决策

### D1 策略方向：归组折叠（用户选定）

子会话不再各自占气泡，并入祖先气泡 + 聚合徽标，需要时原地展开。

- 否决「直接隐藏」（`origin='subagent'` 不进气泡列）：彻底失去对子会话的
  导航入口与完成提醒，信息损失不可接受。
- 否决「缩进树」（全平铺 + depth 缩进）：只是缓解不是解决，「占满」依旧。

### D2 归组锚点：根祖先锚定（用户选定）

所有 subagent 后代折叠进其**最顶层的普通会话祖先**（沿 `parentId` 上溯到
第一个非 `'subagent'` 来源的会话）。一条 grill 主会话无论派生多少层子孙，
只占一个气泡。

- 否决「直接父锚定」：中间层各自成泡，深层派生仍多占气泡，「占满」只
  缓解一半。

### D3 上限语义：只管顶层（用户选定）

`maxVisible`（默认 5，SettingsCard 可配 1–10）继续只约束**顶层归组气泡**
数量；展开某组的子气泡列表原地插入，不占全局名额、不受 maxVisible 限制。
全局「+N」MoreBubble 折叠机制保持不变（只管顶层溢出）。

- 理由：配置项语义不变、无需迁移；总高度可控性由折叠默认态保证。

### D4 子代理徽标内容与形态（自行决策）

徽标 = 箭头 + 后代总数：收起 `▸N` / 展开 `▾N`，置于父气泡标题右侧，
`flex-shrink:0`；存在运行中后代（`runningCount > 0`）时徽标前缀金色呼吸
迷你点（复用 `.dotRunning` 视觉语义）。

- 否决「`▸M/N` 双数字」：宽度抖动、24px 单行气泡信息密度过高。
- 否决「completed 后代徽标描绿」：三色状态超出气泡承载；completed 后代
  展开后可见石绿点，不做额外强提醒。

### D5 展开交互（自行决策）

点击徽标切换该组展开/收起：`stopPropagation` 不触发跳转；挂
`data-jx-interactive` 不触发整盒拖动（复用 ADR-0006 排除机制）。子气泡
原地插在父气泡视觉上方（DOM 中位于父之后，配合 column-reverse），整体
**向左缩进 12px**（右缘对齐布局下即宽度增加方向）+ 弱化背景 + 左侧竖
连接线，树状层级一眼可辨。各组独立维护展开状态。

### D6 当前会话为后代时的表现（自行决策）

`isCurrent` **向上传播**：current 是某后代时，其根祖先气泡挂金描边；且该
组**强制展开**（`effectiveExpanded = manualExpanded || containsCurrent`），
保证当前会话在气泡列中永远可见；`containsCurrent` 消失后自动回落到手动
展开状态。约束代价：current 仍在该组后代中时手动收起无效——与侧边栏
「当前路径保持可见」惯例一致，可接受。

### D7 孤儿回退（自行决策）

沿 `parentId` 上溯中断（父行不在 `byId` 中，或检测到环）时，以停留节点为
根；若该节点本身 `origin === 'subagent'`，则它自成一个顶层归组气泡（徽标
照常统计其可达后代）。孤儿子会话不消失、不丢导航入口。

### D8 排序与实现边界（自行决策）

顶层组顺序 = 宿主 `ids` 原序中根的首次出现位次；组内子气泡顺序 = `ids`
原序过滤。纯逻辑新增 `buildBubbleGroups()`（对齐 `selectBubbleEntries`
seam 模式，与 SDK 类型解耦、vitest 全覆盖），**不复用** SDK
`indexSubagentDescendants`：它按每层祖先索引、输入为 SDK Record 形状，与
本插件轻量投影不合；仅引为先例。

### D9 动效（自行决策）

子气泡出现/消失复用现有 150ms 淡入 / 100ms 淡出 + `leavingEntries`
机制；`prefers-reduced-motion` 全关（对齐 DESIGN.md §6 与 ADR-0007 决策 7）。

## 后果

- **正面**：列高稳定——一条多代理工作流无论派生多少子孙恒占一个顶层
  气泡；子会话活动感知（金呼吸）与导航入口（展开后逐个点击跳转）全保留。
- **代价**：组件复杂度上升（分组投影 + 组内展开态 + current 传播）；
  completed 子代不再各自提醒，需展开查看；`tests/client/session-bubbles.test.ts`
  需补归组用例。
- **中性**：SettingsCard「会话气泡数量上限」配置项语义不变（即顶层归组
  气泡数），仅描述文案微调。

## 关联

- 修订 ADR-0007 的平铺模型与 DESIGN.md §4「会话气泡列」条目。
- 词汇表新增：根祖先、归组气泡、子代理徽标（见 CONTEXT.md）。
