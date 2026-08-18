# Memorial 001 — dsh-plugin-ui

**状态**: 已完成

## 诉求

用户原话：

> 我想产考E:\work\sp\dsh-web-ui项目，在本项目做一个DSH插件UI，这是在之前的项目中一些决策： "E:\work\sp\dsh-web-ui\docs\memorial\001-jiangxiao-asset-pack\context.md"

（"产考"疑为"参考"笔误。核心意图：参考 dsh-web-ui 项目的做法，在本项目 dsh-web-ui-jx 中做一个 DSH 插件 UI。）

**参考材料**：`E:\work\sp\dsh-web-ui\docs\memorial\001-jiangxiao-asset-pack\context.md`（前项目 jiangxiao 素材打包 + 导入入口的决策记录，作为输入参考而非结论）。

**参考源路径（用户指定，2026-08-18）**：
- `E:\work\sp\openCodeMM` — 角色素材源（前 memorial 提到 `open-code-mm` 为公开 character 素材来源，此为本机路径，待确认）
- `E:\work\sp\deepseek-harness` — 待确认用途（可能为 DSH 插件宿主/运行时参照）

参考决策摘要（待 grill 逐条重验）：
1. 素材包格式 .zip；2. 素材存 `~/.codex/pets/jiangxiao/`（复用 dsh-pet 链、路径用户自选）；3. 导入入口 = 皮肤设置卡按钮；4. 打包工具 = `packages/skins/jiangxiao/scripts/pack.mjs`；5. 导入/服务链复用 dsh-pet（`POST /api/pet/import-zip` → `~/.codex/pets/jiangxiao/` → `GET /pet/jiangxiao/<file>`）；6. 需扩展 dsh-pet 支持自定义 targetDir。

---

**新诉求（2026-08-18 续接）**：
> 把所有相关的素材都复制到本项目

（含义解读：将本插件运行/开发所需的所有真实素材——角色动画 webp、皮肤字体 woff2、预览图等——从各源（openCodeMM / dsh-web-ui）复制到 `dsh-web-ui-jx` 仓库内，使其自洽，摆脱对源路径的 file:// 绝对引用。）

## 追问记录

### 2026-08-18 — 素材复制（事实核查）

核查各源的素材体积（作为"复制多少"的判断依据）：

| 源 | 内容 | 数量 | 体积 |
|----|------|------|------|
| openCodeMM character/ | 角色动画 WebP（10 循环 + 36 过渡） | 46 | **232.3MB** |
| openCodeMM docs/video/ | 抠绿前 mp4（10 态 + 过渡 + 额外态） | 53 | 81.1MB |
| openCodeMM docs/image/图片2无水印版/ | 角色设定 PNG | 28 | 49.6MB |
| dsh-web-ui skins/jiangxiao/preview/ | 皮肤预览图 dark/light.png | 2 | ~2.4KB each |
| dsh-web-ui skins/jiangxiao/art.ts | 内联 woff2 字体（楷体+宋体） | 2 | 4.03MB |

关键：**character 46 webp = 232MB**，体积接近原 memorial 的 232MB 素材包规模。复制到本仓库前需确定目标结构与取舍。

### 2026-08-18 — Q5 素材复制范围与结构

先落盘既有决策基底（Q1-Q4 已验证）：完整重做 + 独立 DSH Bundle 插件 + 完整 UI + 设计基准 DESIGN.md 已固定。本诉求「复制所有相关素材」因此服务于**插件运行时自洽**。

**Q5 决策**：全量复制进 git。将相关素材分目录复制进 `dsh-web-ui-jx`（character webp / 字体 woff2 / 预览图等），且**全部纳入 git 提交**（可克隆即用、完全自洽，接受仓库 +232MB）。webp 作为打包工具输入源 + 运行时本地素材，字体提取出 art.ts 作为运行字体。

**Q6 决策**：只保留插件运行必需素材（方案 1），跳过设定 PNG 与 mp4 中间产物。

**素材复制结果（落地）**：
- `assets/character/` — 46 个角色 webp（10 循环 + 36 过渡），232.3MB
- `assets/fonts/` — JIANGXIAO_FONT_MASHANZHENG.woff2 (1680KB) + JIANGXIAO_FONT_NOTOSERIFSC.woff2 (1416KB)，从 art.ts base64 提取
- `assets/preview/` — dark.png / light.png (2.4KB each)
- 合计 235.3MB。设定 PNG（49.6MB）与 mp4 源（81MB）**不复制**（运行时不需要，是生成 webp 的中间产物）。提取脚本 `.temp/scripts/extract-fonts.mjs`（临时，不进 git）。

