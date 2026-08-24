# ADR-0022 — 会话气泡单击保留 + 拖拽收纳双投放区（收起 / 归档）

## 状态

已接受（grill 会话 2026-02-14 定案，待实施）。

## 背景

ADR-0007 会话气泡列的点击契约是「点击即跳转」，而气泡可见性由 SDK 的
`SessionSummary.completed` 位（"Finished while not selected and not yet opened"）
驱动——会话一旦被打开，SDK 即清除该位，气泡随之消失。

实际使用暴露的痛点：用户看到任务完成 → 点过去看一眼 → 但并未继续处理该
任务 → 气泡已经消失 → 事后忘记哪些会话还需要处理。即「查看」与「办结」
被 SDK 强制绑定为同一动作，缺少「看过但未办结」的中间态。

同时用户希望把办结的会话从侧边栏收纳掉。查证：

- `IWorkspaces.archiveSession(sessionId)` 原生支持归档（registry-global 集，
  从所有分组界面隐藏、日志保留）；`archivedSessionIds` 随
  `WorkspaceListState` 暴露；**契约层无 unarchive——单向不可逆**；
  归档当前会话会清空选择、视图跳 New Session state。
- 真删除不存在：`ISessions` / `IWorkspaces` / wire 层均无 session 删除 RPC，
  会话日志为 Host durable 数据。
- 本插件 UI 面仅姜晓浮层 + 设置卡，无法为宿主侧边栏加入口——归档入口
  只能落在浮层上。

## 决策

1. **单击保留（本地记账）**：保留模式开启时，点击气泡照旧 `sessions.open(id)`
   跳转，同时把该 id 记入本地 kept 集合；可见性过滤扩展为
   `running || completed || kept.has(id)`。SDK 清除 completed 位不可拦截，
   故由客户端记账直至显式移除。kept/dismissed 集合 localStorage 持久化
   （键名 `jx-bubble-keep-*`），跨刷新记忆正是诉求核心价值；过滤时惰性
   忽略已不在 items 的 id 并在写入时裁剪。
2. **移除走拖拽手势，双击方案否决**：单击与移除彻底解耦——单击恒为
   「跳转+保留」（零延迟）；移除是独立的拖拽投放。已否决：event.detail
   双击判定（移除非当前泡时第一击误跳转）、~250ms 双击窗口（高频单击
   常年迟滞）、混合方案（同一手势两种行为）。
3. **双投放区**：
   - **收起区**（近放，气泡列正下方）：拖入 = 记入本地 dismissed 集合，
     气泡消失，不动 SDK，完全可逆——管「暂时不想看」。
   - **归档区**（远放，角色脚边/浮层另一侧）：拖入 = 调 `archiveSession`，
     气泡消失且侧边栏同步隐藏，**不可逆**——管「永久办结」。警示视觉
     （琥珀/朱砂描边 + hover 提示「归档后从列表隐藏，不可恢复」）。
   - 远近分置本身即防误触栏：危险重操作必须特意够过去。已否决：并排
     双格（易拖错且其一错误代价不可逆）、单区+Shift 修饰键（不可发现）。
4. **可拖范围 = 仅 completed 类**（未查看 + 已保留均可）；running 气泡
   （拖走后 completed 复活问题）与 pending 组（审批误删风险，ADR-0020
   豁免折叠的紧急信号）禁止拖动，视觉呈现禁止态。
5. **归档区拒绝当前会话气泡**：与 ADR-0007 决策4「当前泡点击 no-op」同源
   语义——正停留的会话谈不上办结，且规避归档当前会话清空选择踢到
   New Session 的副作用。收起区不拒当前泡（纯本地操作无副作用）。
6. **配置两开关（SettingsCard 角色 section 追加 toggle）**：
   - 配置①「查看后保留气泡」总开关：关 = 完全回到现状（点击即跳转即
     消失，无拖动无投放区）；开 = 整套新范式。默认开。
   - 配置②「拖拽归档会话」独立开关：仅在①开启时有意义（主从）；关 =
     仅显示收起区。默认开（误触已被距离+警示+仅completed可拖三重约束）。
   - 新配置模块 `session-bubble-keep-config.ts`，对齐 skin.ts /
     session-bubbles-config.ts 容错 + store 模式。
7. **键盘无障碍**：既有 Enter/Space 激活 = 单击跳转+保留；新增
   Delete/Backspace = 收起聚焦气泡；归档不做键盘路径（危险操作保持
   拖拽仪式感）。aria-label 补充说明。
8. **派生层排除 `archivedSessionIds`**（读 ctx.workspaces.list 快照）：
   防止归档后的会话经 kept/completed 路径在气泡列复活。
9. **交互边界不变**：整盒拖动仍从角色本体发起（ADR-0006/0007 的
   `data-jx-interactive` 排除机制原样复用）；pointerdown 记起点、位移超
   ~8px 进入拖动态，未超阈值松手 = 既有 click。退出动效复用 leaving
   100ms 淡出。

## 后果

- **气泡点击语义反转（相对 ADR-0007）**：点击不再隐含「已消费提醒」——
  提醒的生命周期改由本地集合与显式手势管理。ADR-0007 决策4「当前泡点击
  无动作」保持不变。
- 引入插件内第二个持久化本地集合（kept/dismissed），其正确性依赖惰性
  裁剪纪律；归档权威在 SDK（archivedSessionIds），本地不重复记账归档态。
- 归档不可逆风险由三重约束控制：仅 completed 可拖、远近分置、警示视觉；
  归档错误的恢复只能依赖宿主侧手段，插件内无撤销路径（如实告知用户）。
- DESIGN.md §4 需追加「收起区/归档区」条目与拖拽手势约定；CONTEXT.md
  登录术语（保留模式、收起区、归档区、投放区）。
- 测试域新增纯逻辑 seam：kept/dismissed 过滤、双开关组合、archived 排除、
  当前泡归档拒绝。
