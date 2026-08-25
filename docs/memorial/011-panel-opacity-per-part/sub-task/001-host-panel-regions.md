# 调查：宿主面板区域 ↔ --dsw-* 变量映射（方案1可行性）

**状态:** 已完成

## 任务描述
评估「方案1：面板各区域独立不透明度滑块」能做到什么程度。需要摸清 DSH 宿主 web UI 的**面板区域划分**与 **--dsw-\* 语义变量的实际绑定**，判断哪些区域可通过插件 remap 单独调 alpha、哪些做不了。

## 背景（必读）
- 插件 dsh-web-ui-jx 通过 `jiangxiao.css` 在 `body[data-dsh-jiangxiao]` 下把宿主变量 remap 到自己的 `--jx-surface-0..3`，目前所有 surface 共用一个 alpha（`var(--jx-panel-alpha, 1)`），即所有面板统一半透明。
- 宿主的变量三族（见 `packages/client/ui-theme/src/styles/design-platform.css`）：
  - `--dsw-static-neutral-*`：固定色阶（-900 深 / -00 浅）。
  - `--dsw-alias-bg-base/layer-1/2/3`：**按层级**的通用背景（宿主默认全 bluish-00，我们 remap 成 surface-0..3）。
  - `--dsw-specific-*`：**按区域**的专属变量（已知有 sidebar-bg / input-major / bubble / assistant-bubble / sidebar-nav-item-active / sidebar-nav-item-hover）。
- 插件当前 remap（jiangxiao.css 内）：
  - `--dsw-static-neutral-0..3` 与 `--dsw-alias-bg-(base/layer-1/2/3)` → `--jx-surface-0..3`
  - `--dsw-specific-sidebar-bg → surface-1`；`--dsw-specific-input-major → surface-1`；`--dsw-specific-bubble → surface-2`；`--dsw-specific-assistant-bubble → surface-0`

## 明确问题
1. 宿主 web UI 主要有哪些**面板区域**（如：左侧导航/文件树、顶栏、消息列表/会话区、底部输入栏 composer、右侧详情栏、设置/抽屉、弹窗 modal、会话气泡浮层等）？
2. 每个区域组件**实际消费哪个/哪些 `--dsw-*` 变量**作为背景色？（去 `packages/client/web/src`、`packages/client/ui-*` 各 module.css 里 grep `--dsw-*` 消费点，逐区域归因）
   - 特别注意哪些区域消费 `--dsw-specific-*`（可单独 remap 的），哪些只消费 `--dsw-alias-bg-layer-*` 或 `--dsw-static-neutral-*`（只能按层级/全局调）。
3. `--dsw-specific-*` 定义在宿主哪（design-platform.css 是否定义了 specific-*？还是仅我们插件自造并被宿主组件认领？）——若宿主没定义 specific-* 而组件却消费它，说明这套变量是本插件注入的，需确认宿主组件是否真的引用。

## 期望产出
- 一张映射表：`面板区域 | 消费的 --dsw-* 变量 | 是否可独立调 alpha（仅影响该区域） | 备注`
- 结论段：「方案1 按区域独立滑块」能覆盖到哪几块面板、哪块因层级耦合做不到独立、以及最小可行改动路径。

## 回写要求
把「结论 + 来源（文件路径:行号）+ 完成时间」追加写回**本工单文件**，并把状态改为「已完成」。唯一产出落点即本工单，禁止输出到别处。

---

## 调查结论（已完成 2026-08-25）

宿主工程：`E:\work\sp\deepseek-harness`。以下按「主机三栏布局（ui-layout AppFrame）内的区域」归因，宿主把面板拆成**侧栏列 / 中栏(header+会话+composer) / 右详情列**三大列，另有浮层(mask/modal/menu/tooltip/toast)与设置抽屉。

### 关键发现 0 —— 变量定义位置（问题3 答案）
- `--dsw-specific-*` 全部由宿主在 `packages/client/ui-theme/src/styles/design-platform.css` **完整定义并自持**：亮色 `:235–245`、暗色 `:327–337`。宿主真实 specific 名单：
  `sidebar-fill / bubble / bubble-highlight / input-major / login-input / menu / selector / sidebar-nav-item-hover / sidebar-nav-item-active / sidebar-nav-item-active-accent / tip`。
