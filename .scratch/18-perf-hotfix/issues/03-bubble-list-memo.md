# SessionBubbleList 包 React.memo 隔离重渲染

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 浮层状态推进（runtime `emit()`，14 个调用点）不再导致整个会话气泡列子树重渲染——`SessionBubbleList` 导出包 `React.memo`（或提升到 `RootApp` 与 `CharacterOverlay` 并列）。气泡列派生计算（items / folded / expandedResult）本就经 `useMemo` 绑定稳定引用，本次只切掉组件函数体与全量 JSX diff。

**验收标准：**

- [ ] `SessionBubbleList` 导出包 `React.memo`（或等效结构隔离）
- [ ] runtime 的 emit 语义零改动（ADR-0016：无条件 emit 保留，playback 内容为推进唯一身份）
- [ ] `session-bubble-list.test.ts` 渲染回归全绿
- [ ] 若 jsdom 可可靠观察，补「稳定 props 下不重渲染」断言；全量测试全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮无发现项（标准/spec 双维度）；工单置 `done`，随 M1 里程碑提交。
- 2026-08-30（实现）：`SessionBubbleList` 导出改为 `memo(function SessionBubbleList(...))`，props（sessions/workspaces/两个 transport）为稳定宿主引用，父浮层自身状态重渲染时气泡列跳过整棵 JSX diff；气泡列内部 external store 驱动的更新不受影响。runtime emit 语义零改动（未触碰 runtime 层）。`session-bubble-list.test.ts` 新增「稳定 props 下不重渲染」断言（getSnapshot 计数法，jsdom 可可靠观察，含 workspaces 稳定引用），13 项全绿。
- 来源：PRD 18-perf-hotfix 候选 H4；证据见 memorial 017 archived `index.html`（SessionBubbleList.tsx:1001 未包 memo；emit 调用点 14 处）。
- **禁止**在 runtime 层加内容 diff 去抖——ADR-0016 已明确否决。
