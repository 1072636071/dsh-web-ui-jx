# 18-perf-hotfix — 地图

> 来源：memorial 017（全量盘点）→ PRD 18-perf-hotfix（to-spec）→ 拆单（to-tickets）。

## 目标

P0 快速修复批四件事：`writeJson` 单一实现（01）、素材路由 304 顺序（02）、气泡列 `React.memo`（03）、host 产物纯净复核（04）。

## 阻塞图

全部工单无阻塞，可并行实施、独立验收。

```
01 writeJson 收敛（无阻塞）
02 素材路由 304（无阻塞）
03 React.memo（无阻塞）
04 产物纯净复核（无阻塞；建议在 01/02 后重跑 build 一并核验）
```

## 已做决策

- 复用既有 seam，零新建：`tests/host/*` HTTP seam + 库组件渲染回归。
- 不触碰 runtime emit 语义（ADR-0016 否决 runtime 去抖）。
- 素材路由不回退强缓存（2026-08-22 事故护栏）。
- 04 建议与 20-07（体积基线）协作：复核产物时一并固化基线。
