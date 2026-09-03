# ADR-0033 — 个性化问候：宿主开槽 + 插件占用

状态：已接受（待实施）
日期：2026-09-03
关联：ADR-0001（独立 Bundle 插件定位）、memorial 017

## 背景

用户要求把新会话空态的大标题「探索未至之境」换成按时段 + 用户名的问候语，并明确「实现要放在本插件里」。

调查发现本插件当前**完全没有接入 slots**（`src/client/index.ts:164` 注释：「后续工单用 slots/locale 等」），peerDeps 只有 react/react-dom，整体定位是「独立插件，不复用 dsh-web-ui 任何包」（ADR-0001）。而大标题的渲染点属于宿主 `ui-conversation`，本插件碰不到。

核心张力：用户既要「大标题真的变」，又要「可插拔」。二者在 dsh 的 slot 机制下不可同时零成本达成——slot 的**声明**与**渲染点**必须写在宿主代码里，插件只能 `ctx.slots.inject` **占用**已存在的 slot（范式：`ui-brand-official` → `conversation.hero.brand.mark`）。不存在"插件凭空造一个宿主会渲染的槽"。

## 决策

宿主 `ui-conversation` **开一次槽**，本插件占用它。可插拔性由"槽"提供，不是由"零改动"提供。

**宿主侧 3 处改动（约 10 行）**：

1. `packages/client/ui-conversation/src/client/apply.ts:184-187` — children 增加
   `'conversation.hero.headline': { kind: 'single', scope: 'root' }`
2. `packages/client/ui-conversation/src/client/contract/slots.ts:121-125` — 增加该 slot 的 owner 类型声明
3. `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx:124` —
   `t('hero.headline')` 改为 `renderSlot('conversation.hero.headline', {}, { fallback: <span className={css.headlineText}>{t('hero.headline')}</span> })`

**插件侧**：新增 peerDependency `@deepseek-ai/dsh-client-ui-conversation`，接入 slots 后占用该槽，时段判定、用户名、全部文案都留在本插件。

**为什么 fallback 保留原文案很关键**：槽无人占用时回落「探索未至之境」，于是
- 宿主测试零改动（`tests/skeleton.client.spec.tsx` 中 5 处断言仍命中 fallback）；
- i18n 零改动（无新增 locale key，不触发 `verify-client-ui-i18n`）；
- 卸载插件即自动回落，可插拔语义成立。

## 被否决的替代方案

1. **client 侧 DOM 劫持（零改动宿主）**——`lib/client.js` 确实在页面里跑，技术上可行。但 hero 标题的 class 是 CSS module 哈希名，插件拿不到 `css.headlineText`，只能靠匹配文案「探索未至之境」；locale 一换即失效，且与宿主 DOM 结构强耦合。否决（埋雷）。
2. **把时段问候逻辑直接写进 `ui-conversation`，用户名从本插件读**——不新增 slot 概念，但逻辑劈在两个仓库、互相读对方配置，耦合最脏。否决。
3. **放弃大标题，只让姜晓在气泡里问候**——插件真正自包含、零跨仓库改动，但用户明确要的是大标题那句话。否决。
