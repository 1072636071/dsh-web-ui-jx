# ADR-0029 — 会话气泡独立成子包（库 + 薄壳插件，monorepo 就地改造）

**状态:** 已接受（2026-08-27，memorial 014 grill 定案；实施待排期）
**关联:** ADR-0007（会话气泡列）、ADR-0018（归组模型）、ADR-0022（保留模式）、ADR-0028（跨刷新留存）

## 背景

会话气泡列是本项目最有价值、复用潜力最大的模块（归组引擎 + 保留模式 + 跨刷新
留存，纯逻辑层 `session-bubbles.ts` 已与宿主完全解耦）。朋友想独立成一个包
使用，且朋友同样跑 DSH 宿主（deepseek-harness）。

## 决策

1. **包形态 = 库 + 薄壳插件两层。** 内部一个通用 React 组件库
   `dsh-session-bubble`（纯逻辑 `buildBubbleGroups` + 组件 `SessionBubbleList`
   + 配置/记账模块 + 样式，独立 npm 发布）；顶部套一个最小 DSH bundle 插件
   `dsh-session-bubble-plugin`（极简 fixed 容器承载气泡列，`inject:
   ["sessions","workspaces"]`，朋友 `dsh plugin add` 装完即用）。本插件
   （dsh-web-ui-jx）改为 import 库——单一事实源，不再持有一份拷贝。
2. **monorepo 轻量就地改造。** 根目录保持 `dsh-web-ui-jx` 插件原位不动，
   根 `package.json` 增 `"workspaces": ["packages/*"]`；新增
   `packages/dsh-session-bubble/`（库）与 `packages/dsh-session-bubble-plugin/`
   （薄壳）。否决把根插件迁入 `packages/`——大量路径变更、风险高、收益小。
3. **CSS token 库自洽。** `--jx-*`（金/朱砂/墨阶）定义在本插件
   `body[data-dsh-jiangxiao]` 下，朋友环境缺失会导致气泡颜色全崩。库自带
   `bubble-theme.css`：`--jx-gold`/`--jx-seal`/`--jx-surface-1` 等默认值声明在
   气泡根容器 class 下（作用域限定不污染宿主），深浅双值随
   `data-ds-dark-theme` 切换；宿主同名变量按 CSS 变量作用域规则自然覆盖。
   `--dsw-*` 为 DSH 官方 token，由宿主提供，库不复制。
4. **数据契约不抽象。** 消费方同为 DSH 宿主，`ISessions`/`IWorkspaces`
   接口原样消费（`sessions.list`/`sessions.open`/`workspaces.list`/
   `workspaces.archiveSession`），不造通用 SessionLike 层。
5. **localStorage key 保留 `jx-*` 前缀**，集中到库内 `storage-keys.ts` 单点。
   本插件与薄壳同宿主时共享同一份记账数据（同一用户同一会话列表，语义合理）。

## 后果

- 朋友可独立安装气泡功能（薄壳），或在自己的 DSH 插件里 import 库二次接线。
- 气泡演进（ADR 还会加）只需改库一处，根插件与薄壳同时生效。
- 根插件体积因去掉气泡代码略减；构建产物归属分包。
- monorepo 化后 `vite.config.ts`（双半区）、`verify-release.mjs`、`vitest`
  配置需适配多包；库/薄壳各自新增轻量构建与验收。

## 否决替代

- **独立 DSH bundle 插件（不拆库）**：朋友装完即用最省事，但本插件与子包各持
  一份实现，后续气泡演进两处漂移，单一事实源断裂。
- **纯 React 组件库（不配薄壳）**：单一实现源最纯粹，但朋友要自己接线挂载，
  不满足"装完即用"。
- **独立新仓库**：跨仓库同步成本高，本插件消费库只能引 npm 发布版，版本锁定 +
  每次改动要先发布才能用。
- **库只依赖 `--dsw-*` 官方 token**：鎏金/朱砂为唐风专属色，官方色板无等价物，
  视觉特质丢失。
