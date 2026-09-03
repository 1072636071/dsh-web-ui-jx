# Memorial 017 — 个性化问候（时段 + 用户名）+ 姜晓新建会话台词 + 颜文字

状态：已完成
创建：2026-09-03
回写：ADR-0033/0034/0035/0036 已同步 `docs/adr/`；CONTEXT.md 已新增「个性化问候」术语与四条已定决策。
关联：deepseek-harness `docs/memorial/002-hero-greeting-personalization`（本次诉求的前半段在那里完成 grill，D1–D5 迁移过来）

## 诉求（用户原话）

> 我想做一些个性化，关怀性调整：
> 把新会话中的探索未至之境，改成：
> 上午好，【用户名字】，有什么需要我搞定的么？
> 下午好，【用户名字】，有什么需要我搞定的么？
> 晚上好，【用户名字】，有什么需要我搞定的么？
> 该休息了，【用户名字】，让我来做吧，好好休息哦。

> 我想放在这个插件里去做实现，并且给姜晓也加上新建会话的台词，
> 还有给姜晓现在的台词加上一些颜文字。

拆解：
1. 新会话空态的 hero 标题 → 按时段 + 用户名的个性化问候（实现落点：本插件）。
2. 姜晓新增「新建会话」场景台词。
3. 姜晓**现有**台词加颜文字。
4. 用户已授权：「其他的也自己决策」。

## 迁移自 memorial 002 的决策（deepseek-harness，2026-09-03）

- **D1 [用户名来源]**：用户自填的设置项。否决 OS 用户名推断（拿到的是机器账号名，关怀感为负）、首启询问（打断冷启动）、退化掉名字。
- **D2 [解耦方式]**：经 slot 占用提供 hero 文案，宿主保留原 `t('hero.headline')` 作 fallback。否决「宿主直接依赖提供方」。
- **D3 [时段划分]**：上午 05:00–11:59 / 下午 12:00–17:59 / 晚上 18:00–22:59 / 该休息 23:00–04:59（wrap-around 判定 `h >= 23 || h < 5`）。时区取浏览器本地时间。否决 B（06/12/18/00，23 点漏掉关怀句）与 C（22 点就劝休息，扫兴）。
- **D4 [无名字退化]**：去掉名字与逗号，保留问候语本身（「上午好，有什么需要我搞定的么？」）。带名/不带名两套文案，绝不跨 key 拼接句子。
- **D5 [刷新时机]**：挂载时算一次，不挂 timer。hero 只在空会话显示，新建会话会重新挂载，本身即刷新时机。

## 追问记录

- [2026-09-03] **事实调研（本仓库源码）**
  - 台词集中于一处：`src/client/state-machine/overlay-speech.ts` —— `STATE_SPEECH` 8 条（working / error / permission / done / nod-smile / frown-wave / happy / angry）+ `SURPRISE_LINES` 4 条惊吓池（吓！/ 何人！/ 休要动手动脚！/ 咦？可是吓到大人了？）。
  - 人设（`docs/character-profile.md`）：古风 · 贵族 · 少女 · 剑士 · 很聪明 · 冷冽。
  - 风格红线（`docs/character-lines.md`）：半文半白 + 赛博点缀；一句 12 字内为佳；**不甜腻、不卑微**；「生气/惊吓等生活化场景允许破格」。
  - 状态机 `overlay-state-machine.ts`：`OverlayState = idle | working | permission | error`，`PerformanceKind` 含 done/nod-smile/frown-wave/happy/angry/surprised。**当前无「新建会话」态或钩子**。
  - **本插件尚未接入 slots**（`src/client/index.ts:164` 注释：后续工单用 slots/locale 等）；peerDeps 只有 react/react-dom，定位「独立插件，不复用 dsh-web-ui 任何包」。
  - 会话数据可达：`ctx.get("sessions")`（ISessions），已供会话气泡列使用 → 新建会话可由此监听。
  - 持久化两条现成路径：client 侧 `createPersistentSetting`（`packages/dsh-session-bubble`，localStorage + `STORAGE_KEYS` 单点，皮肤/特效/气泡数上限均走此路）；host 侧 `ctx.storageDomain` + `settings` 分节 `dsh-jx.*`（先例 `dsh-jx.aiTitle`）。
  - **关键阻塞**：`conversation.hero.headline` slot 不在本仓库，必须由 deepseek-harness 的 `ui-conversation` 新增；本插件要占用它就得新增对 `@deepseek-ai/dsh-client-ui-conversation` 的依赖。

