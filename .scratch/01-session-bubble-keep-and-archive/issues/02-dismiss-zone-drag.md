# 02 — 收起区：拖拽手势骨架 + 本地隐藏

**Status:** resolved

**Blocked by:** 01

**构建内容：** 已完成类气泡可拖入近放「收起区」暂时隐藏（可逆），未命中松手自然弹回；键盘可收起聚焦气泡；被收起的会话再次完成新一轮任务时重新提醒。判定矩阵一次写全（含归档/禁止组合，03 直接消费）。

**验收标准：**

- [ ] 判定矩阵纯函数一次写全并逐格断言：click / dismiss / archive / forbidden 四态；运行中 × 任意、等待交互 × 任意一律禁止；当前会话 × 归档区禁止（为 03 预置）
- [ ] 仅已完成类气泡可进入拖动态；运行中/等待交互气泡呈现视觉禁止态、不可拖动
- [ ] 收起区近放（气泡列正下方）；拖入松手 → dismissed 记账 → 复用既有退出淡出动效消失
- [ ] 未落入投放区松手 → 弹回原位、无记账；位移阈值约 8px 区分点击与拖拽，点击路径（跳转 + 记账）不受影响
- [ ] dismissed 经投影上下文参数接线生效；新一轮完成上升沿清除该会话 dismissed 记账（旧收起不吞新提醒）
- [ ] 键盘 Delete / Backspace 收起聚焦气泡；归档刻意无键盘路径；aria-label 补充说明
- [ ] 整盒拖动格局不变：气泡上的按下拖动不触发浮层移动（既有排除机制复用）
- [ ] 刷新页面后 dismissed 依然生效（持久化）
- [ ] `npm run build` + `npm run verify` 通过

## 答案

### 变更文件清单

- **`src/client/state-machine/session-bubbles.ts`**（判定矩阵，C9 一次写全）：新增 `DropZoneKind` / `DragVerdict` / `DragEntryFlags` 类型、`DRAG_THRESHOLD_PX = 8` 常量、`resolveDragAction`（7 步钉死判定顺序：阈值内 click 先于一切禁止判定〔禁拖不禁点〕→ running forbidden → pending forbidden → 当前泡×归档 forbidden〔03 预置格〕→ dismiss → archive → 未命中 forbidden=弹回）、`isBubbleDraggable`（!running && pending 无；isCurrent 不影响可拖性）。纯函数零依赖，03 直接消费不改签名。
- **`tests/client/session-bubbles.test.ts`**（TDD 红→绿：先 10 failed | 66 passed，实现后 76/76）：新增矩阵断言组 10 用例——36 格点击全矩阵（3 位移采样 × 3 zone × 4 flags）、阈值边界 7/8px（含浮点 99.5px）、forbidden 全排列①running×任意zone（含当前/非当前）②等待交互三类（approval/plan-review/question）×任意zone③当前泡×归档；当前泡×收起=允许 dismiss；普通条目三落点（dismiss/archive/未命中弹回）；DRAG_THRESHOLD_PX 常量钉死为 8；isBubbleDraggable 六断言（running/pending/组合禁，普通与当前泡可拖）。既有测试零改动。
- **`src/client/components/SessionBubbleList.tsx`**（手势接线 C10/C12/C13/C14 + 视觉/aria C11）：
  - 手势四连回调（pointerdown 记起点+setPointerCapture / move 超 8px 进拖态直接写 DOM transform 跟手不走 React state / up 以 elementFromPoint→closest("[data-jx-zone]") 解析落点喂 resolveDragAction / cancel 复位）；状态全部 ref 化；
  - suppressClickRef + 容器 onClickCapture 捕获阶段消费一次——拖拽发生过必吞合成 click（防「拖完又跳转」），未超阈值路径不置位、原生 click（跳转+记账）零影响；
  - verdict==="dismiss" ⇒ addDismissed(id)，投影变化由既有 leaving 双层退出机制接管淡出（未另写动画）；其余弹回原位（CSS transition 弹回，prefers-reduced-motion matchMedia 直接复位）；
  - 键盘 Delete/Backspace 收起聚焦气泡（仅保留模式 && 可拖时注入 onDismissKey；当前会话允许；归档无键盘路径）；
  - dismissed 生命周期：completed 上升沿（prev ref Map 对齐 prevItemsRef 写法）⇒ clearDismissed——旧收起不吞新提醒，首帧仅建基线；
  - running/pending 气泡挂 .dragForbidden（仅保留模式下呈现，开关关完全现状外观）；可拖条目 aria-label 追加「可拖至收起区移除，或按 Delete 收起」；
  - 收起区常驻渲染于整列正下方 8px（keepEnabled 时），data-jx-zone="dismiss" + role="note" aria-label 说明用途；归档区不渲染。整盒拖动排除机制原样未动（气泡仍带 data-jx-interactive）。
