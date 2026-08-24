# 代码库设计扫描报告 — dsh-web-ui-jx

> 扫描范围：全仓代码（`src/client`、`src/host`、`tests`、`tools`、构建脚本）。
> 分析方法：深模块词汇（模块 / 接口 / 实现 / 深度 / 接缝 / 适配器 / 杠杆 / 局部性 / 可测试性）。
> 依据：`docs/adr/*`（0019 份决策记录）+ `DESIGN.md` §8（runtime 深模块接口基准）+ `CONTEXT.md` 术语表。
> 结论基调：**整体深模块纪律极好**——`state-machine/` 半区几乎是教科书式的小接口大实现；主要改进点在入口接线层与个别时间接缝的不一致。

---

## 1. 摘要

- 全仓 `src/` 共 39 个 TypeScript 模块（client 30 + host 5 + 支撑 4），`tests/` 14 个测试文件，`tools/` 5 个 Python 素材脚本。
- **标杆深模块 3 个**：`overlay-session-runtime`、`overlay-state-machine`、`playback-cursor`。它们的共同形态——纯逻辑、零 DOM/React 依赖、依赖注入、返回结果不产生副作用、`useSyncExternalStore` 契约——是全仓质量上限。
- **接缝设计成熟**：`ISessions` 外部服务接缝、`ctx.webServer.register` 路由接缝、`ctx.storageDomain` KV 接缝、注入 `now()` + `__tick()` 的**单一时钟接缝**。测试侧有对应的 `memory-backend.ts` 适配器，构成「两适配器 = 真接缝」的实证。
- **主要风险 2 处**：
  1. `client/index.ts` 入口把「可重入清扫」这一真实行为（ADR-0017/0019，~150 行）焊死在接线层，虽有测试但接口与局部性弱于独立模块。
  2. 时间接缝出现**双模型**：runtime 统一「注入 now + tick 扫描」无真实 `setTimeout`；`playback-cursor` 却用真实 `setTimeout` 排程、`now()` 仅做锚定。二者并存是历史产物（ADR-0016 补齐 permission 可见性时未统一），建议文档化或收敛。
- **覆盖缺口**：`fx/index.ts` 的开关聚合逻辑、`overlay-settings`、`skin.ts`、组件壳层（CharacterOverlay/SessionBubbleList）无直接单测。

---

## 2. 分析方法与词汇

| 术语 | 本报告含义 |
| --- | --- |
| **模块** | 任何有接口与实现的单元（文件级粒度为主） |
| **接口** | 调用者必须知道的一切：类型签名 + 不变量 + 顺序/错误模式 |
| **深度** | 每单位接口学习量所能行使的行为量（小接口 × 大实现 = 深） |
| **接缝** | 无需编辑即可改变行为的位置（接口所在处） |
| **适配器** | 在接缝处满足接口的具体事物（角色，非实质） |
| **杠杆** | 深度给调用者的回报（N 调用点 + M 测试共享同一接口） |
| **局部性** | 深度给维护者的回报（变更/知识集中在模块内部，修一次处处修） |

评估三问：能否减少方法数？能否简化参数？能否内藏更多？

---

## 3. 模块全景

```
src/
├── client/                          # 浏览器半区（~30 模块）
│   ├── index.ts                     # 入口 + apply 可重入接线（ADR-0017/0019）
│   ├── skin.ts                      # 皮肤开关（localStorage + body attr）
│   ├── types.ts / webp-duration.ts  # 类型契约 / ANMF 时长解析
│   ├── session-bubbles-config.ts    # 气泡上限配置
│   ├── components/  (10)            # React 渲染壳
│   ├── fx/          (7)             # 特效系统（聚合 + 5 类）
│   ├── state-machine/ (8)           # ★ 纯逻辑核心（最深）
│   └── styles/      (9)             # 三层 token 样式
├── host/          (5)               # 宿主半区：路由 + 导入 API + KV
└── tests/         (14)              # client 10 + host 2 + helpers 2
```

**半区边界是最大的接缝**：client 只经 `ctx.sessions` 服务 + 快照订阅读世界，host 只经 `ctx.webServer.register` / `ctx.storageDomain` 暴露能力。两层互不 import（除类型），隔离干净。