- **插件发明名映射是「死 remap」**：`jiangxiao.css:181` remap 的是 `--dsw-specific-sidebar-bg`，而宿主侧栏真正消费的是 `--dsw-specific-sidebar-fill`（`AppFrame.module.css:28`、`SidebarRoot.module.css:16`、`WorkspaceBrowser.module.css:319`、`TrajectoryTable.module.css:153`）；`jiangxiao.css:187` remap 的 `--dsw-specific-assistant-bubble` 宿主根本不存在（宿主只定义 `bubble-highlight`，且**无任何宿主组件消费它**）。这俩进不了宿主，只被插件自研 UI（`sidebar-settings.module.css` / `management.module.css` / `session-bubbles.module.css`）认领。
- 同理，`jiangxiao.css:132–137` 的 `--dsw-static-neutral-0..3 / --dsw-static-bluish-0..3` 是插件捏造的色阶名；宿主静态色阶为 `--dsw-static-neutral-bluish-00..1000`。且 grep 证实**宿主 module.css 无任何 `background: ...--dsw-static-neutral*` 直接消费点**——static 只经 alias/specific 间接引用，所以「按 static 全局调」无独立意义。

### 映射表（`面板区域 | 消费的 --dsw-* 背景变量 | 可否独立调 alpha(仅该区) | 备注`）

| 区域 | 消费变量（来源 文件:行） | 独立调 alpha | 备注 |
|---|---|---|---|
| 左侧导航列 / 文件树 | `--dsw-specific-sidebar-fill`（SidebarRoot.module.css:16，AppFrame.module.css:28 wor列，WorkspaceBrowser.module.css:319） | ✅ 可 | 但插件 remap 名写错为`sidebar-bg`，需改真名才生效；侧栏内行 hover 用 `--dsw-alias-interactive-bg-hover` |
| 顶栏（中栏 header） | 无独立 token；header `background: transparent`，透出列底 `--dsw-alias-bg-base`（ConversationRoot.module.css:11、AppFrame.module.css:7） | ❌ 只随全局 | 顶栏随 alias-bg-base（=>surface-0） |
| 消息列表/会话区背景 | `--dsw-alias-bg-base`（ConversationRoot.module.css:11）；会话 hover 用 interactive-hover | ❌ 只随全局 | 会话区整体是 alias-bg-base |
| 用户消息气泡 | `--dsw-specific-bubble`（chat/MessageItem.module.css:22） | ✅ 可 | 插件已 remap =>surface-2 |
| 助手气泡高亮 | 宿主定义 `--dsw-specific-bubble-highlight`（design-platform.css:235/327）但**无宿主消费** | ✗ 无抓手 | 插件欲调「助手气泡」的 `assistant-bubble` 脚本无效；宿主中 assistant 消息内容实际用 `--dsw-alias-markdown-*`/`label-*` |
| 底部 composer 输入卡 | `--dsw-specific-input-major`（skeleton/InputBar.module.css:57） | ✅ 可 | 插件已 remap =>surface-1 |
| composer 附件「+」钮 | `--dsw-specific-selector`（InputBar.module.css:325） | ✅ 可 | 插件未 remap，现落 bluish-60/800 |
| 目标栏 GoalBar | `--dsw-specific-tip`（ui-goal/GoalBar.module.css:31） | ✅ 可 | 插件未 remap |
| Todo 条 | `--dsw-specific-tip`（skeleton/TodoPanel.module.css:29） | ✅ 可 | 与 Goal/Queue 同 token，会联动 |
| Queue 面板 | `--dsw-specific-tip`（queue/QueueDock.module.css:34） | ✅ 可 | 同上 |
| 右键详情列 | `--dsw-alias-bg-base`（DetailsPanel.module.css:11）；代码区 `--dsw-alias-markdown-code-block`(:83) | ❌ 只随全局 | 详情列无 specific 变量 |
| modal 弹窗卡片 | `--dsw-alias-bg-layer-2`（ui-primitives/Modal.module.css:33）；mask `--dsw-alias-bg-mask-1` | ❌ 层级/全局 | 无 specific |
| 设置抽屉面板 | `--dsw-alias-bg-layer-2`（ui-settings-general/SettingsRoot.module.css:82）；mask `bg-mask-1`(:63)；左侧 nav cell hover/active `--dsw-specific-sidebar-nav-item-hover/active`(:143/:147)一律 alias-bg-overlay(QuestionComposer:214) | 面板体仅层级；nav cell 可独立 | 设置抽屉还有 `active-accent`(ui-user-questions/QuestionComposer.module.css:280) |
| 菜单/浮层下拉 | `--dsw-specific-menu`(=`--dsw-alias-bg-layer-3`)（ui-primitives/Menu.module.css:18，及 ui-model-selection/ModelSelect.module.css:87/:152、ui-conversation/ContextMeter.module.css:50 等 8 处） | 仅层级(surface-3) | 随 layer-3 全局 |
| Tooltip | `--dsw-alias-tooltip-bg`（ui-primitives/Tooltip.module.css:18） | 层级/全局 | — |
| Toast | `--dsw-alias-button-contrast-fill`（ui-primitives/Toast.module.css:24） | 全局 | — |
| HoverCard | 组件写死 `--dsw-hovercard-bg:#2C2C2E`（HoverCard.module.css:14/21） | ✗ 不可 | 字面量，插件摸不到 |

