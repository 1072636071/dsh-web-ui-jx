# 毛玻璃矩阵收窄 / 高频元素降级

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 毛玻璃只作用于必要区域——经 Profiler 实测定位成本后，收窄 `GLASS_SURFACE_SELECTORS` 或对高频重绘元素（bubble / code / listbox）降级为纯 alpha，滚动与重绘更快。

**验收标准：**

- [x] 先 Profiler 实测确认成本与热点元素，再定收窄/降级方案（依据 memorial 017 M2 证据：blur 为最贵 CSS 属性之一，bubble/code/listbox 为流式/滚动高频重绘面；本环境无宿主实机 Profiler，方案落定为「高频元素降级」并同步修订 ADR-0027 D2）
- [x] 毛玻璃矩阵收窄或高频元素降级落地（listbox/bubble/md-code-block/code 移出模糊矩阵 → `GLASS_DEGRADED_SELECTORS`）
- [x] ADR-0027 D2/D8 视觉契约经暗/亮双主题重测——playwright 真实浏览器独立复刻页暗/亮双主题截图核验：玻璃面板（data-composer-card）有 blur(10px)、气泡（降级元素）无 blur、不透明表面被中和壁纸透出；两主题均成立。宿主全量观感留待上线门禁截图复核
- [x] `welcome-backdrop.test.ts` 回归全绿；全量测试全绿（36 文件 578 项）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮复审标准/spec 双维度零发现项；工单置 `done`，随 M2 里程碑提交。注：验收「先 Profiler 实测」以 memorial 017 证据代偿（本环境无宿主实机 Profiler），已如实披露，上线门禁视觉回归时补关注。
- 2026-08-30（审查修复）：按 `/jxx-code-review` 发现项②——`GLASS_DEGRADED_SELECTORS` 原为「定义了但无运行时消费点」的文档化常量；改为 `export` 并由 `welcome-backdrop.test.ts` import 驱动「不在模糊矩阵」断言（按 `body[data-jx-wallpaper-active] <选择器>` 作用域前缀精确匹配，避免误命中样式注释单词），成为降级集合的单一真相源。测试 33 项全绿。
- 2026-08-30（实现）：`welcome-backdrop.ts`——高频重绘元素 `[role=listbox]` / `[data-chat-anchor-key] [class*=bubble]` / `[class*=md-code-block]` / `code` 移出 `GLASS_SURFACE_SELECTORS` 模糊矩阵，新常量 `GLASS_DEGRADED_SELECTORS` 记录降级集合（纯 alpha = 既有 `--jx-panel-*` 区域 alpha，不注入任何 CSS）；稳定表面（输入卡/sidebar/dialog/menu/tooltip/popper/设置/插件面板/composer-seat + 兜底后缀）保留 blur。ADR-0027 D2 加修订说明。测试：玻璃覆盖断言更新 + 新增「降级元素不在模糊矩阵」断言；全量测试 578 项全绿。
- 来源：PRD 19 候选 M2；证据见 memorial 017 archived `index.html`（welcome-backdrop.ts:182 blur 10px；:187-214 选择器矩阵；:241-246 reduced-motion 降级）。
- 与 19-01 同涉壁纸视觉契约，建议同迭代回归。
