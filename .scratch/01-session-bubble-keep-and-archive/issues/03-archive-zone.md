# 03 — 归档区：真归档 + 第二开关 + 防复活排除

**Status:** resolved

**Blocked by:** 02

**构建内容：** 远放警示「归档区」端到端可用：拖入即调 SDK 真归档——气泡与侧边栏同时清爽且永不复活；当前正停留的会话拖入被拒；设置卡出现「拖拽归档会话」开关（主从于总开关，关闭时仅剩收起区）。收尾完成 DESIGN.md 回写与最终验收。

**验收标准：**

- [ ] 宿主归档集读入投影上下文并参与排除——已归档会话不再出现于气泡列（即使本地仍记着 kept）
- [ ] 归档区远放（角色脚边），警示描边 + hover 提示「归档后从列表隐藏，不可恢复」
- [ ] 拖入松手 → 调用归档接口 → 气泡淡出、侧边栏同步隐藏；失败静默，气泡不消失即为失败信号（无错误 UI）
- [ ] 当前会话气泡拖入归档区呈禁止态且不发起调用（消费 02 矩阵的 forbidden 组合）
- [ ] 设置卡开关②主从灰显：总开关关时不可用；开关②关时归档区不渲染、仅剩收起区
- [ ] 双开关组合的投影退化路径测试补齐（①关②任意 = 现状；①开②关 = 仅收起区语义）
- [ ] DESIGN.md §4 追加投放区与拖拽手势条目（ADR-0022 后果清单回写项）
- [ ] `npm run build` + `npm run verify` 最终通过

## 答案

### 变更文件清单

- **`src/client/components/SessionBubbleList.tsx`**（本片主体）：
  - props 新增 `workspaces?: IWorkspaces`；订阅 `workspaces.list` 快照（缺省时 noop + undefined，镜像 sessions 模式）；
  - `archivedIds`：从快照 `archivedSessionIds` 派生 `ReadonlySet<string>`（useMemo 仅随快照引用变化；快照未就绪 = 稳定空集 EMPTY_ARCHIVED）——**归档权威在 SDK，本地不重复记账归档态（ADR-0022 D8）**；
  - keepContext 接入第 4 位 `archived`（C1 契约参数位正式填充）；开关②不进投影（其职责是归档区显隐）；
  - pointerup 判定新增 archive 分支：`workspaces?.archiveSession(g.id)` + `.catch(() => {})` **失败静默**——无错误 UI，气泡不消失即为失败信号（ADR-0022 D3 兑现）；成功后宿主快照更新 ⇒ 排除集变化 ⇒ 投影移除 ⇒ 既有 leaving 淡出接管视觉移除，侧边栏同步隐藏、永不复活；当前泡×归档已被矩阵拦为 forbidden（D5），不会发起调用；
  - 归档区渲染：组件返回改为 Fragment 双根——第二根挂 `.archiveZone`，门控 `keepEnabled && archiveDragEnabled`（②关 = 仅剩收起区）。
- **`src/client/components/CharacterOverlay.tsx`**：props 透传 workspaces → SessionBubbleList。
- **`src/client/index.ts`**：`ctx.get("workspaces")` → RootApp → CharacterOverlay（ADR-0007 sessions 模式的镜像接线）。
- **`src/client/components/SettingsCard.tsx`**：设置卡开关②「拖拽归档会话」——主从灰显（①关时 `disabled` + `aria-disabled` + title「需先开启查看后保留气泡」+ 描述文案切换）；默认开（误触已被远近分置 + 朱砂警示 + 仅 completed 可拖三重约束兜住，PRD 用户故事 8 收益论证）。
- **`src/client/styles/session-bubbles.module.css`**：`.archiveZone`——锚定浮层盒（`.overlay` 是 position:fixed 包含块）正下方居中、`top: calc(100% + 32px)` 让位状态文案标签；朱砂实线描边 + 朱砂文字（`--jx-seal` 双主题警示语义，区别于收起区虚线素线弱化语言）；title hover 提示；pointer-events:auto（elementFromPoint 命中前提）；与收起区横向相隔整个盒宽——远近分置即防误触栏（D3）；静态无动画，reduced-motion 天然免分支。
- **`src/client/styles/sidebar-settings.module.css`**：`.toggleDisabled` 主从灰显态（opacity 0.45 + not-allowed 光标 + hover 不提亮）。
- **`tests/client/session-bubbles.test.ts`**：+4 护栏用例（76→80）——①「①关 × 全脏集（kept/dismissed/archived 含幽灵 id）= 现状逐条目全等」②「①开 × archived 缺省/空集 = 与仅开关①全等（SDK 快照未就绪 = 无排除）」③「优先级网格：archived > dismissed > kept > 基线；running/pending 豁免压过归档集」（7 条目可见性逐条断言）④「防复活（PRD 用户故事 14）：已归档 + kept 记账不复活——②关闭亦同（②不进投影）」。
- **`DESIGN.md` §4 回写**：新增「保留模式投放区与拖拽手势（ADR-0022）」条目——双投放区几何/视觉语义、判定矩阵要点、合成 click 必吞结论、归档权威在 SDK。

