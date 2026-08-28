# PRD — 气泡内容弹框（hover 预览会话问话）

- Feature: `14-session-bubble-content-preview`
- Status: `done`
- Source: memorial 014 `docs/memorial/014-bubble-hover-preview-last-message/`（Q1–Q9 + 决策 D1–D6）+ ADR-0028

## 问题陈述

用户鼠标划过会话气泡时，希望能直接看到该会话的对话内容（尤其是最后几次问话），而不必先点击跳转过去再翻看。但当前气泡列（ADR-0007/0018/0022/0026）只显示会话标题与状态点，无任何内容预览。

「和官方走一样的接口」的调查结论：client 半区读非当前会话内容必须切换当前会话（副作用）；但插件 **host 半区**有专门的无副作用接口 `ctx.sessionController.inspect(sessionId)`（官方服务端能力，兼容冷会话）——这是本功能的数据源。

## 解决方案

鼠标 **hover 会话气泡 → 浮现内容弹框**（tooltip 浮层）：

- 弹框顶部 = **会话标题**；
- 标题下 = 一排**问话胶囊**（该会话的全部用户问话，每条一个胶囊，显示截断摘要；超长折叠「+N」）；
- 弹框下方 = **问话详情区**，显示当前选中胶囊对应的**完整问话内容**；
- **默认展开最后一个胶囊**（详情区显示最后一条问话）；
- **hover 某胶囊** → 详情区切换为对应完整问话；
- **点击胶囊** → `sessions.open(id)` 跳到该会话（会话内精确定位留待官方开放接口后补）。

数据链路：host 半区 `sessionController.inspect(sessionId)` 无副作用读会话日志（attached + 冷会话均兼容）→ 提取全部直接用户问话 → 经 `/api/dsh-jx` 路由下发 → client hover 时 fetch。

## 用户故事

1. 作为用户，我希望鼠标划过会话气泡时浮现一个内容弹框，以便不跳转即可预览该会话内容。
2. 作为用户，我希望弹框里显示会话标题，以便快速识别这是哪个会话。
3. 作为用户，我希望弹框标题下有一排问话胶囊（每个胶囊对应该会话的一条用户问话），以便浏览该会话问过什么。
4. 作为用户，我希望弹框展示该会话**全部**用户问话（不只最后一条），以便完整回顾。
5. 作为用户，我希望问话胶囊显示截断摘要（超长省略），以便紧凑排版。
6. 作为用户，我希望问话数量很多时折叠成「+N」而不是撑爆弹框，以便弹框保持可读。
7. 作为用户，我希望弹框**默认展开最后一个胶囊**，详情区显示最后一条问话的完整内容，以便快速看到最近一次问话。
8. 作为用户，我希望鼠标划过某个胶囊时详情区切换到那条问话的完整内容，以便查看任意一轮问话。
9. 作为用户，我希望点击胶囊能跳转到该会话，以便深入处理。
10. 作为用户，我希望 hover 其他气泡时弹框跟着切换（不会串会话），以便连续预览多个会话。
11. 作为用户，我希望弹框只在 hover 会话气泡时出现、移开/离开气泡时消失，以便不遮挡视线。
12. 作为用户，我希望弹框出现不影响既有气泡点击跳转、保留记账、手柄收起等交互，以便不破坏既有功能。
13. 作为用户，我希望弹框不触发整盒拖动（浮层拖动/气泡交互正确分流），以便拖角色和预览互不干扰。
14. 作为用户，我希望正在运行/等待交互的会话也能预览问话（数据与运行状态无关），以便随时查看。
15. 作为用户，我在「减少动态效果」系统设置下不看到弹框动画（instant 切换），以便低性能设备获得降级体验。
16. 作为用户，我希望弹框在深浅双主题下都可读（消费语义别名），以便视觉一致。
17. 作为用户，我希望冷会话（未打开/已重启）也能预览问话，以便预览不受会话激活状态影响。
18. 作为开发者，我希望数据提取逻辑是纯函数（输入事件数组、输出问话列表），以便可靠测试。
19. 作为开发者，我希望插件热重载后弹框/路由无残留，以便长驻存活（ADR-0017 可重入约束）。

## 实现决策

