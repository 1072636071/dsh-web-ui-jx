# 19-fx-wallpaper-performance — 地图

> 来源：memorial 017 → PRD 19-fx-wallpaper-performance（to-spec）→ 拆单（to-tickets）。

## 目标

特效与壁纸渲染成本：壁纸打标批处理（01）、毛玻璃矩阵（02）、warp 语义二选一（03）、涟漪去 reflow（04）、fall 阴影实测（05）。

## 阻塞图

全部工单无阻塞。

```
01 壁纸 rAF 批处理（无阻塞）
02 毛玻璃矩阵（无阻塞）
03 warp onFrame 二选一（无阻塞）
04 涟漪去 reflow（无阻塞）
05 fall 阴影实测（无阻塞，实测驱动）
```

## 已做决策

- 01 与 02 同涉壁纸视觉契约（ADR-0024/0027），建议同迭代回归暗/亮两主题。
- 03 必须二选一落地，不留「写了不接」状态。
- 05 为实测驱动：推断成立才动手，否则关闭本单。
- reduced-motion 降级语义全保留。
