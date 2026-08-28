# 架构优化方案 — 持久化收口 + host 共享件（jxx-to-spec）

> 范围：2026-08-28 架构审查（`jxx-improve-codebase-architecture`）产出的 7 个候选点。
> 方法：每个点先给出**已核实的事实**（文件 + 行号），再用深模块词汇（模块 / 接口 / 深度 / 接缝 / 适配器 / 杠杆 / 局部性）诊断摩擦，最后给出**可执行的完整改造方案**（目标形态 / 步骤 / 兼容性 / 测试 / 验收）。
> 约束前提：不改任何 localStorage 键名与存储格式（`jx-*` 是持久化契约，ADR-0022/0024/0025/0028）；不逆重构已深化模块（`state-machine/` 半区不动）；不违反 ADR-0030 D5（不走宿主 llm adapter 注册体系）。

---

## 0. 执行总览（依赖序）

| 序 | Spec | 候选点 | 前置 | 风险等级 |
| --- | --- | --- | --- | --- |
| S1 | 工厂扩展：`createPersistentBoolSetting` + `createPersistentIdSetSetting` | —（新） | 无 | 中 |
| S2 | 保留模式持久化收口 | 候选 1（强烈） | S1 | 低 |
| S3 | 欢迎背景配置收口 | 候选 2（强烈） | S1 | 中（测试隔离） |
| S4 | 会话气泡上限配置削层 | 候选 6（值得探索） | S1 | 低 |
| S5 | host HTTP 共享件 | 候选 3（值得探索） | 无 | 低 |
| S6 | LLM 客户端适配器 | 候选 5（值得探索） | 无 | 低 |
| S7 | host 改走库公共入口 | 候选 4（值得探索） | 无 | 低（需构建验证） |
| S8 | client 设置壳 | 候选 7（试探性） | 无 | — 不实施，观察 |

**根因洞察**：S2/S3/S4 共享同一根因——`persistent-setting.ts` 工厂（之前架构审查创建的深化模块）**没有成为持久化的单一事实源**。皮肤 / 浮层设置 / 上限已入工厂，但保留模式与欢迎背景仍各持一套裸 localStorage 原语。S1 补齐工厂能力后，三处可同时收口，获得一致的行为（含跨标签页同步）与单一实现源。

---

## S1 工厂扩展：bool 与 id-set 构造器

**现状事实**（`packages/dsh-session-bubble/src/persistent-setting.ts`）：
- 现有 `createPersistentSetting<T>`（:71-140）已含：容错读写（:78-88）、`serialize`/`parse`（:75-76）、`subscribe(listener: (value: T) => void)`（值参订阅，:113-118）、`reload()`（:120-127）、跨标签页同步（全局 `storage` 监听惰性挂载一次 :55-62，按 key 分发 :129-137）。
- 缺失两型：**布尔**便捷构造器（skin / overlay-settings 各写一遍 `parse` 闭包，见 `skin.ts:24-28`、`overlay-settings.ts:18-22`——轻微重复）与 **id 集合**构造器（keep-config 需要的「稳定引用快照 + 零参订阅 + add/remove/prune 惰性写盘」现由 `session-bubble-keep-config.ts:191-234` 的私有 `makeIdSetStore` 承担）。

**摩擦诊断**：id-set 语义（幂等 add、prune 仅确有删除才写盘、写失败静默、快照稳定引用）是**真实行为**而非接线，却被焊在 keep-config 内部；布尔 parse 闭包在 3 处重复。→ 接口未承载该职责，局部性弱。

**目标形态**：工厂新增两个上层构造器，`createPersistentSetting` 本体与四件套语义**完全不动**：

```ts
// persistent-setting.ts 新增
export interface IdSetSetting {
  getSnapshot(): ReadonlySet<string>;            // 值不变引用稳定
  subscribe(listener: () => void): () => void;   // 零参，契合 useSyncExternalStore
  add(id: string): void;                         // 幂等：无变化不写盘不通知
  remove(id: string): void;                      // 幂等
  prune(validIds: ReadonlySet<string>): boolean; // 仅确有删除才写盘+通知，返回是否发生
}

export function createPersistentBoolSetting(
  key: string,
  default: boolean,
): PersistentSetting<boolean>;
// parse: "true"→true / "false"→false / 其余 undefined（回落 default）

export function createPersistentIdSetSetting(key: string): IdSetSetting;
// serialize = JSON.stringify([...ids])（插入序，与既有 jx-bubble-keep-* 格式一致）
// 跨标签页：storage 事件 → parse 新集合 → 与当前不等才替换 + 通知
```

