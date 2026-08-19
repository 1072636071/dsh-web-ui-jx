# 动画素材盘点与补齐计划

> 来源：memorial 004（2026-08-19）。状态：**待补素材部分已定，其余待处理**。

## 需补素材（6 个，ADR-0009 表情体系扩展）

| # | 文件名 | 表情 | 触发时机 |
|---|--------|------|---------|
| 1 | `character/transition-idle-happy.webp` | happy（开心） | 会话完成（done） |
| 2 | `character/transition-happy-idle.webp` | happy（开心） | 播完回 idle |
| 3 | `character/transition-idle-angry.webp` | angry（生气） | 授权/工具等待 10s 未响应 |
| 4 | `character/transition-angry-idle.webp` | angry（生气） | 播完回 idle |
| 5 | `character/transition-idle-shocked.webp` | shocked（惊吓） | 被点击/拖动（触发一次） |
| 6 | `character/transition-shocked-idle.webp` | shocked（惊吓） | 播完回 idle |

## 素材规格要求

- 命名：`transition-{from}-{to}.webp`，放入 `assets/character/`（ADR-0003 zip 契约：`character/` 子目录，webp 白名单，全部进 git）。
- 与现有素材同规格：alpha 透明、常规帧 67ms（≈14.9fps）、末帧 536ms 收尾定格、唐风古风少女剑士画风对齐现有角色。
- 动画时长：随状态机加载期 ANMF 解析自动适配（ADR-0008 D10，失败回退 800ms）。

## 相关文档

- 触发语义与表情体系：`docs/adr/0009-expression-system.md`
- 表情台词：`docs/character-lines.md` 第二节
- 人设：`docs/character-profile.md`
