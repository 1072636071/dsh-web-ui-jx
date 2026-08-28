# 04 — 发布前验收

**Status:** done

**Blocked by:** 03

**构建内容：** 功能整体验收：全量测试 + `npm run build`（host/client 双半区产物）+ `npm run verify`（21 项检查）全绿；PRD `14-session-bubble-content-preview` 的 19 条用户故事逐条核对无遗漏；无回归。

**验收标准：**

- [x] 全量测试通过（新增 host/client 测试 + 既有 390 tests 无回归）
- [x] `npm run build` 成功产出 `lib/index.js` + `lib/client.js`
- [x] `npm run verify` 21/21 通过
- [x] PRD 用户故事 19 条逐条核对通过（预览/折叠/跳转/交互分流/冷会话/主题降级/可重入）

## 评论

验收数据（2026-08-28）：
- 全量测试 442 passed（新增 host 15 + client 22，既有零回归）。
- `npm run build` 双半区产物正常（lib/index.js + lib/client.js/client.css）。
- `npm run verify` 21/21 通过。
- PRD 19 条用户故事逐条核对通过（修复复审后两轴均无发现项）。
- 已知限制（ADR-0028 附注）：点击胶囊仅 `sessions.open(id)` 跳会话，会话内定位留待官方开放接口；seq 已随问话下发留位。
