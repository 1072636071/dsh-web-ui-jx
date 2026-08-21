# 04 — 轮换开关（设置存储 + 设置卡片界面）

**Status:** resolved

**Blocked by:** 03（开关消费方就位后接线）

**构建内容：** SettingsCard「角色」section 新增「动作轮换」开关，默认开启，控制 idle/working 变体轮换（D7）。要点：
1. 设置存储沿用 `overlay-settings.ts` 既有模式（持久化键 + subscribe + get/设置）。
2. SettingsCard「角色」section 加开关，与状态文案开关同款样式与交互。
3. 开关状态变化即时生效（运行期订阅），无需刷新。
4. `prefers-reduced-motion` 不额外处理（轮换非装饰动效，且开关已给用户控制权）。

**验收标准：**

- [ ] 「角色」section 出现「动作轮换」开关，默认开
- [ ] 持久化生效：刷新/重开后保留用户选择
- [ ] 关闭后 idle/working 回到单一主素材循环；开启后恢复轮换；切换即时生效
- [ ] 纯逻辑可单测；`npm run build` 与 `npm run verify` 通过

## 评论

（memorial 008 D7；样式对齐状态文案开关。）
