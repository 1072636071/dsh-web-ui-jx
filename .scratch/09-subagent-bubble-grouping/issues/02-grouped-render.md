# 分组渲染上线（占满问题端到端解决）

**Status:** resolved

**Blocked by:** 01

**构建内容：** 用户可见的主价值上线：一条多代理工作流无论派生多少层子代理，气泡列只占一个气泡——「占满」问题消失。徽标 `▸N` 显示该工作流的后代总数，有运行中后代时前缀金色呼吸迷你点；当前会话（含子会话）所在组的根气泡金描边；数量上限只约束顶层气泡；普通非 subagent 会话体验与改造前完全一致。本工单徽标仅展示不可展开（展开交互在工单 03）。

**验收标准：**

- [x] 气泡列按分组结构渲染：grill 类工作流的任意多层子孙折叠进单一顶层气泡
- [x] 徽标计数与呼吸迷你点随会话开始/结束实时增减；reduced-motion 下呼吸点静态
- [x] current 在某后代中时其根气泡金描边（传播高亮，子气泡若可见各自保留高亮）
- [x] 上限只约束顶层组：溢出仍折叠「+N」，行为与改造前一致
- [x] 回归：无谱系字段场景的渲染与改造前逐项一致
- [x] 收缩完成：移除被分组渲染取代的旧平铺导出及其过时测试块，全量测试保持绿色
- [ ] 人工视觉验证：并行多代理场景下列高稳定、主会话不再被挤进折叠区
- [ ] npm run build && npm run verify 通过

## 评论

- **工单02 实施完成（ui-eng）**。落地内容：
  - `deriveItems` 透传 `parentId` / `origin`（undefined 缺省不落键）；组件切换到
    `buildBubbleGroups(items, current, maxVisible)` 分组渲染——新增内部组件
    GroupBubble 渲染顶层归组气泡（标题 + 根状态点 + 徽标），消费方折叠态 /
    展开态均走同一纯函数 seam。
  - 徽标仅展示：`.badge` 显示 `▸{badge.total}`，flex-shrink:0 + nowrap 不换行
    不挤压（挤压让位给标题侧 ellipsis），文字取 `--dsw-alias-label-dimmed`
    （与「+N」弱化气泡同轨的元数据语言）；`badge.running > 0` 时前缀
    `.badgeRunningDot` 金色呼吸迷你点——复用既有 `@keyframes dot-breathe`
    （同周期同缓动，全列呼吸节奏一致），reduced-motion 下静态金点。
  - 【队长裁定落实】containsCurrent ⇒ 根气泡金描边，按
    `root.isCurrent || containsCurrent` 组合判定（D6 组合式表达）；
    `group.pending` ⇒ 根气泡挂 `.pending` 朱砂描边且 aria-label 追加
    「等待确认」；状态点始终表示根会话自身状态（`.dotPending` 涟漪点仅当
    根本身等待交互）——描边传播紧急信号、点位保持自身语义。
  - MoreBubble「+N/收起」机制不变（只管顶层组溢出，pending 组豁免由纯逻辑层
    组级聚合承载）；退出跟踪改为组粒度 `leavingGroups`（键 rootId，
    BUBBLE_EXIT_MS 100ms 淡出不变）。
  - 收缩步：删除生产导出 `selectBubbleEntries` 与 `SelectBubbleEntriesResult`；
    测试文件 7 个直测 describe 块随之移除。平铺回归护栏保留——测试文件内联
    oracle `legacyFlatSelect`（原实现原样副本，仅测试域）作改造前行为基准，
    「平铺回归护栏」3 个用例继续逐条目比对（护栏方向敏感注释已写明）。
  - 无谱系字段回归：单例组渲染路径与改造前逐项一致（点/标题/金描边/pending/
    折叠/aria 全部保持；徽标 total=0 不渲染）。子会话数并入气泡 aria-label
    （「含 N 个子会话」），徽标本体 aria-hidden。
  - 门禁：npx vitest run 全绿（12 文件 247 用例）、npm run typecheck 零错误、
    npm run build 双半区产物成功（woff2 构建期未解析属预期警告）。
- 待办遗留：「人工视觉验证」待人工视觉验证（需真实宿主并行多代理场景）；
  「npm run build && npm run verify」中 build 已过，verify 按队长裁定由工单04
  统一收尾执行。
- 给后续工单的提示：①ADR-0020 文档第 35 行仍引用已删除的 `selectBubbleEntries`
  （「折叠豁免在 selectBubbleEntries 中…」），语义现由 `buildBubbleGroups`
  组级聚合承载——按约束我未动 docs，措辞漂移交工单04核对修正；②成员条目
  isCurrent 标记已在纯逻辑层就绪（工单01测试覆盖「各自保留高亮」数据面），
  工单03 渲染子气泡时直接消费。
- 本工单是扩展-收缩循环的收缩步：依赖工单 01 的并存窗口，切换消费方后删除旧形式。
- 决策依据：PRD 实现决策 1/3/6/7；ADR-0018 D1/D4/D6。
