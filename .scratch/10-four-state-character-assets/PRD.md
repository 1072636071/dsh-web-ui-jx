# PRD — 角色素材四态重构（状态机收敛与素材全量替换）

Status: ready-for-agent
来源: memorial 009（jxx-grill-with-memorial，2026-08-23，决策 D1–D15）+ ADR-0016 + ADR-0008/0010/0011/0013/0015 + DESIGN.md §4

## 问题陈述

DSH 宿主用户日常使用中，角色浮层的工作类动画存在三个相互叠加的问题：

1. **细分工作态名存实亡**：状态机虽有 thinking/reading/replying/working 四个工作细分态，但焦点层 3000ms 防抖在高频工具链场景下反复覆盖，最终只有 working 可见；多会话并行驻留再钉死 working。用户实机几乎从未见过思考/看书/回复动画——为这些细分态制作的素材与过渡边（thinking↔replying 等）全部形同虚设。
2. **working 素材观感差**：工作态是画符咒动作（符咒凭空出现/收起有硬弹出史，memorial 008 局部镜像修复后仍不理想），用户拍板「太烂」，源视频与画符咒变体系列已删除。
3. **素材切换生硬**：播放序列内部换素材（过渡段入场、过渡→循环、变体轮换换段）均为硬切，仅焦点会话切换有 150ms 淡入淡出，视觉断裂感明显。

## 解决方案

将角色动画体系收敛为**四态状态机 + 一次性表演事件**（ADR-0016），素材全量重组但**不新增任何视频素材**——工作类由现有「思考」（thinking）与「看书」（reading）素材轮换担当，画符咒系列与无触发源素材全部退役。

- **4 循环态**：待机（idle）/ 工作中（working）/ 要权限·交互（permission）/ 错误（error）。事件层面工作不再细分——思考中、工具调用中、回复输出中统一映射 working。
- **6 一次性表演**（边沿触发、播完自动回落、不占循环态）：done（回合完成）、welcome（入场）、nod-smile（权限批准）、frown-wave（权限拒绝）、surprised（点击惊吓）、happy/angry（并行驻留摸鱼彩蛋）。
- **working 显示层轮换**：思考播 2 整圈 → 经待机中转过渡换气 → 看书播 2 整圈 → 随机交替（不连续重复）。切换只发生在整圈边界，跨姿态必经过渡段。
- **待机变体轮换保留**：张望/舒展/整理饰物三段变体沿用现有播放列表拼接机制。
- **防抖保留**：working 进入与回落防抖约 2000ms（防连续回合/多会话切焦抖动）；permission/error 硬切不防抖（紧急态即时原则不变）。
- **全素材切换淡入**：播放序列内一切素材切换与焦点切换统一走 150ms 淡入淡出（cross-fade），prefers-reduced-motion 下全关。

## 用户故事

1. 作为 DSH 宿主用户，我想要助手跑工具/思考/输出回复时角色统一呈现「工作中」（思考与看书动作自然轮换），以便我能稳定感知助手在干活，而不是看到动画在不同细分动作间急促乱跳。
2. 作为 DSH 宿主用户，我想要工作动画在思考与看书之间轮换（各播约两整圈后经待机姿态自然过渡交替），以便长时间工作时画面不单调。
3. 作为 DSH 宿主用户，我想要工作动画的轮换只发生在动作整圈播完的边界、且跨姿态必经过渡段，以便我永远看不到动作半途被拦腰切断或姿态硬跳。
4. 作为 DSH 宿主用户，我想要助手请求权限时角色立即切到请示动作（不打断延迟），以便审批等待有明确的视觉对应。
5. 作为 DSH 宿主用户，我想要我批准权限后角色颔首微笑再回去继续工作，以便我的操作有正向反馈。
6. 作为 DSH 宿主用户，我想要我拒绝权限后角色皱眉摆手再回到待机，以便拒绝也有明确的视觉确认。
7. 作为 DSH 宿主用户，我想要助手出错时角色立即切到报错动作（硬切、不被任何进行中动画遮蔽），以便我第一时间感知异常。
8. 作为 DSH 宿主用户，我想要回合完成时角色做一次「收工」表演再回到待机，以便完成时刻有仪式感。
9. 作为 DSH 宿主用户，我想要浮层首次入场时角色做一次欢迎表演，以便首次见面有入场仪式。
10. 作为 DSH 宿主用户，我想要待机时角色在待命/张望/舒展/整理饰物之间随机轮换，以便长期挂机画面不单调（现状保留）。
11. 作为 DSH 宿主用户，我想要点击角色仍触发惊吓表演与台词，以便互动彩蛋保留（现状保留）。
12. 作为 DSH 宿主用户，我想要多会话并行运行时浮层显示工作中、且摸鱼彩蛋（开心/生气/惊讶）仍会随机出现，以便并行场景体验不回退（现状保留，彩蛋池收敛为 3 表情）。
13. 作为 DSH 宿主用户，我想要所有素材切换（过渡段间、过渡→循环、变体轮换、焦点切换）都带 150ms 淡入淡出，以便画面切换柔和不闪断。
14. 作为 DSH 宿主用户，我想要系统偏好「减少动态效果」时淡入淡出全部关闭，以便动效可访问（现状原则沿用）。
15. 作为 DSH 宿主用户，我想要画符咒相关动画（工作主素材与全部符咒变体）彻底消失，以便不再看到观感差的符咒动作。
16. 作为 DSH 宿主用户，我想要回合刚开始或结束的瞬间动画不急促往返切换（进入/回落各有约 2 秒确认窗口），以便连续快速提问时画面稳定。
17. 作为 DSH 宿主用户，我想要角色下方的状态文案与四态语义一致（候命中/工作中/需大人首肯/此事有蹊跷等），以便文案与动画不脱节。
18. 作为开发者，我想要状态机的循环态只有 4 个、过渡边收敛为 20 条，以便状态空间可枚举、素材清单可穷举验收。
19. 作为开发者，我想要素材重组不新增视频生成环节（仅新转 nod-smile/frown-wave 两个 webp 循环体、删除约 24 个退役 webp），以便本次重构不涉及外部生成工具链。
20. 作为维护者，我想要防抖机制保留但对象从细分工作态改为 working 进入/回落，以便连续回合与多会话切焦的边界抖动仍有保护。

