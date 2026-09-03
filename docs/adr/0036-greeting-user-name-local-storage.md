# ADR-0036 — 用户名存 client 侧 localStorage，不走 host settings 分节

状态：已接受（待实施）
日期：2026-09-03
关联：ADR-0034（用户名由用户自填）、ADR-0006/0007（同类持久化先例）、memorial 017

## 背景

用户名（ADR-0034）需要持久化。本插件现存**两条**持久化路径：

1. **client 侧** `createPersistentSetting`（`packages/dsh-session-bubble`）——localStorage，键名集中在 `STORAGE_KEYS`。皮肤开关（ADR-0006）、气泡数量上限（ADR-0007）等客户端展示偏好都走这条路。
2. **host 侧** `ctx.storageDomain` + `settings` 分节 `dsh-jx.*`——先例是 `dsh-jx.aiTitle`（AI 动态标题的配置与 API key）。

一个额外的约束来自宿主侧：`settingsScope` 快照带 `mode: 'host' | 'memory'`，**memory 模式（远端浏览器）不接受写入**。也就是说若选 host settings，远端浏览器里名字根本存不住，而这不是边角情况、是必然发生的路径。

## 决策

走 client 侧 `createPersistentSetting`，与皮肤 / 特效开关同构。

- 纯展示偏好，不劳烦 host 半区，也不需要 host 服务可用；
- 顺带绕开 memory 模式不可写的问题；
- 键名进 `STORAGE_KEYS` 单点，与既有约定一致。

**代价（已接受）**：不跨浏览器 profile 同步。对一个角色插件的显示名而言可接受。

## 附带的开关决策

**在 SettingsCard 里加一个「个性化问候」开关**（默认开）。

这里修正了 grill 早期的一个结论：原先在"独立成包"的假设下判断"不加开关"，理由是关闭等价于在 `cordis.yml` 里 `disabled` 掉那个包。但实现落点换到本插件后该理由失效——本插件同时承载角色浮层，不能为了关问候而把整个姜晓禁掉，关闭粒度太粗。而 SettingsCard 已有皮肤 / 特效同类开关，加一个是同构改动，成本极低。

## 被否决的替代方案

1. **host settings 分节 `dsh-jx.greeting`**——看起来更"正式"，且与 `dsh-jx.aiTitle` 同轨。但 memory 模式下不可写，远端浏览器里名字存不住；且为一个纯 client 展示偏好引入 host 往返不划算。否决。
2. **不做开关，靠 `disabled` 整个包关闭**——关闭粒度是整个插件（连角色浮层一起没），不是"只关问候"。否决（见上）。
