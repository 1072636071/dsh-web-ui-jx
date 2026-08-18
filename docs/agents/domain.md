# 领域文档

工程技能在探索代码库时应如何使用此仓库的领域文档。

## 探索前，先阅读这些

- 仓库根目录的 **`CONTEXT.md`**，或
- 仓库根目录的 **`CONTEXT-MAP.md`**（如果存在）——它指向每个上下文的一个 `CONTEXT.md`。阅读与主题相关的每个。
- **`docs/adr/`** — 阅读涉及你即将处理区域的 ADR。在多上下文仓库中，也要检查 `src/<context>/docs/adr/` 中的上下文范围决策。

如果这些文件不存在，**静默继续**。不要标记它们的缺失；不要主动建议创建它们。`/jxx-domain-modeling` 技能（通过 `/jxx-grill-with-docs` 和 `/jxx-improve-codebase-architecture` 到达）在术语或决策实际被确定时惰性创建它们。

## 文件结构

单上下文仓库（大多数仓库）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文特定决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用词汇表的词汇

当你的输出命名领域概念时（在 issue 标题、重构提案、假设、测试名称中），使用 `CONTEXT.md` 中定义的术语。不要漂移到词汇表明确避免的同义词。

如果你需要的概念尚未在词汇表中，这是一个信号——要么你在发明项目不使用的语言（重新考虑），要么确实存在缺口（记录给 `/jxx-domain-modeling`）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 矛盾，明确地提出而非默默地覆盖：

> _与 ADR-0007（事件溯源订单）矛盾——但值得重新审视，因为…_
