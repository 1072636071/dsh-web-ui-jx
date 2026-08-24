# 全素材切换统一淡入

**Status:** resolved

**Blocked by:** 02

**构建内容：** 角色画面的一切素材切换都柔和过渡——过渡段入场、过渡→循环落稳、待机变体轮换、工作轮换段间、焦点会话切换，统一 150ms 淡入淡出，不再出现硬切闪断。系统偏好减少动态效果时全部关闭。

**验收标准：**

- [x] cross-fade 触发条件从焦点 nonce 变化扩展为播放项 url 任意变化：旧素材作底层淡出、新素材上层淡入，150ms
- [x] 150ms 内连续再切时底层直接替换为最新旧帧；浮层盒内 img 恒 ≤2 的自愈守卫不变量保持
- [x] prefers-reduced-motion 下淡入淡出全关（沿用现有守卫）
- [x] 不在资产层烘焙淡入（循环回卷点不得有暗帧）
- [x] 焦点切换原有行为不回退（含焦点 nonce 递增语义）
- [x] 组件级测试覆盖：url 变化触发 underlay、连切替换、reduced-motion 禁用


- 2026-08-23：决策依据 PRD 实现决策 9（D15）。实现复用 ADR-0008 决策 3 双 img underlay 机制，仅扩展触发条件。

## 评论

- 2026-08-23：决策依据 PRD 实现决策 9（D15）。实现复用 ADR-0008 决策 3 双 img underlay 机制，仅扩展触发条件。
- 2026-08-23（完成）：CharacterOverlay cross-fade 触发条件从 focusNonce 扩展为 item.url 任意变化（urlChangeSeqRef 序号作 underlay key，150ms 内连切直接替换底层旧帧）；主 img key 改为 item.url（url 变化重挂载重放淡入动画）；reduced-motion 守卫沿用（underlay 不渲染）；焦点 nonce 语义保留（递增规则不变，仅不再承担淡入触发）。组件级测试 tests/client/character-overlay-crossfade.test.ts（jsdom + react-dom act）：url 变化触发 underlay、150ms 内连切替换为最新旧帧、160ms 后 underlay 移除、reduced-motion 下不渲染 underlay，四项验收断言齐备；现有 overlay-img-guard 不变量测试保持绿。
