# SettingsCard 三 section 折叠把手 + 内嵌 ManagementUI + 移除 onOpenManagement 链路

**Status:** resolved

**Blocked by:** 01, 02

**构建内容：** SettingsCard 重构为三个独立可折叠 section（皮肤开关 / 特效开关 / 素材管理），各自折叠把手（点击标题栏或键盘 Enter/Space 切换）。皮肤/特效 section 默认展开，管理界面 section 默认折叠；展开时内嵌 ManagementUI（ImportPanel + AssetList），section body 内滚动。移除 SettingsCard 的 onOpenManagement prop + 「进入管理界面」按钮。SidebarEntry 移除 onOpenManagement prop + handleOpenManagement，不再向 SettingsCard 传回调。完成后管理界面在侧边栏内折叠展开，完整功能可用。

**验收标准：**

- [ ] `SettingsCard.tsx` 移除 `onOpenManagement` prop、`handleOpenManagement`、底部「进入管理界面」按钮 section；新增三 section 折叠状态（skinCollapsed/fxCollapsed/mgmtCollapsed，默认 false/false/true）+ 三个 toggle 回调 + `handleSectionKeyDown`（Enter/Space）
- [ ] 三 section 各用 `<div role="button" tabIndex={0} aria-expanded onKeyDown>` 标题栏 + `<span aria-hidden>` ▸/▾ 把手；折叠时 section body 不渲染（条件渲染，瞬时切换）
- [ ] 素材管理 section 展开时渲染 `<div className={styles.managementBody}><ManagementUI /></div>`
- [ ] 引入 `ManagementUI` 组件
- [ ] `SidebarEntry.tsx` 移除 `onOpenManagement` prop、`handleOpenManagement`；`<SettingsCard />` 不再传回调；更新注释
- [ ] 侧边栏展开后三 section 各自独立折叠把手
- [ ] 皮肤/特效默认展开，管理默认折叠
- [ ] 点击 section 标题栏切换折叠/展开
- [ ] 键盘 Enter/Space + Tab 聚焦 + :focus-visible 金描边
- [ ] 管理界面 section 展开时显示 ImportPanel + AssetList，section body 内滚动
- [ ] 右上角无残留浮层，「进入管理界面」按钮已移除
- [ ] `npm run build` 通过
- [ ] `npm run verify` 21 项全绿

## 评论

- 回写（2026-08-23）：map.md 已记录本票「已实施」，状态行同步补记为 resolved（提交 41d2c77）。

事后补工单（功能已实施）。本工单完成 ADR-0004 的完整功能：管理界面内嵌侧边栏作为可折叠 section。阻塞于 01（section 折叠 CSS 基础）+ 02（ManagementUI 无壳可用）。
