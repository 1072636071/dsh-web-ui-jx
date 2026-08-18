# Memorial 002 — UI 重组与插件定位再梳理

**状态**：已完成（grill + 实施均完成）
**创建**：2026-08-18 21:56
**slug**：ui-restructure-and-plugin-reorg

---

## 诉求

用户原话（三段，按提出顺序）：

1. > 进入管理界面后，管理界面没办法收起来了。还有管理界面为啥要在右上角出现，不能在特效开关这里做一个折叠么。

2. > 还有我想把对皮肤的设置放在挪到 设置里。

3. > 还有当前项目我想整理做为皮肤插件，后面还有其他的插件一起管理。

---

## 追问记录

### 2026-08-18 21:40 — 诉求 1：管理界面收起 + 位置

**事实查证**（自己查代码，非问用户）：
- `src/client/index.ts:62` 只有 `setManagementVisible(true)`，全仓库无 `setManagementVisible(false)` 调用 → 一旦打开永不清零。
- `ManagementUI.tsx` 无 `onClose` prop、无 X 按钮、无 ESC 监听、无遮罩点击关闭（对比 `SidebarEntry` 三者俱全）。
- 内部 `collapsed` 状态只是"折叠成标题栏"，`.panel` + `.header` 仍常驻右上角 `position: fixed; top:16px; right:16px`。
- `ManagementUI` 宽 360px（`management.module.css:27`）；侧边栏展开宽 320px（`sidebar-settings.module.css:128`）。
- 入口在 `SettingsCard` 底部「进入管理界面」按钮（`SettingsCard.tsx:162-172`），打开后 UI 跳到右上角，与特效开关空间分离。

**Q1**：「收起」的语义？
**A1**：用户答「我想把管理界面做到 特效开关 这边做个折叠，特效开关也折叠。」→ 方向变更：不是补关闭路径，而是迁移位置 + 加折叠。

**Q2**：管理界面移到左侧后，与特效开关在 SettingsCard 内怎么组织？
**A2**：用户选「两个独立 section 各自折叠」。

**Q3**：宽度处理（管理界面 360px vs 侧边栏 320px，差 40px）？
**A3**：用户选「侧边栏加宽到 380px」。

**Q4**：section 默认折叠态？
**A4**：用户选「特效展开 / 管理折叠」。

**Q5**：折叠态视觉形态？
**A5**：用户选「一行标题栏 + ▸ 把手」。

**Q6**：滚动策略？
**A6**：用户选「section 内滚动 + 侧边栏兜底」。

### 2026-08-18 21:50 — 诉求 2：皮肤设置挪到"设置"里

**Q7**：「设置」具体指哪里？（当前皮肤开关已在 SettingsCard 第一个 section）
**A7**：用户选「挪进 DSH 宿主全局设置面板」。

**事实查证（被中断，待重启）**：DSH 宿主是否暴露设置注册 API？需查：
- 当前 host 半区 ctx 上可用的 API 列表
- 宿主仓库 `E:\work\sp\deepseek-harness` 是否可访问、是否有设置面板注册入口
- 当前皮肤开关生效机制（`src/client/skin.ts`）

### 2026-08-18 21:52 — 诉求 3：项目定位为皮肤插件 + 多插件管理

**待 grill**：尚未开始。核心未知：
- "皮肤插件"定位 vs 当前 ADR-0001（独立 DSH Bundle 插件，实现姜晓角色素材 UI）的关系
- "其他插件一起管理"的形态：本仓库变多插件容器？还是多个独立插件 + 外部管理器？
- 是否影响当前 ADR-0004 的实施（UI 重组是否仍按计划进行）

---

## 决策汇总

| # | 决策 | 状态 | ADR |
|---|------|------|-----|
| D1 | 管理界面从右上角 fixed 浮层迁移到左侧 SettingsCard 内作为独立 section | 已定 | ADR-0004（已回写全局 `docs/adr/`） |
| D2 | SettingsCard 三 section（皮肤/特效/管理）各自独立折叠把手 | 已定 | ADR-0004 |
| D3 | 侧边栏展开宽度 320→380px（max-width 90vw 保留） | 已定 | ADR-0004 |
| D4 | 默认折叠态：特效开关 section 展开 / 管理界面 section 折叠 | 已定 | — |
| D5 | 折叠态视觉：一行标题栏 + ▸ 把手（accordion 模式） | 已定 | — |
| D6 | 滚动策略：管理界面 section body max-height + overflow-y auto，侧边栏整体 max-height calc(100vh - 32px) 兜底 | 已定 | — |
| D7 | 皮肤开关从 SettingsCard 移出，挪进 DSH 宿主全局设置面板 | **暂缓**（选 (C)，先完成 ADR-0004；宿主设置面板插槽未知，待宿主可访问再定） | — |
| D8 | 项目定位重构为"皮肤插件 + 多插件管理" | **已定：暂缓不动**（用户"先不动了"，保持 ADR-0001 单插件定位） | — |
| D9 | 入场动画：移除原 `panel-in` 350ms translateY，section 展开/折叠瞬时切换（无过渡） | 已定 | — |

---

## 待澄清

（已清零）

- ~~DSH 宿主是否暴露设置注册 API~~ → 已查证（sub-task/001），ctx.settings 存在，宿主设置面板插槽未知。D7 用户选暂缓。
- ~~多插件架构形态~~ → D8 用户选暂缓不动。
- ~~入场动画处理~~ → D9 用户选"不需要了"，移除 panel-in，瞬时切换。
- **注**：D9 与 DESIGN.md §6「布局 200ms」动效令牌存在潜在冲突。实施时若需保持动效一致性，可改为 200ms max-height 过渡；当前按用户"不需要了"定瞬时切换。

---

## 调查工单

### sub-task/001 — DSH 宿主设置 API 查证（已完成）

**结论**：
- `ctx.settings` 存在（`@deepseek-ai/dsh-settings` 包，declaration merging 注入 Context），API：`register`/`describe`/`get`/`update`/`replace`/`mutate`。
- client 侧有 `bindSettingsScope`（浏览器设置镜像，`getSnapshot`/`subscribe`/`set`/`unset`）。
- 当前皮肤开关走纯 `localStorage('jx-skin')`，生效靠增删 `body[data-dsh-jiangxiao]` 属性。
- **宿主全局设置面板插槽未知** — 宿主仓库 `E:\work\sp\deepseek-harness` 不可访问（E 盘不存在），无法确认是否有 `settings-panel` 插槽。node_modules 中未发现 ui-layout 等 shell 包。

**D7 落地形态**（待 grill）：
- (A) 仅迁移存储层：UI 留插件 SettingsCard，读写改用 `ctx.settings`。立即可行，不依赖宿主 shell。
- (B) UI 也挪进宿主全局设置面板：需 `ctx.slots.register` + 宿主声明插槽。若宿主无插槽需扩展宿主（超出本仓库范围）。
- (C) 暂缓 D7，等宿主可访问后再定。

---

## 备注

- 本 memorial 由 `jxx-grill-with-docs` 会话中途切换到 `jxx-grill-with-memorial` 迁移而来。
- ADR-0004 已在前身技能（grill-with-docs）下直接回写到全局 `docs/adr/0004-management-inline-sidebar-section.md`，并已更新全局 `CONTEXT.md`。本 memorial 的 `adr/` 内放副本仅作记录。
- 全局 `CONTEXT.md` 已新增术语：侧边栏入口、设置卡、管理界面（ADR-0004 引用）。
