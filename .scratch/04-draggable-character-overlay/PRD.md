# PRD — 角色浮层可拖动（整盒可拖 + 位置持久化 + 视口钳制 + 重置入口）

Status: ready-for-agent
来源: grill 会话（jxx-grill-with-docs，2026-08-19）+ ADR-0006 + DESIGN.md §4 + CONTEXT.md

## 问题陈述

DSH 宿主右下角常驻的角色浮层（姜晓动画）被 `position: fixed; right/bottom: 16px`
钉死在右下角，用户无法移动。浮层透明无底、`pointer-events: none` 完全不拦截指针
（DESIGN.md §4「装饰层不拦截底层 UI 交互」），用户想把它挪到别处（如左上角、或
让开某块正在阅读的内容）只能接受固定位置。需求：让姜晓动画可以被用户拖动到屏幕
任意位置，且拖动位置在刷新后保留。

## 解决方案

让角色浮层整个盒可拖（ADR-0006）：

- **交互模型**：整个 180×260 浮层盒可拖，`pointer-events: none → auto`（反转原
  「装饰层不拦截」原则——该矩形从此拦截其下方宿主 UI 指针，可接受，用户可拖走）。
- **定位**：由 `right/bottom` 改为 `left:0/top:0 + transform: translate3d(x,y,0)`
  （GPU 合成），默认位置 = 右下角（视口 - 尺寸 - 16px 边距）。
- **持久化**：`localStorage('jx-overlay-pos')`，JSON `{x,y}`（px，视口左上角为原点），
  拖动结束钳制后写入；初始化读回，无则用默认右下角。命名对齐 `jx-fx` / `jx-skin`。
- **视口钳制**：`0 ≤ x ≤ vw-width`，`0 ≤ y ≤ vh-height`；`window resize` 时重新钳制，
  防止窗口缩小后浮层出屏。
- **拖动反馈**：`cursor: grab`（悬停）/`grabbing`（拖动中）；拖动中 `opacity 0.85 +
  scale 1.02` 轻微提视；`prefers-reduced-motion` 下无过渡。
- **重置入口**：设置卡（SettingsCard）提供「重置浮层位置」按钮 → 回右下角并清除
  持久化。作为拖动丢位置的兜底（配合钳制保证不丢）。
- **实现机制**：Pointer Events（`setPointerCapture`）统一鼠标与触控；`touch-action:
  none` + 拖动中 `user-select: none`；`pointerdown` 目标为交互子元素（未来
  StateSwitcher 按钮等）时不触发拖动。

## 用户故事

1. 作为 DSH 宿主用户，我想要按住角色浮层的任意位置把它移到屏幕任意处，以便把姜晓动画摆到我喜欢的角落不挡内容。
2. 作为 DSH 宿主用户，我想要浮层默认出现在右下角，以便开箱即用、不改变现有布局预期。
3. 作为 DSH 宿主用户，我想要拖动后的位置在刷新/重开插件后保留，以便不用每次重新摆放。
4. 作为 DSH 宿主用户，我想要浮层拖不出屏幕外（视口内钳制），以便角色不会拖丢找不回。
5. 作为 DSH 宿主用户，我想要窗口 resize 后浮层自动回到可见区内，以便窗口缩小后角色不会跑到屏幕外。
6. 作为 DSH 宿主用户，我想要鼠标悬停浮层时显示抓取光标（`grab`），以便我知道这个浮层可以拖动。
7. 作为 DSH 宿主用户，我想要拖动过程中光标变抓取中（`grabbing`）且浮层轻微提视（半透明 + 微放大），以便有明确的"正在拖动"反馈。
8. 作为 DSH 宿主用户，我想要在触屏设备上用手指拖动浮层，以便移动端也能摆放位置。
9. 作为 DSH 宿主用户，我想要点击浮层上的交互元素（如未来状态切换按钮）不会误触发拖动，以便按钮点击与拖动互不干扰。
10. 作为 DSH 宿主用户，我想要在设置卡里点「重置浮层位置」一键回到右下角，以便拖乱后快速复原。
11. 作为 DSH 宿主用户，我想要台词气泡跟随浮层整体移动，以便气泡与角色始终在一起。
12. 作为 DSH 宿主用户，我想要 `prefers-reduced-motion` 下拖动无过渡动画，以便满足可访问性。
13. 作为开发者，我想要位置计算/钳制/持久化/拖动归约逻辑提取为纯函数模块，以便用 vitest node 环境单元测试（复用 state-machine / warp-controller 同款 seam）。
14. 作为开发者，我想要 pointer 事件监听、`transform` 写入、cursor/提视类切换留在组件薄壳层，以便纯逻辑与 DOM 解耦。
15. 作为开发者，我想要浮层位置持久化用 `localStorage('jx-overlay-pos')` JSON `{x,y}`，以便与 `jx-fx` / `jx-skin` 持久化模式一致。
16. 作为开发者，我想要拖动用 Pointer Events + `setPointerCapture` 统一鼠标/触控，以便一套代码覆盖两类输入。
17. 作为开发者，我想要拖动中 `touch-action: none` + `user-select: none`，以便触屏拖动不触发页面滚动/文本选中。
18. 作为维护者，我想要 DESIGN.md §4 已更新「整盒可拖」专规、CONTEXT.md 已登记角色浮层术语、ADR-0006 已记录决策，以便文档与代码一致。

