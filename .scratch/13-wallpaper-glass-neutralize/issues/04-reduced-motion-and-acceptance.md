# reduced-motion 降级 + 集成验收

**Status:** resolved

**Blocked by:** 01, 02, 03

**构建内容：** 在 `prefers-reduced-motion: reduce` 下，毛玻璃 `backdrop-filter` 全关（回纯 alpha + 压纱兜底），对齐 DESIGN §6 既有全关惯例；整体验收全链路——开关壁纸、切会话、深浅双主题、各面板透出、无残留层/标记/属性。端到端：低性能/敏感设备获得可读降级，整功能验收通过。

**验收标准：**

- [ ] `prefers-reduced-motion: reduce` 下毛玻璃 blur 全关，壁纸仍可见但无模糊（压纱兜底保证文字对比）
- [ ] 深浅双主题下壁纸都持续可见、玻璃值正确
- [ ] 关闭欢迎背景后回纯色，无任何残留层/标记/`--jx-panel-*` 属性
- [ ] 皮肤开+背景开门控正确；皮肤关/背景关均正确卸载
- [ ] 全链路验收通过（按 PRD 用户故事核对）

## 评论

### 验收记录（2026-08-27 回填复验）

- [x] reduced-motion 降级：`@media (prefers-reduced-motion: reduce)` 下毛玻璃 `backdrop-filter: none`（webkit 前缀同步）全关，回纯区域 alpha + 压纱兜底——ADR-0027 D4 / DESIGN §6 惯例，不新增开关
- [x] 深浅双主题：玻璃与中和规则消费的 surface 变量均为双主题定义；壁纸可见性经滑杆（壁纸 100 / 面板 50 / 压纱 25 默认）调节
- [x] 关闭欢迎背景回纯色：ctx.effect dispose 卸层 + 移除 html/body 激活标记 + 区域变量移除（welcome-backdrop.test.ts 覆盖写/移对称）
- [x] 开关门控：皮肤开且背景开才挂层；任一关均正确卸载（配置订阅接线单测覆盖）
- [x] 2026-08-27 全链路自动化复验：`npm run build` ✓、`npm run verify` 21/21 ✓、全量 vitest 447 绿