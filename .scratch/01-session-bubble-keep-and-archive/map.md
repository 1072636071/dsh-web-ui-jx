# map — 会话气泡保留 + 双投放区

## 已做决策（上下文指针）

- **Grill 全记录**：`docs/memorial/010-session-bubble-keep-on-view/context.md`（6 轮追问 · D1–D15 · 回写记录）
- **架构依据**：ADR-0022 —— `docs/adr/0022-session-bubble-keep-and-archive.md`（全局）+ memorial 内部副本；含全部被否决替代方案
- **规格**：本目录 `PRD.md`（20 用户故事 · 实现决策 · 测试决策 · 超出范围），Status: ready-for-agent
- **Seam 裁定**：唯一 seam = 气泡纯逻辑模块及其既有测试文件；投影函数一次性扩展完整上下文形状（01 定形，02/03 填充）；判定矩阵 02 一次写全
- **词汇**：保留模式 / 投放区 / 收起区 / 归档区 —— 见全局 CONTEXT.md

## 工单前沿

| # | 工单 | 阻塞于 |
|---|------|--------|
| 01 | click-keep（总开关 + kept 记账端到端）——**已完成（resolved）**：BubbleKeepContext 一次性定形（seam 可选第 4 参）+ `session-bubble-keep-config.ts` 新模块 + SessionBubbleList 接线（订阅/记账/惰性裁剪）+ 设置卡开关①；TDD 红→绿，vitest 66/66、npm test 293/293、build+verify 21/21 通过；typecheck 存量 5 错与本片无关（详见 issue 01 答案）；未 commit（待队长统一审查） | 无——可立即开始 |
| 02 | dismiss-zone-drag（拖拽手势骨架 + 本地隐藏）——**已完成（resolved）**：判定矩阵一次写全（resolveDragAction / isBubbleDraggable / DRAG_THRESHOLD_PX=8，逐格断言含 forbidden 全排列与 7/8px 阈值边界）+ 手势接线（ref 态 + setPointerCapture + DOM transform 跟手 + suppressClickRef 容器捕获防「拖完又跳转」+ transition 弹回/reduced-motion 直复位）+ 收起区渲染（data-jx-zone="dismiss"，近放列下 8px）+ Delete/Backspace 键盘收起 + completed 上升沿清 dismissed；vitest 76/76、build+verify 21/21 通过；未 commit（待队长统一审查） | 01 |
| 03 | archive-zone（真归档 + 第二开关 + 防复活）——**已完成（resolved）**：ctx.get("workspaces") 三级透传（index→CharacterOverlay→SessionBubbleList）+ workspaces.list 订阅派生 archivedIds 接入 context 第 4 位（归档权威在 SDK，本地不记账）+ pointerup archive 分支调 archiveSession（失败静默，气泡不消失即失败信号）+ 归档区渲染（Fragment 第二根锚定浮层盒正下居中，朱砂警示描边 + title 提示，①&&② 双门控）+ 设置卡开关②主从灰显；纯逻辑零改动（矩阵/排除语义 01 预建、02 补齐），+4 护栏用例（80/80）；npm test 306/306、typecheck ⊆ 存量基线无新增（队长修订口径）、build+verify 21/21 通过；DESIGN.md §4 已回写；未 commit（待审查）。迷雾②定案：失败形态以「气泡未消失即失败信号」静默约定兜底 | 02 |

## 迷雾（待实施中澄清）

- ~~手势接线中点击合成与 pointer capture 的兼容细节~~ **已定案（02 实测）**：setPointerCapture 后浏览器仍会在被捕获元素上合成 click（down/up 同为捕获元素，大位移亦然）⇒ 「拖拽发生过必吞合成 click」为硬要求，实现为 suppressClickRef + 容器 onClickCapture 捕获阶段消费一次；未超阈值路径零介入（详见 issue 02 答案）
- ~~归档接口失败的具体错误形态~~ **已定案（03 实施兑现原约定）**：不枚举 RPC 错误形态——archiveSession 失败 catch 静默吞掉，无错误 UI；以「气泡未消失即失败信号」兜底（ADR-0022 D3），归档成功反馈完全由宿主快照 → 排除集 → 投影移除的数据流驱动
