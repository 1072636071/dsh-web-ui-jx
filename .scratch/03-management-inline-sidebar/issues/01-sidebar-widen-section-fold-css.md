# 侧边栏加宽 + section 折叠 CSS 基础设施

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 侧边栏展开宽度从 320px 加宽到 380px（max-width 90vw 保留），为内嵌管理界面 section 预留空间。新增可折叠 section 样式基础设施（.sectionHeader 可点击标题栏 / .sectionToggleBtn ▸/▾ 视觉指示 / .sectionBody 内容区 / .managementBody 带滚动的管理界面容器）。移除旧的「进入管理界面」按钮样式（.managementSection / .managementButton）及 prefers-reduced-motion 中对应引用。本工单仅改 CSS，不触碰组件逻辑，完成后新样式存在但未被任何组件消费，构建通过。

**验收标准：**

- [ ] `sidebar-settings.module.css` 中 `.sidebarExpanded` 宽度改为 380px
- [ ] 新增 `.sectionHeader`（含 :hover / :focus-visible 金描边）/ `.sectionToggleBtn` / `.sectionBody` / `.managementBody`（max-height 50vh + overflow-y auto + 金描滚动条）样式
- [ ] 移除 `.managementSection` / `.managementButton` 及其 :hover / :active / :focus-visible
- [ ] `prefers-reduced-motion` 块中移除 `.managementButton` 引用
- [ ] `npm run build` 通过（host/client 双半区）
- [ ] `npm run verify` 21 项全绿

## 评论

- 回写（2026-08-23）：map.md 已记录本票「已实施」，状态行同步补记为 resolved（提交 41d2c77）。

事后补工单（功能已实施）。本工单为预重构：先铺设 section 折叠 CSS 基础设施，为工单 02/03 的组件改动做准备。
