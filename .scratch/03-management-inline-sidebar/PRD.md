# PRD — management-inline-sidebar（管理界面内嵌侧边栏作为可折叠 section）

Status: resolved
来源: grill 会话（jxx-grill-with-memorial）+ ADR-0004 + CONTEXT.md + memorial 002
状态: 已实施（本 PRD 为事后补文档）

---

## 问题陈述

用户面临两个问题：

1. **管理界面打开后无法收起** — 点击侧边栏「进入管理界面」按钮后，管理面板出现在右上角，但没有任何关闭路径：无 X 关闭按钮、无 ESC 监听、无遮罩点击关闭。面板内部的「折叠」按钮只是把内容区藏起来，标题栏仍常驻右上角，用户直觉上"没收起来"。根因：`setManagementVisible` 全仓库只有 `true` 调用无 `false`，`ManagementUI` 组件无 `onClose` prop。

2. **管理界面位置与入口割裂** — 入口在左侧侧边栏的特效开关区域底部，打开后 UI 跳到右上角固定浮层，与特效开关在空间上分离。用户期望"在特效开关处做折叠"，即管理界面应与特效开关同处左侧侧边栏，可折叠展开。

## 解决方案

将管理界面从右上角 `position: fixed` 浮层**迁移到左侧侧边栏 `SettingsCard` 内**，作为第三个可折叠 section，与皮肤开关、特效开关并列。三个 section 各自独立折叠把手，互不影响。侧边栏展开宽度从 320px 加宽到 380px 以容纳管理界面内容。

用户点击 section 标题栏（或键盘 Enter/Space）切换折叠/展开。特效开关 section 默认展开（常用），管理界面 section 默认折叠（不常用且内容多）。管理界面 section 展开时内嵌导入面板 + 已导入列表，section body 内滚动以防长列表撑长侧边栏。

## 用户故事

1. 作为用户，我想要管理界面能收起，以便不永久遮挡主内容区
2. 作为用户，我想要管理界面在特效开关旁边（同处左侧侧边栏），以便入口与面板空间连续
3. 作为用户，我想要点击 section 标题栏切换折叠/展开，以便快速切换显隐
4. 作为用户，我想要键盘 Enter/Space 也能切换折叠，以便键盘可访问性
5. 作为用户，我想要折叠把手有 `aria-expanded` 属性，以便屏幕阅读器识别展开状态
6. 作为用户，我想要折叠态视觉是"一行标题栏 + ▸ 把手"，以便直觉识别可展开
7. 作为用户，我想要特效开关 section 默认展开，以便常用设置立即可见
8. 作为用户，我想要管理界面 section 默认折叠，以便侧边栏展开时不过长
9. 作为用户，我想要皮肤开关 section 默认展开，以便皮肤总开关立即可见
10. 作为用户，我想要管理界面 section 展开时显示导入面板 + 已导入列表，以便执行素材导入与查看
11. 作为用户，我想要管理界面 section body 内滚动（长列表），以便列表不撑长整个侧边栏
12. 作为用户，我想要侧边栏整体兜底滚动，以便三 section 都展开且内容很长时仍可访问底部
13. 作为用户，我想要右上角不再出现管理浮层，以便消除位置割裂
14. 作为用户，我想要侧边栏内不再有「进入管理界面」按钮，以便管理界面直接在侧边栏内折叠展开
15. 作为用户，我想要 section 折叠/展开瞬时切换无动画，以便操作响应即时
16. 作为用户，我想要侧边栏加宽以容纳管理界面内容，以便导入面板/列表不溢出
17. 作为用户，我想要 prefers-reduced-motion 下动效全关，以便无障碍
18. 作为用户，我想要折叠把手 :focus-visible 有金描边，以便键盘焦点可见

## 实现决策

