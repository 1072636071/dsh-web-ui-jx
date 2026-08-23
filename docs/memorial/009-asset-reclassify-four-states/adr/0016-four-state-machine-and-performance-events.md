# ADR-0016：四态状态机与一次性表演事件

- 状态：提议（memorial 009 决策 D1–D14，待用户确认后转已接受）
- 日期：2026-08-23
- 推翻/修订：ADR-0008（13 循环态）、ADR-0009（生活化表情循环态）、ADR-0010 D1（工作细分态防抖对象）的部分内容

## 背景

角色浮层旧架构为 13 循环态 + 6 中间态表情 + 42 过渡边（ADR-0008/0009）。实机观察：thinking/reading/replying 三个工作细分态几乎不可见——焦点层 3000ms 防抖（ADR-0010 D1）在窗口内高频覆盖，只有 working 最终落盘；并行驻留再钉死 working。细分态的素材与过渡边投入（thinking↔replying 等）形同虚设。

同时 working 素材（画符咒系列）观感差，用户拍板弃用全部符咒素材且不再新增素材，工作类改用现有 thinking（思考）/reading（看书）担当。

## 决策

**状态机收敛为 4 循环态**：`idle`（待机）/ `working`（工作中）/ `permission`（要权限·交互）/ `error`（错误）。

**一次性表演事件**（边沿触发、播完回落、不占循环态）：done（回合完成）、welcome（入场）、nod-smile（权限批准）、frown-wave（权限拒绝）、surprised（poke 惊吓）、happy/angry（摸鱼彩蛋）。

**过渡边收敛为 20 边**：idle 枢纽（↔thinking/reading/permission/error/done/welcome/surprised/happy/angry）+ 权限反馈链（permission→nod-smile→idle、permission→frown-wave→idle）。

**working 显示层轮换**：thinking 与 reading 经 idle 中转过渡交替（各播 2 整圈 ≈19.8s，随机不连续重复），切换只发生在整圈边界。事件层面 working 是单一意图，素材轮换由显示层驱动。

**防抖保留但对象改变**：working 进入/回落防抖 ~2000ms（防回合边界抖动）；permission/error 硬切（紧急态原则不变）。READING_THRESHOLD_MS（thinking→reading 8s 推导）废弃。

## 循环自然三原则

1. 切换只发生在整圈边界（pingpong 烘焙后首尾同帧点）；
2. 跨姿态必经过渡段，无硬切；
3. 过渡段首帧=源姿态首帧、尾帧=目标姿态首帧，播完恰落目标循环自然起点。

**素材切换统一淡入**（D15）：播放序列内一切素材切换（过渡段间、过渡→循环、变体轮换）与焦点切换统一走 UI 层 150ms CSS opacity cross-fade（复用 ADR-0008 双 img underlay 机制，触发条件从 focusNonce 变化扩展为 item.url 任意变化）。不做资产层烘焙淡入——首帧变暗会污染循环回卷点，违反循环自然三原则。prefers-reduced-motion 下禁用。

## 被否决的替代方案

- **保留 13 态、4 类仅作素材分组**：状态与素材多对多，防抖覆盖问题不解决，"替换素材"不彻底。
- **4 态 + 拆除防抖**：working↔idle 边界抖动（连续回合、多会话切焦）会失去保护，用户明确否决。
- **working 变体走 ADR-0013 播放列表拼接**：thinking/reading 是独立姿态循环（非中性姿起止），拼接会跳变；必须经 idle 中转过渡。
- **replying 保留**：说话动作在思考/翻书轮换中突兀，且事件语义并入 working 后无触发场景。
- **新生成 working 素材**：用户拍板不新增素材。

## 后果

- 素材加工量极小：仅需新转 nod-smile/frown-wave 两个循环体 webp；删除约 24 个符咒系与弃用态 webp；其余全部复用。
- 事件映射（diffTarget）输出从 7 目标收敛为 5 目标（working/permission/error/done/idle + 表演触发）。
- 6 中间态表情（shush/shy-smile/cheek-rest/chin-rest 等）退出舞台，彩蛋池收敛为 3 表情。
- 会话级 runtime 架构（每会话状态机 + 焦点仲裁 + 并行驻留，ADR-0008/0010 主干）不变。