---

## 4. 深模块分析（按深度分级）

### 4.1 深模块（小接口 × 大实现，标杆）

#### 4.1.1 `overlay-session-runtime.ts` — 全仓最深模块

- **接口（6 方法）**：`getSnapshot / subscribe / poke / dispose / __tick / resetRotation`。`subscribe` 回调无参，监听者一律经 `getSnapshot()` 读取（`useSyncExternalStore` 契约），接口如实承诺。
- **输出（RuntimeSnapshot）**：`focusSessionId / currentState / playback / focusNonce`。返回结果、不产生副作用；`focusNonce` 焦点切换才递增，UI 据此 cross-fade。
- **实现（~1000 行）隐藏的行为**：每会话 `Map<sessionId, SessionEntry>` 状态机、焦点三层仲裁（用户焦点 → 紧急抢焦 → 交还）、工作态 3000ms 防抖、permission/error 硬切、并行驻留、摸鱼彩蛋（2–5min 随机）、poke 惊吓驻留/回落、变体轮换拼接与打断重抽。
- **接缝**：依赖一律注入（`ISessions`、`now`、`random`、`tickIntervalMs`、`variantRotationEnabled`）。**时间接缝唯一化**：全部定时 = 注入 `now()` 的截止时刻 + `tick()` 扫描，无真实 `setTimeout`；`__tick()` 是唯一测试钩子，测试「推进 now + `__tick()`」驱动全部时间，无需 `vi.useFakeTimers`。
- **评估**：接口≈30 行、实现≈1000 行 → 深度 ≈ 30 倍杠杆。DESIGN.md §8 的三问自查全部通过（6 方法恰够、参数已最小、规则全内藏）。**这是全仓新代码应锚定的形态基准。**

#### 4.1.2 `overlay-state-machine.ts` — 状态面与过渡契约

- **接口**：`OverlayState`（13 循环态）、`IntermediateState`（6 表情）、`TransitionEndpoint`、`TRANSITION_EDGES`（42 边）、`hasTransitionEdge`、`planSwitch`（直接/中转 idle 的路径规划）、`loopAssetUrl / transitionAssetUrl` 素材映射。
- **实现隐藏**：42 边的 `EDGE_SET` O(1) 查询、A→B 直接过渡 vs 经 idle 中转的决策、素材命名 ↔ 状态的映射规则。
- **评估**：纯数据 + 纯函数，接口即资源清单（素材契约）。深度中上——调用者只需要知道「状态名 + planSwitch」，不需要知道 42 条边的存在逻辑。

#### 4.1.3 `playback-cursor.ts` — 播放推进闸门

- **接口（5 方法）**：`onPlan / resolveDuration / getSnapshot / subscribe / dispose`。
- **实现隐藏**：结构等价门槛（`playbackPlansEqual`：长度 + 逐项 kind/url，而非引用比较，吸收 runtime 无条件 emit 的引用抖动，ADR-0016）、过渡段按时长推进、时长异步解析缓存 + 回退默认值、索引钳制。
- **评估**：深。一个小接口闸住了「何时重播」这一最难调试的坑（permission 可见性延迟根因）。**渲染契约**（计划内容是唯一身份）是接口级的显式承诺。

#### 4.1.4 `fx/index.ts` — 特效聚合器

- **接口**：`FX_NAMES`、`FxState`、`applyFx()`、`setFxEnabled(name, enabled)`。
- **实现隐藏**：`FX_CLASS / FX_START / FX_STOP` 三张映射表 + reduced-motion 抑制 + localStorage 持久化 + html 类切换。
- **评估**：深/中——对调用者（SettingsCard）暴露「开/关某个特效」的极简接口，隐藏了 CSS 类与 JS 驱动（fall/warp）的差异。**内部还有深化空间**：三张平行映射表本质是「每类特效一个生命周期」，若特效增多可收敛为单一 `FxRegistrar` 接口（届时即有「两个适配器」证据）。

### 4.2 中模块（接口与实现相称）

