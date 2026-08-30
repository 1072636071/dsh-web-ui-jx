# 壁纸打标 rAF 批处理 + 廉价前置过滤

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 流式输出时壁纸打标不再阻塞主线程——`MutationObserver` 回调经 `requestAnimationFrame` 合并 + 微批去重；元素先用 `offsetHeight`/`clientHeight` 廉价前置过滤，只对通过者做 rect + computedStyle；观察范围从 `document.body` 收窄（`#root` 或加 depth/数量上限）。

**验收标准：**

- [x] `handleSurfaceMutations` 改 rAF 合并 + 微批去重
- [x] `isWallpaperSurface` 增加廉价前置过滤
- [x] 观察范围收窄（`#root` 或 depth 上限）
- [x] `welcome-backdrop.test.ts` 扩展 rAF 批处理断言（新增 observer batching describe，4 用例全绿）
- [x] 视觉回归覆盖暗/亮两主题（ADR-0024/0027 中和规则不改变）——playwright 真实浏览器独立复刻页（注入实际中和规则）暗/亮双主题截图核验：不透明表面被中和为透明、壁纸透出，两主题均成立；jsdom 测试锁定规则文本与作用域。宿主全量观感留待上线门禁截图复核

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮复审标准/spec 双维度零发现项；工单置 `done`，随 M2 里程碑提交。
- 2026-08-30（实现）：`welcome-backdrop.ts`——① `handleSurfaceMutations` 改 Set 积累 + `scheduleSurfaceBatch` rAF 合并（同帧多批 mutation 一次批处理；无 rAF 环境同步兜底；`stopSurfaceObserver` 取消除残留批）；② `isWallpaperSurface` 增加 `offsetHeight` 廉价前置过滤，不达标跳过 rect/computedStyle；③ 观察范围保留 body（portal 浮层/popper 直挂 body 层，收窄到 #root 会漏）但增量扫描加 `MAX_SURFACE_SCAN_DEPTH=12` / `MAX_INCREMENTAL_SCAN_NODES=1024` 上限（`walkElements` 改 BFS 浅层优先）。中和规则语义零改动。`welcome-backdrop.test.ts` 新增 rAF 批处理/去重/摘标/前置过滤 4 用例 + 既有表面用例适配 offsetHeight seam；33 项全绿。
- 来源：PRD 19 候选 H1；证据见 memorial 017 archived `index.html`（welcome-backdrop.ts:273 全子树观察；:277-287 无防抖；:131-151 逐元素 rect+computedStyle+closest）。
- 触及 ADR-0024/0027 视觉契约，改完必须重测视觉。
