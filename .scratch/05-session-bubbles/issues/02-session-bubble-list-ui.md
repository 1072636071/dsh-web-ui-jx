# 02 · 会话气泡列端到端 UI

**Status:** resolved

**Blocked by:** 01

**构建内容：** 角色浮层（姜晓）左侧出现竖排气泡列（自下而上生长），气泡数与运行中/已结束未查看的会话数一致：每气泡显示会话标题（超长省略、无标题回落会话 id）+ 状态点（运行中金呼吸点 / 已完成石绿实心点）；点击气泡跳到对应会话；当前会话金描边高亮、点击无动作；超过上限折叠为「+N」点击原地展开、再点收起；气泡列随浮层整体拖动、从气泡上按下不触发拖动；台词气泡留在头顶右上原位不受影响；无相关会话时不显示气泡列。出现 150ms 淡入 / 消失 100ms 淡出，`prefers-reduced-motion` 下全关且状态点不呼吸。

**验收标准：**

- [ ] `SessionBubble` 与 `SessionBubbleList` 组件（消费语义别名 + `--jx-gold` 专属轨，无颜色字面量、无主题选择器）：单行标题省略号、状态点、hover 金描边提视、`role="button"` 键盘可激活、`aria-label` 含会话标题
- [ ] 气泡列渲染于角色左侧（`column-reverse` 自下而上），随浮层盒整体移动；台词气泡位置不变、两者并存互不遮挡
- [ ] 点击气泡调 `sessions.open(id)` 跳转；气泡挂 `data-jx-interactive`（拖动按下不启动）；当前会话金描边、点击 no-op
- [ ] 折叠/展开：总数 ≤ 上限全显示；超出显示 visible + 「+N」（弱化样式），点击原地展开全部、展开态原位变「收起」再点收起
- [ ] 会话状态实时增减：开始跑/跑完/移除时气泡列随之变化；无 running/completed 会话时不渲染
- [ ] 上限读取自配置模块（默认 5 起步，工单 03 完成后改动即生效）
- [ ] 动效与可访问性：150ms 淡入（opacity+translateY 4px 自然减速）/100ms 淡出、重排无动画；`prefers-reduced-motion` 全关、状态点静态
- [ ] 集成：`CharacterOverlay` 接收 `sessions` prop 盒内渲染；`index.ts` 传入 `ctx.get("sessions")`；sessions 缺省时气泡列不渲染
- [ ] `npm run typecheck` + `npm run test` 全绿

## 评论

- 回写（2026-08-23）：清点核实已实施——`SessionBubbleList.tsx` 气泡列上线并接入 CharacterOverlay（提交 443814b）。状态由 ready-for-agent 补记为 resolved。

来源：`.scratch/05-session-bubbles/PRD.md` 实现决策 1/4/5/6/8/9；ADR-0007 决策 2/3/4/6/7。