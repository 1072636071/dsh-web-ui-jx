# 全浮层毛玻璃继承区域 alpha（方案 B）

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 开启壁纸时，给所有浮层/面板/卡片（输入卡、用户气泡、代码块、内联 code、侧栏 `data-slot="sidebar"`、dialog/menu/listbox/popper/tooltip、`data-dsh-plugin="..."` 各插件面板、底部面板、设置表面）加固定 `backdrop-filter: blur(10px)`，`background-color` 继承既有 `--jx-panel-*` 区域 alpha / `--jx-panel-alpha`，壁纸从面板后整幅透出；不新增滑杆，透明度仍随现有区域滑块控制。端到端：壁纸在整幅 UI 后持续可见，面板透明度随现有滑块。

**验收标准：**

- [ ] 覆盖矩阵生效：输入卡/气泡/代码块/侧栏/插件面板/dialog 等表面均透出壁纸
- [ ] 玻璃 `background-color` 继承现有区域 alpha，调节现有滑块时透明度随之变化
- [ ] 不新增设置项/滑杆
- [ ] 不命中时按参考项目 `patches.css` 稳定后缀兜底回填选择器，覆盖不遗漏

## 评论