## 实现决策

1. **交互模型**：整个浮层盒可拖，`pointer-events: none → auto`。反转 DESIGN.md §4
   原「装饰层不拦截指针」原则（已同步更新 DESIGN.md §4）。代价：浮层所在 180×260
   矩形拦截其下方宿主 UI 指针——已接受，用户可拖动移开。
2. **定位模型**：由 `right/bottom` 改为 `left:0/top:0 + transform: translate3d(x,y,0)`
   （GPU 合成、避免布局抖动）。默认位置 = 右下角（视口 - 尺寸 - 16px 边距）。
3. **纯逻辑模块 `overlay-position`（新建）**，镜像 `overlayStateMachine` 的单例
   store 模式：
   - `clampToViewport(pos, size, viewport)`：视口内钳制。
   - `defaultOverlayPosition(viewport, size, margin)`：默认右下角。
   - 持久化 `load` / `save` / `clear`：`localStorage('jx-overlay-pos')` JSON `{x,y}`，
     缺省/malformed 回落默认，写失败静默忽略（对齐 `skin.ts` 容错）。
   - 位置单例 store：`getSnapshot()` / `set(pos)`（写 localStorage + 通知订阅者）/
     `subscribe` / `reset()`（清 storage + 回默认 + 通知）。
   - drag reducer（纯函数）：`dragStart(pos, clientX, clientY)` → 会话（记录起点 +
     起始位置）；`dragMove(session, clientX, clientY, size, viewport)` → 跟手且钳制；
     `dragEnd(session)` → 提交位置。交互子元素（`pointerdown` 命中可点元素）不启动会话。
4. **`CharacterOverlay` 薄壳**：初始化订阅位置 store（读持久化/默认右下角）；组件
   根元素挂 `pointerdown`（排除交互子元素）→ `setPointerCapture` → `pointermove`
   实时更新 `transform`（拖动中不写回 store，up 才提交，避免高频通知）；`pointerup`
   提交 `dragMove` 结果到 store（钳制 + 持久化）；`window resize` 监听重钳制。
5. **视觉反馈**：悬停 `cursor: grab`，拖动中 `cursor: grabbing` + `opacity 0.85 +
   scale 1.02`；transition 只作用于 opacity/scale 不作用于 transform（避免拖动抖动）；
   `prefers-reduced-motion` 下无过渡。
6. **触控**：Pointer Events + `setPointerCapture`；`touch-action: none`；
   拖动中 `user-select: none`。
7. **重置入口**：`SettingsCard` 新增「重置浮层位置」按钮，调 `reset()`（经位置单例
   store 通知 `CharacterOverlay` 生效）。放置于设置卡底部或皮肤开关 section 内，
   采用唐风次要按钮样式（消费语义别名）。
