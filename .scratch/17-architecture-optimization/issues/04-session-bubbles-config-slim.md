# 工单 04 — 会话气泡上限配置削层

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 删除会话气泡上限配置的第二层 store（`cachedMax`/`maxListeners`），订阅/快照直接桥接工厂（number 原始值天然稳定，第二层缓存是冗余间接）；该模块首次获得单测。无用户可见行为变化。

**验收标准：**

- [ ] 删除 `cachedMax` / `maxListeners`；`subscribeMaxSessionBubbles` 直接桥接工厂零参订阅；`getMaxSessionBubblesSnapshot` 返回工厂 `get()`
- [ ] 导出面不变；钳制 [1,10]、写读一致、默认 10 行为不变
- [ ] 新增 `session-bubbles-config.test.ts`（jsdom）：默认值 / 钳制 / 写读一致 / 订阅退订 / 跨标签页 storage 事件同步

## 评论

- 来源：架构优化方案 `docs/architecture-optimization-plan.md` S4（2026-08-28）。
- 阻塞纠偏：初版方案表误标前置 S1；本工单只用既有工厂 API，无阻塞。