| 模块 | 接口 | 隐藏行为 | 评估 |
| --- | --- | --- | --- |
| `session-follow.ts` | `SnapshotCore`、`diffTarget` | 会话状态 → 浮层状态映射、reading/done 阈值、部分可见 chunk 判定 | 纯函数，接口≈实现，合理 |
| `session-bubbles.ts` | `selectBubbleEntries`、`displayTitle` | 过滤/折叠/isCurrent 标记、标题回落截断 | 纯逻辑，与 SDK 类型解耦，深 |
| `variant-rotation.ts` | `isRotatableState`、`pickNextVariant`、`rotationPool` | 变体池随机不重复抽取、轮换周期 | 纯逻辑，深 |
| `overlay-position.ts` | `getOverlayPositionSnapshot` 等 | 拖动钳制、localStorage 持久化、resize 重钳制 | 单例 store，中 |
| `overlay-settings.ts` | 设置读取/订阅 | 开关持久化与订阅 | 薄但职责单一，中 |
| `warp-controller.ts` | `WarpController`（onMove/onFrame/...） | 可见性/淡出相位状态机、coarse/reduced-motion 降级 | **好接缝**：大脑与渲染分离 |
| `warp.ts` / `fall.ts` 等 | `startXxx / stopXxx` | DOM 挂载、监听、视觉参数 | 适配器/渲染层，中 |
| `storage-domain.ts` | `ImportStore`（get/put/entries/close） | zod 声明式 KV domain 封装 | 深：小接口包住 KV 契约 |
| `asset-routes.ts` / `import-api.ts` | `registerXxx(ctx)` | HTTP 路由、zip 解压、进度、路径穿越防御 | 中偏深（import-api ~450 行） |
| `webp-duration.ts` | 时长解析 + 缓存 | ANMF 解析、失败回退 800ms | 中，独立模块化好 |

### 4.3 浅模块 / 接线层（透传为主，符合定位）

| 模块 | 说明 | 风险 |
| --- | --- | --- |
| `host/index.ts` | 纯组装：`registerAssetRoutes(ctx)` + `await registerImportApi(ctx)` | 无。入口职责即组装 |
| `client/index.ts` | 入口：挂 root + 组装 RootApp + 接线 runtime + applyFx | **见 §5.1**：可重入清扫行为焊死在入口 |
| `components/SpeechBubble.tsx` | 台词气泡薄壳（text/duration/onDone） | 无，叶组件 |
| `components/FishLogo / AssetList / ImportPanel` | 渲染壳 | 无 |

### 4.4 组件层（React 壳）评估

- **`CharacterOverlay.tsx`（~450 行）**：接口 = props（width/height/className/speech/sessions/runtime）。**遵守了「禁止重演 runtime 规则」的硬约束**——经 `useSyncExternalStore` 订阅 runtime 快照，不自行实现状态机逻辑。但壳内还承载了拖动（overlay-position store）、reduced-motion 响应、台词触发、状态标签显隐。**438 行对「壳」偏大**：拖动与会话逻辑虽已抽出 store，但组件内部仍有可观的 effect/handler 编排。建议后续若再增行为，把拖动/台词各自抽成 hook，保持「壳薄」。
- **`SessionBubbleList.tsx`**：直接订阅 `sessions.list`（noop 回落），归组/展开逻辑（ADR-0018）在组件内。行为偏多，值得评估是否抽纯逻辑到 `session-bubbles.ts`（当前文件只做基础过滤，归组根祖先/展开态在组件里）。
- **`SettingsCard / SidebarEntry / ManagementUI`**：三 section 折叠 + 管理内嵌，均为壳 + 回调，职责清晰。

---

## 5. 接缝与适配器地图

| 接缝 | 接口方 | 适配器/实现方 | 证据 |
| --- | --- | --- | --- |
| 外部会话服务 | runtime / SessionBubbleList / CharacterOverlay | `ISessions`（dsh-client-runtime） | 真外部服务，单适配器 |
| 宿主路由 | `asset-routes` / `import-api` | `ctx.webServer.register` | 宿主注入 |
| KV 元数据 | `storage-domain.ImportStore` | `ctx.storageDomain` + **测试 `memory-backend.ts`** | **两适配器 = 真接缝** ✅ |
| 时间 | runtime 全部定时 | 注入 `now()` + `__tick()` | 单一时钟接缝 |
| FX 生命周期 | `fx/index.ts` | 5 类 start/stop | 聚合器接缝 |

