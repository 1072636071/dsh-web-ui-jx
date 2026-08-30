# fall 飘落阴影实测与消除

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 飘落特效走纯合成层路径——若实测 `drop-shadow` 与 WAAPI 动画叠加确有栅格化成本，把阴影烘进现有 SVG data-uri 素材，去掉 CSS `filter: drop-shadow`。

**验收标准：**

- [x] 先实测确认成本（实测结论：**静态 drop-shadow 不阻碍纯合成层路径**，无实施成本 → 按工单规则关闭本单、不硬上）
- [ ] 若实施：`fx.css` 动画元素上无 `filter: drop-shadow`，阴影已烘进 SVG 素材——不实施，本项 N/A
- [ ] 飘落视觉与现状一致（含暗/亮两主题）——不实施，视觉零改动
- [x] 全量测试全绿（36 文件 578 项）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮复审标准/spec 双维度零发现项；实测关闭结论被 spec 复审确认为站得住；工单置 `done`，随 M2 里程碑提交。
- 2026-08-30（实测驱动，关闭不实施）：用 playwright 真实 Chrome 跑 100 片叶子（真实量 8 片的 12.5 倍）对照基准页（`fall-bench.html`，A=带 `filter: drop-shadow`、B=不带），CDP `Performance.getMetrics` 4 秒动画窗：两变体 **Script/Layout/Style/Task 主线程耗时均为 0.0ms**；rAF 90 帧采样 A 平均 7.52ms（≈133fps）、B 平均 6.05ms（≈165fps），**两变体零掉帧**。结论：静态 filter 只在一层栅格化时算一次，transform/opacity 动画仍走合成线程；真实 8 片叶子差异不可感知。L2 推断不成立 → 按「未实测则不实施」规则关闭本单，`fx.css` 保持现状。
- 来源：PRD 19 候选 L2；证据见 memorial 017 archived `index.html`（fx.css:90/99；fall.ts:118/122-127）。
- 本单为「实测驱动」：推断成立才动手。
