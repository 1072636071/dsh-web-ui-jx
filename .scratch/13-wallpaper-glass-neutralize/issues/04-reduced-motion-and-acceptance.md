# reduced-motion 降级 + 集成验收

**Status:** ready-for-agent

**Blocked by:** 01, 02, 03

**构建内容：** 在 `prefers-reduced-motion: reduce` 下，毛玻璃 `backdrop-filter` 全关（回纯 alpha + 压纱兜底），对齐 DESIGN §6 既有全关惯例；整体验收全链路——开关壁纸、切会话、深浅双主题、各面板透出、无残留层/标记/属性。端到端：低性能/敏感设备获得可读降级，整功能验收通过。

**验收标准：**

- [ ] `prefers-reduced-motion: reduce` 下毛玻璃 blur 全关，壁纸仍可见但无模糊（压纱兜底保证文字对比）
- [ ] 深浅双主题下壁纸都持续可见、玻璃值正确
- [ ] 关闭欢迎背景后回纯色，无任何残留层/标记/`--jx-panel-*` 属性
- [ ] 皮肤开+背景开门控正确；皮肤关/背景关均正确卸载
- [ ] 全链路验收通过（按 PRD 用户故事核对）

## 评论