**发现**：全仓最干净的接缝实证是 KV 存储——生产走 `ctx.storageDomain`，测试走 `MemoryStorageBackend`，接口（`StorageBackend` 契约）稳定，符合「一个适配器意味着假想接缝，两个适配器意味着真接缝」。

---

## 6. 可测试性审计

**强的部分（穿过接口，不碰内部）**：
- `overlay-session-runtime.test.ts`：显式声明测「seam/接口 输入输出」，注入 now + `__tick()` 驱动时间，不 `vi.useFakeTimers`。
- `import-api.test.ts`：测 **HTTP seam**——不 mock WebServer/StorageDomain，经 memory backend + 真实 HTTP 断言契约与错误路径。
- `playback-cursor / state-machine / session-bubbles / variant-rotation / session-follow / overlay-position / warp-controller / webp-duration / client-apply-reentrant` 均有测试，覆盖 main 逻辑。

**缺口（扫描时点）**：
| 未覆盖 | 影响 | 状态 |
| --- | --- | --- |
| `fx/index.ts` 的 `applyFx / setFxEnabled` 聚合逻辑 | 开关组合、reduced-motion 抑制、localStorage 往返无直接断言（依赖手动验收） | ✅ 已补 `tests/client/fx.test.ts` |
| `overlay-settings.ts` 持久化 | 轮换开关读取/订阅链路无测试 | ✅ 已补 `tests/client/overlay-settings.test.ts` |
| `skin.ts` | 皮肤开关初始化无测试 | ✅ 已补 `tests/client/skin.test.ts` |
| 组件壳（CharacterOverlay / SessionBubbleList / SettingsCard） | 无组件测试（壳层薄，可接受）；SDK 投影 `deriveItems` 埋于组件内不可测 | ✅ SDK 投影已抽为 `session-list-adapter.ts` 并补 `tests/client/session-list-adapter.test.ts` |

---

## 7. 主要发现与建议

### 7.1 入口可重入清扫行为宜独立成模块（局部性机会）

`client/index.ts` 内 `isJxResidualRoot + sweepResidualRoots + RootHostElement`（ADR-0017/0019，~150 行）是**真实行为**而非接线，被焊在入口里。有测试（client-apply-reentrant）说明行为已验证，但：
- **接口不显式**：入口私有函数，外部无法作为契约复用/替换；
- **局部性弱**：任何新增 body 直挂 DOM 的代码都要改这里（ADR-0017 明示的约束），但改动面埋在线接层。

**建议**：抽 `state-machine/root-lifecycle.ts`（或 `client/root-lifecycle.ts`），导出 `sweepResidualRoots(doc)` + 容器创建/清理封装，接口 = 「挂载/清扫一个带标记的 root 容器」。立即获得模块级单测、显式契约、以及后续扩展（如 async 挂载）的接缝。

### 7.2 时间接缝双模型（一致性机会）

| | runtime | playback-cursor |
| --- | --- | --- |
| 排程 | 注入 `now()` 截止时刻 + `__tick()` 扫描 | 真实 `setTimeout` |
| 时钟注入 | 唯一时间源 | `now()` 仅做 resolveDuration 锚定 |
| 测试 | 无 fake timers | 需 fake timers（或真延时） |

两者并存是 ADR-0016 补齐 permission 可见性时的历史产物。**不是缺陷**（cursor 是 UI 侧每播放项的局部推进，runtime 是全浮层状态），但**语义不一致**：同一仓库两套时间模型，新维护者易误用。建议二选一：① cursor 也收敛到「注入 now + tick」；② 至少在 `playback-cursor.ts` 头部注释显式说明与 runtime 时间模型的差异与共存理由。

### 7.3 组件壳的薄度保持 + 扫描偏差更正

`CharacterOverlay` 438 行偏厚但**未违反深模块约束**（不重演 runtime 规则）。维持「壳薄」纪律：若拖动、台词、气泡列任一继续增长，抽独立 hook / 组件。

