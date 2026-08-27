# Memorial 014 — 会话气泡独立成子包

> 状态：已完成（2026-08-27 收尾，C1-C5 全绿；回写 CONTEXT.md 已执行，ADR-0029 已在全局 docs/adr/）
> 创建：2026-08-27

## 诉求（用户原话）

> 当前项目中最有价值的就是这个会话管理的气泡，朋友希望我独立出一个包，给他用，帮我想办法，有没有办法做一个子包。

## 追问记录

### 2026-08-27 — 调查结果（代码侦查，非用户结论）

气泡列（会话管理的气泡）构成与依赖面：

| 模块 | 作用 | 依赖 |
| --- | --- | --- |
| `SessionBubbleList.tsx` | UI 组件（约 1000 行） | React 18、SDK 类型、配置模块、样式 |
| `session-bubbles.ts` | 纯逻辑：`buildBubbleGroups` 归组引擎 / 拖拽判定矩阵 / `displayTitle` | **零依赖**（纯函数，已与 SDK/React/DOM 解耦） |
| `session-list-adapter.ts` | SDK `SessionListState` → `SessionListEntry[]` 投影 | SDK 类型 |
| `session-bubbles-config.ts` | 气泡上限 `maxVisible`（localStorage `jx-max-session-bubbles`） | localStorage |
| `session-bubble-keep-config.ts` | 保留模式记账 kept/dismissed/seen（localStorage `jx-bubble-keep-*`） | localStorage |
| `session-bubbles.module.css` | 样式 | CSS 变量 `--dsw-*` / `--jx-*`（宿主 token 架构） |

消费的 SDK 接口面（`@deepseek-ai/dsh-client-runtime/client`）：
- `sessions.list.subscribe / getSnapshot`（`SessionListState`：ids + byId + current + phase + archivedSessionIds）
- `sessions.open(id)`
- `workspaces.list.subscribe / getSnapshot`（归档排除集）
- `workspaces.archiveSession`（真归档，可选消费）

关键观察：
1. **纯逻辑层已与宿主完全解耦**——`buildBubbleGroups(items, current, maxVisible, context)` 是纯函数，输入是自有 `SessionListEntry` 形状（无 SDK 类型），这是独立成包最好的地基。
2. 组件层直接消费 DSH SDK 接口 + 宿主 CSS token（`--dsw-alias-*`、`--dsw-specific-*`、`--jx-*`），这两处是「去 DSH 化」的主要改造点。
3. localStorage key 全部带 `jx-` 前缀，独立成包后需考虑前缀可配置或去前缀。
4. `peerDependencies` 已有 react/react-dom ^18.2.0，包发布形态为 DSH bundle 插件（host/client 双半区 + `cordis.patch.yml`）。

### 2026-08-27 — Q1 朋友的使用环境

**Q1**：朋友的环境是什么？
- 方案 1：朋友也用 DSH 宿主（deepseek-harness），装插件
- 方案 2：朋友有自己产品（非 DSH），有类似多会话运行数据
- 方案 3：朋友只要 UI 形态，数据自己喂（受控组件）

**用户答**：方案 1——朋友也用 DSH 宿主。

### 2026-08-27 — Q2 子包的包形态

**Q2**：独立成包后挂载点没了（气泡当前贴浮层盒左侧），包形态怎么选？
- 方案 1：独立 DSH bundle 插件（自带最小宿主壳），装完即用
- 方案 2：纯 React 组件库包（本插件改造成 import 同一实现）
- 方案 3：库 + 薄壳插件两层——内部 React 组件库 + 顶部最小 DSH bundle 壳

**用户答**：方案 3——库 + 薄壳插件两层。

### 2026-08-27 — Q3 仓库组织形态

**Q3**：代码放哪、怎么组织（最难逆转的决策）。
- 方案 1：当前仓库就地改造为 monorepo（npm workspaces）：`packages/session-bubble-core`（库）+ 顶层插件 + 薄壳插件
- 方案 2：独立新仓库（本插件引 npm 发布版 → 单一事实源断裂）
- 方案 3：单仓库单包 + exports 子路径（语义混乱）

**用户答**：方案 1——当前仓库就地改造为 monorepo（npm workspaces）。

### 2026-08-27 — Q4 CSS token 自洽 + 授权自行决策

**Q4**：气泡库的 CSS token 怎么自洽（`--jx-*` 定义在本插件 `body[data-dsh-jiangxiao]` 下，朋友环境缺失会全崩）。
- 方案 1：库自带 `--jx-*` 默认值，作用域限定在气泡根容器
- 方案 2：库改 props / theme 注入
- 方案 3：库只依赖 `--dsw-*` 官方 token

**用户答**：方案 1——库自带 `--jx-*` 默认值。**并授权：其余决策由助手自行调研后落定。**

### 2026-08-27 — 自行决策（用户授权）

**D5 包命名**：库 `dsh-session-bubble`（通用 React 组件库，含纯逻辑+组件+样式+配置）；薄壳插件 `dsh-session-bubble-plugin`（DSH bundle 插件）。均无 scope（对齐根包 `dsh-web-ui-jx` 无 scope 风格）。

