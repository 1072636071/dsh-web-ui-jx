# 会话气泡两缺陷：刷新后已完成气泡消失 · 已归档会话气泡残留

**状态:** 已完成（grill 决策完结；实施待启动）

## 诉求（用户原话）
> 发现两个问题：
> 已经完成的会话气泡，在刷新完后，就消失了，不需要点手柄。
> 还有如果一个会话已经归档了，会话气泡还存在

## 背景事实（grill 启动前自查）

### Bug 1 根因（刷新后已完成气泡消失）——两层叠加

**① SDK 层主因：`completed` 位是连接内活事实，刷新即失忆。**
`dsh-client-runtime/lib/client.js` `syncCompletedNotifications()`（~8521 行）：
- `completedNotifications` 是客户端 Set，由**本连接内** running→idle 边沿武装
  （非 selected 会话）；running 再次置真则解除；会话移除则丢弃。
- 官方注释原文："First observation only records the running bit — sessions
  already idle at load get no reminder."——刷新后首次观察只记录 running 位，
  加载时已空闲的会话**永远得不到 completed 提醒**。
- 结论：刷新后所有完成气泡的 completed 位归零（无论查看与否），SDK 不再上报。
  未点过的气泡没有 kept 记账 → 直接消失；点过的本应靠 kept 记账留存。

**② 插件层次因：挂载首帧空列表 prune 误清 localStorage 记账。**
- SDK `sessions.list` store 初始快照 = `{ids: [], byId: {}, phase: "pending"}`
  （client.js ~8909 行），直到首次成功拉取基线才转 `phase: "ready"`
  （SessionListPhase = 'pending' | 'ready'，service.d.ts:74 + manager.d.ts:14）。
- SessionBubbleList.tsx:647-653 的 prune 副作用守卫只判
  `rawState === undefined`——但该 store **永不返回 undefined**，挂载首帧即以
  空列表执行 `pruneKept(new Set())` + `pruneDismissed(new Set())`，
  把 kept/dismissed 全量记账从内存与 localStorage 一并清空（写盘不可恢复）。
- 后果链：kept 记忆丢失 → 点过的完成气泡刷后也消失；dismissed 记忆同样被清
  （已收起气泡会复活——用户未报告但同根因）。代码注释「rawState 缺省时跳过
  避免空列表误清」的防御对实际初始态完全失效。

### Bug 2 根因（已归档会话气泡残留）——两个结构洞

- **洞 A（主嫌）：归组模型的组入选条件放行已归档的根。**
  session-bubbles.ts:371 组入选 = 根通过过滤 || 任一成员通过。根会话在宿主
  侧边栏被归档后 rootPasses=false，但只要任一 subagent 成员仍 completed /
  kept / running-pending 豁免在列，整组照常渲染——已归档的根气泡继续作为
  锚点显示。多代理工作流归档根会话后必现。
- **洞 B：keepEnabled=false 时 archived 排除整体失效。**
  session-bubbles.ts:269 `if (!keepActive) return e.running || e.completed;`
  短路返回，archived/dismissed 集全部被忽略——保留模式关时归档排除不存在。
- 附带事实：running/pending 条目豁免记账隐藏是既有设计（ADR-0020 活动信号
  优先），运行中会话归档后到静止前仍显示属瞬态。

### 其他查证

- 归档入口：插件内无任何 archiveSession 调用点（ADR-0026 改型移除了归档区），
  用户是在宿主侧边栏归档的；archivedSessionIds 经 `workspace.list` 基线、
  unary 回声、`host/archived-sessions-changed` 帧三路全快照响应式更新
  （runtime README §25），排除集数据链路本身可靠。
- workspaces prop 接线完好：index.ts:164-173 从 ctx 取 sessions/workspaces
  下传 CharacterOverlay → SessionBubbleList。
- 配置模块 session-bubble-keep-config.ts 本身读写容错完备、持久化正常；
  问题不在配置层，在读到记忆之后的裁剪与投影层。

## 决策汇总
- Q1（2026-08-26 用户拍板）：**方案1——客户端持久「完成见闻集」+ prune 加
  phase 守卫**。观察 completed=true 即写入 localStorage 见闻集，投影范围扩展
  为 `running || completed || kept || seen`；prune 仅在 `phase === "ready"`
  后执行，根治挂载首帧误清。
