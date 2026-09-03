# 接入宿主 slots，占用 hero 标题，时段问候 MVP（不带名）

**Status:** done

**Blocked by:** 无——可立即开始（外部前置：deepseek-harness 仓库 `03-hero-headline-slot` 的工单合入后才能实际占用，见评论）

**构建内容：** 用户打开新会话时，大标题按时段显示问候语——「上午好，有什么需要我搞定的么？」等四档；卸载本插件自动回落宿主原文案「探索未至之境」。此切片不涉及用户名与开关。

**验收标准：**

- [ ] 新增对宿主 conversation UI 包的 peerDependency，并接入 slots（本插件首次接入 slots 体系）
- [ ] 占用 `conversation.hero.headline`，渲染四档问候的不带名文案（两套文案结构就绪，本切片只接不带名路径）
- [ ] 时段判定：上午 05:00–11:59 / 下午 12:00–17:59 / 晚上 18:00–22:59 / 该休息 23:00–04:59，wrap-around 判定，浏览器本地时间
- [ ] 挂载时计算一次，不挂 timer；时段判定工具为可复用纯函数（后续工单复用）
- [ ] 边界测试覆盖 4/5、11/12、17/18、22/23 四个切换点
- [ ] 插件缺席（disabled / 未安装）时宿主自动回落原文案，无空白标题
- [ ] `npm run build && npm run verify` 通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）

### 2026-09-03 实现摘要（impl-jx-greeting-mvp）

**接入方式**：运行时（rc.7）`dsh-client-runtime` 已含 `SlotRegistry` 服务（`ctx.slots.inject` / `ctx.slots.register`）。本插件在 `src/client/index.ts` 的 `inject` 数组追加 `"slots"`，并在 `apply()` 内调用 `registerHeroHeadlineGreeting(ctx)`。`inject` 内部经调用方 `ctx.effect` 自动级联清理（ADR-0017 可重入约束），无需手动 disposer。

**改动文件**：
- `src/client/state-machine/greeting.ts`（新增，纯逻辑：时段四档 `getGreetingBucket` + 带名/不带名两套文案常量 + `selectGreetingText`）
- `src/client/components/HeroHeadline.tsx`（新增，纯展示组件，`useState` 挂载时算一次、`owner.className` 有则应用到 `<span>`）
- `src/client/hero-headline-greeting.ts`（新增，`HERO_HEADLINE_SLOT` 导出常量 + 本地 `SlotMap` 扩充 + 防御性 `slots` 缺失兜底）
- `src/client/index.ts`（追加 `slots` 注入 + 调用注册）
- `tests/client/greeting.test.ts`（新增，边界 4/5、11/12、17/18、22/23 + wrap-around）

**peerDep 推迟原因**：npm 上的 `@deepseek-ai/dsh-client-ui-conversation@0.1.2-alpha.5`（9/2 发布）不含 `conversation.hero.headline` slot，故不添加 peerDependency（ADR-0033 依赖项推迟到宿主发布含 slot 的版本）。改用本地 `declare module` 扩充 `SlotMap` 同键，并对 `ctx.slots` 做存在性兜底；文件头注释已写明 SWITCH 切换条件（宿主发布后改 import 真实类型包、删本地扩充）。插件缺席/宿主回落均不空白标题。

**验收**：`npm run typecheck` ✓ / `npm test`（646 全过）✓ / `npm run build`（host+client 双半区）✓ / `npm run verify`（24 项）✓。

**遗留风险**：1) 运行时按字符串键占用，宿主未实际声明该 slot 时 occupant 不渲染（无副作用，回落原文案）——待宿主发布含 slot 版本后联调确认；2) `ClientContext.slots` 类型非空，兼容性兜底靠运行时 cast，切换真实类型后此 cast 可移除。
