# 17-architecture-optimization — 地图

> 来源：2026-08-28 架构审查（`jxx-improve-codebase-architecture`）→ 方案 `docs/architecture-optimization-plan.md` → 拆单（`jxx-to-tickets`）。

## 目标

- **持久化收口**：`persistent-setting.ts` 成为持久化真正单一事实源（bool / number / id-set 三型全覆盖）。工单 01 是前置；02/03/04 收口三处裸 localStorage。
- **host 半区收敛**：共享件（05）、LLM 适配器（06）、公共入口（07）。

## 阻塞图

```
01 工厂扩展 ──┬── 02 keep-config 收口
              └── 03 welcome-backdrop 收口
04 上限削层（无阻塞；已纠偏，不用 S1）
05 host http-shared（无阻塞）
06 llm-client（无阻塞）
07 库公共入口（无阻塞）
```

## 已做决策

- 存储格式零迁移：所有 `jx-*` 键名与值格式（bool `"true"/"false"`、集合 JSON string[]、十进制整数串）不改。
- 行为不变护栏：每张收口工单的既有测试「零改动全绿」；新能力（跨标签页同步）必须补测试锁定。
- 测试隔离：工厂是内存缓存，localStorage.clear 不重置 → 03 必须改 `vi.resetModules()` + 动态 import。
- S4 阻塞纠偏：只用既有工厂 API，无阻塞（初版方案表误标前置 S1）。
- S8（client 设置壳）为观察项，不拆单不实施。
- 不违反 ADR-0030 D5：LLM 走本地 OpenAI 兼容客户端，不走宿主模型体系。
