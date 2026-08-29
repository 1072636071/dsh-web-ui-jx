# 02 — 数据层迁移入库

**Status:** resolved

**Blocked by:** 01

**构建内容：** 气泡列的数据核心（归组引擎、拖拽判定矩阵、标题推导、SDK 快照投影）从根插件迁入库并作为公共 API 导出；根插件改从库 import 数据层。功能上用户无感知（行为完全一致），但对开发者而言，库已是可单独消费的数据包。

**验收标准：**

- [x] 库导出归组引擎、标题推导、相关类型与投影函数，类型完整
- [x] 数据层相关测试全部迁入库并全绿（断言语义零改动）
- [x] 根插件数据层代码移除，改为从库 import，根插件构建通过
- [x] 根插件测试在改 import 后全量通过

## 答案

2026-08-27 完成，commit `136af1f`（与工单 03 同批提交）。

- `session-bubbles.ts`（归组引擎/拖拽判定/标题，100% rename）、`session-list-adapter.ts`（投影）迁入库包 `packages/dsh-session-bubble/src/`；库 `index.ts` 导出 `buildBubbleGroups`/`displayTitle`/`resolveDragAction`/`isBubbleDraggable`/`isBubbleRowDraggable`/`isBubbleHandleHit`/`deriveSessionListEntries` + 相关类型
- 测试 `session-bubbles`（107）/`session-list-adapter`（4）/`bubble-drag-handle`（4）随迁库包 `__tests__/`，断言零改动（similarity 95–99%）
- `SessionBubbleList.tsx` 数据层 import 改为库公共 API（`../../../packages/dsh-session-bubble/src/index.ts`）
- 验证：根+库 typecheck、447 测试、根 build（client 50 模块）、21 项验收全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）
