# 设计令牌基座与双主题

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 插件 UI 的设计基座可用：L1 base / L2 jiangxiao remap 令牌落地，楷体与宋体 woff2 经 `@font-face` 加载；一个最小演示组件只消费语义别名渲染，并随宿主官方明暗信号即时切换墨金卷轴（深）/ 宣纸梅花（浅）双主题。

**验收标准：**

- [ ] L2 skin remap 挂 `body[data-dsh-jiangxiao]`，`--jx-*` 规范令牌深浅双值齐全（缺一套即违规）
- [ ] `--dsw-static-*` / `--dsw-alias-*` / `--dsw-specific-*` 按 DESIGN.md remap 原则 remap 到唐风色板（仅插件 UI 用到的语义别名，不做整套皮肤 remap）
- [ ] 暗/亮走官方信号 `body[data-ds-dark-theme]`，浅色 = `:not([data-ds-dark-theme])`
- [ ] 两个 woff2 字体（楷体/宋体）经 `@font-face` 从素材路由加载，不再 base64 内联
- [ ] 演示组件只消费 `--dsw-alias-*` / `--dsw-specific-*`，无颜色字面量、无主题选择器
- [ ] 官方小鲸鱼 logo（FishLogo 精确 SVG path，`fill=currentColor`）在品牌行可用

## 评论
