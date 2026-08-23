# 展开交互与子气泡呈现

**Status:** resolved

**Blocked by:** 02

**构建内容：** 用户可点击徽标原地展开/收起该工作流的子气泡列表：子气泡向左缩进、弱化背景、带左侧竖连接线，层级一眼可辨；点击子气泡直达对应子会话（completed 后代的石绿点展开可见）；当前会话在该组内时强制展开、手动收起无效，current 离开后自动回落手动状态；动效与键盘/读屏可访问性齐备。

**验收标准：**

- [x] 点击徽标切换该组展开/收起，各组独立互不影响；阻断冒泡——不触发跳转、不触发整盒拖动
- [x] 生效展开态 = 手动展开 或 containsCurrent；current 离开该组后回落到手动状态
- [x] 子气泡相对父气泡向左缩进 12px + 弱化背景 + 左侧竖连接线；组内顺序为宿主列表原序
- [x] 点击子气泡跳转对应会话；当前会话子气泡金描边且点击无动作
- [x] 子气泡出现 150ms 淡入 / 消失 100ms 淡出，复用既有退出跟踪机制；prefers-reduced-motion 全关
- [x] 徽标可键盘激活（Enter/Space），aria-label 报告剩余子会话数
- [ ] 人工视觉验证：父子层级辨识度、展开不挤压其他顶层气泡
- [ ] npm run build && npm run verify 通过

## 评论

- **工单03 实施完成（ui-eng）**。落地内容：
  - 徽标按钮化：`.badge` 升级为真实 `role="button"`（tabIndex 随 leaving 态
    -1/0），Enter/Space 键盘激活；onClick 与 onKeyDown 对 Enter/Space 一律
    `stopPropagation`——鼠标点击不冒泡到根气泡 onClick（不触发 sessions.open
    跳转）、键盘不冒泡到根气泡 handleKeyDown（不双重激活）；`data-jx-interactive`
    双保险挂载（父气泡已带排除标记，拖动经 closest() 同一属性排除）。
    aria-label =「展开/收起 N 个子会话」（报告剩余数）、aria-expanded 反映
    生效展开态；箭头随态翻转 收起 ▸N / 展开 ▾N（PRD 实现决策 3）。徽标不再
    aria-hidden（真实按钮自行播报），父气泡 aria-label 移除工单02 临时加的
    「含 N 个子会话」避免读屏重复。
  - 展开状态：`manualExpanded: Set<rootId>` 各组独立手动态；生效展开 =
    `manualExpanded.has(rootId) || group.containsCurrent`（派生判定，无副作用
    清理——current 离开后 containsCurrent 自然转假自动回落）。current 在组内
    时点击徽标仍切换手动态（生效态保持展开，「手动收起无效」为已接受权衡）。
  - 子气泡：新增 ChildBubble 内部组件渲染组内成员（dot + 标题）；DOM 位于
    父气泡之后（column-reverse ⇒ 视觉上方）；组内顺序 = 宿主列表原序
    （members 由纯逻辑层保证）。样式 `.bubble.bubbleChild` 组合：
    `.bubbleList align-items:flex-end` 右缘对齐锚定（等宽气泡视觉不变、展开
    不挤压他组），`margin-right:12px` 使边框盒整体左移形成缩进；弱化背景取
    `--jx-surface-1`（墨阶比父泡 surface-2 下沉一级，两主题均退后一层）、
    文字取 `--dsw-alias-label-tertiary`；左侧竖连接线为 `::before` 1px 素线，
    取色 `--dsw-alias-border-l1`（装饰边界轨——结构语义刻意避开状态信号通道）
    悬于左缘外 4px 沟槽、纵向越出 4px 桥接行间隙连成连续 lineage 竖轨
    （取色与位置理由均已在 CSS 注释写明）；`.bubbleChild overflow:visible`
    放开裁切让伪元素逃出气泡盒（ellipsis 由 .title 自身承担）。
  - 点击子气泡 `sessions.open(sessionId)` 直达；当前会话子气泡金描边且点击
    无动作；成员自身 pendingInteraction ⇒ 各自朱砂描边 + 涟漪点（状态样式全
    按成员自身标志挂载）。
  - 动效：出现复用 `.bubble` 既有 150ms enter；退出跟踪扩为双层粒度——整组
    从顶层可见集消失捕获子树单元（组+当时可见成员一起淡出，键 rootId，避免
    组/子重复登记）、单个成员消失而父组仍在按子粒度捕获（键
    `${rootId}:${sessionId}`，渲染紧随其父组活成员之后）；每键独立计时器
    100ms 后移除。本工单新增类均为纯静态装饰（无新 keyframes），reduced-motion
    由既有 .bubble/.leaving 分支全覆盖（CSS 内已注释说明）。
  - 门禁：npx vitest run 全绿（12 文件 247 用例）、npm run typecheck 零错误、
    npm run build 双半区产物成功（woff2 构建期未解析属预期警告）。
- 待办遗留：「人工视觉验证」待人工视觉验证（父子层级辨识度、展开不挤压需
  真实宿主场景）；「npm run build && npm run verify」中 build 已过，verify 按
  队长裁定由工单04统一收尾执行。
- 已接受的权衡：current 仍在组内时手动收起无效（对齐侧边栏「当前路径保持可见」惯例）。
- 决策依据：PRD 实现决策 4/5/10；ADR-0018 D5/D6/D9。