### 验收标准核对

- [x] 宿主归档集读入投影上下文并参与排除：workspaces.list 订阅 → archivedIds 派生 → context.archived；已归档会话不再出现于气泡列（即使本地仍记着 kept——护栏用例④）
- [x] 归档区远放（角色脚边）：浮层盒正下方居中锚定 + 朱砂警示描边 + title hover 提示「归档后从列表隐藏，不可恢复」
- [x] 拖入松手 → archiveSession → 宿主快照更新 → 投影移除走既有淡出、侧边栏同步隐藏；失败静默 catch，气泡不消失即失败信号（无错误 UI）
- [x] 当前会话气泡拖入归档区呈禁止态且不发起调用（消费 02 矩阵 forbidden 组合，isCurrent×archive）
- [x] 设置卡开关②主从灰显：总开关①关时 disabled+aria-disabled+灰显不可用；②关时归档区不渲染、仅剩收起区
- [x] 双开关组合的投影退化路径测试补齐：4 用例（见上）
- [x] DESIGN.md §4 追加投放区与拖拽手势条目（ADR-0022 后果清单回写项）
- [x] npm run build + npm run verify 最终通过

### 验证命令结果（队长修订口径：typecheck 相对 HEAD 基线无新增）

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/client/session-bubbles.test.ts` | ✅ 80/80（76 + 4 护栏用例） |
| `npm run typecheck` | ✅ 错误集合 ⊆ 存量基线 5 处（character-overlay-crossfade ×2 / overlay-session-runtime / state-machine / variant-rotation 的 .test.ts），无新增、不落变更文件——符合修订口径。过程中 typecheck 曾暴露 SessionBubbleList 一处 t2 遗漏的 type-only 导入（DropZoneKind，手势落点解析处引用），本片补上后归零 |
| `npm test` | ✅ **306/306（14 文件全绿）** |
| `npm run build` | ✅ lib/index.js + lib/client.js 144.75 kB |
| `npm run verify` | ✅ 21/21 通过，exit 0 |

### 实施注记

0. **C17 补正（队长并行协调指令触发）**：初版实现漏了把 `"workspaces"` 加进 `src/client/index.ts` 的 `export const inject` 服务声明列表（只加了 `ctx.get("workspaces")` 调用）——已补正为 `["sessions", "workspaces"]` 并复跑全套（306/306 + build + verify 21/21 全绿）。同时按指令核验了 CharacterOverlay.tsx 增量收敛性：git diff 确认本特性增量恰为最小集（导入 IWorkspaces 类型 / props 接口一字段 / 解构一处 / SessionBubbleList 透传一处），与并行努力 ADR-0023 的 welcome 移除改动（台词表/标签表）在同文件内干净共存、零行级碰撞。
1. **纯逻辑零改动**：判定矩阵与归档排除/豁免/优先级语义按 C1 契约在工单01 已预建（参数位一次定形）、02 补齐 forbidden 格——本片是纯接线片（SDK 订阅 + 调用 + 渲染层门控）。故新增 seam 测试为文档级护栏、直接落绿（无新纯逻辑可红，「先红后绿」在本片不适用，如实记录）；组件手势/渲染按仓内惯例不测，由 build+verify 兜底。
2. 迷雾②（归档接口失败形态）定案：无需枚举具体 RPC 错误形态——catch 静默吞掉任何 rejection，以「气泡未消失即失败信号」的约定兜底（ADR-0022 D3 原案兑现），map.md 迷雾② 已关闭。
3. 归档成功路径的 UI 反馈完全由数据流驱动：宿主 archivedSessionIds 更新 → 本组件排除集派生 → 投影移除 → leaving 淡出。无本地乐观删除、无错误重试 UI——与「归档权威在 SDK」单一权威原则一致。

### 审查修复轮（t6）

- **S1（已修）**：补「①开②关 = 仅收起区语义」显式命名投影测试格（issue03 验收第 6 条字面要求）——断言同一 BubbleKeepContext 形状的输出恒等，注释钉死②不在投影上下文的结构性隔离（编译期保证）+ 渲染层门控归属，防未来误把②引入投影签名。
- **S3（已修）**：开关② disabled 态的 `title` 提示从按钮移至外层 `.fxItem` 容器（部分浏览器不弹 disabled 按钮 title；悬停整行可见），描述文案切换兜底保留。
- **S4（已修）**：ADR-0022 后果段补「归档排除的豁免边界」说明——running/pending 紧急可见性压过归档排除集是对 PRD 用户故事14 绝对表述的有意限定（测试钉死：优先级网格用例），非实现偏差；绝对隐匿仅对已完成且无等待交互条目成立。

## 评论

（新内容置于最前。）

- 上下文指针：`PRD.md`（实现决策 §归档权威在 SDK / §设置卡）、ADR-0022 决策 3/5/6/8、memorial 010 D6/D8/D13。
- 归档权威在 SDK：本地不重复记账归档态，排除集合每次从宿主快照派生。
