# ADR-0002：官方三层 token 架构为唯一设计基准

**状态**: Accepted
**日期**: 2026-08-18

## 背景

jiangxiao 皮肤继承自 openCodeMM「姜晓·墨染」唐风二次元设计（深色黑金 · 浅色梅花）。deepseek-harness 官方样式系统采用三层 token 架构，但本项目组件若直接引用 `--jx-*` 或写颜色字面量，将偏离官方组件规则。

## 决策

采用**官方三层 token 架构**并固化到项目根 `DESIGN.md` 作为唯一设计基准：

```
L1 base       :root        → --dsw-font-family / --ds-font-family-code / --ds-ease-in-out / --ds-transition-duration*
L2 skin remap :body[data-dsh-jiangxiao] → --jx-* 规范令牌 + 将 --dsw-static-* / --dsw-alias-* / --dsw-specific-* remap 到唐风色板
               :not([data-ds-dark-theme]) → 浅色覆盖
L3 组件       : 只消费 --dsw-alias-* / --dsw-specific-*，禁止写颜色字面量、禁止含主题选择器
```

暗/亮信号走官方 `body[data-ds-dark-theme]`。保留官方小鲸鱼 logo（FishLogo.tsx 精确 path）。

## 被否决的替代方案

1. **仅继承 `--jx-*` 核心令牌，组件直接写字面量** — 偏离官方组件规则，多主题一致性差。
2. **整套皮肤 remap（含 `--aion-*` 等 DSH 专属渲染目标）** — 本插件是独立插件而非 skin-center 皮肤，不需要整张 remap 表，仅需插件 UI 用到的语义别名。
3. **CSS-in-JS 自建设计系统** — 与官方「CSS Modules + 语义别名」约定冲突。

## 影响

- 所有新组件引用 `--dsw-alias-*` / `--dsw-specific-*`，唐风炫技（烫金/印章/金描）用 `--jx-*` 专属轨。
- DESIGN.md 成为唯一设计权威，取代视觉实现细节推断。
- 深/浅两套令牌双值必须同时覆盖，缺一即违规。