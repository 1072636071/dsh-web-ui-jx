# 017-deepen-optimize-performance

状态：已完成

## 诉求

用户原话：「当前的项目还有什么可以深化，优化，提升性能的地方的地方么？输出一个 index.html」

拆为两个诉求点：
- P1：盘点本项目（dsh-web-ui-jx）当前尚可**深化（模块深度/架构）**、**优化（正确性/可维护性）**、**性能提升（运行时/包体）** 的候选点，并排出优先级。
- P2：产出一份 `index.html`（候选点清单 + 优先级 + 建议，可直接浏览器打开阅读）。

## 追问记录

### 2026-08-30 — 初始化

- 既有材料 `docs/architecture-optimization-plan.md` 已覆盖 7 个架构候选点（S1–S8），本 memorial 需明确：是**重做一份更广的盘点**（含性能），还是**只补该方案未覆盖的部分**。→ 待用户决策（Q1）。

### 2026-08-30 — 调查结果（sub-task 001 / 002 已闭环）

**001 性能**（结论全文见 `sub-task/001.md`）：
- 高影响 4：H1 欢迎壁纸 `MutationObserver` 全域子树监听导致强制同步布局风暴（`welcome-backdrop.ts:273/277-287/131-151`）；H2 `assets/` 总体积 ≈187 MB、单文件最大 12.37 MB；H3 素材路由 304 路径仍全量 `readFile`（`asset-routes.ts:91` 在 ETag 判定之前）且无压缩；H4 `SessionBubbleList` 未 `React.memo`，被 CharacterOverlay 重渲染放大（`SessionBubbleList.tsx:1001`）。
- 中影响 5：M1 过渡时长解析整文件 `arrayBuffer`（`webp-duration.ts:76-80`）；M2 `backdrop-filter: blur(10px)` 大面积覆盖（`welcome-backdrop.ts:182/187-214`）；M3 `session-messages` inspect 无缓存无去重（`session-messages.ts:274`）；M4 ai-title 服务端无缓存、客户端缓存无界且 TTL 全局覆写（`dynamic-title.ts:333/402`）；M5 warp 涟漪每次 pointerdown 强制 reflow（`warp.ts:190-193`）。
- 低影响 5：L1 `warp-controller.onFrame` 死代码致 `visible` 守卫恒真；L2 fall 叶子 CSS `filter: drop-shadow`；L3 client 产物 `minify: false`；L4 产物体积口径；L5 并入 M4。
- **三条工单假设被证伪**：getSnapshot 引用不稳定（三处 store 均有缓存）、多 store 各自 setState（React 18 批处理）、feDisplacementMap 重绘（静态 turbulence，无 DisplacementMap）。
- tick 生产值 = 1000ms（`overlay-session-runtime.ts:375`）。
- **与 ADR 冲突**：H4 在 runtime 层加 diff 与 ADR-0016 直接冲突且已被否决；M1/M3/M4 新增模块级缓存触及 ADR-0017 可重入；M3 缓存触及 ADR-0028；H1/M2 触及 ADR-0024/0027 视觉契约；H2 触及 ADR-0012/0021；H3 不可回退强缓存。

**002 深化 / 优化**（结论全文见 `sub-task/002.md`）：
- S1–S8 核实：S1/S2/S3/S4/S6/S7 已完成，S5 已完成但**已回归**（第二份 `writeJson`），S8 维持现状不实施。
- 新候选：C1【P0】`json-response.ts` 与 `http-shared.ts` 双份 `writeJson`，`import-api.ts:34-38` 与 `:47` 重复同名导入绑定；C2【P1】`overlay-position.ts:52/113/323` 是收口后唯一剩余裸 localStorage 点（且「move 不写盘」是有意语义，改造风险中）；C3【P2】client 设置壳遗留重复（S8 已判不实施，仅登记）。
- 测试缺口（事实）：`src/client/components/` 全部 UI 组件无单测（SettingsCard / ImportPanel / AssetList / ManagementUI / SidebarEntry / SpeechBubble / FishLogo）；`bubble-drag-handle.test.ts` 仅 1.83 KB 偏薄。
- ADR 落地状态：ADR-0014 **未实施**（`blockedSince` 全 src 0 命中）；ADR-0024 已实施；ADR-0032 已实施（`POPUP_WIDTH_PX = 560` / `POPUP_HEIGHT_PX = 320`）。

### 2026-08-30 — Q1 决策

- **Q1（报告定位与范围）→ 方案 1「全量盘点报告」**（用户选 1）。报告涵盖：深化 / 优化 / 性能三类全量候选点 + 已证伪项 + 与既有 ADR 的冲突 + 测试缺口 + ADR 落地状态 + 优先级排序 + 建议下一步。既有 `architecture-optimization-plan.md` 的 S1–S8 也纳入（含 S5 回归），保证单点可读全貌。

## 决策汇总

| # | 决策 | 结论 | 依据 |
| --- | --- | --- | --- |
| D1 | index.html 报告定位与范围 | 全量盘点（深化 / 优化 / 性能 + 证伪项 + ADR 冲突 + 测试缺口 + ADR 落地状态 + 优先级 + 建议下一步） | 用户选方案 1（2026-08-30） |
| D2 | index.html 落点 | `docs/memorial/017-deepen-optimize-performance/index.html`（与 memorial 上下文同处，归档时一起走） | 用户选方案 2（2026-08-30） |
| D3 | 优先级排序口径 | 主键 = 影响（高/中/低）；同类内按「确定性（已核实 > 推断）→ 风险（低 > 中 > 高）→ 实施成本」；与既有 ADR 冲突的项单独打标并给出合规改法，不因冲突而隐藏 | 主代理推荐值（2026-08-30） |
| D4 | 报告产出 | `docs/memorial/017-deepen-optimize-performance/index.html`（自包含单页，无外部依赖；深/浅双主题 + 类别/优先级/冲突筛选）已生成；含 20 候选点 + 3 证伪项 + 6 项已核实无问题 + S1–S8 与 ADR 落地状态 + 建议下一步 P0/P1/P2 | 2026-08-30 |

### 2026-08-30 — 待澄清逐条销项（事实核实）

1. **UI 组件层零单测是否为有意决策** → 否。`AGENTS.md` / `docs/agents/` 全量检索「测试 / 单测 / 覆盖率 / TDD」**0 命中**（仅 `docs/agents/domain.md:43` 提及「测试名称中使用术语」，非测试策略）。→ **无成文测试策略，零单测是缺口而非有意取舍**。是否补列入报告「建议下一步」P2。
2. **`overlay-position.ts` 的 move 不写盘是否为有意语义** → **是，且是有意设计**：`:299-300` 注释「仅更新内存位置 + 通知订阅者，不写 localStorage（实时跟手用，避免高频 I/O）」；`:352-359` `set` 是提交语义（pointerup，ADR-0006 决策 3）。测试 `overlay-position.test.ts:426` 已锁定该语义。→ **C2 结论修正：不可直接套工厂**（工厂 `set` 一律写盘会破坏「跟手不写盘」），降级为「观察，不实施」；若真要收口，只能抽「容错读写」这一层，保留 move/set 双语义。
3. **类型逃逸 / 竞态专项审计** → 类型逃逸已扫描：非测试代码中 `any` / `as unknown as` / 非空断言合计极低（src 5 文件 15 处、packages 1 处 `persistent-setting.ts`），**不构成候选点**。竞态 / 边界 bug 专项审计本次未做，在报告中明确标注为「未覆盖」，建议后续单开工单。

## 待澄清

（已清零）

## 决策汇总

## 待澄清
