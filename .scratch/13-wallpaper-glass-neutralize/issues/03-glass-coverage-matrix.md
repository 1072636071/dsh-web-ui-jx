# 全浮层毛玻璃继承区域 alpha（方案 B）

**Status:** resolved

**Blocked by:** 01

**构建内容：** 开启壁纸时，给所有浮层/面板/卡片（输入卡、用户气泡、代码块、内联 code、侧栏 `data-slot="sidebar"`、dialog/menu/listbox/popper/tooltip、`data-dsh-plugin="..."` 各插件面板、底部面板、设置表面）加固定 `backdrop-filter: blur(10px)`，`background-color` 继承既有 `--jx-panel-*` 区域 alpha / `--jx-panel-alpha`，壁纸从面板后整幅透出；不新增滑杆，透明度仍随现有区域滑块控制。端到端：壁纸在整幅 UI 后持续可见，面板透明度随现有滑块。

**验收标准：**

- [ ] 覆盖矩阵生效：输入卡/气泡/代码块/侧栏/插件面板/dialog 等表面均透出壁纸
- [ ] 玻璃 `background-color` 继承现有区域 alpha，调节现有滑块时透明度随之变化
- [ ] 不新增设置项/滑杆
- [ ] 不命中时按参考项目 `patches.css` 稳定后缀兜底回填选择器，覆盖不遗漏

## 评论

### 实施记录（回填于 2026-08-27；实施提交 f92da4a，ADR-0027）

- [x] 覆盖矩阵：`ALL_GLASS_SELECTORS` 统一作用域 `body[data-jx-wallpaper-active]` 下加固定 `backdrop-filter: blur(10px)`（`GLASS_BLUR_PX = 10`，webkit 前缀同步）——覆盖输入卡/用户气泡/代码块/内联 code/侧栏/dialog/menu/listbox/popper/tooltip/插件面板/底部面板/设置表面
- [x] 玻璃 `background-color` 继承既有 `--jx-panel-*` 区域 alpha / 全局 `--jx-panel-alpha`：调现有滑块透明度随之变化，未新增任何设置项/滑杆
- [x] 稳定后缀兜底：按参考项目 patches.css 口径回填不易命中的选择器（`welcome-backdrop.ts` 兜底选择器段），与主矩阵同作用域
- [x] 2026-08-27 复验：build ✓、typecheck ✓、welcome-backdrop.test.ts 27 例全绿