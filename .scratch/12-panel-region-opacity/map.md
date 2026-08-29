# map — 面板区域独立不透明度

## 已做决策
- MD-011 grill 定案 → 决策汇总 → **ADR-0025**（已回写 `docs/adr/` 与 `CONTEXT.md`）。
- 方案1：只做可独立区滑块 + 修 remap bug；不改宿主布局。
- 独立覆盖：五区域各 0–100 定最终值，全局 `--jx-panel-alpha` 降级只控未拆面板（会话区/顶栏/详情）。
- 半透明仅「欢迎背景」开时生效，关则回实色。
- 默认 50；修 `sidebar-bg`→`sidebar-fill`、删无效 `assistant-bubble`。
- **已实施完结（commit e34ec89，2026-08 回填关单）**：工单 01/02/03 全部 resolved——config 五项 + 双主题 token + remap 修正 + 运行时写/移（welcome-backdrop-config.ts / jiangxiao.css / welcome-backdrop.ts）、设置卡 REGION_ALPHA_UI 数据驱动滑杆组、build/verify/全量测试复验绿（2026-08-27：447 用例）。

## 工单
- **issues/01-region-alpha-model.md**（resolved）：区域 alpha 配置 + CSS token + remap 修正 + 运行时写/移（含测试）。
- **issues/02-region-slider-ui.md**（resolved）：设置卡「其余面板」+ 五根区域滑杆 UI 接线。
- **issues/03-acceptance-verify.md**（resolved）：build / verify / 全量测试绿 + 实机走查。

## 迷雾 / 待办
- 会话区/顶栏/详情独立（alias-bg-base 二次 remap）— 二期。
- modal/设置/菜单按层级（layer-2/3）— 维持。
- 目标/Todo/Queue 三卡分开（宿主 tip 单 token）— 需宿主拆分，暂不推进。