**demo 自洽改造（落地）**：`.temp/preview/jiangxiao-demo.html` 的素材绝对路径 `file:///E:/work/sp/openCodeMM/...` 已改为相对 `../../assets/character/`（img src + CHARACTER_DIR），demo 完全自洽。浏览器验证：角色 webp 经相对路径从本仓库加载成功（naturalWidth=720），页面正常渲染；无素材相关报错。临时 http 服务器已停止。

已读取参考 memorial（001-jiangxiao-asset-pack）：核心是 jiangxiao 角色素材的**打包工具 + 导入入口**，其 6 项决策全部依赖 dsh-web-ui monorepo 的既有基础设施（dsh-pet 导入/服务链、skin-center、dsh-skins）。本项目为空仓库，无这些依赖，需澄清「DSH 插件 UI」的范围。

**Q1 决策**：用户选择方案 1「完整重做 jiangxiao 素材插件」——打包工具 + 导入 UI + 素材服务链全部本仓库自建，独立 DSH 插件，复用其前项目决策但不复用 dsh-web-ui 任何包。

**Q2 决策**：宿主耦合方式选择方案 1「独立仓库，DSH Bundle 插件」——`package.json` 声明 `dsh.bundle.patch` + `cordis.patch.yml`（host/client 双半区），通过 `dsh plugin --profile web add link:$(pwd)/...` 安装；独立发布到 npm；复用 deepseek-harness `docs/自定义插件/README.md` 的加载链路与排障流程。

**Q3 决策**：UI 暴露点选择「1+3 叠加 = 完整插件」——后端服务 + 管理 UI + 角色浮层 + 状态切换 + 侧边栏入口兼具。host 半区注册 `/api/dsh-jx/*` 路由（导入 API + 素材服务），client 半区注入：管理界面（选 zip/选目录/进度/已导入列表）+ 角色浮层（常驻 + 10 态切换）+ 设置卡 + 侧边栏入口。定位于角色体验（openCodeMM 式），导入是前置。

**Q4 决策**：原型 HTML 继承方式走方案 2「手工重建原型 demo」——基于继承的 `--jx-*` 令牌 + 记忆中的原 demo 描述（三栏布局 + 双主题 + 角色动画 + 10 态切换 + 台词气泡），重写一份静态原型 HTML 放在本项目 `.temp/` 下（进 gitignore，不含令牌内联 base64 字体，纯设计预览）。令牌继承待确认粒度（整套 remap vs 仅 `--jx-*` 核心）。

**Q4 后续（原型打磨 + 真实素材接入）**：
- 用 `impeccable`（polish）打磨原型：角色浮层占位替换为真实 `<video>`，10 态切换时播放对应 mp4；修复 `.avatar video` 样式；清理重复 `</script>`。
- 素材源：`E:\work\sp\openCodeMM\docs\video\` 10 态 mp4 齐全（idle/thinking/reading/replying/working/error/welcome/done/permission/listening → `{state}.mp4`），外加 36 组 `transition-*` 过渡态。原型 JS 用 `VIDEO_DIR = file:///E:/work/sp/openCodeMM/docs/video/` 拼接播放。
- 原型路径：`.temp/preview/jiangxiao-demo.html`（file:// 直接打开可用，video 用绝对 file:// 路径播放）。

**产品修正（素材源correction）**：动画包实际正确源是 `E:\work\sp\openCodeMM\opencode\packages\app\public\character\`——**46 个 WebP**（10 循环态 + 36 过渡态），与参考 memorial 完全吻合；`docs/video/` 的 mp4 只是抠绿前的中间产物。README 规范：用 `<img>` 播放（非 `<video>`）、`{state}.webp` 命名、9:16 透明、循环段 looptim、过渡段 loop 一次。原型已改为 `<img>` + `CHARACTER_DIR = file:///.../public/character/` 播放 WebP。

### 2026-08-18 — 官方设计系统核查（deepseek-harness）

用户指示去官方代码找设计。核查 `deepseek-harness` 得出官方样式架构（source of truth）：

- `docs/web-styling.zh.md`：`ui-theme` 负责 `--dsw-*` 静态色阶/语义别名/排版/动效/阴影/滚动条/明暗；功能包**只用语义别名**，不写颜色字面量，不含主题选择器。
- `packages/client/ui-theme/src/styles/base.css`：`--dsw-font-family`（系统+PingFang+雅黑栈）、`--ds-font-family-code`、`--ds-ease-in-out`、`--ds-transition-duration*`。
- `design-platform.css`：`--dsw-static-*`（neutral/neutral-bluish/blue/deepseek/green/red/amber，主题无关）+ `--dsw-alias-*`/`--dsw-specific-*`（light 默认 + `body[data-ds-dark-theme]` 暗覆盖）。
- **结论**：官方三层 = L1 base → L2 static+alias/specific → L3 组件消费语义别名。jiangxiao 皮肤（L2 remap）在 `body[data-dsh-jiangxiao]` 作用域把 static/alias remap 到唐风色板，浅色 = `:not([data-ds-dark-theme])`。
- 原型 `.temp/preview/jiangxiao-demo.html` 已按此三层架构重写：组件层只消费 `--dsw-alias-*`/`--dsw-specific-*`，皮肤层 remap，暗/亮走 `body[data-ds-dark-theme]` 官方信号。

