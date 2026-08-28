# 工单 03 — 欢迎背景配置收口入工厂

**Status:** done

**Blocked by:** 01

**构建内容：** 欢迎背景 9 项设置（总开关 + 壁纸/面板/压暗 + 五区域 alpha）收口到工厂实例，`subscribeBackdrop` 保留为桥接层；删除全部裸 localStorage 读写与私有 `createRegionAlphaStore`。首次获得跨标签页同步——一页改不透明度 / 区域 alpha，另一页背景层即时重同步。

**验收标准：**

- [ ] `welcome-backdrop-config.ts` 无任何裸 `localStorage` 调用；`clampBackdropOpacity` 与默认值常量导出不变
- [ ] 9 项默认值 / 钳制 / 写读一致行为不变；`setXxxOpacity` / 区域 setter 仍返回钳制后实际值
- [ ] `subscribeBackdrop` 每次任一配置项写入恰好触发一次（既有测试语义保持）
- [ ] `welcome-backdrop.test.ts` 改为 `vi.resetModules()` + 动态 import 模式（工厂内存缓存不随 localStorage.clear 重置），既有断言全量回归
- [ ] 新增跨标签页用例：storage 事件改不透明度 / 区域 alpha → getter 更新 + subscribeBackdrop 触发

## 评论

- 来源：架构优化方案 `docs/architecture-optimization-plan.md` S3（2026-08-28）。
- 阻塞于工单 01。
- 关键风险：测试隔离（工厂内存缓存）——不可只依赖 beforeEach 清 localStorage。
- 实施记录（spec 审查 2026-08-28 手段偏差记录）：测试隔离采用**静态 import + beforeEach 调 `reloadBackdropConfig()`**（新增导出，重置 9 个工厂实例内存缓存至持久化状态），而非方案字面的 `vi.resetModules()` 动态 import。二者效果等价（清 localStorage 后缓存重同步默认值），reload 方案避免重写 500+ 行测试文件为动态 import，且与 skin 的 `initSkin()` reload 模式同构。跨标签页用例已加（welcome-backdrop.test.ts「跨标签页 storage 事件同步」）。