## 实现决策

1. **状态机收敛**（推翻 ADR-0008 的 13 循环态、ADR-0009 的表情循环态部分内容）：循环态 = idle / working / permission / error 四态。thinking/reading/replying/done/welcome/listening 不再作为循环态节点；6 中间态表情（shy-smile/shush/nod-smile/frown-wave/chin-rest/cheek-rest）类型整体退役。
2. **一次性表演类型**：新增表演概念——边沿触发、由过渡段入→循环体驻留（或定格）→过渡段出的固定序列，播完自动回落至基础显示态。表演与循环态在类型层分离，表演不作为切换意图目标。
3. **过渡边收敛为 20 边**：idle↔thinking、idle↔reading（工作轮换中转）；idle↔permission、idle↔error（紧急态出入）；idle↔done、idle↔welcome（表演出入）；permission→nod-smile、nod-smile→idle（批准链）；permission→frown-wave、frown-wave→idle（拒绝链）；idle↔surprised、idle↔happy、idle↔angry（poke 与彩蛋）。弃用边：idle↔working、idle↔replying、thinking↔replying、idle↔listening、idle↔shush、idle↔shy-smile、idle↔cheek-rest、idle↔chin-rest、idle→nod-smile、idle→frown-wave、nod-smile→permission、frown-wave→permission。
4. **事件映射收敛**（会话差分推导重写）：error 上升沿 → error（硬切）；pending 上升沿 → permission（硬切）；pending 下降沿 + 回合仍在运行 → nod-smile 表演后回 working；pending 下降沿 + 回合已终止 → frown-wave 表演后回 idle；运行中（有工具调用或有可见输出或无输出思考中）→ working（进入防抖约 2000ms）；running 下降沿（无 error/pending）→ done 表演后回 idle；全静 → idle（回落防抖约 2000ms）。批准/拒绝启发式：以下降沿后 running 是否继续区分，若宿主提供显式拒绝信号则优先采用（实现期验证）。thinking 持续 8 秒推导 reading 的阈值逻辑废弃——reading 仅是显示层轮换素材。
5. **working 显示层轮换**：进入 working 时经 idle→thinking 过渡起播；每个工作素材播 2 整圈（整圈时长由 webp 时长解析获得，烘焙后约 9916ms）后在整圈边界切出，经「当前→idle→下一段」过渡换气；下一段在 thinking/reading 间随机抽取、不连续重复（复用可注入随机源）。事件打断（permission/error/done）时等当前整圈播完再切出。working 不再走变体轮换池（其素材为独立姿态循环，须经过渡段衔接，与待机变体的中性帧拼接机制不同构）。
6. **待机变体轮换保留**：池 = idle 主素材 + 3 变体（张望/舒展/整理饰物），ADR-0013 播放列表拼接与随机不重复抽取、设置开关、段间中性帧停顿全部沿用；变体轮换配置中移除 working 池。
7. **表演调度**：done 表演 = 工作态整圈边界切出 → 经 idle 中转 → idle→done 过渡 → done 循环体驻留约 3s → done→idle；welcome = 浮层首次入场时 idle→welcome → 驻留约 3s → welcome→idle；nod-smile/frown-wave = permission→表情过渡 → 循环体约 2s → 表情→idle（之后按现场回落工作或待机）；surprised/happy/angry 沿用 ADR-0010/0011 现有 poke 与彩蛋机制，彩蛋池收敛为 3 表情。所有表演定时器按过渡段实测时长排程（现有 TRANSITION_EDGE_MS 机制，重构后随边表重测）。
8. **循环自然三原则**（贯穿全部实现）：①切换只发生在整圈边界（pingpong 烘焙后首尾同帧点）；②跨姿态必经过渡段，无硬切；③过渡段首帧=源姿态首帧、尾帧=目标姿态首帧，播完恰落目标循环自然起点。
9. **统一淡入**（D15）：浮层组件的 cross-fade 触发条件从焦点切换扩展为播放项 url 任意变化——旧素材作底层淡出、新素材上层淡入，150ms；150ms 内连续再切时底层直接替换为最新旧帧（盒内 img 恒 ≤2 的自愈守卫不变量兼容）。不做资产层烘焙淡入（首帧变暗会污染循环回卷点）。prefers-reduced-motion 下禁用。
10. **素材加工**：新转 nod-smile.webp / frown-wave.webp 两个循环体（绿幕抠像管线，360×640、67ms/帧、pingpong 烘焙，同经典态规格；转码质检门沿用 memorial 008 三道门）；删除退役 webp 约 24 个（working 主素材与 v2~v5 符咒变体、replying、listening、12 条弃用过渡）；其余素材全部复用。素材与代码同包发布契约（ADR-0003）不变。
11. **会话级架构主干不变**：每会话一个状态机实例 + 焦点仲裁 + 紧急抢焦 + 并行驻留（ADR-0008/0010 主干）保留；并行驻留仍显示 working。
12. **宿主事件适配器收敛**：适配方法收敛为 idle/working/permission/error/done 五目标 + 表演触发；replying/reading/thinking/listening/welcome 等旧方法移除（welcome 改由浮层入场自触发）。
13. **台词与状态文案**：STATE_SPEECH/STATE_LABEL 收敛到四态 + 表演态（done/welcome/nod-smile/frown-wave/surprised/happy/angry）；replying/listening 等退役态文案一并清理。

