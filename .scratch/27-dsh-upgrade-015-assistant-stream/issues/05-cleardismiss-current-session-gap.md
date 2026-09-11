# 当前查看会话的"新完成解除旧收起"缺口（0.1.5 相邻回归）

**Status:** done

**Blocked by:** 无——可立即开始（承 27-04 审查发现的相邻缺口）

**构建内容：** 作为用户，收起某个会话气泡后，如果那个会话**又跑了一轮并回答完毕**，它应当像后台会话一样重新弹出一条"完成提醒"气泡（旧收起不该吞掉新完成信号——即既有 ADR/工单02「新一轮完成上升沿解除旧收起」的故事）。当前查看的会话此前做不到这一点。

**问题定性（已确认=是真问题）：** 解除旧收起的 `clearDismissed` 只在 `completed` 上升沿触发。0.1.5 宿主对**当前选中/正在查看**的会话不下发 `completed` 位，故这类会话再完成一轮时 `clearDismissed` 永不触发 → 旧 `dismissed` 不被清 → 回答完的气泡被旧收起压制、不重现。后台会话走 completed 边沿一切正常，两者行为不一致。

**验收标准：**

- [x] 复现用例：当前查看会话先 `running:true`、被收起；再 `running` 真→假落沿（无 `completed` 帧）⇒ `dismissed` 记账被解除、气泡重新可见（红→绿）。
- [x] 与 27-04 已合入的"running 落沿记 `seen`"对称：同一落沿既 `addSeen` 又 `clearDismissed`；可移除判定（`isBubbleDraggable = !running && !pending`）维持不变。
- [x] 不影响后台会话既有 completed 边沿解除路径（两条边沿并存、`clearDismissed` 幂等）；`typecheck` / `test`(685) / `build` / `verify` 全绿。

## 评论

**实现记录（本轮，jxx-tdd 红→绿）**：接缝=`SessionBubbleList` 组件 `prevRunningRef` 落沿 effect。复现用例（当前查看会话 running→idle、无 completed，被收起后应重现）先红（`dismissed` 仍为 `['z']`）；在既有 `running 真→假` 落沿循环内、`addSeen` 之后补一行 `clearDismissed(item.sessionId)` 转绿。净源码改动 1 行（+ 测试 22 行）。EOL：改动以二进制外科插入贴合文件既有 CRLF 块，未整文件翻转、无 import 假 diff。

来源：`/jxx-code-review`（工单 27 修复批次）spec 轴发现——旧逻辑只补了 `seen` 半区、漏了 `clearDismissed` 半区。属既有、非本批引入，同源同因，单列此工单修复。