实现要点：
- id-set 读失败 / 键缺失回落**共享空集常量**（模块级 `EMPTY_ID_SET`，保持稳定引用）。
- id-set 的集合相等判定：`size` + 逐成员，避免 JSON 串比较的脆弱性。
- bool 构造器复用既有 parse 语义，等价于 `createPersistentSetting` + parse 闭包——**消除 3 处重复闭包**。

**兼容性约束**：`createPersistentSetting` 已有测试（`packages/dsh-session-bubble/src/__tests__/persistent-setting.test.ts`）全量回归；新增构造器不改其签名。

**测试计划**：
- `persistent-setting.test.ts` 增：id-set 的 add/remove/prune 幂等与惰性纪律、写失败静默、跨标签页整集合替换、bool 构造器 parse 语义。
- 复用既有 jsdom 环境（真实 localStorage + storage 事件）。

**验收标准**：
1. 新增构造器单测全绿；既有工厂测试回归通过。
2. id-set 满足 keep-config 现有测试的全部语义（幂等不写盘不通知、prune 零副作用、写失败静默）。
3. `npm run build && npm run verify && npm test` 全绿。

---

## S2 候选 1（强烈）：保留模式持久化收口

**现状事实**（`packages/dsh-session-bubble/src/session-bubble-keep-config.ts`）：
- 自持一套平行持久化原语：`readBool`/`writeBool`（:43-63）、`readIdSet`/`writeIdSet`（:69-93）——与工厂容错模式逐字重复（读失败回落、写失败静默）。
- 每开关独立 listener 集 + 模块级缓存（:99-103、:127-167）。
- `makeIdSetStore`（:191-234）自实现「稳定快照 + 订阅 + add/remove/prune」；三个集合实例（:236-238）。
- **缺失跨标签页同步**：本模块无 storage 监听——与 skin / overlay-settings / session-bubbles-config（均已入工厂）行为不一致。跨标签页改保留模式，本页不更新。
- 现有测试 `session-bubble-keep-config.test.ts`：`vi.resetModules()` + 动态 import 按例重载（种子读取 / 脏数据回落才能构造）；断言初始化读取、`addSeen` 写穿 + 换引用 + 通知、幂等、`pruneSeen` 惰性纪律、写失败静默。

**摩擦诊断**：`readBool`/`readIdSet` 与工厂实现逐字重复（**Duplicated Code**）；「跨标签页同步」这一工厂已吸收的职责在本模块缺失（行为不一致）。删除这些私有原语，复杂性**集中**到工厂而非移动——删除检验通过。

**目标形态**：keep-config 退化为**纯声明层**：

```ts
// session-bubble-keep-config.ts（目标形态骨架）
const keepEnabled = createPersistentBoolSetting(STORAGE_KEYS.keepEnabled, true);
const archiveDragEnabled = createPersistentBoolSetting(STORAGE_KEYS.archiveDragEnabled, true);
const kept = createPersistentIdSetSetting(STORAGE_KEYS.kept);
const dismissed = createPersistentIdSetSetting(STORAGE_KEYS.dismissed);
const seen = createPersistentIdSetSetting(STORAGE_KEYS.seen);
// 导出函数 = 薄委托，导出面完全不变
```

**改造步骤**：
1. 完成 S1（工厂扩展）。
2. 重写 keep-config.ts：删除 `readBool`/`writeBool`/`readIdSet`/`writeIdSet`/`makeIdSetStore`/私有 listener 集；21 个导出函数改为薄委托。
3. 保留 `setKeepEnabled` / `setArchiveDragEnabled` 的**幂等**（值未变不写盘不通知）：委托层保留 `if (enabled === current) return` 判断（工厂 `set` 非幂等，语义以现状为准）。
4. 删除模块内 `EMPTY_ID_SET`（工厂提供共享空集）。

