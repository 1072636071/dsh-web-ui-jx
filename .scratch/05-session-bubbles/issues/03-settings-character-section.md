# 03 · SettingsCard「角色」section（上限配置）

**Status:** resolved

**Blocked by:** 01, 02

**构建内容：** 设置卡（SettingsCard）新增「角色」可折叠 section（默认折叠，复用既有 section 结构）：数字输入调整会话气泡数量上限（min 1 / max 10 / step 1，默认 5），改动即时生效于角色浮层气泡列并持久化，刷新/重开插件后保留。

**验收标准：**

- [ ] 「角色」section 出现在设置卡（默认折叠，▸ 展开/▾ 收起，键盘可激活，样式复用既有 section 模式）
- [ ] 数字输入初始值 = 配置模块读取值（默认 5）；输入即时调配置模块写入并钳制 [1,10]（越界值回落到边界）
- [ ] 输入值变化后，角色浮层气泡列的折叠阈值实时变化（改小 → 更多气泡收进「+N」；改大 → 露出更多）
- [ ] 刷新页面/重开插件后上限保持（localStorage 持久化）
- [ ] `npm run typecheck` + `npm run test` 全绿

## 评论

- 回写（2026-08-23）：清点核实已实施——SettingsCard「角色」section 上限配置完成（提交 443814b）。状态由 ready-for-agent 补记为 resolved。

来源：`.scratch/05-session-bubbles/PRD.md` 实现决策 3/10 + 用户故事 11；ADR-0007 决策 5。