- **`src/client/styles/session-bubbles.module.css`**：`.dragForbidden`（cursor:not-allowed + 虚线素线描边弱化；border 变化用 :not(.pending) 收窄——朱砂紧急描边绝不被覆盖，hover 不给金提视）；`.dismissZone`（absolute 锚定 .bubbleList 盒正下方 8px、右缘对齐；**pointer-events:auto 显式声明**——父容器 none 会被子级继承而落点解析靠 elementFromPoint 命中；虚线素线 + surface-1 墨阶下沉 + dimmed 文字，静态无动画故 reduced-motion 天然免分支）。

### 验收标准核对

- [x] 判定矩阵一次写全并逐格断言：四态齐全；运行中×任意、等待交互×任意一律禁止；当前会话×归档区禁止（03 预置）
- [x] 仅已完成类气泡进拖动态；运行中/等待交互呈现 .dragForbidden 禁止态且 pointerdown 不启动臂态
- [x] 收起区近放（列正下方 8px）；拖入松手 → addDismissed → 投影变化走既有 leaving 淡出
- [x] 未命中松手弹回原位零记账；8px 阈值区分点击与拖拽；点击路径（跳转+记账）不受影响
- [x] dismissed 经投影上下文参数生效（01 已接线）；completed 上升沿清除 dismissed 记账
- [x] Delete/Backspace 收起聚焦气泡；归档刻意无键盘路径；aria-label 补充说明
- [x] 整盒拖动格局不变：data-jx-interactive 排除机制未动，气泡手势不触碰 overlayPositionStore
- [x] 刷新后 dismissed 依然生效：配置模块加载时 readIdSet 恢复快照喂投影（读路径验证，C16）
- [x] npm run build + npm run verify 通过