- **D1 — 数据源 = host 半区 `sessionController.inspect`**（ADR-0028）：host `inject` 追加 `"sessionController"`；调 `inspect(sessionId)` 无副作用读会话完整 events（attached 读 `Session.events`，冷会话经 `inspectApiSession` 持久化读）；从 events 顺序收集全部（时序正序输出、末条恒为最新；实施勘误：原「倒序」措辞与不变量矛盾，以正序为准） `type==='user/message'` 且 `data.source.kind==='user'`（直接用户消息，排除 plugin/notice/recall 合成）的事件，提取 `content` 中 `type==='text'` 的 `text` 拼接（多 text block 拼接、image 等忽略）。否决 client 临时 open 切回 / `sessions.search` / 仅已 open 会话降级。
- **D2 — host 路由下发**：经既有 `ctx.webServer.register` 模式注册一条 `/api/dsh-jx/session/<id>/messages` 路由，返回 `{ title, prompts: [{ seq, text }] }`（seq 随问话下发，留待官方定位能力开放后接线）。
- **D3 — client 弹框 = 胶囊 + 详情区**：hover 气泡浮现浮层；弹框 = 会话标题 + 一排紧凑问话胶囊 + 问话详情区。默认选中最后胶囊（详情区显示最后问话完整内容）；hover 切胶囊。
- **D4 — 胶囊折叠**：胶囊数超出上限（实施定阈值，参考 maxVisible 模式）折叠为「+N」。
- **D5 — 点击胶囊跳转**：`sessions.open(id)` 跳到该会话；会话内**精确定位留待官方开放接口后补**（官方 API 无此能力）。
- **D6 — 交互与既有机制分流**：弹框挂 `data-jx-interactive` 避免触发整盒拖动；气泡点击跳转/保留记账/手柄收起语义不变；hover 弹框用 debounce 防抖 + 结果缓存（避免高频 fetch host 路由）。
- **D7 — 主题与降级**：弹框样式只消费语义别名 + `--jx-*` 专属轨，无颜色字面量、无主题选择器；`prefers-reduced-motion` 下动画全关（instant 切换）；弹框逃逸/视口钳制对齐 overlay 定位经验。

### 模块（seam）

- **`src/host/session-messages.ts`**（**唯一新 seam**）：导出纯函数 `collectUserMessages(events)` → `UserPrompt[]`（每条 `{seq, text}`），从宿主事件序列提取全部直接用户问话。纯逻辑、不依赖 React/HTTP。
- **`src/host/index.ts`**：`inject` 追加 `"sessionController"`；接线新增路由（调用 `inspect` → `collectUserMessages` → JSON）。
- **`src/client/components/SessionBubbleList.tsx`**：hover 气泡浮现弹框（新增子组件 + hover 状态），hover 时 fetch 路由。纯接线。
- **`src/client/styles/`**：新增弹框 CSS module（消费语义别名）。

> 复用既有模式：host 路由对齐 `asset-routes.ts` / `import-api.ts`；client 订阅/配置对齐 `session-bubbles-config.ts` / `session-bubble-keep-config.ts`；交互排除对齐 `data-jx-interactive`（ADR-0006/0007）。

## 测试决策

- **好测试的特征**：只测外部可观察行为——`collectUserMessages` 输入事件数组是否输出正确的问话列表（过滤 `source.kind==='user'`、多 text block 拼接、image/plugin/notice 忽略、空事件/无问话的退化输入）；不测内部实现细节。
- **被测模块**：
  - `collectUserMessages` 纯函数——以 `tests/host/asset-routes.test.ts` / `import-api.test.ts` 为同层先例。
  - 路由接线与弹框交互（hover 切换、胶囊选中、折叠）——组件层测试可复用 `tests/client/session-bubbles.test.ts` 先例。
- **测试先例**：`tests/host/asset-routes.test.ts`、`tests/host/import-api.test.ts`（host 层）；`tests/client/session-bubbles.test.ts`（client 组件/逻辑层）。

## 超出范围

- 不做「打开会话并滚动定位到某条问话」——官方 API 无此能力，作为已知限制记录（ADR-0028 附注）；seq 随数据下发留待官方开放后接线。
- 不改官方宿主/前端源码。
- 不改既有气泡点击/保留/收起交互契约。
- 弹框不承载除问话预览外的其他内容（不做完整对话渲染）。

## 补充说明

- host `inject` 追加 `sessionController` 需确认宿主 composition 已加载（已确认：`bundle/web-app/cordis.patch.yml:85-88`）。
- 「全部问话」在极长会话下可能较大：折叠阈值与返回条数上限由实施定，但须保证「默认展开最后一个胶囊」恒成立。
- 弹框定位：气泡列在浮层盒外（`right: calc(100%+8px)`），弹框可能超出视口左缘——需视口钳制/翻转（复用 overlay 定位经验）。
- 实施后必须 `npm run build` + `npm run verify`（AGENTS.md 构建验收约束）。