8. **台词气泡**：绝对定位在浮层盒内（`bottom: 100%`），随盒整体移动，无冲突，不改动。
9. **CSS 变更**（`overlay` 模块样式）：`pointer-events: auto`、`left/top: 0`、
   `cursor: grab`、`touch-action: none`；拖动中类加 `cursor: grabbing` + 提视；
   reduced-motion 段关闭过渡。
10. **文档同步**（已完成于 grill 会话）：DESIGN.md §4 加「可拖动（ADR-0006）」专规；
    CONTEXT.md 角色浮层术语更新 + 已定决策表加 ADR-0006；ADR-0006 记录决策与权衡。

## 测试决策

- **好测试的定义**：只测外部行为（输入位置/尺寸/事件 → 输出位置快照/存储读写），
  不测实现细节（DOM API、类名、React 渲染、中间变量）。
- **Seam：复用既有 Seam 2**（client 纯逻辑 + vitest node 环境，先例
  `state-machine.test.ts` / `warp-controller.test.ts`）。**新 seam 数 = 0**。
- **被测模块**：`overlay-position` 纯逻辑模块。DOM 薄壳（`CharacterOverlay` 的
  pointer 事件绑定、`transform` 写入、cursor/提视类切换）不在自动化测试范围。
- **覆盖**：
  - `clampToViewport`：超左上/右下边界钳到边界内；边界内不变。
  - `defaultOverlayPosition`：右下角 = 视口 - 尺寸 - 边距。
  - 持久化 round-trip：`save` 后 `load` 一致；缺省/malformed → 回落默认；写失败静默。
  - `reset`：清 storage、回默认并通知订阅者。
  - drag reducer：`dragStart` 记录起点；`dragMove` 跟手且钳制（越界位置被钳回）；
    `dragEnd` 提交位置；从交互子元素起的 `dragStart` 不启动会话。
  - resize 重钳制：输入新视口尺寸 → 输出钳制后位置。
- **测试先例**：`tests/client/warp-controller.test.ts`（纯逻辑、node 环境、输入事件
  断言输出状态、不依赖 DOM/React）。
- **不自动化部分**：pointer 事件真实 DOM 绑定、`setPointerCapture`、`transform`
  写入、cursor/提视视觉、触屏手感、真实 `resize` 事件——人工视觉验证，沿用 FX/
  浮层系统无自动化视觉测试的惯例（PRD-01 测试决策）。

## 超出范围

- **StateSwitcher 状态切换按钮的构建**——属未来工单；本期只保证拖动逻辑排除交互
  子元素的机制（`dragStart` 对可点元素不启动），不实现按钮本身。
- 多显示器 / 负坐标支持——本期单视口钳制。
- 拖动弹性 / 回弹 / 吸附 / 缩放动画——本期仅基础提视（opacity/scale）。
- 引入拖拽/动画库——维持零依赖现状。
- 位置持久化迁移与版本化——本期单版本 JSON `{x,y}`。

## 补充说明

- 此需求为 grill 会话（`jxx-grill-with-docs`，2026-08-19）定案的 ADR-0006 实现：
  6 项核心决策（整盒可拖 / 持久化 / 钳制 / 反馈 / 重置入口 / 实现机制）+ 按惯例自定
  的细节（存储 key `jx-overlay-pos`、默认边距 16px、提视参数 0.85/1.02、重置按钮
  放置位置）。
- 领域词汇以 `CONTEXT.md` 为准（「角色浮层」已更新为整盒可拖动）；架构决策以
  ADR-0006 为准；视觉以 `DESIGN.md` §4 为准。
- **已接受的权衡**：整盒可拖使浮层矩形拦截其下方宿主 UI 指针（反转原穿透原则）。
  若未来需要"穿透 + 可拖"并存，需另立功能（如拖动手柄方案，ADR-0006 已否决）。
- 持久化 key 命名 `jx-overlay-pos` 对齐现有 `jx-fx` / `jx-skin` 模式。
