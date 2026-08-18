# Map — 03-management-inline-sidebar

**功能**：管理界面内嵌侧边栏作为可折叠 section（ADR-0004）
**PRD**：`.scratch/03-management-inline-sidebar/PRD.md`
**ADR**：`docs/adr/0004-management-inline-sidebar-section.md`
**memorial**：`docs/memorial/002-ui-restructure-and-plugin-reorg/`
**状态**：已实施（事后补工单）

## 工单拆解

| # | 工单 | 阻塞于 | 状态 |
|---|------|--------|------|
| 01 | 侧边栏加宽 + section 折叠 CSS 基础设施 | 无——可立即开始 | 已实施 |
| 02 | ManagementUI 重构为无壳 section 内容 + 移除右上角浮层渲染 | 01 | 已实施 |
| 03 | SettingsCard 三 section 折叠把手 + 内嵌 ManagementUI + 移除 onOpenManagement 链路 | 01, 02 | 已实施 |

## 关键决策

- **ADR-0004**：管理界面从右上角 fixed 浮层迁移到左侧 SettingsCard 第三个可折叠 section
- **D4**：默认折叠态 — 皮肤展开 / 特效展开 / 管理折叠
- **D5**：折叠态视觉 — 一行标题栏 + ▸ 把手（accordion）
- **D6**：滚动策略 — section body max-height 50vh + overflow-y auto，侧边栏整体兜底
- **D9**：入场动画移除，section 展开/折叠瞬时切换
- **D7 暂缓**：皮肤设置挪进 DSH 宿主全局设置面板（待宿主可访问）
- **D8 暂缓**：项目定位重构为多插件管理（保持 ADR-0001）

## 改动文件

- `src/client/styles/sidebar-settings.module.css`（工单 01）
- `src/client/styles/management.module.css`（工单 02）
- `src/client/components/ManagementUI.tsx`（工单 02）
- `src/client/index.ts`（工单 02）
- `src/client/components/SettingsCard.tsx`（工单 03）
- `src/client/components/SidebarEntry.tsx`（工单 03）

## 验证

- `npm run build`：host 167.8 KB + client 97.9 KB，通过
- `npm run verify`：21 项全绿