**扫描更正**：本报告初稿基于扫描摘要误称 `SessionBubbleList` 内含 ADR-0018 归组/展开逻辑。**实测代码仍为 ADR-0007 平铺模型**——`session-bubbles.ts` 只有过滤/折叠/isCurrent，组件内唯一非平凡纯逻辑是 SDK 投影 `deriveItems`；ADR-0018 归组（根祖先锚定/展开传播）仅存在于 ADR/CONTEXT 文档，**尚未实现**。故「下沉归组逻辑」不成立，真实可改进点是：把 `deriveItems` 从组件抽到 `session-list-adapter.ts`（SDK 形状 → 领域条目的接缝适配器，保持 `session-bubbles.ts` 不依赖 SDK 的契约），已修复并补测。

### 7.4 单适配器接缝注意

`ISessions` 目前单适配器（真实服务）。按「两适配器 = 真接缝」原则，**暂不引入假接缝**，但 runtime 与 SessionBubbleList 都以 `ISessions` 为界，形状已正确；若未来有第二数据源（如 mock 会话）才需要抽接口。

### 7.5 补测优先级

`fx/index.ts` 聚合逻辑 > `session-bubbles.ts` 归组下沉后的纯逻辑 > `overlay-settings` / `skin`。前三者直接补测试即可锁定现状行为，无需改生产代码。（✅ 均已补测，见 §6 状态列；归组逻辑因未实现而改以 SDK 投影适配器下沉代替。）

---

## 8. 结论

**深模块纪律是这套代码库最值钱的资产**。`state-machine/` 半区证明了「小接口大实现 + 单一时钟接缝 + 依赖注入 + 返回结果」的组合能承载 1000 行复杂调度而让 UI 保持薄壳。报告发现的问题已全部修复，详见 §9。

---

## 9. 修复记录

| # | 发现 | 处置 | 涉及文件 |
| --- | --- | --- | --- |
| 1 | 入口可重入清扫行为焊在 `client/index.ts`，接口不显式、局部性弱 | 抽为独立 `root-lifecycle.ts`：导出 `RootHostElement / isJxResidualRoot / sweepResidualRoots / createRootContainer`；`apply()` 变纯接线 | 新增 [root-lifecycle.ts](file:///d:/work/space/dsh-web-ui-jx/src/client/root-lifecycle.ts)；改 [index.ts](file:///d:/work/space/dsh-web-ui-jx/src/client/index.ts)、[client-apply-reentrant.test.ts](file:///d:/work/space/dsh-web-ui-jx/tests/client/client-apply-reentrant.test.ts)（注释位置） |
| 2 | 时间接缝双模型语义不一致 | 文档化：`playback-cursor.ts` 头部显式说明与 runtime 注入时钟的差异与共存理由（选「文档化」而非强制收敛——cursor 是每项局部推进，收敛有行为风险且收益低） | [playback-cursor.ts](file:///d:/work/space/dsh-web-ui-jx/src/client/state-machine/playback-cursor.ts) |
| 3 | 组件内 SDK 投影 `deriveItems` 不可测；报告误称含 ADR-0018 归组逻辑 | 抽为 `session-list-adapter.ts` 接缝适配器并补测；报告 §7.3 更正扫描偏差 | 新增 [session-list-adapter.ts](file:///d:/work/space/dsh-web-ui-jx/src/client/state-machine/session-list-adapter.ts)、[session-list-adapter.test.ts](file:///d:/work/space/dsh-web-ui-jx/tests/client/session-list-adapter.test.ts)；改 [SessionBubbleList.tsx](file:///d:/work/space/dsh-web-ui-jx/src/client/components/SessionBubbleList.tsx) |
| 4 | `fx/index.ts` / `overlay-settings` / `skin` 无直接单测 | 补 3 个测试文件，覆盖开关组合、reduced-motion 抑制/恢复、持久化、订阅与跨标签页同步 | 新增 [fx.test.ts](file:///d:/work/space/dsh-web-ui-jx/tests/client/fx.test.ts)、[overlay-settings.test.ts](file:///d:/work/space/dsh-web-ui-jx/tests/client/overlay-settings.test.ts)、[skin.test.ts](file:///d:/work/space/dsh-web-ui-jx/tests/client/skin.test.ts) |

> 附：本报告依据仓库真实代码与 0019 份 ADR 撰写。词汇遵循 `jxx-codebase-design` 深模块框架（深模块、接口、接缝、适配器、杠杆、局部性）。