### 验证命令结果（最终复测，并行工单落定后）

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/client/session-bubbles.test.ts` | ✅ 76/76（66 + 10 新矩阵用例） |
| `npm run typecheck` | ✅ 本片全部文件 0 错误；仓库存量 5 错（character-overlay-crossfade ×2 / overlay-session-runtime / state-machine / variant-rotation 的 .test.ts）与本片无关，工单01 时即存在 |
| `npm test` | ✅ **302/302（14 文件全绿）**——中间窗口曾出现 4 个失败，均属并行进行中的 ADR-0023（移除 welcome 入场表演）改动域中间态，其作者落定后复测全绿；本片全程无失败 |
| `npm run build` | ✅ lib/index.js + lib/client.js 140.88 kB |
| `npm run verify` | ✅ 21/21 通过，exit 0 |

> 并行协作观察：实施期间检测到另一 agent 正在同工作区推进 ADR-0023（welcome 移除，overlay-session-runtime.ts / overlay-state-machine.ts 在本片验证窗口内被修改并最终落定）。上述中间态红与本片无交集；全套绿态以其落定后的复测为准。

### 迷雾实测结论（map.md 迷雾①，已固化组件注释）

setPointerCapture 之后浏览器仍会在被捕获元素上合成 click（pointerdown/up 目标同为捕获元素，大位移拖拽也不例外）——因此「拖拽发生过 ⇒ 必须显式吞掉紧随的合成 click」是硬要求，实现为 suppressClickRef + 容器 onClickCapture 捕获阶段消费一次；未超阈值的按下-松手完全不置位该标记，原生点击路径零改动。迷雾②（归档接口失败形态）属工单03，未动。

### 实施注记

1. 并行协作观察：实施期间检测到另一 agent 正在同工作区推进 ADR-0023（welcome 移除，overlay-session-runtime.ts / overlay-state-machine.ts 于本片验证窗口内被修改）——上述 typecheck/npm test 的存量红均出自其未完成的中间态，与本片无交集；建议 ADR-0023 落定后复跑全套确认。
2. 徽标区域按下同样进入根气泡臂态（徽标无独立拖拽语义）；拖拽后的合成 click 已被容器闸门吞掉，不影响徽标 toggle 的正常 stopPropagation 路径。

### 队长追加需求：可移除指示线（t4 验收后实施，2024 追加工单）

**需求**：「可以被移除的气泡」行左侧加一条绿色竖线。解读口径按队长指令：可移除 = keepEnabled && isBubbleDraggable（!running 且无 pendingInteraction，含当前会话泡）；GroupBubble 根气泡与 ChildBubble 子气泡都挂；keepEnabled 关闭时不加任何标记。

**实现**：
- **`SessionBubbleList.tsx`**：GroupBubble / ChildBubble 两处 classes 数组各加一行 `draggable ? styles.draggable : ""`——`draggable` 变量本就含 `dragEnabled &&` 门控（t2 已定形），零新增判定逻辑。
- **`session-bubbles.module.css`** 新增 `.draggable`：
  ```css
  .draggable { box-shadow: inset 3px 0 0 0 var(--dsw-alias-state-success-primary); }
  ```
  采用队长首选的 inset box-shadow 方案——前置核查确认本文件 `.bubble/.current/.pending/.dragForbidden` 的状态描边全部走 `border/border-color` 通道、box-shadow 属性无人占用，分属性分层共存零覆盖风险；不占布局、不受 overflow 影响、与子气泡 `::before` 连接线（盒外 left:-4px）无冲突（线居盒内、连接线悬盒外）。颜色取 `--dsw-alias-state-success-primary` 石绿语义令牌（与 `.dotCompleted` 状态点同源——「已完成 ⇒ 可收纳」点线同轨），无字面量。
- **四态叠加自查**：`.draggable` 与 `.pending`/`.dragForbidden` 在逻辑层互斥（类挂载由同一 isBubbleRowDraggable 布尔驱动），绿线实际只与素线描边或金描边（current/hover）叠加——石绿线居内、状态描边居外，各组合下绿线不丢失、不遮蔽状态描边；keepEnabled 关闭时组件不挂此类，完全现状视觉；静态无动画，reduced-motion 无需分支。
- 文件头注释 ADR-0022 清单同步补 `.draggable` 条目。

**快速回归**：seam vitest 80/80 ✅；typecheck 恰为存量基线 5 错（无新增）✅；build ✅ client.css 77.88 kB / client.js 145.10 kB；verify 21/21 exit 0 ✅。未 commit。

### 队长追加需求 #2：组内运行中即不可移除（绿线之后实施）

**用户规则**：「如果有子代理还在运行，就不是可以移除的气泡」。语义钉死：行是否可移除 = 自身 flags 判定 && **其所属归组内没有任何运行中成员**（含嵌套后代——ADR-0018 归组模型已折叠进同一组，`badge.running` 即组内运行中成员计数）。进行中的工作流不许被收纳。

**实现（TDD 先红后绿：6 failed | 80 passed → 86/86）**：
- **`session-bubbles.ts`** 新增纯函数（紧邻 isBubbleDraggable）：
  ```ts
  export function isBubbleRowDraggable(flags: DragEntryFlags, groupRunningMembers: number): boolean {
    return isBubbleDraggable(flags) && groupRunningMembers <= 0;
  }
  ```
  `isBubbleDraggable` 保持原样——resolveDragAction 的逐条目判定原语不动，判定矩阵语义零变化。
- **测试 +6 用例**（tests/client/session-bubbles.test.ts）：completed 根泡 × running=2 ⇒ false；独组 ⇒ true；子泡同规则且与成员位次无关（兄弟运行中 false / 全组安静 true）；当前会话子泡同理（组活跃锁死 / 组安静可收起）；running 自身 / pending 自身无论组态恒 false（自身 flags 是前置原语）；阈值边界 <= 0 钉死（1 个运行中成员即整组锁死）；kept-only 条目同规则（记账不影响可移除性）。
- **`SessionBubbleList.tsx` 接线**（统一判定源替换三处消费）：
  - GroupBubble：`draggable = dragEnabled && isBubbleRowDraggable(rootFlags, group.badge.running)`；
  - ChildBubble：新增 prop `groupRunningMembers: number`（三处调用点均传 `group.badge.running`——活成员、组内退出成员、整组退出单元），同样改用新函数；
  - 手势臂态闸门 `handleBubblePointerDown` 签名扩展第 4 参 `groupRunningMembers`，闸门改 `isBubbleRowDraggable`（GroupBubble/ChildBubble 的 onPointerDown 分别传 `group.badge.running` / prop）；
  - 列表层根泡 onDismissKey 门控（rootDraggable）同步改用行级判定；
  - 绿线 `.draggable`、dragForbidden 禁止态、aria-label 追加说明全部经由既有 draggable 布尔自动跟随新规则——组内活跃时该行呈现禁止态 + 无绿线 + 键盘不可收起 + 拖拽臂态不启动，正是期望反馈。
- 组件头注释与 GroupBubble/ChildBubble doc 同步更新为行级可移除语义。

**快速回归**：seam vitest **86/86** ✅；typecheck ⊆ 存量基线 5 错无新增 ✅；npm test **312/312 全绿** ✅；build ✅ client.js 150.76 kB；verify **21/21** exit 0 ✅。未 commit。

### 审查修复轮（t6）

- **S2（已修）**：`handleBubblePointerDown` 入口重置 `suppressClickRef.current = false`——pointercancel 置位后浏览器通常不再合成 click，残留标记会吞掉下一次正常点击；同手势 up→click 消费序列恒先于下一次 pointerdown，入口重置不误清当次标记（注释已固化时序论证）。
- **N10（已修）**：springBackBubble 的 transitionend 监听 + setTimeout(260) 兜底登记到组件级 `springBackCleanupsRef` 集合，新增卸载 useEffect 集中取消并直接复位内联样式——悬挂句柄对齐 React 生命周期纪律。
- **N11（已修）**：四处 `{running, pendingInteraction, isCurrent}` 字面量拼装收拢为单点 `toDragFlags(entry: BubbleEntry)` helper（GroupBubble 根 / ChildBubble 成员 / 列表层两处 onDismissKey 门控）。首版参数手写宽类型（string vs PendingInteractionKind）被 typecheck 拦下，改接 BubbleEntry 后归零——类型系统按预期工作。
- **N13（已修）**：session-bubbles.module.css .draggable 注释 + 本文件绿线小节的「isBubbleDraggable 布尔驱动」→「isBubbleRowDraggable 统一驱动」（需求 #2 升级后的判定函数名）。
- **N5（跳过留档待后续重构）**：GroupBubble/ChildBubble 的键盘分支/flags 投影/className 组装确有重复，但两者在徽标、展开传播、组/成员语义上已实质分叉——抽取共享 helper 需要宽参数化面且无组件级测试兜底，重构引入回归的风险大于收益，留档待后续有组件测试基建时再做。

## 评论

（新内容置于最前。）

- 上下文指针：`PRD.md`（实现决策 §判定矩阵 / §组件接线 / §dismissed 生命周期）、ADR-0022 决策 2/3/4/7/9、memorial 010 D3/D9/D12/D14。
- 本片工作量最大的是手势接线（跟随、弹回、与点击合成的关系），纯逻辑部分先立矩阵测试再动组件。