- [2026-09-03] **Q6–Q9 由我拍板（用户已授权）** —— 见下方 D6–D10。

- [2026-09-03] **Q1 追问（用户）：「大标题还是『探索未至之境』，不能做可插拔的插件么？」** —— 即希望插件自己就能换掉大标题。
  - 事实核查（dsh slots 机制）：slot 的**声明**与**渲染点**都必须在宿主侧——`ui-conversation/src/client/apply.ts:184-187`（children 声明）与 `EmptyHero.tsx:124`（`renderSlot` 渲染点）。插件只能 `ctx.slots.inject` **占用**已存在的 slot（范式见 `ui-brand-official` → `conversation.hero.brand.mark`）。**不存在"插件凭空新增一个宿主会渲染的 slot"的机制。**
  - 因此「零改动宿主 + 换掉大标题」只有一条路：client 侧 DOM 劫持（`lib/client.js` 确实在页面里跑）。但 hero 标题的 class 是 CSS module 哈希名（插件拿不到 `css.headlineText`），只能靠文案匹配（「探索未至之境」）——locale 一换即失效，且与宿主 DOM 结构强耦合。判定为不可接受。
  - 结论：**可插拔 ≠ 零改动宿主**。宿主要开一次槽（3 处约 10 行），之后任意插件可插拔：装上显示问候，卸载自动回落原文案。
  - 宿主改动清单（已核到行）：
    1. `packages/client/ui-conversation/src/client/apply.ts:184-187` — children 加 `'conversation.hero.headline': { kind: 'single', scope: 'root' }`
    2. `packages/client/ui-conversation/src/client/contract/slots.ts:121-125` — 加该 slot 的 owner 类型声明
    3. `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx:124` — `t('hero.headline')` 改为 `renderSlot(..., { fallback: 原文案 })`
  - 好消息：fallback 保留原文案 → 宿主**测试零改动**（`tests/skeleton.client.spec.tsx` 的 5 处断言仍命中 fallback）、**i18n 零改动**（无新增 locale key，不触发 `verify-client-ui-i18n`）。

- [2026-09-03] **Q1 → 用户选方案 1「跨仓库开槽」**；**Q2 → 用户选「全加」（覆盖全部台词，非我推荐的「只给破格场景加」）**。
- [2026-09-03] **事实核查（新建会话能否检测）**：`SessionSummary`（`dsh-client-runtime/lib/types/client/sessions/service.d.ts:30-61`）含 **`blank: boolean`** ——「Empty-log bit（host summary derivation mirror）」。故 `sessions.list` 快照里 `byId[current].blank === true` 即可判定空会话。**注意同一句注释**：「New Session reuses a blank one targeting the same workspace」——点「新建会话」若复用同工作区已有空白会话，session id **不变**，id 变化检测会漏掉。
- [2026-09-03] **台词 + 颜文字草案（待用户过目）** —— 见下方「台词草案」段。

## 决策汇总

- **D1–D5**：见上，迁移自 memorial 002。
- **D6 [英文文案]**：不做。本插件是中文单语角色插件，无 locale 体系；若走 slot 方案，宿主侧 fallback 保持原「探索未至之境 / Into the Unknown」不动。
- **D7 [「预览版」badge]**：保留不动。slot 只替换 headline 节点，badge 是兄弟节点（宿主 `EmptyHero.tsx:124-125`），互不影响。
- **D8 [关闭开关]**：**在本插件的 SettingsCard 里加一个「个性化问候」开关**。修正了 memorial 002 中「不加开关」的初步结论——那里关闭粒度 = 禁掉整个包，而本插件同时承载角色浮层，不能为了关问候而连姜晓一起禁掉；且 SettingsCard 已有皮肤/特效同类开关，成本极低。
- **D9 [用户名校验]**：`trim` 后非空才算有效（全空白 = 未填，走 D4 退化文案）；上限 **16 字符**；剥离控制字符与换行（避免破坏单行排版）；允许中文/字母/emoji；不做敏感词校验。
- **D10 [用户名存储]**：走 client 侧 `createPersistentSetting`（localStorage），与皮肤/特效开关同构。不选 host settings 分节——纯展示偏好不劳烦 host 半区，且顺带绕开「远端浏览器 memory 模式下 host settings 不可写」的问题。代价：不跨浏览器 profile 同步，对角色插件可接受。
- **D11 [hero 实现路径]**：跨仓库开槽。宿主 `ui-conversation` 新增 `conversation.hero.headline` slot（3 处约 10 行，fallback 保留原文案 → 宿主测试/i18n 均零改动），本插件新增 peerDep 并占用。否决 DOM 劫持（靠文案匹配、locale 一换即失效）。
- **D12 [颜文字覆盖]**：**全部台词都加**（用户拍板，我原推荐只覆盖破格场景）。风格统一取**线条型/冷感**，避开圆润可爱型，守住「不甜腻、不卑微」红线。
- **D13 [新建会话触发时机]**：订阅 `sessions.list`，当 `current` **变化**且 `byId[current].blank === true` 时触发一次；同一 id 不重复（记 lastGreetedId）；插件挂载时若当前已是 blank 会话，补触发一次。**已知漏检**：点「新建会话」复用同工作区已有空白会话时 id 不变 → 不触发（此时 hero 也未重新挂载，行为一致）。
- **D14 [姜晓台词称呼]**：用「大人」，**不带用户名**。用户名只出现在 hero 标题。理由：姜晓现有台词一律用「大人」，人设为古风敬语，塞入现代用户名会破人设且与 hero 标题重复。