**D6 monorepo 结构（轻量方案）**：根目录保持 `dsh-web-ui-jx` 插件原位不动（现有 package.json/构建/验收链路零破坏），根 package.json 增加 `"workspaces": ["packages/*"]`；新增两个子包 `packages/dsh-session-bubble/`（库）与 `packages/dsh-session-bubble-plugin/`（薄壳）。否决"根插件迁入 packages/"——大量路径变更、风险高、收益小。npm publish 时子包不进根包 files 清单。

**D7 库的构成与公共 API**：迁移文件 = `session-bubbles.ts`（纯逻辑）、`session-list-adapter.ts`（SDK 投影）、`SessionBubbleList.tsx`（组件）、`session-bubbles-config.ts` + `session-bubble-keep-config.ts`（配置/记账）、`persistent-setting.ts`（工厂）、`session-bubbles.module.css`（样式）+ 新增 `bubble-theme.css`（`--jx-*` 默认值，作用域限定）。导出面 = `SessionBubbleList` 组件 + 纯逻辑（`buildBubbleGroups`/`displayTitle`/类型）+ 配置操作（`setMaxSessionBubbles`/`setKeepEnabled`/`setArchiveDragEnabled` 等）。根插件 `SettingsCard`/`CharacterOverlay` 改 import 库。

**D8 localStorage key**：保留 `jx-*` 前缀、集中到库内 `storage-keys.ts` 单点。根插件与薄壳同宿主时共享同一份记账数据（同一用户同一会话列表，语义合理）。

**D9 薄壳插件形态**：DSH bundle 插件骨架（cordis.patch.yml 单行挂载），`inject: ["sessions", "workspaces"]`；极简 fixed 定位容器承载 `SessionBubbleList`（无浮层、无素材、无设置卡）。挂载位置/锚点在实施阶段细化（气泡列 `.bubbleList` 贴容器左缘的定位可通过 CSS 变量或容器布局调整）。host 半区是否必须的查证列入实施调研。

**D10 测试迁移**：5 个气泡相关测试（`session-bubbles`/`session-list-adapter`/`session-bubble-keep-config`/`session-bubble-list`/`bubble-drag-handle`）随源码迁入库包；vitest 配置适配 workspace。

**D11 构建/验收**：库 = vite lib mode（ESM + CSS 抽取，独立发布产物）；根插件从库 import 走 workspace 源码构建（vite 直接打包库源码）；薄壳 = 双半区构建（复用 `inlineClientCss` 模式，CLIENT_ID 换名）+ 自有 `cordis.patch.yml`；`verify-release.mjs` 保持验收根插件，库/薄壳发布前以 `build`+`typecheck` 兜底。

**D12 发布策略**：库 `dsh-session-bubble` npm publish（access public）；薄壳 `dsh-session-bubble-plugin` npm publish 或 `dsh plugin add link:` 本地安装（朋友开发期）；根插件照旧。

**D13 配置归属**：保留模式/上限配置操作函数从库导出，根插件 `SettingsCard` 照旧接线；薄壳不带 SettingsCard（最小化），保留模式默认开。

## 决策汇总

| # | 决策 | 状态 |
| --- | --- | --- |
| D1 | 消费方环境 = DSH 宿主（deepseek-harness）。数据契约保留 `ISessions`/`IWorkspaces` 接口原样，不做通用抽象层。 | 已定 |
| D2 | 包形态 = 库 + 薄壳插件两层：内部 React 组件库（纯逻辑 + 组件 + 样式，独立发布）+ 顶部最小 DSH bundle 壳（朋友装完即用）。本插件消费同一库实现（单一事实源）。 | 已定 |
| D3 | 仓库组织 = 当前仓库就地改造为 monorepo（npm workspaces）。现有 build/verify 链路需适配多包结构。 | 已定 |
| D4 | CSS token = 库自带 `--jx-*` 默认值（`bubble-theme.css`，作用域限定在气泡根容器，深浅双值随 `data-ds-dark-theme`），宿主同名变量自然覆盖。 | 已定 |
| D5 | 命名：库 `dsh-session-bubble`；薄壳 `dsh-session-bubble-plugin`。 | 已定 |
| D6 | monorepo 轻量方案：根插件原位不动 + `workspaces: ["packages/*"]` + 两子包。 | 已定 |
| D7 | 库构成与导出面（见上）。根插件改 import 库。 | 已定 |
| D8 | localStorage key 保留 `jx-*` 前缀、集中单点。 | 已定 |
| D9 | 薄壳 = 极简 fixed 容器 + `SessionBubbleList`，`inject: ["sessions","workspaces"]`。 | 已定 |
| D10 | 5 个测试文件随迁库包，vitest 适配 workspace。 | 已定 |
| D11 | 构建/验收适配（见上）。 | 已定 |
| D12 | 发布策略（见上）。 | 已定 |
| D13 | 配置操作从库导出，薄壳最小化不带 SettingsCard。 | 已定 |

## 待澄清

（无——收尾回写确认见下轮）