**兼容性约束**：
- 存储格式零迁移：bool `"true"/"false"`、集合 `JSON.stringify([...])`（插入序）——既有用户数据原样可读。
- 导出面不变 → 现有测试（`session-bubble-keep-config.test.ts`）应**无需修改**全部通过；这是回归护栏。
- ADR-0022 D6 / ADR-0028 D1 的记账语义、惰性裁剪纪律均保留。

**测试计划**：
- 既有测试回归（零改动是目标）。
- 新增：跨标签页 storage 事件改 `kept` 集 → 快照更新 + 订阅通知（新能力锁定）。

**验收标准**：
1. keep-config.ts 无任何裸 `localStorage` 调用。
2. 两开关 + 三集合行为与改造前完全一致（幂等、惰性裁剪、写失败静默）。
3. 跨标签页修改保留模式即时生效。
4. 全量测试 + build + verify 全绿。

---

## S3 候选 2（强烈）：欢迎背景配置收口

**现状事实**（`src/client/welcome-backdrop-config.ts`）：
- 9 项配置全部裸触 `localStorage`：总开关 `"on"/"off"`（:91-114）、wall/panel/veil 三个不透明度（:121-213，get/set 双函数 + `clampBackdropOpacity` 钳制）、五区域 alpha 经私有 `createRegionAlphaStore`（:223-250，已消十函数同构重复，但仍是裸读写）。
- 全局 `notifyBackdropListeners` + `subscribeBackdrop`（:306-324）：任一配置项写入即通知（runtime 与 SettingsCard 订阅）。
- **无跨标签页同步**（与已入工厂的 skin / overlay-settings 不一致）。
- 现有测试 `tests/client/welcome-backdrop.test.ts`：默认值、钳制、写读一致、五区域读写、`subscribeBackdrop` 每次写入触发一次（:129-145）。

**摩擦诊断**：与 S2 同根因——工厂未成为单一事实源。`createRegionAlphaStore` 已是局部工厂，但停留在「裸读写 + 手动 notify」，缺 parse 统一 / 跨标签页 / reload。删除自持原语，复杂性集中到工厂。

**目标形态**：9 项 = 9 个 `createPersistentSetting` 实例；`subscribeBackdrop` 保留为**桥接层**（每个实例订阅 → 转发共享 `backdropListeners`，每次任一实例通知恰好触发一次，维持既有测试语义）：

```ts
// 不透明度 parse 例（工厂语义：返回 undefined 回落 default）
const wallOpacity = createPersistentSetting<number>(WALL_OPACITY_KEY, {
  parse: (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? clampBackdropOpacity(n, DEFAULT_WALL_OPACITY) : undefined;
  },
  default: DEFAULT_WALL_OPACITY,
});
// 总开关 parse: "on"→true / "off"→false / 其余 undefined
// setXxxOpacity 委托层先 clamp 再 set、返回实际值（维持返回值契约）
```

**改造步骤**：
1. 完成 S1。
2. 重写 welcome-backdrop-config.ts：删除全部裸读写与 `createRegionAlphaStore`；9 个实例 + 桥接 `subscribeBackdrop`；`clampBackdropOpacity` 与默认值常量导出不变。
3. 引入路径沿用既有先例：`import { createPersistentSetting } from "../../packages/dsh-session-bubble/src/index.ts"`（同 `skin.ts:16`）。
4. 改 `tests/client/welcome-backdrop.test.ts` 为 `vi.resetModules()` + 动态 import 模式（**关键**，见风险）。

**兼容性约束 / 风险（重点）**：
- 存储格式零迁移（`"on"/"off"`、十进制整数串）。
- **测试隔离风险**：工厂实例是内存缓存；当前测试依赖「每次 get 重读 localStorage」。改造后 `beforeEach` 清 localStorage **不会**重置内存缓存，跨用例可能读到上一用例写入的值。处理：测试文件改用 `vi.resetModules()` + 动态 import（与 `session-bubble-keep-config.test.ts:22-25` 同模式）——单文件、低风险。
- **新能力**：跨标签页同步。runtime 经 `subscribeBackdrop` 桥收到通知 → 重读 → 即时同步（与皮肤行为一致）。这是行为提升，需补测试锁定。
- `setBackdropEnabled` 现每次写都 notify（测试 :134 依赖），工厂 `set` 也是每次 notify——一致，无需幂等。
- `welcome-backdrop.ts` runtime 消费 getter 的调用点不受影响。

