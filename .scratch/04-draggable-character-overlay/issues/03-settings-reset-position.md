# SettingsCard 重置浮层位置入口

**Status:** ready-for-agent

**Blocked by:** 02

**构建内容：** 用户在设置卡（SettingsCard）点「重置浮层位置」按钮 → 浮层回右下角，`localStorage('jx-overlay-pos')` 被清除，刷新后仍在右下角。作为拖动丢位置的兜底（配合视口钳制保证不丢）。

**验收标准：**

- [ ] 设置卡出现「重置浮层位置」按钮（唐风次要按钮样式，只消费语义别名，无颜色字面量/主题选择器）
- [ ] 点击按钮 → 调位置 store 的 `reset()` → 浮层立即回右下角
- [ ] 重置后 `localStorage('jx-overlay-pos')` 被清除
- [ ] 重置后刷新页面，浮层仍在右下角
- [ ] `npm run build` 通过（host/client 双半区）+ `npm run verify` 全绿

## 评论

来源：PRD-04 实现决策 7 + 用户故事 10。阻塞于 02（需浮层已订阅位置 store 才能反映重置）。按钮文案/位置在实现时按唐风极简定稿（设置卡底部或皮肤开关 section 内）。
