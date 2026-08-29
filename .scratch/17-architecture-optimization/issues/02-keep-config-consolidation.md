# 工单 02 — 保留模式持久化收口入工厂

**Status:** done

**Blocked by:** 01

**构建内容：** 保留模式（ADR-0022/0028）持久化收口到工厂：两个开关 + 三个记账集合（kept/dismissed/seen）由工厂构造器承载，删除自持裸 localStorage 原语与私有 id-set 工厂，导出面不变。首次获得跨标签页同步——两个标签页同开时，一页修改「查看后保留气泡」开关或记账集合，另一页即时生效。

**验收标准：**

- [ ] `session-bubble-keep-config.ts` 无任何裸 `localStorage` 调用；14 个导出函数变薄委托，导出面不变
- [ ] 开关 set 幂等（值未变不写盘不通知）；集合 add/remove/prune 惰性纪律、写失败静默保留
- [ ] 既有 `session-bubble-keep-config.test.ts` 零改动全绿（回归护栏）
- [ ] 新增跨标签页用例：storage 事件改 kept 集 → 快照更新 + 订阅通知
- [ ] 存储格式零迁移：bool `"true"/"false"`、集合 JSON string[] 插入序，既有用户数据原样可读

## 评论

- 来源：架构优化方案 `docs/architecture-optimization-plan.md` S2（2026-08-28）。
- 阻塞于工单 01（id-set 构造器）。
- 实施记录：既有测试零改动回归；跨标签页用例已补（`session-bubble-keep-config.test.ts`「记账集合：跨标签页同步」块，spec 审查 2026-08-28 后补齐）。
