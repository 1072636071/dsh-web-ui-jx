# 面板各部分不透明度滑块

**状态:** 已完成（决策完结；实施见后续工单）

## 诉求（用户原话）
> 现在面板的不透明度也会影响壁纸的展示效果，我想让面板的各个部分，都加不透明调节滑块

## 背景事实（grill 启动前自查）
- 当前 token：`--jx-surface-0..3`（深/浅两主题）均直接消费 `var(--jx-panel-alpha, 1)`，即**全局单一 alpha** 同时作用所有面板。
- 宿主与插件面板统一经 `--dsw-*` remap 到 `--jx-surface-N`：
  - 侧边栏/设置卡：`--dsw-specific-sidebar-bg`(=surface-1)、`sidebar-nav-item-active`(=surface-2)
  - 输入框：`--dsw-specific-input-major`(=surface-1)
  - 会话气泡：`--dsw-specific-bubble`(=surface-2)、`assistant-bubble`(=surface-0)
  - 消息列表行：`--dsw-alias-bg-*`(=surface-0..3)、代码块 `--jx-code-bg`(=surface-0)
  - 宿主其余(顶栏/详情等)：`--dsw-static-neutral-*`(=surface-0..3)
- 背景壁纸层（ADR-0024）已实现：`--jx-panel-alpha` 由 `welcome-backdrop.ts` 写 body，背景开时面板半透明露出壁纸；另有壁纸/面板/压暗三滑杆。

## 决策汇总
- Q2（2026-08-25）：**方案1**——只做可独立区滑块（侧栏/气泡/composer/三卡/附件钮）+ 修 remap bug（`sidebar-bg`→`sidebar-fill`、删无效 `assistant-bubble`）；会话区/顶栏/详情等不可独立区维持全局 alpha，不改动宿主布局。
- Q3（2026-08-25）：五组区域滑块与全局「面板不透明度」=**独立覆盖**——五组各 0-100 直接定该区最终不透明度；全局 `--jx-panel-alpha` 降级为只控未拆分面板（会话区/顶栏/详情/modal 等 surface-0 系）。互不乘积。
- Q4（2026-08-25）：**背景关 → 五组回实色**。五组的半透明仅在「欢迎背景」开启时生效；关闭即移除对应 CSS 变量、区域回不透明（保持 ADR-0024「背景关=纯色」闭环）。用户授权其余决策自行定案。

### 自主定案（2026-08-25 用户授权）
- **五组区域**：侧栏(sidebar-fill)、输入栏(input-major)、用户气泡(bubble)、目标/Todo/Queue 卡(tip,联动)、附件钮(selector)。全部纳入。
- **默认值**：五组默认均 = 50（与现状全局面板默认一致），壁纸模式下观感统一，用户可各自细调。
- **token/实现**：保留 `--jx-surface-0..3`(=--jx-panel-alpha) 控未拆区；五组各自新增独立 alpha 变量并 remap 宿主 specific 变量。深色语义值：
  - `--jx-panel-sidebar-alpha` = 0.5 → `--dsw-specific-sidebar-fill: rgb(18 16 22 / var(--jx-panel-sidebar-alpha))`（修 `sidebar-bg`→`sidebar-fill` bug）
  - `--jx-panel-input-alpha` = 0.5 → `--dsw-specific-input-major`（同 surface-1 色）
  - `--jx-panel-bubble-alpha` = 0.5 → `--dsw-specific-bubble`（surface-2 色）
  - `--jx-panel-tip-alpha` = 0.5 → `--dsw-specific-tip`（surface-1 色）
  - `--jx-panel-selector-alpha` = 0.5 → `--dsw-specific-selector`（surface-1 色）
  - 浅色同构（用浅色 surface 对应 RGB），删除无效 `--dsw-specific-assistant-bubble` remap。
- **运行时**：`welcome-backdrop-config.ts` 增 `jx-backdrop-sidebar/input/bubble/tip/selector` 五持久键(=50)+get/set；`welcome-backdrop.ts` 背景开时写五变量于 body、关时移除（Q4）；`SettingsCard.tsx` 皮肤 section「面板不透明度」下并列「其余面板」+ 五组滑杆，总开关关时禁用。
- **UI 组织**：现有「面板不透明度」（其余面板）+ 新增五组「侧栏/输入栏/用户气泡/目标·Todo·Queue卡/附件钮」滑杆，分组排布。

## 待澄清
（空）

## 追问记录

### 2026-08-25 Q1「按区域拆能做到什么程度」调查结果（sub-task/001 已闭环）
来源：`docs/memorial/011-panel-opacity-per-part/sub-task/001-host-panel-regions.md`（结论段），宿主工程 `E:\work\sp\deepseek-harness`。

- **宿主按区域已有 `--dsw-specific-*`**（design-platform.css:235-245/327-337 宿主自持）：`sidebar-fill / bubble / input-major / tip / selector / menu / sidebar-nav-item-*`。
- **可独立调 alpha 的区域**：左侧导航列/文件树(sidebar-fill)、用户消息气泡(bubble)、底部 composer 输入卡(input-major)、目标/Todo/Queue 三卡(tip，三者同 token 联动)、composer 附件钮(selector)。
- **不可独立（只能按层级/全局/字面量）**：会话区/顶栏/右详情列(均 alias-bg-base=surface-0)、modal/设置面板体(layer-2)、菜单(specific-menu=layer-3)、tooltip(alias-tooltip-bg)、toast(alias-button-contrast-fill)、HoverCard(写死 hex)；助手气泡宿主仅定义 `bubble-highlight` 且无组件消费，方案1 无抓手。

- **重大事实（可能解释壁纸/半透明观感残留）**：插件 `jiangxiao.css:181/187` remap 名有误——`--dsw-specific-sidebar-bg` 宿主真名是 `sidebar-fill`（宿主侧栏从未被皮肤化/半透明化）；`--dsw-specific-assistant-bubble` 宿主根本不存在（死 remap）。`jiangxiao.css:132-137` 的 static-neutral-0..3/bluish-0..3 也是捏造名，宿主 module.css 无任何 `background:--dsw-static-neutral*` 直接消费点。

- **最小改动路径**：先修 remap 真名（sidebar-bg→sidebar-fill、删 assistant-bubble），再为 `sidebar-fill / input-major / bubble / tip / selector` 各建独立 alpha（不再共用全局 `--jx-panel-alpha`）；会话区/详情需按列 remap alias-bg-base（成本高，二期）；modal/设置/菜单维持按层级 surface-2/3。

## 待澄清
（空）