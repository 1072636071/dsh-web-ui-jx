# 台词与状态文案收敛

**Status:** resolved

**Blocked by:** 02

**构建内容：** 角色说的话和下方状态标签与新四态语义一致——工作中/需大人首肯/此事有蹊跷/候命中，表演时刻（收工/欢迎/颔首/皱眉/惊吓/彩蛋）有对应台词，退役状态的文案不再出现。

**验收标准：**

- [x] 台词表收敛到四循环态 + 表演态（done/welcome/nod-smile/frown-wave/surprised/happy/angry）；replying/listening/thinking/reading 等退役态文案移除
- [x] 状态标签表同步收敛；working 轮换期间标签恒为「工作中」语义（不随 thinking/reading 素材切换变化）
- [x] 表演态台词触发时机与表演序列对齐（入场时弹、不重复弹）；idle 不弹标签台词的现有习惯保留
- [x] 状态文案开关、变体轮换开关（设置卡片「角色」区）行为不回退
- [x] 相关组件测试更新绿


- 2026-08-23：决策依据 PRD 实现决策 13。文案语气沿用唐风角色既有风格（STATE_SPEECH 现存措辞为基准）。

## 评论

- 2026-08-23：决策依据 PRD 实现决策 13。
- 2026-08-23（完成）：STATE_SPEECH 收敛到四态 + 表演态台词（working/permission/error/done/welcome/nod-smile/frown-wave/happy/angry，surprised 走惊吓池），replying/listening/thinking/reading 及 shy-smile/shush/chin-rest/cheek-rest 文案移除；STATE_LABEL 同步收敛（working 标签恒「工作中」，轮换期间不随素材变化）；idle 不弹标签台词习惯保留；状态文案开关与变体轮换开关行为不变；新增 nod-smile/frown-wave 台词按唐风语气补写。相关组件路径由 runtime 测试覆盖 currentState 断言。