## 测试决策

- **好测试的标准**：只测外部行为（状态机输出的播放计划序列、事件映射结果、轮换抽取序列、快照结构），不测实现细节（定时器 id、内部缓存形状）。
- **seam（全部沿用现有，新 seam 数 = 0）**：
  - 会话差分推导纯函数（输入 prev/curr 核心快照 → 输出目标态/表演触发）——先例：现有 diffTarget 单测；
  - 状态机纯逻辑（计划构造、边表查询）——先例：tests/client/state-machine.test.ts；
  - 会话级 runtime（注入虚拟时钟 now、可注入随机源、fake ISessions 快照源、__tick 手动推进）——先例：tests/client/state-machine.test.ts 与 client-apply-reentrant.test.ts 的注入模式；
  - 变体轮换纯函数（池内容、随机不重复抽取、周期表）——先例：现有 variant-rotation 单测；
  - webp 时长解析真实素材回归（重测后的 TRANSITION_EDGE_MS 表）——先例：webp-duration.test.ts。
- **重点覆盖**：事件映射收敛后的全分支（含 pending 下降沿批准/拒绝两路）；working 轮换的整圈边界切出与随机不重复；表演序列的排程与自动回落；permission/error 硬切打断表演；并行驻留与彩蛋在新状态集合下的行为；淡入触发条件扩展后焦点切换行为不回退。
- **验收**：`npm run build && npm run verify`（AGENTS.md 标准流程，21 项检查）；全量 vitest 绿。

## 超出范围

- 新增视频素材生成（用户明确拍板不新增；working 新动作主题留待未来若重启生成再议）。
- 全量素材瘦身（memorial 008 记录的后续工单候选，不在本次范围）。
- 宿主权限批准/拒绝显式信号的上游改造（本次仅用启发式或现有字段）。
- 会话气泡列、管理界面等其他浮层子系统。
- 源仓库（openCodeMM）侧 PROGRESS.md 文档更新。

## 补充说明

- 决策全过程与素材全景盘点见 `docs/memorial/009-asset-reclassify-four-states/context.md`（D1–D15）；架构论证见同目录 `adr/0016-four-state-machine-and-performance-events.md`。
- 源素材位置：`E:\work\sp\openCodeMM\docs\video\`（nod-smile.mp4、frown-wave.mp4 为本次仅有的两个待转码源）。
- memorial 009 收尾时按流程回写：ADR-0016 → `docs/adr/`；四态词汇（一次性表演/循环自然三原则等）→ CONTEXT.md（均需用户确认）。
