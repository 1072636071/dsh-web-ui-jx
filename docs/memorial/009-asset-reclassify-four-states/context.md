# 009-asset-reclassify-four-states

- 状态：进行中
- 创建时间：2026-08-23

## 诉求（用户原话）

> 我想重新处理所有素材，替换当前已经有的，咱一起优化这个方案：
> 把动作分为4类：
> 工作中
> 要权限/交互
> 错误
> 待机
>
> 原素材都在这里："E:\work\sp\openCodeMM\docs\video"

后续补充：
> 把画符咒相关的动画素材都去掉吧。当前的work相关工作素材太烂了。然后你来设计一下状态机，和素材使用。
> 用思考，看书，作为工作。不会新增素材了，先可能使用现在的素材。
> 防抖还是要保留的，需要多少状态，你重新审视一下，要保证循环的自然。
> 你整理一下当前video视频都是什么，然后进行设计，设计工作全都交给你来进行了。（委派自决）

## 追问记录

### 2026-08-23 现状盘点（agent 自查）

- 旧状态机（`src/client/state-machine/overlay-state-machine.ts`）：13 循环态 + 6 中间态表情 + 42 过渡边。
- 素材：`assets/character/` 下 25 个循环态 webp + 约 40 个过渡 webp，经 `/api/dsh-jx/character/*` 路由服务。
- **用户观察证实**：thinking/reading/replying 几乎不可见——`DEBOUNCE_STATES` 对全部工作细分态走 3000ms 防抖，窗口内高频覆盖，最终只有 working 被 dispatch；并行驻留再钉死 working。细分态名存实亡，印证 4 类收敛合理。

### Q1（2026-08-23）4 类与状态机的关系 → D1/D6 收敛为 4 循环态

### Q2（2026-08-23）画符咒与 working 素材 → D2/D3 弃用删除

### Q4（2026-08-23）工作类素材组织 → D4 用 thinking/reading；D5 防抖保留

### 2026-08-23 素材全景整理（源：`E:\work\sp\openCodeMM\docs\video`）

**循环 mp4 16 段**（根目录）：

| 素材 | 动作 | 新方案用途 |
|---|---|---|
| idle.mp4 | 待机 | 【留用】idle 主素材（已转 webp，pingpong 烘焙 9916ms） |
| thinking.mp4 | 托腮思考 | 【留用】**工作类轮换素材 A**（已转 webp 烘焙） |
| reading.mp4 | 看书翻页 | 【留用】**工作类轮换素材 B**（已转 webp 烘焙） |
| permission.mp4 | 举手请示 | 【留用】permission 循环态 |
| error.mp4 | 报错慌乱 | 【留用】error 循环态 |
| done.mp4 | 完成收工 | 【留用】done 一次性表演 |
| welcome.mp4 | 挥手欢迎 | 【留用】welcome 入场表演 |
| nod-smile.mp4 | 颔首微笑 | 【留用·需转 webp】权限批准反馈循环体 |
| frown-wave.mp4 | 皱眉摆手 | 【留用·需转 webp】权限拒绝反馈循环体 |
| headache.mp4 | 扶额头疼 | 【弃用】error 为短驻留紧急态，变体收益低（memorial 008 Q4 已论证）；无 idle↔headache 过渡 |
| replying.mp4 | 说话 | 【弃用】D4 用户拍板工作=思考+看书，说话动作在翻书轮换中出现突兀 |
| listening.mp4 | 倾听 | 【弃用】无触发源（HostEventAdapter 有方法但宿主未接线） |
| shush.mp4 / shy-smile.mp4 | 示意静音/含笑 | 【弃用】彩蛋池收敛为 happy/angry/surprised |
| walk.mp4 / look-back.mp4 | 走路/回眸 | 【弃用】入场转身链从未接入，welcome 已承担入场 |

**单向不循环 3 段**（单向不循环/）：待机-开心/惊讶/生气 → 已转 happy/angry/surprised.webp（整段 pingpong 烘焙循环）+ idle↔ 过渡 webp 全套 → poke（surprised）+ 摸鱼彩蛋（happy/angry）。