## 台词草案（待用户过目 / 改动）

风格：线条型冷感颜文字；颜文字不计入「一句 12 字内」的字数，但气泡需能容纳（待确认是否放宽）。

**状态台词（8 条，全加）**
| 场景 | 现文案 | 草案 |
|---|---|---|
| working | 遵命，这就去办。 | 遵命，这就去办。(・∀・) |
| error | 此事有蹊跷，容我再查。 | 此事有蹊跷，容我再查。(-_-;) |
| permission | 此事需大人首肯。 | 此事需大人首肯。(`・ω・´)ゞ |
| done | 此事已毕，大人过目。 | 此事已毕，大人过目。(￣▽￣) |
| nod-smile | 大人英明，姜晓这便去办。 | 大人英明，姜晓这便去办。(￣ー￣)b |
| frown-wave | 既如此，姜晓告退。 | 既如此，姜晓告退。(´･_･`) |
| happy | 大人笑了，姜晓也欢喜。 | 大人笑了，姜晓也欢喜。(´▽｀) |
| angry | 久候无应，姜晓有些不耐。 | 久候无应，姜晓有些不耐。(¬_¬) |

**惊吓台词池（4 条，全加）**
`吓！(ﾟДﾟ)` / `何人！(ﾟωﾟ)` / `休要动手动脚！(ﾟДﾟ)ﾉ` / `咦？可是吓到大人了？(´･ω･`)`

**新建会话台词（新增 4 条，与 hero 时段同步）**
`大人，晨安。今日有何差遣？(￣▽￣)` / `大人，午后安好。有何吩咐？(・∀・)` / `大人，夜安。可要姜晓侍候？(￣ー￣)` / `夜深了，大人还不歇息？(¬_¬)`

- **D15 [用字]**：hero 问候里的「有什么需要我搞定的**么**」保留用户原话的「么」，不改为「吗」。更软、更口语，契合关怀语气。
- **D16 [台词定稿]**：上方「台词草案」照用，实施时一字不改（本项目约定：台词文案由用户填，不属于代码审查范围）。
- **D17 [气泡宽度]**：放宽气泡宽度上限以容纳颜文字；「一句 12 字内为佳」的约束**只计汉字**，颜文字不计入，不为此压缩台词。
- **D18 [已知漏检]**：接受 D13 的漏检——点「新建会话」复用同工作区已有空白会话时 session id 不变、不触发台词；此时 hero 亦未重新挂载，两者行为一致。

## ADR

- [adr/0033-hero-greeting-pluggable-slot.md](adr/0033-hero-greeting-pluggable-slot.md) — 宿主开槽 + 插件占用（D2/D11）
- [adr/0034-greeting-user-name-self-declared.md](adr/0034-greeting-user-name-self-declared.md) — 用户名自填 + 姜晓称「大人」（D1/D14）
- [adr/0035-greeting-time-buckets-local-time.md](adr/0035-greeting-time-buckets-local-time.md) — 时段四档 + 本地时区 + 挂载时算一次（D3/D5）
- [adr/0036-greeting-user-name-local-storage.md](adr/0036-greeting-user-name-local-storage.md) — 用户名存 localStorage（D10/D8）

## 完成声明

C1 诉求回应：4 个诉求点（hero 问候 / 姜晓新建会话台词 / 颜文字 / 实现落在本插件）均有对应决策。
C2 决策完备：D1–D18，无「待定 / 暂缓 / 未决」。
C3 待澄清清零：Q1–Q9 全部收敛，三条收尾澄清已转为 D16–D18。
C4 调查闭环：无挂起工单，全部事实由源码直读（deepseek-harness + 本仓库 + `dsh-client-runtime` 类型）。
C5 ADR 齐全：4 条 ADR，均已同步 `docs/adr/`。

---

## 附录：deepseek-harness memorial 002 完整访谈记录

> 以下为 `E:\work\sp\deepseek-harness\docs\memorial\002-hero-greeting-personalization\context.md` 全文照录，使本仓库的访谈记录自包含，不必跨仓库查阅。

# 002-hero-greeting-personalization

状态：已迁移（实现落点改为外部插件 `E:\work\sp\dsh-web-ui-jx`，后续追问见其 `docs/memorial/017-hero-greeting-and-new-session-lines/`）

## 诉求

> 我想做一些个性化，关怀性调整：把新会话中的探索未至之境，改成：
>
> - 上午好，【用户名字】，有什么需要我搞定的么？
> - 下午好，【用户名字】，有什么需要我搞定的么？
> - 晚上好，【用户名字】，有什么需要我搞定的么？
> - 该休息了，【用户名字】，让我来做吧，好好休息哦。

## 追问记录

### 2026-09-03 事实调研（源码直读）

- 「探索未至之境」= locale key `hero.headline`，定义于 `packages/client/ui-conversation/src/client/locales.ts:65`（zh）/ `:213`（en: `Into the Unknown`）。
- 唯一渲染点 = `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx:124`，`{t('hero.headline')}` —— 目前**无参数**调用。
- 同文件 `:125` 紧邻渲染 `hero.preview`（「预览版」badge）。
- `t` 支持插值参数（例：`t('input.accessMode', { name })`），因此 `{name}` 型文案无需改 i18n 基础设施。
- zh 字典是 key-set 的 source of truth，en 用 `satisfies Record<ConversationKey, string>` 强制全量对齐 —— 新增 zh key 必须同步 en。
- **用户名当前全仓库不存在**：`packages/identity/anonymous-user-id` 只提供匿名 UUID（`$DSH_HOME/.anonymous-user-id`），README 明确「不要用它来识别用户」。client 侧无账号/登录/profile 概念，无 `userName` / `displayName`（仅 provider 的 displayName，无关）。
- 测试断言：5 处硬编码「探索未至之境」在 `packages/client/ui-conversation/tests/skeleton.client.spec.tsx`（442/476/483/508/526）。录制快照（`snapshots/`）**不含**该字符串。
- `CONTRIBUTING.zh.md:23` 的「探索未至之境」是项目 tagline，**与本次改动无关**。
- 仓库约定（AGENTS.md）：客户端 UI 文案归语言区域所有，必须经类型化字典 + `t`，硬编码文案会被 `verify-client-ui-i18n` 拒绝。

### 2026-09-03 09:45 追问 Q1（用户名来源）→ 选 1「新增用户自填的设置项」

### 2026-09-03 09:50 补充事实调研（settings 基础设施）

- 设置持久化 = **Host user-settings 文档**（用户级，不是按工作区）。客户端经 `ctx.settingsScope.bind<T>({ namespace })` 读写，快照 `mode: 'host' | 'memory'`；memory 模式（远端浏览器）**不接受写入**，因此名字在 memory 模式下不持久。
- 现成范式（`ui-conversation` 自己的 Enter 行为设置，可直接照抄）：
  - `packages/client/ui-conversation/src/submission-settings.ts` — 字段常量 + schemastery schema + `ConversationSettings` 类型
  - `packages/client/ui-conversation/src/index.ts` — Host 侧 `settingsNamespace(...)` 注册
  - `packages/client/ui-conversation/src/client/apply.ts:106` — `ctx.settingsScope.bind`
  - `.../client/input/submission-policy.ts` — 包一层 policy，暴露 snapshot store + setter
  - `.../client/settings/EnterBehaviorRow.tsx` + `apply.ts:109` 的 `settings.general.item` 注入 — 设置界面里的一行
- 「通用设置」页 = `ui-settings-general`，内容是 `settings.general.item` 列表 slot，由各功能包自行贡献行；当前贡献者有 locale（语言）、ui-agent-preset、ui-chat、ui-conversation。**加一行无需改 ui-settings-general**。
- `EnterBehaviorRow` 是下拉（Menu）；用户名需要的是**文本输入行**，仓库内暂无同类先例。

### 2026-09-03 09:57 补充事实调研（独立成包的成本）

- 参照最小 client 插件 `packages/client/ui-brand-official`，一个新包需要 12 类文件：package.json（5 个 exports 入口 + `dsh.client.inject` + `platform` + peer/dev deps + `files` + `scripts.bundle`）、tsconfig.json、tsdown.config.ts、src/index.ts（Host 面）、src/client/index.ts（Client 面）、src/invariant.ts（仓库强制的包级不变式伴生文件）、tests/invariant.client.spec.ts、tests/*.client.spec.tsx、README.md + README.zh.md + README.i18n.yaml（doc-sync 双语门禁）。
- Host 面注册极轻：`src/index.ts` 只需 `ctx.inject(['settings'], c => c.settings.register(settingsNamespace(NS), Schema))`（见 `ui-conversation/src/index.ts` 全文 23 行）。
- **注册点只有两处**：`packages/bundle/web-app/cordis.patch.yml` 加一条（`ui-conversation` 在 :202）+ `packages/bundle/web-app/package.json` 的 dependencies 加一项（仓库约定：Raw/Web cordis.yml 中的裸插件必须出现在 resolver manifest 的 dependencies 里，由 `verify-cordis-config` 强制）。
- 覆盖率门禁 `test:coverage` 要求 `packages/*/*/src` **每文件 100%** —— 新包从零就要达标。
- **解耦的现成范式 = slot 占用**：`conversation.hero.brand.mark` 是 `kind:'single', scope:'root'` slot，由 `ui-conversation` 定义 + 提供 fallback（FishLogo），由 `ui-brand-official` 占用；`ui-brand-official` 反向 peerDep `ui-conversation`。hero 文案可以照抄这套。

### 2026-09-03 10:00 追问 Q2（是否独立成包）→ 选 1「独立成包 + slot 占用」

### 2026-09-03 10:00 追问 Q3（时段划分边界）—— 已给出 A/B/C 三方案 + 对比图
推断（待确认）：时区取**浏览器本地时间** —— hero 是纯 client 渲染，Host 不参与。
新浮现待澄清：hero 长时间停留时跨档（如 22:59 → 23:00）是否自动刷新问候语。

### 2026-09-03 10:04 追问 Q3（时段边界）→ 选 1「A：05 / 12 / 18 / 23」
### 2026-09-03 10:06 追问 Q4（无名字退化文案）→ 选 1「去掉名字和逗号，保留问候」
### 2026-09-03 10:09 追问 Q5（跨档是否自动刷新）→ 选 1「挂载时算一次，不刷新」
### 2026-09-03 10:13 追问 Q6–Q9（四项低风险默认值）→ 用户回复「你的想法很棒，其他的也自己决策」，授权我自行拍板

### 2026-09-03 10:13 范围变更：实现落点改为外部插件 dsh-web-ui-jx

用户原话：「我想放在这个插件里去做实现，并且给姜晓也加上新建会话的台词，还有给姜晓现在的台词加上一些颜文字。E:\work\sp\dsh-web-ui-jx」

源码调研与关键阻塞见本文件正文「追问记录 → 事实调研（本仓库源码）」。

## 决策汇总

- **D1 [用户名来源]**：新增用户自填的设置项，而非 OS 推断、首启询问或退化掉名字。
- **D2 [归属与解耦]**：经**新增的 `conversation.hero.headline` slot** 占用 hero 文案；`ui-conversation` 保留原 `t('hero.headline')` 作为 fallback，范式同 `ui-brand-official` → `conversation.hero.brand.mark`。
- **D3 [时段划分]**：A 方案 —— 上午 05:00–11:59 / 下午 12:00–17:59 / 晚上 18:00–22:59 / 该休息 23:00–04:59（wrap-around 判定 `hour >= 23 || hour < 5`）。时区取浏览器本地时间。
- **D4 [无名字退化]**：去掉名字与逗号，保留问候语本身；带名/不带名两套文案，绝不跨 key 拼接句子。
- **D5 [刷新时机]**：挂载时计算一次，不挂 timer、不轮询。

## 待澄清

- Q6 英文文案定稿 / Q7 「预览版」badge 是否保留 / Q8 是否提供关闭开关 / Q9 用户名校验与长度上限 —— 均授权我拍板，结论见正文 D6–D10。
- 中文文案里的「么」是否应为「吗」—— 结论见正文 D15（保留「么」）。
