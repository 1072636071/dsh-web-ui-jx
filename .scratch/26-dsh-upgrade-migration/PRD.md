# PRD：dsh 依赖升级到上游最新 + client-runtime 迁移

**Status:** ready-for-agent

## 问题陈述

本插件（dsh-web-ui-jx）长期钉在旧的 `@deepseek-ai/dsh-client-runtime` 及早期 rc（0.1.0-rc.6/rc.7）依赖上。上游 deepseek-harness 已大幅重构：

1. `dsh-client-runtime` 包已被移除，其能力并入 `dsh-client-ui-slots`（SlotRegistry）与 `@deepseek-ai/cordis`（ClientContext）。
2. `sessions` / `workspaces` 的类型来源迁移到 session-controller / workspace-controller 的 client 入口。
3. `conversation.hero.headline` 已成为宿主的官方 slot（root/single），插件长期用「本地 declare module」临时形态声明它。

影响：依赖过旧导致无法跟上宿主演进；一旦宿主升级到移除 `dsh-client-runtime` 的版本，插件将因缺包 / 类型不匹配而无法编译。

## 解决方案

把插件的 `dsh-*` 依赖升级到上游最新，并完成因 `dsh-client-runtime` 移除所需的代码迁移：

- 版本依赖统一升到 `0.1.1-rc.2`（npm 已发布），并补齐新版需要的包（`dsh-client-ui-slots` 类型、`ui-conversation` 的 hero slot 类型、`session-controller`/`workspace-controller` 类型入口）。
- `ClientContext` 改为 `@deepseek-ai/cordis`；`ISessions`/`IWorkspaces` 改从 session/workspace client 入口导入。
- 保留「手挂 body root + `ctx.get('sessions'/'workspaces')`」的自定义图层架构（新版官方仍支持 `ctx.get`）。
- 清除 hero-headline 的临时 `declare module`，改用宿主的真实 slot 类型与 `ctx.slots.inject/register`。
- 调整 `dsh.client` manifest 的 `inject` 与 package.json 依赖 / peer 声明。

两步发布口径：先保住「可独立分发的 npm 版本」绿，再验证「本地 0.1.2 源码链接」能编译。

## 用户故事

1. 作为角色插件作者，我想要 `dsh-client-runtime` 的 import 全部指向新版等价入口，以便在宿主移除旧包后插件仍可编译。
2. 作为 GUI 用户，我想要浮层 / 侧边栏 / 气泡等既有 UI 在升级后照常渲染，以便不因升级引入可见回归。
3. 作为开发者，我想要 `ISessions` / `IWorkspaces` 类型来自可控的新入口，以便类型与宿主模型对齐。
4. 作为开发者，我想要 hero 标题 slot 用宿主的官方类型（而非本地临时扩充），以便占用 / 注销行为与宿主契约一致、可删临时 hack。
5. 作为开发者，我想要保留 `ctx.get('sessions'/'workspaces')` 与手挂 root 的现有架构，以便迁移面最小、不重写既有 UI 层。
6. 作为发布者，我想要 `dsh.client` 的 `inject` 与新依赖清单一致，以便 bundle/宿主能正确组装。
7. 作为维护者，我想要升级后的 `npm run typecheck` 与 `npm run test` 全绿，以便确认无回归、可安全合入。
8. 作为维护者，我想要 `dsh-session-bubble` 及其 plugin 的 peer 依赖同步升级，以便 workspace 内各包一致。
9. 作为角色作者，我想要升级过程不动产品文案与角色资产现状，以便只解决依赖与契约问题。
10. 作为维护者，我想要「本地 0.1.2 源码链接」的复验有明确边界和回退，以便不影响可独立分发口径。

## 实现决策

- 版本基线：`dsh-client-runtime` / `dsh-host-webserver` / `dsh-storage` / `dsh-storage-domain` 及相关 peer 统一升到 `0.1.1-rc.2`；`cordis` 用发布版 `4.0.x`；新增 `dsh-client-ui-slots` 作为直接类型依赖。
- `ClientContext` 类型来源迁移到 `@deepseek-ai/cordis`（选手 `Context`）。
- `ISessions` 类型来源：`@deepseek-ai/dsh-api-session-controller/client`。
- `IWorkspaces` 类型来源：`@deepseek-ai/dsh-api-workspace-controller/client`。
- 数据获取保持 `ctx.get('sessions' / 'workspaces' / 'connection' / 'uiSession')`；`ctx.effect` 生命周期语义不变。
- Slot 组合走 `ctx.slots.inject(key, () => ctx.slots.register({ name, ... }, Component))`；`conversation.hero.headline` 采用 ui-conversation 官方声明，移除本地 `declare module` 临时块。
- `dsh.client.inject` 与 package.json 的依赖 / peerDependencies 按新包名重排。
- 本地对齐路径（`0.1.2`）需要 build 本地对应 `lib/` 再做 `file:` 或 alias 链接；该路径的 peer 治理（如 ui-conversation）同步处理。

## 测试决策

- 主 seam：既有 `npm run typecheck`（`tsc --noEmit`）+ 既有 vitest 套件（`npm run test`，当前 682 个用例）构成验证闭环；不新增测试基础设施 seam。
- 好测试的标准：只断言外部行为（浮层 / 侧边栏 / hero slot 占用与注销 / 依赖可解析、类型正确），不测 import 实现细节。
- 回归面：覆盖 client-apply 可重入、greeting 开关、overlay-session-runtime、variant-rotation、session-bubble 列表等现有用例在新依赖下依旧通过。
- 类型门禁：通过 tsconfig 依赖解析到升级后的包类型，确保 `ISessions`/`IWorkspaces`/`ClientContext`/slot 类型在新入口可用。

## 超出范围

- 不重写产品文案、角色资产或既有 UI 结构（浮层 / 侧边栏 / 气泡的外部表现保持不变）。
- 不新增 slot 或改变宿主 slot 树。
- 不改变「独立插件不分发 dsh 源码」的既定形态；本地源码链接仅作复验，不以本地链接作为唯一交付。
- 不处理上游 0.1.1 → 0.1.2 之间可能与业务无关的其它差异。

## 补充说明

- 发布口径：步骤一（npm 0.1.1-rc.2）保持可独立分发；步骤二（本地 0.1.2）作为复验与前瞻，两者并存，避免把插件捆绑进本地 monorepo。
- hero-headline 迁移到真实类型后，`ui-conversation`（含该 slot 的版本）需作为依赖落地，注意 peer 治理与多环境版本可达性。
- `connection` 服务名与 `ctx.get('connection')` 是否完全一致在新版需实现期确认。