### 结论段
「方案1 = 每块面板一个独立 alpha 滑块」**能覆盖的可独立区**（各自消费 specific-*, 可各自 remap alpha）：
**左侧导航列/文件树**（sidebar-fill）、**用户消息气泡**（bubble）、**底部 composer 输入卡**（input-major）、**目标/Todo/Queue 三张卡片**（tip，三者同 token 会联动）、**composer 附件钮**（selector）。

**做不了独立（只能按层级/全局或写死）**：
- 会话区、顶栏、右详情列、boot 页 —— 全是 `--dsw-alias-bg-base`（全局 surface-0），拆滑块必须另建「按列 remap」（如给 DetailsPanel 容器再包一层把 alias-bg-base 改指向），成本高。
- modal、设置抽屉面板体 —— `--dsw-alias-bg-layer-2`（层级）。抽屉的 nav item hover/active 反而有 specific-* 可独立。
- 菜单/浮层 —— `--dsw-specific-menu`=layer-3，层级联动。
- 助手气泡 —— 宿主无被消费的独立变量（bubble-highlight 悬空），方案1 无抓手。
- Tooltip/Toast/HoverCard —— 分别是 alias-tooltip-bg / alias-button-contrast-fill / 写死 hex。

**最小可行改动路径（优先级排序）**：
1. **先修 remap 真名**：`jiangxiao.css` 把 `--dsw-specific-sidebar-bg`→`--dsw-specific-sidebar-fill`（否则宿主侧栏根本没被皮肤化）；删除/修正无效的 `--dsw-specific-assistant-bubble`。
2. 为可独立区各建独立 alpha 变量（不再共用全局 `--jx-panel-alpha`）：`sidebar-fill / input-major / bubble / tip / selector`，每项一个滑杆。
3. 若要覆盖会话区/详情/顶栏，需按列 remap alias-bg-base（工作量最大），建议二期；modal/设置/菜单暂维持按层级的 surface-2/3。

**来源（文件:行号）**：本表已逐条列来源。核心：宿主 specific 定义 `.../ui-theme/src/styles/design-platform.css:235-245 / 327-337`；侧栏消费 `.../ui-sidebar/src/client/SidebarRoot.module.css:16`、`.../ui-layout/src/client/AppFrame.module.css:28`；气泡 `.../ui-conversation/src/client/chat/MessageItem.module.css:22`；composer `.../ui-conversation/src/client/skeleton/InputBar.module.css:57/325`；tip `ui-goal/GoalBar.module.css:31`、`skeleton/TodoPanel.module.css:29`、`queue/QueueDock.module.css:34`；详情 `skeleton/DetailsPanel.module.css:11`；modal `ui-primitives/Modal.module.css:33`；设置 `ui-settings-general/SettingsRoot.module.css:82/143/147`；菜单 `ui-primitives/Menu.module.css:18`；tooltip `Tooltip.module.css:18`、toast `Toast.module.css:24`、hovercard `HoverCard.module.css:14`；插件死映射 `E:\work\sp\dsh-web-ui-jx\src\client\styles\jiangxiao.css:181/187`。