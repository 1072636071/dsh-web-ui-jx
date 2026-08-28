# 工单 01 — 持久化工厂扩展：bool + id-set 构造器

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 持久化工厂（`persistent-setting.ts`）新增两个构造器：`createPersistentBoolSetting`（"true"/"false" 解析、脏数据回落默认）与 `createPersistentIdSetSetting`（稳定引用快照 + 幂等 add/remove + 惰性 prune + 跨标签页整集合替换）。为保留模式 / 欢迎背景 / 上限三处持久化收口提供单一实现源。纯基础设施，无直接用户可见行为。

**验收标准：**

- [ ] `createPersistentBoolSetting`：parse "true"/"false"，其余回落 default；set 写盘 + 通知 + 跨标签页同步
- [ ] `createPersistentIdSetSetting`：getSnapshot 值不变引用稳定；add/remove 幂等（无变化不写盘不通知）；prune 仅确有删除才写盘 + 通知并返回是否发生
- [ ] id-set 读失败 / 键缺失回落共享空集（稳定引用）；跨标签页 storage 事件 parse 新集合，与当前不等才替换 + 通知
- [ ] `createPersistentSetting` 既有签名与语义完全不变；`persistent-setting.test.ts` 既有用例回归通过，新增构造器用例全绿

## 评论

- 来源：架构优化方案 `docs/architecture-optimization-plan.md` S1（2026-08-28）。
- 关键约束：存储格式零迁移（bool `"true"/"false"`、集合 `JSON.stringify([...])` 插入序，与既有 `jx-bubble-keep-*` 契约一致）。