### 2026-08-18 — 固定设计 + 官方鲸鱼 logo

用户指示「固定这个设计，保留官方小鲸鱼 logo」。处理：
- **固定设计**：以官方三层 token 架构版为基准定稿（L1 base → L2 static/alias/specific remap → L3 组件只消费语义别名）。后续插件组件 CSS 按此写。
- **官方小鲸鱼 logo**：从 `deepseek-harness packages/client/ui-primitives/src/FishLogo.tsx` 提取精确 SVG path（`viewBox 0 0 23.16 17.04`，`fill=currentColor`，native 23.16×17.04 渲染 24×18），移植进原型品牌行 `.fish-logo`，色 `currentColor` 随 `--dsw-alias-brand-text` gilded。官方语义：鱼 logo 是 collapsed rail 的常驻标记 / expanded 时可作品牌饰件。

### 2026-08-18 — 沉淀 DESIGN.md 基准

用户指示将 token 架构 + 组件结构沉淀为 DESIGN.md 基准。已写入项目根 `DESIGN.md`，含：设计哲学（黑金/梅花）、官方三层 token 架构（L1 base / L2 skin remap / L3 组件）、`--jx-*` 令牌暗浅双表、组件结构语义别名规则、角色浮层专规、FX 特效系统表、动效与可访问性、禁用项。此文件取代 imempccable 的 context.mjs 的 visual authority，成为本项目唯一设计基准。

### 2026-08-18 — 继承清单核查（事实核查，非决策）

用户指示「把原来 jiangxiao 的设计令牌和原型 html 先继承过来」。核查结果：

**可继承（磁盘存在）**：
- `packages/skins/jiangxiao/src/client/jiangxiao.module.css` — 设计令牌完整源（`--jx-*` token 块：surface/text/gold/seal/mist/radius/shadow/motion，双主题 dark「墨金卷轴」+ light「宣纸梅花」；三层 remap：`--dsw-static-*` / `--dsw-alias-*` / `--aion-*`；CSS 炫技：鎏金流光顶栏 / 银杏·梅花飘落 / 朱砂印章发送钮 / 金箔标题 / 墨晕呼吸 / 金描滚动条 / prefers-reduced-motion）
- `packages/skins/jiangxiao/src/client/skin-card.module.css` — 皮肤设置卡样式（基于 --jx-* token）
- `packages/skins/jiangxiao/src/client/art.ts` — 4.1MB，两个 woff2 字体（Ma Shan Zheng 楷体 + Noto Serif SC 宋体）base64 内联
- `packages/skins/jiangxiao/src/client/index.ts`、`locales.ts`、`SkinSettingsCard.tsx` — 皮肤 apply() 骨架 + 设置卡组件
- `packages/skins/jiangxiao/skin.json`、`cordis.patch.yml`、`package.json`、`tsdown.config.ts` — 包元数据与构建

**不可继承（已丢失）**：
- `.temp/skin-preview/index.html`（三栏 demo 原型）— 磁盘与 git 历史均不存在（.temp 被 gitignore 且已清理），openCodeMM 中也不在。只有 `gallery/` 两张 preview 图存活。

**注意**：原 jiangxiao 是「皮肤」（skin，挂 skin-center），本插件是「独立 DSH Bundle 插件」——令牌是皮肤层设计语言，可直接继承；但架构定位不同（插件 vs 皮肤）。

用户补充两条参考源路径，探查后落盘为已知事实：

- **`E:\work\sp\deepseek-harness` = DSH 宿主运行时**（`package.json` name `@deepseek-ai/dsh-root` @0.1.0-rc.5）。它是 DSH（DeepSeek Harness）官方 monorepo：vendored cordis，宿主/客户端双半区构建（host/client），包含 `packages/web`、`apps/web`、`apps/cli`、`docs/subsystems/*`（web-server、filesystem、storage、terminal 等子系统）。dsh-web-ui 正是运行在它之上的插件集。
- **`E:\work\sp\openCodeMM` = 角色素材源**（江小晓角色）。`docs/video/` 有 idle/thinking/reading/replying/working/error/welcome/done/permission/listening 共 10 态 mp4 + `transition-*.mp4` 过渡态；`docs/image/图片2无水印版/` 有对应角色 png；`scripts/chroma_key_green.py` 是抠绿脚本。与参考 memorial 中 46 个 WebP 的素材源（openCodeMM 的 public/character/）对应。
- **`E:\work\sp\dsh-web-ui` = 参考项目**（dsh-web-ui fork，jiangxiao 皮肤实现）。

