# 工单 02 — 详情窗组件 + hover 交互 + 书页视觉

**Status:** resolved

**Blocked by:** 16-01

**构建内容：** hover 气泡弹出书页卡片详情窗——会话标题（书眉）、AI 动态标题行（未配置时隐藏）、最后用户消息、最后模型消息，3 行截断；纸感视觉 + 完整交互（进入/离开延迟、视口换侧、点击跳转、触屏长按、加载骨架/失败降级）。无 AI 配置时详情窗完整可用。

**验收标准：**

- [x] 悬停 300ms 弹窗、移开 200ms 隐藏、可移入详情窗、气泡 hover 态保持不闪烁
- [x] 详情窗显示四行内容（标题/动态标题行/最后用户消息/最后模型消息），消息 3 行 line-clamp 截断 + 字符护栏
- [x] 书页卡片视觉：纸感背景（`--jx-paper-bg`/`--jx-paper-edge` 深浅双值随主题）、左侧金线书脊、书眉区排版，遵循 DESIGN.md 纪律
- [x] 视口边缘自动换侧；详情窗内点击 `sessions.open` 跳转
- [x] 触屏长按 500ms 触发；加载骨架/失败静默降级；未配置 AI 时动态标题行隐藏
- [ ] 深浅主题下纸感配色清晰可读（人工视觉验收，归工单 05）

## 答案

2026-08-27 完成。

- 新增 `packages/dsh-session-bubble/src/SessionBubbleDetail.tsx`：书页卡片（纸感背景/纸缘描边/书眉标题+副题/内容预览行/底部书脊）；预览 mount 时按需拉取（骨架屏 + 失败静默）；AI 副题行 configured 显示 / unconfigured 隐藏；`clampText` 字符护栏纯函数；点击卡片 `sessions.open`。
- 新增 `styles/session-bubble-detail.module.css`：只消费语义别名 + `--jx-paper-*` 专属轨，无颜色字面量；`prefers-reduced-motion` 全关。
- `bubble-theme.css` 补 `--dsh-bubble-jx-paper-bg/-edge` 深浅双值兜底；`jiangxiao.css` L2 补 `--jx-paper-bg/-edge`；DESIGN.md §2 令牌表补「纸感」行。
- `SessionBubbleList.tsx` 集成悬停详情：`useHoverDetail` 状态机（pointerover/out 事件委托 + `data-hover-key`，不改动内部 onClick）——进入延迟 300ms / 离开 200ms / 触屏长按 500ms（交互子元素不长按）/ 视口边缘换侧 + 纵向对齐翻转 / 详情窗 pointer 保活 / 触屏点外关闭；卡片 `data-jx-interactive` 不触发整盒拖动，随盒整体移动。
- 测试：`session-bubble-detail.test.ts` 9 项全绿（jsdom；标题/预览行/in-flight/失败静默/副题显隐/点击跳转/护栏）。

## 评论

- 来源：PRD 16 D5/D6/D8（交互/截断/书页 token）+ Q2 视觉意象（书页卡片·扉页式）。
