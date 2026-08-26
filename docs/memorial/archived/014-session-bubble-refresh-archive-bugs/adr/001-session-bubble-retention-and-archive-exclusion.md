# ADR-001（草案，同步全局时编号 0028）— 会话气泡跨刷新留存与归档排除修正

**状态:** 已接受（2026-08-26，memorial 014 grill 定案）
**关联:** ADR-0022（保留模式）、ADR-0026（手柄改型）、ADR-0018（归组模型）

## 背景

两个用户可见缺陷：

1. **刷新后已完成气泡消失。** 两层根因：
   - SDK `completed` 位是**连接内活事实**——runtime `syncCompletedNotifications()`
     以本页面加载内的 running→idle 边沿武装提醒，官方注释明示「加载时已空闲的
     会话得不到提醒」；刷新即全部归零，SDK 不再上报历史完成态。
   - 插件 prune 副作用的守卫只判 `rawState === undefined`，而 `sessions.list`
     store 初始快照是「已定义但为空」（`ids: [], phase: "pending"`）→ 挂载首帧
     即以空列表执行 `pruneKept/pruneDismissed(new Set())`，把 localStorage
     记账全量清空写盘。
2. **已归档会话气泡残留。** 两个结构洞：
   - 归组入选条件 = 根通过 || 任一成员通过；根被归档后只要任一 subagent 成员
     在列，整组照常渲染，归档的根继续当锚点。
   - `keepEnabled=false` 时投影短路返回 `running || completed`，archived 排除
     整体失效。

## 决策

1. **客户端持久「完成见闻集」（seen）。** SDK 不保证跨连接的完成态事实，
   跨刷新留存必须客户端自己记账：观察 `completed === true` 即写入
   localStorage 集合（键 `jx-bubble-keep-seen`，复用 makeIdSetStore 工厂），
   投影范围扩展为 `running || completed || kept || seen`。dismissed/archived
   隐藏优先于 seen 入选；既有「新一轮 completed 上升沿清除 dismissed」不变；
   seen 仅在总开关①开时参与投影。
2. **prune 门控 phase。** 三集合裁剪统一改为快照 `phase === "ready"` 才执行；
   pending 期一律跳过，根治挂载首帧误清（含 dismissed 记忆丢失这一未报告
   同根因缺陷）。
3. **根归档 ⇒ 整组隐藏。** 归档工作流入口 = 整条工作流办结：根被归档且组内
   无 running/pending 豁免成员 ⇒ 整组从气泡列消失（SDK 会话行不动）；有豁免
   成员 ⇒ 组暂留（活动信号优先），静止后自动消失。
4. **归档排除脱离总开关①。** 无论保留模式开关与否，archived 会话一律隐藏
   ——宿主级事实不被客户端显示开关否决。回归护栏语义由「开关关 = 与历史
   现状逐条目全等」改写为「除归档排除外逐条目全等」。

## 后果

- 完成气泡不再随刷新蒸发，「哪些任务没处理」提醒跨刷新持久（memorial 010
  原始痛点闭环）；退场路径 = 手柄收起（可逆）/ 宿主归档（不可逆）。
- 新增一个持久集合及其裁剪纪律；localStorage 键空间 +1。
- 「开关关 = 完全现状」护栏语义收窄，相关测试需同步改写。

## 否决替代

- 只修 prune 守卫——救不回未点过的完成气泡（SDK 主因不动）。
- 向宿主/SDK 提需求持久化 completed 位——跨仓库、周期长，且宿主绿点语义
  本就是瞬态提醒。
- 成员重锚为孤儿顶层泡——视觉突变、实现复杂、与「归档=清理」心智相悖。
- 归档根灰显标记——不满足「不存在」诉求。
- 归档排除维持开关门控——换一套开关组合即可复现 bug 2。
