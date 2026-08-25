# 表面探测器 + 中和规则（方案 A）

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 开启壁纸时，全域表面探测器扫描 body，凡「高度 ≥ 视口 90% 且底非透明且非 modal/plugin/自营层（zIndex≤100）」的表面（如 app 根/对话根）被判定为「盖住壁纸的表面」，打上 `data-jx-backdrop-surface` 标记；在 `body[data-jx-wallpaper-active]` 作用域内，`background{transparent!important; background-image:none!important}` 把这些不透明的底抹透明，壁纸从 app 根后露出来；配 `surfaceObserver`（body subtree MutationObserver）在导航重建后增量重新打标/清标。端到端：壁纸不再被整个 APP 的不透明底盖住。

**验收标准：**

- [ ] 探测器能正确识别「≥90% 视口 + 非透明底 + 非 modal/plugin」的表面并打 `data-jx-backdrop-surface` 标记
- [ ] 激活作用域内被标记表面的底面被中和为透明，app 根不再盖住壁纸
- [ ] 导航/切会话重建后 `surfaceObserver` 对新表面重新打标、对移除表面清标
- [ ] 不污染未激活状态：皮肤/插件样式在壁纸未激活时不受影响

## 评论