**循环的 3 段**（循环的/）：待机-张望/舒展/整理饰物 → **已是 idle-v2/v3/v4.webp**（memorial 008 D8）→ idle 变体池直接复用。

**过渡段 36 个**：按下文边清单取舍。

**已删除**：working.mp4（用户删除）、画符咒 4 段（画一横/画圆/画横来回/画上半圆弧，用户删除）。对应 assets 侧 working.webp、working-v2~v5.webp（v2~v4=画圈/画横/来回，memorial 008 D8；v5 为后备转正之一）及 idle↔working 过渡 webp 待清理。

## 决策汇总

- D1（2026-08-23）：动作分类收敛为 4 类——工作中 / 要权限·交互 / 错误 / 待机。用户原话确立。
- D2（2026-08-23）：画符咒系列全部弃用，源视频已删除；assets 侧 working*.webp（v1~v5）与 idle↔working 过渡待清理。
- D3（2026-08-23）：现有 working 素材弃用，源视频已删除。
- D4（2026-08-23）：**不新增素材**。「工作中」= thinking（思考）+ reading（看书）轮换。replying 弃用。
- D5（2026-08-23）：**防抖保留**。防抖对象从细分工作态改为 working 的进入与回落；permission/error 硬切不防抖。
- D6（2026-08-23，用户委派自决）：**状态机收敛为 4 循环态**：idle / working / permission / error。thinking/reading/replying/done 等细分不再占循环态。
- D7（2026-08-23，委派自决）：**6 个一次性表演**（边沿触发，序列播完自动回落，不占循环态）：
  - done：回合完成（running 下降沿）→ working 整圈边界切出 → thinking/reading→idle → idle→done → done 驻留 3s → done→idle
  - welcome：浮层首次入场 → idle→welcome → 驻留 ~3s → welcome→idle
  - nod-smile：权限批准（pending 下降沿 + running 继续）→ permission→nod-smile → 循环 ~2s → nod-smile→idle →（工作继续走 idle→thinking）
  - frown-wave：权限拒绝（pending 下降沿 + running 终止）→ permission→frown-wave → 循环 ~2s → frown-wave→idle
  - surprised：poke 点击惊吓（沿用 ADR-0011 机制）
  - happy/angry：并行驻留摸鱼彩蛋（沿用 ADR-0010 D7，彩蛋池收敛为 3 表情）
  - 批准/拒绝启发式：pending 下降沿后 running 继续=批准、running 终止=拒绝（实现期验证宿主信号，若有显式 denied 字段则优先用）。
- D8（2026-08-23，委派自决）：**过渡边收敛为 20 边**（素材全部已有 webp）：
  - idle↔thinking / idle↔reading（工作轮换中转，4）
  - idle↔permission / idle↔error（紧急态出入，4）
  - idle↔done / idle↔welcome（一次性表演，4）
  - permission→nod-smile、nod-smile→idle（批准链，2；nod-smile→permission 与 idle→nod-smile 弃用）
  - permission→frown-wave、frown-wave→idle（拒绝链，2；同上弃用反向）
  - idle↔surprised / idle↔happy / idle↔angry（poke 与彩蛋，6）
  - 弃用过渡：idle↔working、idle↔replying、thinking↔replying、idle↔listening、idle↔shush、idle↔shy-smile、idle↔cheek-rest、idle↔chin-rest、idle→nod-smile、idle→frown-wave、nod-smile→permission、frown-wave→permission。
