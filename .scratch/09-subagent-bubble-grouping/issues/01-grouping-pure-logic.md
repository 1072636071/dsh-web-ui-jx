# 归组纯函数与投影扩展

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 开发者获得经过完整单元测试的会话归组引擎（ADR-0018 D8）：输入会话列表投影（在既有投影上新增 parentId / origin 两个字段）+ 当前会话 + 数量上限，输出顶层分组序列——每个顶层组携带根祖先、组内成员序列、徽标计数（后代总数、运行中数）、moreCount、isCurrent 及其向上传播、containsCurrent 标记。纯逻辑层，UI 零变化，可独立以测试套件验证。

**验收标准：**

- [x] 新增纯函数落实 ADR-0018 全部判定：根祖先上溯（停在第一个非 subagent 来源的祖先）、fork 截断传播、孤儿回退（父行缺失 / 父链成环时停留节点为根，subagent 孤儿自成顶层）、组入选条件（根自身或任一后代 running/completed）
- [x] 徽标数据正确：后代总数 N 只计通过范围过滤的后代；运行中数随状态实时
- [x] current 传播：current 为后代时根祖先 isCurrent 为真且 containsCurrent 标记为真；current 为根本身 / 无 current / 不相关时不误传
- [x] 上限只管顶层：moreCount = 顶层组数 − 上限，展开语义不受影响
- [x] 排序稳定：顶层按根在宿主列表中的首次出现位次，组内按原序，不做时间戳重排
- [x] 平铺回归护栏：无谱系字段的输入下输出与既有过滤函数逐条目等价
- [x] vitest 覆盖 PRD「测试决策」全部 8 组用例，全绿；npm run build 通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 队长裁定已落实：豁免改组级聚合（2026-08-23 重开核验）。ADR-0020 折叠豁免的分组组合语义 = 组级聚合：`group.pending` = 根自身**或任一入选成员** `pendingInteraction !== undefined`；溢出且 pending 的组按原相对顺序追加到可见组尾部、不计 moreCount——折叠区里的子代理审批请求不再因「只看根」整组进「+N」（DESIGN.md §4「永驻可见」语义要求组级传播）。实现位于 `buildBubbleGroups()` 尾部：聚合判定（root || members.some(pending)）→ `promoted = overflow.filter(g => g.pending)`。三项补测试齐备：①成员 pending 触发整组豁免（提升位次 + moreCount 不计）；②仅根本身 pending 行为不回归；③无任何 pending 时无豁免介入、溢出照常折叠。门禁复验全绿：vitest 278/278 + `npm run typecheck` 无错 + `npm run build` 双半区通过。

- 回执（2026-08-23）：已实施——`src/client/state-machine/session-bubbles.ts` 新增 `buildBubbleGroups()` 纯函数 + `SessionListEntry` 扩展 `parentId?`/`origin?: string` 两字段（string 解耦 SDK，与简报规格一致）；`tests/client/session-bubbles.test.ts` 追加 PRD 测试决策全部 8 组 + 平铺回归护栏共 39 个用例。验收：vitest 277/277 全绿、`npm run typecheck` 无错、`npm run build` 双半区通过。状态由 ready-for-agent 补记为 resolved。
  - **输出契约**：`{ groups, moreCount }`；`BubbleGroup = { rootId, root, members, badge: {total, running}, containsCurrent, pending }`。
  - **【队长裁定 #5 记录】ADR-0020 折叠豁免的分组组合语义**：组级 pending = 根**或任一入选成员** `pendingInteraction !== undefined`（聚合判定）；pending 组豁免顶层折叠——落在截断线之外的 pending 组按原相对顺序追加到可见组尾部、不计入 moreCount（对齐既有条目级豁免逻辑）。已实现并以 3 个专项用例覆盖（根本身 pending 提升 / 成员 pending 聚合提升 / 截断线内原位不动）。
  - **isCurrent 语义（按简报规格 #2）**：root 条目携带自身 isCurrent = rootId === current（纯自身命中，不烘焙传播）；current 落在后代时由 containsCurrent 表达——组件金描边按 `root.isCurrent || containsCurrent` 组合，强制展开按 `containsCurrent` 判定（D6）。工单 02 渲染层请按此消费。
  - 实现边界备忘：①退化输入（父链成环且环上无节点自锚，如两节点互环）有安全网提升停留节点为孤儿顶层根，保证条目不丢失，真实宿主数据为森林不可达；②`selectBubbleEntries` 原样保留（并存窗口）；③组件投影 `deriveItems` 尚未透传 parentId/origin——工单 02 需补这两字段。
  - 环境备注：node_modules 原缺 `jsdom`（devDependencies 已声明），`client-apply-reentrant.test.ts` 因此无法启动（先于本工单存在）；经 `npm install` 恢复，package.json / package-lock.json 零改动。

- 与既有过滤导出并存（先扩展）；旧导出的收缩在工单 02 渲染切换后执行。
- 决策依据：PRD `.scratch/09-subagent-bubble-grouping/PRD.md` 实现决策 1/2/7/8、测试决策；ADR-0018 D2/D3/D6/D7/D8。