**测试计划**：
- welcome-backdrop.test.ts 改模块重载模式；既有断言全量保留回归。
- 新增：跨标签页 storage 事件改不透明度 / 区域 alpha → getter 更新 + `subscribeBackdrop` 触发一次。

**验收标准**：
1. 9 项行为一致（默认值 / 钳制 / 写读一致 / 五区域）。
2. welcome-backdrop-config.ts 无任何裸 `localStorage`。
3. 跨标签页同步生效（runtime 即时重同步）。
4. 全量测试 + build + verify 全绿。

---

## S4 候选 6（值得探索）：会话气泡上限配置削层

**现状事实**（`packages/dsh-session-bubble/src/session-bubbles-config.ts`）：
- 持久化已入工厂（:48-53），但 :85-92 又自持 `cachedMax` + `maxListeners` 第二层订阅缓存，:100-114 的订阅 / 快照函数消费这层。
- 快照是 `number` 原始值——`useSyncExternalStore` 用 Object.is 比较，原始值天然稳定引用，**第二层缓存并非必需**。它的唯一作用是「值参 subscribe → 零参 subscribe」的桥接，而桥接可以直接做。

**摩擦诊断**：`cachedMax` 是**冗余间接**（Middleware 式的转发层）；删除后复杂性消失而非移动——删除检验通过。

**目标形态**：删 `cachedMax` / `maxListeners`，直接桥接工厂：

```ts
export function subscribeMaxSessionBubbles(listener: () => void): () => void {
  return maxSessionBubbles.subscribe(() => listener());
}
export function getMaxSessionBubblesSnapshot(): number {
  return maxSessionBubbles.get();
}
```

**兼容性约束**：
- 导出面不变。行为差异仅一处：工厂 `set` 通知时不比较新旧值（`session-bubbles-config.setMaxSessionBubbles` 先 clamp 再 set，若 clamp 后同值也会通知订阅者一次）。React 端 `useSyncExternalStore` 幂等（快照未变不重渲染），可接受；且与 overlay-settings 的直通语义一致。
- **无既有测试**（仓库检索 `session-bubbles-config` 无 test 文件）——本次一并补齐。

**测试计划**（新增 `packages/dsh-session-bubble/src/__tests__/session-bubbles-config.test.ts`，jsdom）：
- 默认值 10 / 钳制 [1,10] / 写读一致。
- 订阅通知 / 退订。
- 跨标签页 storage 事件同步。

**验收标准**：
1. 模块删除第二层 store（净减 ~20 行）。
2. 新测试全绿；build + verify 全绿。

---

## S5 候选 3（值得探索）：host HTTP 共享件

**现状事实**（`src/host/`）：
- `writeJson` 逐字重复 2 处：`import-api.ts:97-104`、`ai-title-route.ts:109-116`。
- URL pathname 解析重复 2 处：`asset-routes.ts:84-91`、`import-api.ts:486-493`。
- 路径穿越防御 2 个函数**语义不同且有意**：`asset-routes.ts:48-65`（`resolveSafeSubpath`：字面 `..` 拒绝，纵深防御）+ `import-api.ts:120-128`（`isSafeRelativePath`：只拒 `..` 段，zip/目录遍历）。差异的共享说明写在 `paths.ts:3-17`，但**实现不在同文件**——读者理解「host 如何安全响应」要跳 3 个文件，且两个防御函数**只能经 HTTP 测**（`tests/host/asset-routes.test.ts` 经真实请求断言）。

**摩擦诊断**：writeJson / URL 解析 = 字面重复（Duplicated Code）；防御函数「文档与实现分离」= 局部性弱；「接口非测试面」= 防御逻辑没有纯函数测试入口。

**目标形态**：新增 `src/host/http-shared.ts` 收口共享件：

```ts
// http-shared.ts（目标导出面）
export function writeJson(res: ServerResponse, status: number, body: unknown): void;
export function parseUrlPathname(url?: string): string | null;   // 非法 → null
export function resolveSafeSubpath(
  pathname: string, prefix: string, assetsRoot: string,
): string | null;   // 参数化，纯函数可测
export function isSafeRelativePath(p: string): boolean;           // 纯函数可测
// 头部注释承载「两防御差异是有意的」共享说明（自 paths.ts 迁入）
```

