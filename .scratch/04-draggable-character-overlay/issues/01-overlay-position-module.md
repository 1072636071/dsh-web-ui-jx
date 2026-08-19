# overlay-position 纯逻辑模块 + 单元测试

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 角色浮层可拖动的可测地基：默认右下角计算、视口内钳制、`localStorage('jx-overlay-pos')` 持久化读写、drag reducer（start/move/end → 位置快照）、位置单例 store（getSnapshot / set / subscribe / reset）。镜像既有 `overlayStateMachine` 单例模式与 `skin.ts` 容错。本工单交付以 vitest node 测试全绿为证，无 UI 可见变化。

**验收标准：**

- [ ] `clampToViewport`：超左上/右下边界钳到边界内；边界内位置不变
- [ ] `defaultOverlayPosition`：返回右下角（视口 - 尺寸 - 16px 边距）
- [ ] 持久化 `save`→`load` round-trip 一致；缺省/malformed 回落默认；写失败静默忽略（对齐 skin 容错）
- [ ] 位置单例 store：`getSnapshot` 稳定引用、`set` 写 localStorage + 通知订阅者、`subscribe`/`unsubscribe` 正常、`reset` 清 storage + 回默认 + 通知
- [ ] drag reducer：`dragStart` 记录起点与起始位置；`dragMove` 跟手且钳制（越界位置被钳回）；`dragEnd` 提交位置；从交互子元素起的 `dragStart` 不启动会话
- [ ] resize 重钳制：输入新视口尺寸 → 输出钳制后位置
- [ ] 新 seam 数 = 0（复用 Seam 2：client 纯逻辑 + vitest node 环境，先例 warp-controller.test）
- [ ] `npm run test` 全绿（新增 overlay-position 测试文件通过）

## 评论

来源：PRD-04 实现决策 3 + 测试决策。阻塞者最先放置，本工单为地基，工单 02/03 依赖。
