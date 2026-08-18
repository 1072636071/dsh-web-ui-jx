# FX 特效系统

**Status:** ready-for-agent

**Blocked by:** 03

**构建内容：** 用户体验到五类唐风氛围特效（鎏金流光 / 银杏·梅花飘落 / 墨韵暗纹 / 墨光呼吸 / 微交互），每类可独立关闭；全关后与原版宿主皮肤无差异（极致性能）。

**验收标准：**

- [ ] 五类特效实现：shimmer（鎏金流光顶线+标题烫金）、fall（银杏暗/梅花浅飘落）、grain（墨韵暗纹静态 SVG）、breathe（墨光呼吸背景）、micro（微交互 hover/active）
- [ ] 由 `html` 上 `fx-*` 类 + `localStorage('jx-fx')` 控制，每类独立开关，默认全开
- [ ] 全关判定：`html` 无任何 `fx-*` 类 → 移除全部 animation/transition/装饰层，与原版皮肤无差异
- [ ] `prefers-reduced-motion` 下全部自动关闭
- [ ] 装饰层不拦截指针（`pointer-events: none`）
- [ ] 特效配色只用 `--jx-*` 专属轨与氛围族令牌；氛围族不进正文文字
- [ ] 深浅双主题均覆盖（飘落：暗=银杏 / 浅=梅花）

## 评论