- D9（2026-08-23，委派自决）：**working 显示层轮换**——进入 working：idle→thinking 过渡 → thinking 播 2 整圈（≈19.8s）→ 整圈边界切 transition-thinking-idle → idle 换气帧 → transition-idle-reading → reading 播 2 整圈 → 循环往复。随机化：每轮抽签下一段是 thinking 还是 reading（不连续重复，复用 ADR-0013 D5 随机源注入）。事件打断（permission/error/done）时等当前循环整圈边界再切出。
- D10（2026-08-23，委派自决）：**循环自然三原则**（贯穿实现）：①切换只发生在整圈边界（首尾同帧点）；②跨姿态必经过渡段；③过渡段首帧=源姿态首帧、尾帧=目标姿态首帧，播完恰落目标循环自然起点。
- D11（2026-08-23，委派自决）：**idle 变体轮换保留现有机制**（ADR-0013 播放列表拼接，池 = idle + idle-v2/v3/v4）。working 不再走 variant-rotation 池（其轮换由 runtime 表演序列机制管，因切换需过渡段而非中性帧拼接）。variant-rotation.ts 移除 working 池。
- D12（2026-08-23，委派自决）：**素材加工清单**——
  - 新转 webp ×2：nod-smile.mp4 → nod-smile.webp、frown-wave.mp4 → frown-wave.webp（chroma_key 管线，360×640、67ms/帧、pingpong 烘焙，同经典态规格）
  - 删除 assets ×约 24：working.webp、working-v2/v3/v4/v5.webp、replying.webp、listening.webp、transition-idle-working/working-idle.webp、transition-idle-replying/replying-idle.webp、transition-thinking-replying/replying-thinking.webp、transition-idle-listening/listening-idle.webp、transition-idle-shush/shush-idle.webp、transition-idle-shy-smile/shy-smile-idle.webp、transition-idle-nod-smile.webp、transition-idle-frown-wave.webp、transition-nod-smile-permission/frown-wave-permission.webp、transition-idle-cheek-rest/cheek-rest-idle.webp、transition-idle-chin-rest/chin-rest-idle.webp
  - 其余全部复用现有 webp。
- D13（2026-08-23，委派自决）：**事件映射重写**（session-follow.diffTarget 输出收敛）：
  - hasError 上升沿 → error（硬切）
  - pending 上升沿 → permission（硬切）
  - pending 下降沿 + running → nod-smile 表演 → working；pending 下降沿 + !running → frown-wave 表演 → idle
  - running &&（calls>0 或 无 chunk）→ working（防抖 2000ms 进入）
  - hasVisibleChunk → working（并入，不再区分 replying）
  - running 下降沿（无 error/pending）→ done 表演 → idle
  - 全静 → idle（防抖 2000ms 回落）
  - READING_THRESHOLD_MS（thinking 8s→reading）废弃——reading 不再是事件目标，只是 working 显示层轮换素材。
- D14（2026-08-23，委派自决）：**代码改造范围**——overlay-state-machine.ts（4 态 + 表演类型 + 20 边）、session-follow.ts（diffTarget 收敛）、overlay-session-runtime.ts（防抖改造 + working 轮换 + 统一表演调度器 + 彩蛋池收敛）、variant-rotation.ts（移除 working 池）、HostEventAdapter（方法收敛）、TRANSITION_EDGE_MS 重测、测试重写。构建验收按 AGENTS.md：`npm run build && npm run verify`。
- D15（2026-08-23，用户追加）：**所有素材切换加淡入效果**。现状：仅焦点切换（focusNonce 变化）有 150ms cross-fade（ADR-0008 决策 3 双 img underlay 机制）；播放序列内换 src（过渡段入场、过渡→循环、变体轮换换段）是硬切。设计定案：
  - 实现层：**UI 层 CSS opacity cross-fade**，复用现有 underlay 双 img 机制——item.url 每次变化（不再限于 focusNonce），旧 url 作 underlay 淡出、新 url 淡入，150ms。150ms 内连续再切则 underlay 直接替换为最新旧帧。
  - 不做资产层烘焙淡入：首帧变暗会污染循环回卷点，违反循环自然三原则（D10）。
  - 与帧级衔接的张力已评估：过渡段首尾帧本是姿态连续的（D10 原则③），150ms 淡入足够短，读作柔和切换而非闪断；prefers-reduced-motion 下禁用（沿用现有守卫）。
  - 适用面：播放序列内一切 url 变化（过渡段间、过渡→循环、idle 变体轮换、working 轮换段间）+ 焦点切换，统一一套 cross-fade 路径。

## 待澄清

- （清零——用户已委派自决，剩余均为实现期技术验证项：批准/拒绝宿主信号验证、TRANSITION_EDGE_MS 重测、质检门复跑）
