# ManagementUI 重构为无壳 section 内容 + 移除右上角浮层渲染

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** ManagementUI 组件从右上角 `position:fixed` 浮层（自带 .panel/.header/.title/.collapseBtn 壳 + visible/collapsed 状态）重构为无壳 section 内容组件——只保留 ImportPanel + AssetList + refreshTick 编排逻辑，用 .body 容器包裹。同步移除 management.module.css 的浮层壳样式（.panel/.header/.title/.collapseBtn/@keyframes panel-in）。index.ts 移除 ManagementUI 独立渲染 + RootApp.managementVisible 状态 + handleOpenManagement，RootApp 简化为只渲染 CharacterOverlay + SidebarEntry。完成后右上角浮层消失，ManagementUI 变为待内嵌的 section 内容组件（工单 03 内嵌进 SettingsCard）。

**验收标准：**

- [ ] `ManagementUI.tsx` 移除 `visible` prop、`collapsed` 状态、`handleToggleCollapse`、`.panel`/`.header`/`.title`/`.collapseBtn` 壳；只保留 `refreshTick` + `handleImportComplete` + `<div className={styles.body}>` 包裹 ImportPanel + AssetList
- [ ] `management.module.css` 移除 `.panel`（position:fixed 浮层）/ `.header` / `.title` / `.collapseBtn` / `@keyframes panel-in`；`.body` 改为 section 内容容器（display flex column gap 12px，移除 flex:1 1 auto / overflow-y / padding）；`prefers-reduced-motion` 移除 `.panel` / `.collapseBtn` 引用
- [ ] `index.ts` 移除 `ManagementUI` import、`managementVisible` 状态、`handleOpenManagement`；`RootApp` 只渲染 CharacterOverlay + SidebarEntry；移除 `useState` import（若不再使用）
- [ ] 右上角不再渲染任何管理浮层
- [ ] `npm run build` 通过
- [ ] `npm run verify` 21 项全绿

## 评论

事后补工单（功能已实施）。完成后中间状态：ManagementUI 无壳但未被任何 section 消费，管理界面暂时不可见（等工单 03 内嵌）。构建仍通过（组件存在但未渲染）。
