# CharacterOverlay 拖动接线（pointer 事件 + transform + store + 反馈）

**Status:** resolved

**Blocked by:** 01

**构建内容：** 用户按住姜晓动画浮层盒任意位置拖到屏幕任意处；刷新后位置保留；拖不出屏、窗口缩小自动回可见区；悬停/拖动光标 + 拖动中轻微提视；触屏可拖；台词气泡随盒整体移动。全部交互逻辑复用 overlay-position 纯逻辑（钳制/持久化/drag reducer/位置 store），本工单只做 DOM 薄壳接线。

**验收标准：**

- [ ] 浮层盒 `pointer-events: auto`，按住任意位置可拖动（Pointer Events + `setPointerCapture` 统一鼠标/触控）
- [ ] 拖动实时跟手（`transform: translate3d`，GPU 合成），`pointerup` 提交钳制结果 + 持久化
- [ ] 初始化订阅位置 store：读持久化位置，无则默认右下角
- [ ] `window resize` 监听重钳制，窗口缩小后浮层不跑到屏幕外
- [ ] 悬停 `cursor: grab`，拖动中 `cursor: grabbing` + 提视（opacity 0.85 + scale 1.02）；transition 不作用于 transform；`prefers-reduced-motion` 下无过渡
- [ ] `touch-action: none` + 拖动中 `user-select: none`，触屏拖动不触发页面滚动/文本选中
- [ ] `pointerdown` 命中交互子元素（未来状态切换按钮等）时不触发拖动
- [ ] 台词气泡（盒内绝对定位）随盒整体移动，无冲突
- [ ] `npm run build` 通过（host/client 双半区）+ `npm run verify` 全绿

## 评论

- 回写（2026-08-23）：清点核实已实施——整盒拖动 + 位置持久化 + 视口钳制一次交付（提交 2ce701f）。状态由 ready-for-agent 补记为 resolved。

来源：PRD-04 实现决策 2/4/5/6/8/9。阻塞于 01（位置 store 与 drag reducer）。触控拖动与鼠标拖动共用 Pointer Events 一套代码。
