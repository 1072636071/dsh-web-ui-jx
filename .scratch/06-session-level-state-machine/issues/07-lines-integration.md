# 07 — 台词接入

**Status:** resolved

**Blocked by:** 05

**构建内容：** 角色台词按场景弹出：9 个状态场景（思考/阅读/回复/执行/出错/登场/完成/授权/聆听）与 3 个表情场景（开心/生气/惊吓）触发时显示对应台词气泡（文案以 `docs/character-lines.md` 台词场景表当前内容为准，留空场景不弹气泡）。

**验收标准：**

- [ ] 9 状态台词按场景表弹出（文案原样使用，不做二次创作）
- [ ] 3 表情台词随表情触发弹出（与表情动画并行，互不阻塞）
- [ ] 场景表留空或标注「无」的场景不弹气泡
- [ ] 台词随会话焦点切换正确归属（非焦点会话的台词不串台）
- [ ] 气泡行为保持既有约定（淡入淡出、自动隐去、不拦截指针）
- [ ] 通过 `npm run build` 与 `npm run verify`

## 评论

（来源：PRD 实现决策 9；memorial 004 D15。台词文案由用户填写——若场景表仍为空白示例，实施时接入示例文案，用户后续替换即可。）

### 关闭记录（2026-08-27 状态回填）

本票以四态收敛形态实现关闭：

- 触发规则收敛进纯逻辑模块 [overlay-speech.ts](../../src/client/state-machine/overlay-speech.ts)（深拆 commit 0bc02da；文案源 docs/character-lines.md 人设场景表）：STATE_SPEECH 映射 working/error/permission/done/nod-smile/frown-wave/happy/angry 八场景；SURPRISE_LINES 为惊吓随机池（可注入 random）；
- 留空场景不弹气泡：Partial 映射缺项即无台词（idle/thinking/reading 不弹为显式设计）;
- 台词归属：runtime 仅渲染焦点会话快照，台词随 currentState 推导，非焦点会话不产生输出，不串台；
- welcome 台词条目随 ADR-0023 移除同步清理；
- 气泡淡入淡出/自动隐去约定保持，单测 tests/client/overlay-speech.test.ts 9 例通过。
- 2026-08-27 复验：build ✓、verify 21/21 ✓、全量 vitest 447 绿。