这三个路径构成了本插件的完整生态：**openCodeMM（素材）→ dsh-web-ui-jx（本插件）→ deepseek-harness（宿主）。**

### 宿主平台 API（deepseek-harness 原生能力，核实于 docs/subsystems/）

**HTTP 服务（`ctx.webServer`，packages/host/webserver）**：宿主内嵌 `node:http` 服务，提供命名路由注册表。
- `register(route)`：注册 named route，`kind: 'exact' | 'prefix'`，`path`（绝对路径，无尾斜杠），`handler(req,res)` 拥有完整响应生命周期（可 hold 住，如 SSE）。重复 `(kind,path)` 抛错。返回 disposer。
- `registerFallback` / `registerUpgrade` / `tapIndex`：SPA fallback / websocket upgrade / index.html 变换。
- **这是自建素材服务链的挂载点**（可注册 `/api/dsh-jx/asset/<file>` 之类 prefix 路由读本地文件）。

**存储（`ctx.storage` / `ctx.storageDomain`，packages/storage）**：KV 域存储。
- `ctx.storage.domain`（同 `storageDomain`）声明式规范（zod），`open(spec)` 打开 domain，读写原子且可持久化，`domain/changed` 事件通知。
- **可记录导入状态 / 路径 / manifest 元数据**。
- 注意：KV 是文档型，不适合存 232MB 二进制 WebP——素材本体应走文件系统 + webServer 路由，KV 只存元数据。

**结论**：自建素材服务链可行，宿主原生提供路由注册 + KV 存储，无需扩展宿主。参考项目里 dsh-pet 的「导入/服务链」正是基于这类宿主 API 实现的，本插件可对齐实现而不依赖 dsh-pet 包本身。

## 决策汇总

1. **范围（Q1）**: 完整重做 jiangxiao 素材插件。打包工具 + 导入 UI + 素材服务链全部在本仓库 `dsh-web-ui-jx` from-scratch 实现，作为独立 DSH 插件。参考前项目决策，但**不复用 dsh-web-ui 任何包**（不依赖 dsh-pet / skin-center / dsh-skins）。
2. **宿主耦合方式（Q2）**: 独立仓库 DSH Bundle 插件。`package.json` 声明 `dsh.bundle.patch` + `cordis.patch.yml`（host/client 双半区），`dsh plugin --profile web add link:...` 安装，独立 npm 发布。复用 DSH 自定义插件加载链路。
3. **UI 暴露点（Q3）**: 完整插件（1+3 叠加）。后端服务（导入 API + 素材路由）+ 管理 UI + 角色浮层（常驻 + 10 态切换）+ 设置卡 + 侧边栏入口。定位角色体验，导入为前置。
4. **原型 HTML（Q4）**: 手工重建原型 demo，基于继承 `--jx-*` 令牌，放本项目 `.temp/`（不进 git，纯设计预览）。令牌继承粒度待确认。
5. **设计基准（固化）**: 以官方三层 token 架构版定稿为 `DESIGN.md`（项目根）。官方鲸鱼 logo（FishLogo.tsx 精确 path）保留进品牌行。
6. **素材复制（Q5+Q6）**: 全量复制进 git（`assets/character/` 46 webp + `assets/fonts/` 2 woff2 + `assets/preview/` 2 png，共 235.3MB，50 文件，已 staged）。设定 PNG 与 mp4 中间产物不复制。demo 素材路径已改相对、完全自洽。

## 待澄清

（空。C1-C5 检查见下方回写记录。）

## 收尾回写记录（2026-08-18）

用户确认「全部新建」，已完成回写并标记完成：

- **ADR 同步**：ADR-0001（独立 DSH Bundle 插件而非皮肤）、ADR-0002（官方三层 token 架构为唯一设计基准）已创建到全局 `docs/adr/`，并同步复制到 memorial 内 `adr/`。
- **CONTEXT.md 新建**：登记领域术语（项目定位/设计系统/宿主生态/已定决策），指向 `docs/adr/`。
- **checklist 全绿**：C1 诉求回应 ✅、C2 决策完备 ✅、C3 待澄清清零 ✅、C4 调查闭环 ✅、C5 ADR 齐全 ✅。

本 memorial 不再追加，建议归档。