- **ADR-0004**：管理界面内嵌侧边栏作为可折叠 section，取代右上角固定浮层。详见 `docs/adr/0004-management-inline-sidebar-section.md`。
- **三 section 独立折叠**：`SettingsCard` 内三个 section（皮肤开关 / 特效开关 / 素材管理）各自独立折叠把手，互不影响。折叠状态在 `SettingsCard` 内用三个 `useState` 管理。
- **侧边栏加宽**：展开宽度 320px → 380px（`max-width: 90vw` 保留），容纳管理界面内容（原 `ManagementUI` 宽 360px）。
- **默认折叠态**：皮肤开关 section 展开 / 特效开关 section 展开 / 管理界面 section 折叠。
- **折叠态视觉**：一行标题栏（标题 + ▸/▾ 把手），accordion 模式。折叠时 section body 不渲染（条件渲染），瞬时切换无过渡动画。
- **滚动策略**：管理界面 section body `max-height: 50vh` + `overflow-y: auto`（section 内滚动）；侧边栏整体 `height: 100vh` + `sidebarBody` `overflow-y: auto` 兜底（三 section 都展开时侧边栏整体滚动）。
- **入场动画移除**：原 `ManagementUI` 的 `panel-in` 350ms translateY 动画移除（D9，用户选"不需要了"）。section 展开/折叠瞬时切换。
- **`RootApp` 状态简化**：移除 `managementVisible` + `handleOpenManagement`。`RootApp` 只渲染 `CharacterOverlay` + `SidebarEntry`。
- **`ManagementUI` 重构为无壳 section 内容**：移除 `visible` prop、`collapsed` 状态、`.panel`/`.header`/`.collapseBtn` 浮层壳。只保留 `ImportPanel` + `AssetList` + `refreshTick` 编排逻辑，用 `.body` 容器包裹。
- **「进入管理界面」按钮移除**：`SettingsCard` 不再有 `onOpenManagement` prop 和底部按钮。管理界面直接在侧边栏内折叠展开。
- **section header 可访问性**：用 `<div role="button" tabIndex={0} aria-expanded onKeyDown>`（Enter/Space 触发），把手是 `<span aria-hidden="true">` 视觉指示（▸/▾），非独立 button。`:focus-visible` 用 `--jx-gold` 描边。
- **CSS Module 样式**：`sidebar-settings.module.css` 新增 `.sectionHeader`/`.sectionToggleBtn`/`.sectionBody`/`.managementBody`；移除 `.managementSection`/`.managementButton`。`management.module.css` 移除 `.panel`/`.header`/`.title`/`.collapseBtn`/`panel-in`，保留 `.body` + ImportPanel/AssetList 内容样式。

## 测试决策

- **Seam B：手测 + 构建验证，不写自动化测试**。
- **理由**：本次是 UI 重组无新逻辑，折叠状态是纯 `useState` toggle，组件测试引入 `@testing-library/react` 的成本高于收益。项目现有测试先例均为纯逻辑/API 测试（`tests/client/warp-controller.test.ts`、`tests/host/import-api.test.ts`、`tests/host/asset-routes.test.ts`），无 React 组件渲染测试先例。
- **自动化验证**：`npm run build`（host/client 双半区构建通过）+ `npm run verify`（21 项发布前验收全绿）。
- **手测 checklist**（PRD 附录）：
  - [ ] 侧边栏展开宽度 380px
  - [ ] 三 section 各自折叠把手（皮肤/特效/管理）
  - [ ] 皮肤/特效默认展开，管理默认折叠
  - [ ] 点击 section header 切换折叠/展开
  - [ ] 键盘 Enter/Space 切换折叠/展开
  - [ ] Tab 能聚焦 section header，:focus-visible 金描边
  - [ ] 管理界面 section 展开时显示 ImportPanel + AssetList
  - [ ] 管理界面 section body 内滚动（长列表时）
  - [ ] 三 section 都展开 + 内容很长时侧边栏整体滚动
  - [ ] 右上角无残留浮层
  - [ ] 「进入管理界面」按钮已移除
  - [ ] prefers-reduced-motion 下无动效
  - [ ] 深浅双主题下样式正确

## 超出范围

- **D7：皮肤设置挪进 DSH 宿主全局设置面板** — 暂缓。事实查证确认 `ctx.settings` 存在（`@deepseek-ai/dsh-settings` 包），但宿主全局设置面板插槽未知（宿主仓库 `E:\work\sp\deepseek-harness` 不可访问）。待宿主可访问后再定落地形态（仅迁移存储层 / UI 也挪进宿主面板）。
- **D8：项目定位重构为"皮肤插件 + 多插件管理"** — 暂缓。保持 ADR-0001 单插件定位。待后续需求明确再启。
- **D9 与 DESIGN.md §6 动效令牌的潜在冲突** — 当前按用户"不需要动画"定瞬时切换，与 DESIGN.md §6「布局 200ms」令牌不一致。若需保持动效一致性，可改为 200ms `max-height` 过渡。本次不调整。

## 补充说明

- **ADR**：`docs/adr/0004-management-inline-sidebar-section.md`（已回写全局）。
- **CONTEXT.md 术语**：新增「侧边栏入口」「设置卡」「管理界面」三个术语（已回写全局）。
- **memorial**：`docs/memorial/002-ui-restructure-and-plugin-reorg/`（grill 全过程记录 + sub-task/001 宿主设置 API 查证结果）。
- **构建产物**：`lib/index.js` 167.8 KB（host 半区）、`lib/client.js` 97.9 KB（client 半区，已内联 CSS）。
- **本次改动文件**：`sidebar-settings.module.css`、`management.module.css`、`ManagementUI.tsx`、`SettingsCard.tsx`、`SidebarEntry.tsx`、`index.ts`。