`paths.ts` 保留 `resolveAssetsRoot`（素材根探测），注释精简指向 http-shared.ts。

**改造步骤**：
1. 新建 http-shared.ts（含共享说明注释）。
2. `asset-routes.ts`：`:48-65` 改调 `resolveSafeSubpath(pathname, ASSET_ROUTE_PREFIX, ASSETS_ROOT)`；URL 解析改 `parseUrlPathname`。
3. `import-api.ts`：`:97-104` / `:120-128` / `:486-493` 改用共享件。
4. `ai-title-route.ts`：`:109-116` 改用 `writeJson`。
5. `paths.ts` 注释精简。

**兼容性约束**：行为逐字节等价（status / headers / body 不变）。现有 HTTP seam 测试（asset-routes / import-api / ai-title-route）全量回归是护栏。

**测试计划**（新增 `tests/host/http-shared.test.ts`，纯函数，不经 HTTP）：
- `writeJson`：content-type / content-length / body（mock `ServerResponse`）。
- `resolveSafeSubpath`：malformed %-escape / null 字节 / 字面 `..` / normalize 逃逸（Windows 盘符、绝对路径）。
- `isSafeRelativePath`：绝对路径 / `..` 段 / 反斜杠归一化 / 允许 `foo..bar`。

**验收标准**：
1. 三处 writeJson / URL 解析收敛为单一实现。
2. 防御纯函数可直测（不再只能经 HTTP）。
3. 既有 HTTP seam 测试全绿；新单测全绿。

---

## S6 候选 5（值得探索）：LLM 客户端适配器

**现状事实**（`src/host/ai-title-route.ts`）：
- LLM 适配三件套焊在路由文件内：`resolveChatCompletionsUrl`（:119-123）、`extractContent`（:126-137）、`callLlm`（:140-172，AbortController 10s 超时 + fetch + 解析）。
- 路由 handler（:181-230）混三责：body 解析、配置 / 凭据判定、LLM 调用。
- 现有测试 `tests/host/ai-title-route.test.ts`：真实 HTTP seam + `vi.stubGlobal("fetch", mockFetch)` 测全链路——**无法隔离**「路由降级」与「LLM 适配」。
- ADR-0030 D5 明确否决走宿主 llm adapter 注册体系——**本地 OpenAI 兼容客户端形态是正确且必要的**，不冲突。

**摩擦诊断**：LLM 适配器（真实行为）焊在路由 handler（编排层）内部 → 接口非测试面；`callLlm` 无法独立于 HTTP seam 单测。抽出后，适配器是**可注入的接缝**（一个默认实现 + 测试可注入假实现 = 真接缝）。

**目标形态**：新增 `src/host/llm-client.ts`：

```ts
// llm-client.ts
export interface LlmClient {
  chat(prompt: string, opts: { baseURL: string; model: string; apiKey: string }):
    Promise<string | undefined>;
}
export function createOpenAiClient(options: {
  fetchImpl?: typeof fetch;   // 默认 globalThis.fetch（测试/自托管注入）
  timeoutMs?: number;         // 默认 10000
} = {}): LlmClient;
// 内含 resolveChatCompletionsUrl / extractContent / 超时中止 / 60 字护栏
```

`ai-title-route.ts` 改造：
- handler 保留 body 解析 + 配置 / 凭据判定 + 未配置短路；LLM 调用改为 `deps.llmClient ?? createOpenAiClient()`。
- `registerAiTitleRoute(ctx, deps?: { llmClient?: LlmClient })` 提供注入接缝。

**兼容性约束**：默认路径行为与现状逐字节等价（`createOpenAiClient()` 默认 `globalThis.fetch` + 10s 超时 → 既有测试的全局 fetch stub 仍然生效，HTTP seam 测试零改动回归）。

**测试计划**：
- 新增 `tests/host/llm-client.test.ts`（注入 mock fetchImpl）：URL 归一化（无后缀追加 / 已带后缀原样）、`Authorization: Bearer` 头、请求体 model/messages、非 2xx → undefined、choices 缺失 → undefined、content 去空白 + 60 护栏、超时中止（注入 fake timers 或快速 abort）。
- `ai-title-route.test.ts` 回归；可选新增「注入假 llmClient」用例锁定路由降级分支（未配置 / LLM 失败 → `{ error }`）。

