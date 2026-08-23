# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**主要用户：DSH 宿主终端用户。** 他们在 deepseek-harness（DSH 宿主运行时，Web 界面）上使用 AI 助手，原本是纯文字交互。本插件为这类用户提供常驻的唐风角色「姜晓」浮层陪伴，在 idle/thinking/reading/replying/working/error/welcome/done/permission/listening 等状态间随助手行为切换，并通过台词气泡与会话气泡列提供拟人化、可导航的反馈。用户希望在工作事需要「沉浸但不扰工」的角色陪伴，而非喧宾夺主的装饰。

**次要受众：开发者与维护者。** 他们克隆仓库即可获得全部素材（无外部路径依赖）、独立发布/迭代版本，并通过内置素材管理面板导入自定义角色素材。管理能力属于用户可配置项，不抢占核心价值。

## Product Purpose

把姜晓角色浮层、素材管理 UI 与唐风三层 token 设计系统，以**独立、可安装、可独立发布**的 DSH Bundle 插件形态带进 deepseek-harness 宿主。它让文字驱动的 AI 助手界面获得角色化陪伴体验，同时保持素材自洽、复用宿主原生 API、不影响宿主其他 UI。成功 = 用户一条命令装好后即可获得连贯的角色化陪伴，且深浅主题、可访问性、性能开关均开箱可用。

## Positioning

在 DSH 生态里，本插件是唯一一个**不复用 dsh-web-ui 任何包**、自带全部角色素材、以「姜晓角色 + 唐风三层 token 设计系统」为完整闭环的独立 Bundle 插件。它把原来耦合在 monorepo（dsh-pet / skin-center）里、无法独立使用/测试/发布的角色皮肤，拆成一个可克隆即用、可独立迭代的实体。定位抓手：素材自洽（进 git）+ 官方 token 架构 + 绑定品牌人设，三者缺一即不再是本产品。

## Operating Context

- **宿主**：deepseek-harness（`E:\work\sp\deepseek-harness`，`@deepseek-ai/dsh-root`）。经 `ctx.webServer.register` 注册 `/api/dsh-jx/*` 路由，经 `ctx.storageDomain` 存素材导入元数据（KV）。
- **素材生态三段**：openCodeMM（素材源，46 角色 webp）→ dsh-web-ui-jx（本插件）→ deepseek-harness（宿主）。
- **安装/发布**：`dsh plugin --profile web add link:...`（开发）/ `npm publish`（发布）。
- **构建与验收**：`npm run build`（host/client 双半区：lib/index.js + lib/client.js）、`npm run verify`（21 项发布前检查）、`prepublishOnly` 自动 build+verify。部署/提交前须主动构建验收。
- **主题信号**：跟随官方 `body[data-ds-dark-theme]`；浅色 = `:not([data-ds-dark-theme])`。
- **当前主声场**：角色浮层可整盒拖动、位置持久化（`localStorage`）、会话气泡列可点击跳转会话。拖动/浮层均不干扰底层 UI（台词气泡穿透，气泡本体可点）。

## Capabilities and Constraints

能力：

- 角色浮层：10 循环态 + 36 过渡态 WebP，`<img>` 播放（非 video）；台词气泡淡入淡出自动隐去；整盒可拖 + 位置持久化。
- 会话级状态机：每会话一实例 + 焦点仲裁（当前打开会话最优先，error/permission 可紧急抢焦）。
- 会话气泡列：运行中/已完成会话竖排、可点击跳转、当前会话高亮、数量上限可配（默认 10）。
- 素材管理：选 zip / 本地目录导入、进度反馈、已导入列表；zip 契约按 ADR-0003。
- 设置卡：皮肤 / 特效 / 管理界面三个可折叠 section + 角色 section。
- 特效系统：shimmer / fall / grain / warp / micro 五类，默认开、可独立关；全关 = 与原版宿主皮肤无差异。
- 深浅双主题：深色墨金卷轴 / 浅色宣纸梅花，两套令牌双值必须同时覆盖。

约束：

- **三层 token 架构（ADR-0002）**：L1 base → L2 jiangxiao remap（`body[data-dsh-jiangxiao]`）→ L3 组件。组件只消费 `--dsw-alias-*` / `--dsw-specific-*` 语义别名，不写颜色字面量、不含主题选择器；唐风炫技走 `--jx-*` 专属轨。唯一设计基准固化于根 `DESIGN.md`。
- **角色透明无底**：容器无 background / box-shadow / 光晕 / 背光（背光已于近期实现中移除，代码需与基准一致）。
- **素材进 git、二进制不进 KV**：素材本体走文件系统 + 路由，KV 只存导入状态/路径/manifest 元数据。
- **复用宿主原生 API**：不扩展 webServer/storage 之外的主机能力；不复用 dsh-web-ui / dsh-pet / skin-center 任何代码。
- **独立 DSH Bundle 插件（ADR-0001）**：host/client 双半区，独立 npm 发布。

## Brand Commitments

以下为**binding（不可违反）**的品牌承诺，后续任何视觉演进只能继承性演进，不得替换：

- **姜晓人设**：古风、贵族、少女、剑士、很聪明、冷冽；异时间线赛博大明的智能助手。台词场景表见 `docs/character-lines.md`，人设详见 `docs/character-profile.md`。
- **唐风二次元视觉**：透明无底角色素材 + 唐风设计系统（墨金卷轴 / 宣纸梅花），装饰克制、只点缀核心元素。
- **官方小鲸鱼 logo**：保留（FishLogo.tsx 精确 SVG path，`fill=currentColor` 随 `--dsw-alias-brand-text`）。
- **沉浸但不扰工**：动效柔和不拦截指针；可访问性优先于花哨。

## Evidence on Hand

- 用户故事、解决方案、实现/测试决策：`.scratch/01-dsh-jx-plugin/PRD.md`。
- 领域词汇与已定决策（ADR-0001…0009）：根 `CONTEXT.md` + `docs/adr/`。
- 视觉唯一基准：根 `DESIGN.md`。
- 宿主与素材源路径记录于 `CONTEXT.md`。
- 素材：`assets/character/`（46 webp）、`assets/fonts/`（2 woff2）、`assets/preview/`（2 png）。
- 无外部证言/benchmark/定价：本产品为内部生态插件，**不得虚构**成功案例、客户、定价或部署声量。

## Product Principles

1. **角色陪伴为核心，管理为可配置项**：打磨浮层/状态机/台词/气泡体验优先；管理 UI 只须正确、可发现、不喧宾夺主。
2. **透明无底、零干扰**：角色永远 alpha 透明、不占容器背景、不加光晕背光；装饰层不拦截用户与宿主 UI 的交互。
3. **官方信号优先**：主题、动效降级（reduced-motion）、特效开关全部尊重宿主与用户偏好，不抢宿主控制权。
4. **素材自洽、开箱即用**：克隆仓库即可跑，素材进 git，不依赖外部路径；import 只做增强，不阻塞即用。
5. **一致性由系统保证、不靠约定**：三层 token 架构下组件只消费语义别名，深浅双主题、品牌更换由 L2 remap 一处统一，避免组件层散落字面量。

## Accessibility & Inclusion

- `prefers-reduced-motion` 下所有动效全部关闭（过渡、动画、装饰层、飘落/光效），保留静态内容。
- 深浅双主题均达 WCAG AA 对比度；`:focus-visible` 用 `--jx-gold` 描边。
- 参考实现硬件不提供的触屏降级（warp 在 `pointer:coarse` 降级），触屏浮层拖动不触发页面滚动/文本选中（`touch-action:none`）。
- 建立的标准：跟随宿主主题信号即时无闪烁。