# ADR-0023 — 移除 welcome 入场表演

## 状态

已接受（2026-08 grill 会话「欢迎场景移除」定案）。

## 背景

四态收敛重构（设计出处 `.scratch/10-four-state-character-assets/PRD.md` 决策 7）把「浮层首次入场播欢迎表演」定为仪式感设计：idle→welcome 过渡 → 驻留约 3s → welcome→idle，由 runtime 的 `welcomeOnStart` 在浮层首次入场时自触发，这也是 welcome 在当前代码里的唯一触发点（旧的宿主事件 `onAssistantWelcome` 在四态收敛时已删）。实际使用中该场景从未产生价值，用户裁定「欢迎的场景根本用不上」，彻底移除。

**文档沿革勘误**：四态收敛与表演态设计从未单独立 ADR；代码注释与 CONTEXT.md 曾将其出处写作「ADR-0016」，实为笔误——ADR-0016 是《播放计划结构等价门槛》，与本主题无关。本 ADR 是表演态成员变动的第一份正式决策记录，后续讨论引用此处。

## 决策

**D1 — 彻底移除 welcome**：

- 素材：删 `assets/character/welcome.webp`、`transition-idle-welcome.webp`、`transition-welcome-idle.webp`（合计约 15MB；character webp 总数 37→34，其中过渡段 22→20）。
- 状态机：`OverlayState` 去 `"welcome"` 节点；边表去 `idle↔welcome` 两条；`TRANSITION_EDGE_MS` 去对应两条时长。
- 触发逻辑：删除 `welcomeOnStart` 选项及 runtime 首次入场的 `startPerformance("welcome", …)` 分支。
- 文案：`STATE_SPEECH.welcome`（「大人来了，姜晓候久。」）与 `STATE_LABEL.welcome`（「大人来了」）移除。
- 测试：「welcome 入场表演」用例删除；各测试里 `welcomeOnStart: false` 注入随选项消失一并简化。

**D2 — 入场替代体验 = 无表演**：浮层首次出现直接落基础显示态（通常为 idle 待机循环）。复用 done/nod-smile 等现有表演顶替见面礼的方案被否决——它们各有业务语义（收工/批准），挪作欢迎用会稀释语义（与 ADR-0010 否决「彩蛋池加入 welcome/listening」同一理由）。

**D3 — 边界不动项**：

- `tools/anim_loop_repair.py`、`diag_classic_motion.py` 的旧十态清单保留 `"welcome"`：二者是历史一次性烘焙/诊断脚本，名单是当年操作记录（且早已含退役态 replying/listening），不为本次改动改写历史工具。
- `.scratch/` PRD 与 issues、`docs/memorial/` 为历史记录，不回写。
- `.temp/preview/jiangxiao-demo.html` 手工预览页非发布物，其欢迎按钮/台词随手清理。

## 后果

- npm 发布包减重约 15MB。
- 表演态收敛为 6 种：done / nod-smile / frown-wave / surprised / happy / angry；首次入场无仪式动作。
- 若未来想要恢复入场仪式，需从 git 历史找回三件套素材并重建节点/边/时长表，成本可预期但非零。
- `scripts/verify-release.mjs` 不受影响（只检查素材存在性，不查数量）；`.temp/scripts/measure_all_durations.mjs` 为历史复测临时脚本，不在维护面内。
