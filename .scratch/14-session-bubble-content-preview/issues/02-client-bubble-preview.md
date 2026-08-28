# 02 — 气泡 hover 内容弹框核心

**Status:** done

**Blocked by:** 01

**构建内容：** 鼠标 hover 会话气泡 → 浮现内容弹框（tooltip 浮层）：会话标题 + 一排问话胶囊（每条用户问话一个胶囊，显示截断摘要）+ 问话详情区（当前选中胶囊的完整问话）。hover 时 fetch 01 的路由拿数据；**默认展开最后一个胶囊**（详情区显示最后一条问话）；hover 某胶囊 → 详情区切换为对应完整问话；**点击胶囊 → `sessions.open(id)` 跳到该会话**。

**验收标准：**

- [x] hover 会话气泡出现弹框，移开/离开气泡后消失
- [x] 弹框显示会话标题 + 一排问话胶囊 + 问话详情区
- [x] 默认选中最后一个胶囊：详情区显示最后一条问话完整内容
- [x] hover 某胶囊 → 详情区切换为对应完整问话
- [x] 点击胶囊 → `sessions.open(id)` 跳到该会话
- [x] hover 不同气泡 → 弹框跟随切换（不串会话）
- [x] 既有气泡点击跳转/保留记账/手柄收起交互不受影响
- [x] 组件测试覆盖胶囊选中/默认展开逻辑（对齐 `tests/client/session-bubbles.test.ts` 先例）

## 评论

实施备注（2026-08-28）：
- hover/fetch 组件接线无 React 渲染测试先例（对齐本仓惯例「组件手势接线不测，构建验收兜底」）；胶囊选中/默认展开/折叠/解析/定位全部下沉 `state-machine/session-bubble-preview.ts` 纯逻辑 seam 测试（22 条）。
- 缓存 key = `sessionId:updatedAt`：会话新活动自动失效，无定时器失效面；in-flight 去重 + 64 条 LRU 逐出。
- 弹框经 createPortal 挂 body（浮层祖先带 transform，盒内 fixed 失效），挂 `data-jx-interactive` 排除整盒拖动。
