# 弹框固定尺寸：maxHeight 改固定 height 根治抖动

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 弹框出现与切换问话时尺寸恒定，不再因内容长短上下伸缩抖动；贯穿几何常量、定位纯函数与样式，独立可目视验证。

**验收标准：**

- [x] 新增固定高度常量 POPUP_HEIGHT_PX=320 替换 POPUP_MAX_HEIGHT_PX，POPUP_WIDTH_PX 调为 560
- [x] 组件 inline style 注入固定 height（非 max-height），切换问话弹框尺寸不随之伸缩
- [x] computePopupPlacement 按固定高度钳制，翻转/视口边距行为不回归
- [x] 纯函数测试断言固定几何下 placement 结果；npm run build 绿

## 评论

- [2026-08-30 · 验收] 验证通过：POPUP_WIDTH_PX=560 / POPUP_HEIGHT_PX=320 固定 height 经 inline style 注入；computePopupPlacement 固定高钳制单测绿；build 产物含三列 grid；host 重启后浏览器实测切换问话无高度抖动（用户已确认 UI 良好）。
