# ADR-0004：管理界面内嵌侧边栏作为可折叠 section（取代右上角固定浮层）

- 状态：accepted
- 日期：2026-08-18
- 决策者：姜晓 + grill 会话

## 上下文

当前 `ManagementUI` 是右上角 `position: fixed; top:16px; right:16px` 浮层（`src/client/styles/management.module.css:21-39`），由 `RootApp.managementVisible` 控制（`src/client/index.ts:57-63`）。

存在两个问题：

1. **无法收起** — `setManagementVisible` 全仓库只有 `setManagementVisible(true)` 被调用一次（`index.ts:62`），**`setManagementVisible(false)` 从未被调用**。`ManagementUI` 组件无 `onClose` prop、无 X 按钮、无 ESC 监听、无遮罩点击关闭（对比 `SidebarEntry` 三者俱全）。内部 `collapsed` 状态只是"折叠成标题栏"，`.panel` + `.header` 仍常驻右上角，用户直觉上"没收起来"。
2. **位置割裂** — 入口在左侧 `SidebarEntry` 展开后的 `SettingsCard` 底部「进入管理界面」按钮，打开后 UI 跳到右上角，与特效开关在空间上分离。用户期望"在特效开关处做折叠"。

## 决策

将 `ManagementUI` 从右上角固定浮层**迁移到左侧 `SidebarEntry` 展开后的 `SettingsCard` 内**，作为独立 section：

1. `SettingsCard` 内三个 section 依次：**皮肤开关** / **特效开关**（可折叠）/ **管理界面**（可折叠）。各自独立折叠把手，互不影响。
2. 管理界面 section 展开时内嵌 `ImportPanel` + `AssetList`。
3. 侧边栏展开宽度 `320px → 380px`（`max-width: 90vw` 保留），容纳管理界面内容（原 `ManagementUI` 宽 360px）。
4. 移除右上角 `position: fixed` 浮层模式 + `RootApp.managementVisible` 状态 + `setManagementVisible` 调用。
5. 移除 `SettingsCard` 底部「进入管理界面」按钮（改为管理界面 section 的折叠把手）。

## 后果

**正面**

- 关闭交互与 `SidebarEntry` 一致（折叠把手），无需补 X/ESC/遮罩三套关闭路径。
- 入口与面板同处左侧，空间连续，符合"在特效开关处做折叠"的用户直觉。
- `RootApp` 状态简化：移除 `managementVisible` + `handleOpenManagement`。

**负面**

- 侧边栏展开后内容变长（特效 + 管理界面），需滚动策略（见后续 grill）。
- `ImportPanel`/`AssetList` 内宽从 360px 压缩到侧边栏内容区宽度，需验证 zip 路径行、AssetList 项不溢出。
- `ManagementUI` 的 `panel-in` 入场动画（350ms translateY）需调整为 section 展开动画或移除。

## 替代方案（被否决）

- **保留右上角浮层 + 补全关闭路径（X + ESC + 遮罩）** — 改动最小，但用户明确要求"做到特效开关这边做个折叠"，位置割裂问题不解决。
- **在特效开关区域加"收起管理界面"按钮（远程关闭右上角浮层）** — 关闭交互跨空间，直觉性差。
- **让特效开关本身成为 ManagementUI 的折叠把手** — 跨组件状态同步 + 视觉重定位动画，违反"侧边栏=设置/入口，右上角=管理面板"的清晰分工，改动大收益小。

## 关联

- 取代 `ManagementUI` 右上角浮层模式（`src/client/components/ManagementUI.tsx` + `src/client/styles/management.module.css`）。
- 影响 `SidebarEntry`、`SettingsCard`、`RootApp`（`src/client/index.ts`）。
