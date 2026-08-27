# 壁纸层基座：负 z-index + 激活标记 + 复挂 + 清扫

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 开启欢迎背景时，壁纸层以负 z-index 垫在所有宿主内容之下（media/图 `-3`、veil/压纱 `-2`），浏览器不再与宿主 app 根同层互排；激活时在 `document.body` 与 `documentElement` 写入 `data-jx-wallpaper-active` 标记，供 CSS 中和/玻璃规则作用域 gate；切换会话或导航重建 body 子树后，断连的壁纸层被连接感知复挂（`!isConnected` 即回拼），壁纸不消失；插件热重载后残留层/标记被清扫。端到端：壁纸稳定垫底、切换会话不闪失、重载无残留。

**验收标准：**

- [ ] 壁纸层使用负 z-index（media/图 `-3`、veil/压纱 `-2`），层级与宿主 app 根互相分离
- [ ] 背景激活时 body + documentElement 均出现 `data-jx-wallpaper-active` 标记
- [ ] 切换对话/新建会话后壁纸层自动复挂，壁纸不消失
- [ ] 卸层（皮肤关或背景关）与热重载后无残留层/标记（沿用 ADR-0017 可重入 + `sweepResidualBackdrops` 兜底）

## 评论

### 实施记录（回填于 2026-08-27；实施提交 f92da4a，ADR-0027）

- [x] 壁纸层负 z-index 垫底：容器 `BACKDROP_Z_INDEX = -3`（实底 base / 壁纸 img / 压纱 veil 为容器内子层，整体与宿主 app 根脱离互排）—— `src/client/welcome-backdrop.ts`
- [x] 激活标记：`data-jx-wallpaper-active` 同时写 `documentElement` 与 `body`（`BACKDROP_ACTIVE_ATTR`）
- [x] 复挂：连接感知守卫 `!backdropEl.isConnected` 即 `insertBefore(body.firstChild)` 回拼，切换对话/重建子树后壁纸不消失
- [x] 清扫：卸层经 ctx.effect dispose；入口另提供 `sweepResidualBackdrops` 兜热重载残留（对齐 sweepResidualFxLayers / ADR-0017 先例）
- [x] 2026-08-27 复验：build ✓、typecheck ✓、welcome-backdrop.test.ts 27 例全绿