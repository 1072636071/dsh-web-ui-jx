# SettingsCard 开关接线回归测试

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 设置卡各开关的读写 / 订阅通知 / 重置入口 / 角色 section 有测试护栏——改设置逻辑不怕破坏。

**验收标准：**

- [x] `SettingsCard` jsdom 测试：各开关写入 / 读取 / 订阅通知 / 重置入口 / 角色 section 项
- [x] 仿 `session-bubble-list.test.ts` 渲染模式（不引入新 seam）
- [x] 全量测试全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30 实施（M5）：新增 `tests/client/settings-card.test.ts`（10 用例）——
  皮肤开关（唐风皮肤 aria-checked+getSkinEnabled+body 属性 / 欢迎背景 getBackdropEnabled）、
  特效五类逐一写入（隔离语义：仅目标类翻转，其余保持先前）、角色 section（默认折叠 →
  展开含 状态标签/动作轮换/气泡上限/保留/拖拽归档；状态标签写入+订阅通知
  subscribeShowStateLabel；动作轮换写入；气泡上限输入修改经原生 value setter 驱动
  React onChange → setMaxSessionBubbles；①保留关→②拖拽归档禁用灰显 + disabled 不可点击）、
  重置浮层位置（点击调用 overlayPositionStore.reset，vi.spyOn）。**seam**：仿
  session-bubble-list.test.ts（createRoot+act）；jsdom 桩 Element.animate + matchMedia
  （fall/warp/背景层 WAAPI）；beforeEach 清 localStorage + reload/reset 全部设置单例到
  默认（persistent-setting 内存缓存重同步，保证用例与顺序无关）。全量 37 文件 613 项全绿。
- 来源：PRD 21 候选 U3；证据见 memorial 017 archived `index.html`（src/client/components/ 7 个组件全部无单测；AGENTS.md + docs/agents/ 无成文测试策略）。
- `SettingsCard` 承载全部设置开关接线，属高风险 - 零覆盖区。
