# 台词气泡

**Status:** resolved

**Blocked by:** 04

**构建内容：** 角色「说话」时浮层旁出现台词气泡，淡入淡出、播放后自动隐去；气泡完全不拦截鼠标指针，用户可正常点击浮层覆盖区域的 UI。

**验收标准：**

- [ ] 台词气泡以 opacity + translateY 淡入淡出
- [ ] 播放后自动隐去（无需用户手动关闭）
- [ ] 气泡 `pointer-events: none`
- [ ] 气泡样式只消费语义别名，深浅双主题均覆盖
- [ ] 气泡文本可读性达 WCAG AA（深底浅字 / 浅底深字）

## 评论

- 回写（2026-08-23）：清点核实已实施——`SpeechBubble.tsx` 台词气泡上线（淡入淡出、自动隐去、pointer-events:none、语义别名双主题）。状态由 ready-for-agent 补记为 resolved。
