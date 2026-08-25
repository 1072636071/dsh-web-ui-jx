# ADR-0025 — 面板区域独立不透明度（按区域滑块）

**状态**: 已接受（2026-08-25 grill 会话定案，决策完结）

## 背景

ADR-0024 引入欢迎背景整页壁纸层，面板半透明由全局 `--jx-panel-alpha` 统一驱动：`--jx-surface-0..3` 全部消费 `var(--jx-panel-alpha, 1)`，宿主 via `--dsw-*` remap 到 surface，所有面板同步半透明。用户希望**面板的各个部分各自有滑动不透明滑块**（更好地控制露出壁纸的程度）。

调研（sub-task/001）：宿主在 `design-platform.css` 已按**区域**定义 `--dsw-specific-*` 族（`sidebar-fill / input-major / bubble / tip / selector / menu / sidebar-nav-item-*`），这些区域可被插件单独 remap；而**会话区/顶栏/右详情列**只用 `--dsw-alias-bg-base`(→surface-0)、**modal/设置体**用 `--dsw-alias-bg-layer-2`，只能按层级/全局。另发现既有 bug：插件 remap 名 `--dsw-specific-sidebar-bg` 宿主真名为 `sidebar-fill`（宿主侧栏从未被皮肤化/半透明化），`--dsw-specific-assistant-bubble` 宿主不存在（死 remap）。

## 决策

**D1 — 区域独立 alpha，独立覆盖**：对可独立区（侧栏 / 输入栏 / 用户气泡 / 目标·Todo·Queue 卡 / 附件钮）各新增专属 alpha 变量并 remap 对应宿主 `--dsw-specific-*`；各面板 0–100 独立定最终不透明度，不再共用全局 `--jx-panel-alpha`。全局 `--jx-panel-alpha` 降级为只控未拆分面板（surface-0 系：会话区/顶栏/详情等）。否决「全局×区域」乘积模型（值相乘不直观）与「全取代 6 组」方案（设置卡过挤）。

**D2 — 半透明仅背景开时生效**：五组 alpha 变量仅当「欢迎背景」开启时由运行时写于 body；关闭即移除、区域回不透明，保持 ADR-0024「背景关=纯色」闭环。

**D3 — 修 remap 真名**：`--dsw-specific-sidebar-bg`→`--dsw-specific-sidebar-fill`；删除无效 `--dsw-specific-assistant-bubble` 映射。宿主 specific 变量名以 `design-platform.css` 定义为准，不得捏造。

**D4 — 默认值 50**：五组默认 alpha 均 = 50%，与现状全局面板默认一致，壁纸模式下观感统一。

## 后果

- 设置卡皮肤 section 从 3 滑杆扩为「其余面板」+ 5 组 = 6 滑杆（各独立持久化于 `localStorage('jx-*')`）。
- 修 `sidebar-fill` 后宿主侧栏首度真正皮肤化/可半透明——无壁纸时侧栏由宿主 bluish 变为 jx surface 观感，属预期。
- 会话区/顶栏/详情等仍未独立（alias-bg-base 层级耦合），拆列待二期。
- 目标/Todo/Queue 三卡共用 `tip` 变量，单滑杆联动；期望分别控制需宿主拆分，暂不推进。
- 五组 alpha 在背景关时对面板无效（回实色），与「壁纸淡影纯透明」场景的用户预期一致。