- Q2（2026-08-26 用户拍板）：**方案1——根归档 ⇒ 整组隐藏**。归档工作流入口
  = 整条工作流办结，成员随根从气泡列消失（SDK 行不动，仅投影层隐藏）；
  组内有 running/pending 成员时活动信号优先、组暂留，全部静止后自动消失。
  否决成员重锚（视觉突变）与灰显标记（不满足「不存在」诉求）。
- Q3（2026-08-26 用户拍板）：**方案1——归档排除脱离总开关①**。无论保留模式
  开关与否，archived 会话一律从气泡列隐藏（宿主级事实不被客户端显示开关
  否决）；kept/dismissed/seen 仍随①走。回归护栏语义改写为「除归档排除外，
  开关关 = 与历史现状逐条目全等」，相关测试同步调整。

### 自主定案（2026-08-26 用户于 Q1 授权细节子项）
- D-seen1 记账时机：组件投影副作用 diff items——条目出现 `completed === true`
  即写入 seen 集（幂等）；点击路径 `addKept` 照旧不变。
- D-seen2 存储载体：复用 `makeIdSetStore` 工厂新增实例，键名
  `jx-bubble-keep-seen`；prune 与 kept/dismissed 同一纪律。
- D-seen3 门控关系：seen 仅在总开关①开时参与投影；①关 = 见闻集忽略
  （但归档排除仍生效，见 Q3）。
- D-seen4 隐藏优先级：dismissed/archived 隐藏优先于 seen 入选；既有「新一轮
  completed 上升沿清除 dismissed」逻辑不变（旧收起不吞新完成提醒）。
- D-grp1 整组隐藏判定落纯逻辑层：根被归档且组内无 running/pending 豁免成员
  ⇒ 跳过整组；有豁免成员 ⇒ 组暂留（现状渲染），全部静止后自动消失。
- D-prune1 prune 门控：三集合裁剪统一改为 `rawState !== undefined &&
  rawState.phase === "ready"` 才执行；pending 期一律跳过。

## 待澄清
（已清零——Q1/Q2/Q3 全部定案，细节子项以「自主定案 D-seen*/D-grp1/D-prune1」
落盘，无待定条目。）

## 追问记录

### 2026-08-26 10:55 Q1「已完成气泡跨刷新留存的机制载体？」— 已答：方案1
- 方案1 客户端持久「完成见闻集」+ prune 加 phase 守卫【推荐】；方案2 只修
  prune；方案3 提需求宿主/SDK。
- 用户答：「方案1」→ 定案：新增持久见闻集（观察 completed=true 即记账，
  投影范围扩展 `running || completed || kept || seen`）；prune 守卫改
  `phase === "ready"` 才裁剪。细节子项（记账时机、与①开关门控关系、dismissed
  优先级）由 captain 按既有纪律自主定案，实施时落 ADR/测试。

### 2026-08-26 11:00 Q2「归组根被归档后整组怎么处理？」— 已答：方案1
- 方案1 整组隐藏（running/pending 豁免暂留）【推荐】；方案2 成员重锚孤儿泡；
  方案3 灰显标记。
- 用户答：「方案1」→ 定案见决策汇总 Q2。
### 2026-08-26 11:05 Q3「归档排除要不要脱离总开关①？」— 已答：方案1
- 方案1 排除脱离开关（回归护栏改写）【推荐】；方案2 维持现状记为已知限制。
- 用户答：「方案1」→ 定案见决策汇总 Q3。grill 就此收尾，进入 checklist。

## 收尾 checklist（2026-08-26）
| # | 检查项 | 结果 |
|---|--------|------|
| C1 | 诉求回应 | ✅ 刷新消失 → Q1/D-seen*/D-prune1；归档残留 → Q2/Q3/D-grp1 |
| C2 | 决策完备 | ✅ 无待定条目（细节子项均已自主定案落盘） |
| C3 | 待澄清清零 | ✅ 空 |
| C4 | 调查闭环 | ✅ 无调查工单（事实全部本地自查：runtime 源码 + 契约类型 + 插件接线） |
| C5 | ADR 齐全 | ✅ adr/001 已建（四条决策满足三条件：契约反转难逆 / 未来读者惊讶——SDK completed 瞬态 vs 客户端持久、根归档藏整组、排除脱离开关 / 有真替代被否决） |

**回写状态:** 已确认并执行（2026-08-26）：
- CONTEXT.md：词汇表新增「完成见闻集」（指向 ADR-0028）；已定决策表新增
  ADR-0028 行。
- ADR 同步：`adr/001` → 全局 `docs/adr/0028-session-bubble-retention-and-archive-exclusion.md`
  （状态改记「已接受；实施待启动」）。