**验收标准**：
1. LLM 适配器独立单测覆盖全部解析 / 归一化 / 超时分支。
2. 路由 handler 只做编排（body / 配置 / 凭据 / 响应），不再含 fetch 细节。
3. 既有 ai-title HTTP seam 测试零改动全绿。

---

## S7 候选 4（值得探索）：host 改走库公共入口

**现状事实**：
- `src/host/ai-title-route.ts:27` 深路径 import `buildDynamicTitlePrompt` 自 `packages/dsh-session-bubble/src/detail/dynamic-title.ts`——**绕过库公共入口**。
- 库公共入口 `packages/dsh-session-bubble/src/index.ts:108-125` **已导出** `buildDynamicTitlePrompt`。全仓检索确认：host 半区仅此一处深路径；client 侧全部走 `src/index.ts` 公共入口（`skin.ts:16`、`overlay-settings.ts:15`、`fx/index.ts:31` 等）。
- host 构建（`vite.config.ts:133-145`）external 了 `react` / `react-dom` / `@deepseek-ai/*` / `node:*`；走 index.ts 时 rollup 需 tree-shake 掉未用的 React 组件。库 `package.json` **无 `sideEffects: false`**。

**摩擦诊断**：host（Node 侧）直接耦合组件库内部文件布局——库的**稳定契约是 index.ts**，深路径 import 是跨接缝泄漏（改动库内部路径即无声破坏 host，且部署有把 React 组件拖入 host bundle 的风险）。

**目标形态**：host 只经库公共 API 消费纯逻辑。
**改造步骤**：
1. `ai-title-route.ts:27` 改为 `import { buildDynamicTitlePrompt } from "../../packages/dsh-session-bubble/src/index.ts"`。
2. `npm run build` 后验证 `lib/index.js`：**不含** React 组件痕迹（`SessionBubbleList` / `useState` / `createElement`）、体积不显著增长（相对当前仅含 dynamic-title 的宿主产物）。
3. **若 tree-shaking 未生效**（组件被拖入）：给 `packages/dsh-session-bubble/package.json` 加 `"sideEffects": false`（包内全为纯 ESM 模块，唯一副作用是 guard 过的 `window` 访问，安全）；重跑 build 验证。
4. 可选加固：`scripts/verify-release.mjs` 增加「host 产物不含 React 组件代码」门禁（若 3 已解决则非必需）。

**兼容性约束**：函数签名不变；`ai-title-route.test.ts` 零改动回归。

**验收标准**：
1. host 半区无任何库内部路径 import（grep 验证）。
2. `lib/index.js` 无 React 组件代码，体积合理。
3. 全量测试 + build + verify 全绿。

---

## S8 候选 7（试探性）：client 设置壳 —— 观察，不实施

**现状事实**（`src/client/state-machine/overlay-settings.ts`、`src/client/skin.ts`）：均已入工厂，是「声明层 + 薄委托」，接口≈实现对声明层是正常且健康的形态（`overlay-settings.ts:25-34` 两个实例 + 具名导出）。

**诊断**：这不是浅模块——它是深模块（工厂）的薄壳。逆重构（合并成一个设置表）反而会破坏具名导出契约与既有测试。**维持现状**。
**观察点**：若未来新增第 3+ 个 client 设置项，再评估 `defineClientSettings` 声明式表（一次声明项名 / parse / default / 导出生成）是否值得——届时才有足够样本证明必要性。当前不加。

---

## 验证与验收（全量门禁）

每完成一个 Spec 立即执行，不留到发布时：

```bash
npm run build    # 双半区构建（host + client）
npm run verify   # 发布前验收（21 项检查）
npm test         # 全量测试
```

- **行为不变项**（S2/S3/S4/S5/S6/S7）：既有测试零改动或仅机械改（模块重载模式）后全绿，是「未破坏行为」的硬护栏。
- **新增行为项**：跨标签页同步（S2/S3/S4 新能力）必须补测试锁定。
- **构建门禁**：S7 必须人工/脚本验证 host 产物无 React 组件。

> 本方案全部 Spec 完成后，`persistent-setting.ts` 成为持久化的**真正单一事实源**（bool / number / id-set 三型全覆盖），host 半区共享件收敛，LLM 适配器与路由编排解耦——杠杆与局部性同时提升，且无任何存储格式迁移。
