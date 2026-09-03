# 姜晓新建会话台词（blank 检测 + 4 句时段台词）

**Status:** done

**Blocked by:** 01

**构建内容：** 用户切到一个空会话时，姜晓说一句与时段匹配的问候——「大人，晨安。今日有何差遣？(￣▽￣)」等 4 句；同一会话不重复说。

**验收标准：**

- [ ] 复用工单 01 的时段判定纯函数（不写第二份）
- [ ] 4 句台词与 memorial 017「台词草案」定稿逐字一致，经既有台词决策器扩展接入
- [ ] 触发判定：会话列表快照中 current id **变化**且该会话空日志（`SessionSummary.blank`）时触发一次；同一 id 不重复（lastGreetedId）
- [ ] 挂载时若当前已是空会话，补触发一次
- [ ] 「个性化问候」开关关闭时不触发
- [ ] 边界测试：blank 翻转、id 变化、同 id 不重复（fake sessions 双先例沿用）
- [ ] 已知漏检记录在案不修：宿主「New Session reuses a blank one targeting the same workspace」——复用同工作区空白会话时 id 不变，不触发（与 hero 未重新挂载行为一致）
- [ ] `npm run build && npm run verify` 通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）

### 实现摘要（impl-jx-new-session，2026-09-03）

**台词通道选择**：复用既有台词显示通道——`CharacterOverlay` 的 `speech` prop（nonce 变化即弹台词气泡），不发明新通道。新建 `useNewSessionGreeting` hook 桥接纯逻辑 `createNewSessionGreeter` → 触发时产出 `SpeechTrigger` 经 RootApp 传入 `CharacterOverlay` 的 `speech` prop。

**改动文件**：
- 新增 `src/client/state-machine/new-session-greeting.ts`（纯逻辑：4 句台词常量 `NEW_SESSION_LINES` 逐字照抄 memorial 017 D16；`selectNewSessionLine` 复用工单 01 `greeting.ts` 的 `getGreetingBucket`，不写第二份时段判定；`shouldGreetNewSession` 纯触发判定；`isNewSessionGreetingEnabled` 单一开关判定点（本工单恒为开；已由工单 03 接入 `greetingEnabledStore`，改为始终订阅、evaluate 实时静默）；`createNewSessionGreeter` 订阅 `sessions.list`，挂载补触发）。
- 新增 `src/client/new-session-greeting.ts`（React hook，桥接 greeter → SpeechTrigger，随组件 effect 释放订阅）。
- 修改 `src/client/index.ts`（RootApp 追加 `speech={greetingSpeech}`，追加式小改）。
- 新增 `tests/client/new-session-greeting.test.ts`（判定点纯逻辑 + 集成，fake sessions 双 + now 注入）。

**四项检查**：`npm run typecheck` ✓ / `npm test` ✓（674 passed，含本工单 17 例）/ `npm run build` ✓（lib/index.js + lib/client.js 产出）/ `npm run verify` ✓（24 项）。

**已知漏检（记录，未修）**：宿主「New Session reuses a blank one targeting the same workspace」——点「新建会话」复用同工作区已有空白会话时 session id 不变，`current` 未变化 → 不触发请安台词。此时 hero 也未重新挂载，行为一致，与 D13 决策一致地接受。

**遗留风险**：`useNewSessionGreeting` 仅在 `sessions` 注入时工作；`sessions` 缺失（测试假 ctx）不弹。【已被工单 03 接入】开关判定点 `isNewSessionGreetingEnabled` 现读 `getGreetingEnabled()`，evaluate 内实时静默；其余调用点无改动。
