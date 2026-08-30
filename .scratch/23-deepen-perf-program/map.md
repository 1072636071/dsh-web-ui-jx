# 23-deepen-perf-program — 地图

> 程序级协调目录：把 18–21 四个 topic 的 19 张工单统一成 5 个里程碑交付。来源链路：memorial 017（archived）→ to-spec（18–22 五个 PRD）→ to-tickets（19 工单）→ to-milestones（本程序）。

## 涉及的 topic

| Topic | 内容 | 工单 |
|---|---|---|
| 18-perf-hotfix | P0 快速修复 | 01-04 |
| 19-fx-wallpaper-performance | 特效与壁纸性能 | 01-05 |
| 20-cache-network-bundle | 网络缓存与包体 | 01-07 |
| 21-capability-test-coverage | 能力与测试补强 | 01-03 |
| 22-observation-and-disproved | 记录（无工单） | — |

## 里程碑 → 工单

见 `MILESTONES.md` 进度总览：M1（18-01..04）→ M2（19-01..05）→ M3（20-01..04）→ M4（20-05..07）→ M5（21-01..03）。

## 已做决策

- 里程碑按「可独立上线 + 回滚可定」分组，里程碑间严格串行、内可并行。
- 工单状态真相源在各 topic `issues/` 的 `Status:` 行；本程序 `MILESTONES.md` 的 `**状态：**` 行跨 topic 手动维护。
- M4 素材重编码不可逆 → 原件备份 `bak/`（ADR-0012 先例）可还原。
