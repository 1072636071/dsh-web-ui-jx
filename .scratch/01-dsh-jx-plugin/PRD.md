# PRD — dsh-jx-plugin（姜晓角色素材 DSH 插件）

Status: ready-for-agent
来源: docs/memorial/001-dsh-plugin-ui（Q1-Q6 决策汇总）+ ADR-0001 + ADR-0002 + CONTEXT.md

## 问题陈述

用户在 deepseek-harness（DSH 宿主运行时）上使用 AI 助手时，界面是纯文字交互，没有角色化体验。openCodeMM 的「姜晓」角色（唐风二次元，46 个 WebP 动画：10 循环态 + 36 过渡态）此前只存在于参考项目 dsh-web-ui 的 jiangxiao 皮肤里，且依赖其 monorepo 基础设施（dsh-pet 导入/服务链、skin-center），无法独立使用、独立测试、独立发布。用户需要一个可独立安装、开箱即用的插件，把姜晓角色浮层、管理 UI 和唐风设计系统带进 DSH 宿主，且素材自洽（克隆仓库即可用，不依赖外部路径）。

## 解决方案

构建独立 DSH Bundle 插件 `dsh-web-ui-jx`（ADR-0001）：

- **host 半区**：注册 `/api/dsh-jx/*` 路由——素材服务（读取仓库内 `assets/character/` WebP）+ 导入 API；用 `ctx.storageDomain`（KV）记录导入状态/路径/manifest 元数据。
- **client 半区**：注入管理界面（选 zip/选目录/进度/已导入列表）、角色浮层（右下角常驻透明层，10 态切换 + 台词气泡）、设置卡、侧边栏入口。
- **设计**：官方三层 token 架构（ADR-0002），组件只消费 `--dsw-alias-*` / `--dsw-specific-*` 语义别名；L2 jiangxiao remap 到唐风色板（深色墨金卷轴 / 浅色宣纸梅花），暗/亮走官方信号 `body[data-ds-dark-theme]`；保留官方小鲸鱼 logo。
- **素材**：全部进 git（character 46 webp / fonts 2 woff2 / preview 2 png，共 235.3MB），已 staged。

安装方式：`dsh plugin --profile web add link:...`，可独立 npm 发布。不复用 dsh-web-ui 任何包。

## 用户故事

1. 作为 DSH 宿主用户，我想要通过 `dsh plugin --profile web add` 一条命令安装插件，以便无需改动宿主代码即可启用姜晓角色体验。
2. 作为 DSH 宿主用户，我想要在侧边栏看到插件入口，以便快速进入插件管理界面。
3. 作为 DSH 宿主用户，我想要在管理界面选择一个素材 zip 或本地目录，以便导入自定义角色素材。
4. 作为 DSH 宿主用户，我想要在导入时看到进度反馈，以便了解导入是否完成、是否失败。
5. 作为 DSH 宿主用户，我想要在管理界面看到已导入素材的列表，以便确认当前可用的素材包。
6. 作为 DSH 宿主用户，我想要通过 HTTP 路由访问角色素材文件，以便角色浮层能以 `<img>` 方式播放 WebP 动画。
7. 作为 DSH 宿主用户，我想要在屏幕右下角看到常驻的姜晓角色浮层，以便工作时获得角色陪伴体验。
8. 作为 DSH 宿主用户，我想要角色浮层透明无底、不占容器背景、不加光晕，以便它不干扰底层界面。
9. 作为 DSH 宿主用户，我想要角色在 idle/thinking/reading/replying/working/error/welcome/done/permission/listening 共 10 态间切换，以便角色的状态与助手行为对应。
10. 作为 DSH 宿主用户，我想要状态切换时播放对应的过渡动画（transition-\*，播放一次后落到循环态），以便切换自然不生硬。
11. 作为 DSH 宿主用户，我想要角色说话时出现台词气泡（淡入淡出、播后自动隐去），以便获得拟人化反馈。
12. 作为 DSH 宿主用户，我想要台词气泡不拦截鼠标指针，以便我能正常点击浮层覆盖区域的 UI。
13. 作为 DSH 宿主用户，我想要在设置卡中控制插件行为（如特效开关），以便按性能和偏好定制体验。
14. 作为 DSH 宿主用户，我想要鎏金流光/飘落/墨韵暗纹/呼吸背景/微交互五类特效可独立关闭，以便低性能设备上全关后与原版宿主皮肤无差异。
15. 作为 DSH 宿主用户，我想要深色主题（墨金卷轴：黑金鎏金）与浅色主题（宣纸梅花：米白粉梅）都完整覆盖，以便跟随宿主的明暗切换获得一致视觉。
16. 作为 DSH 宿主用户，我想要插件遵循宿主官方明暗信号切换主题，以便主题切换即时、无闪烁。
17. 作为 DSH 宿主用户，我想要 `prefers-reduced-motion` 下所有动效自动关闭，以便满足可访问性需求。
18. 作为 DSH 宿主用户，我想要楷体/宋体唐风字体随插件加载（woff2），以便标题与装饰文字呈现唐风气质。
19. 作为开发者，我想要克隆仓库后即获得全部素材（235.3MB 进 git），以便无需任何外部路径即可运行与测试插件。
20. 作为开发者，我想要插件独立发布到 npm，以便脱离 dsh-web-ui monorepo 独立迭代版本。
21. 作为开发者，我想要组件层只消费语义别名、不写颜色字面量、不含主题选择器，以便多主题一致性由 L2 remap 统一保证。
22. 作为维护者，我想要导入状态与 manifest 元数据存 KV 而素材本体走文件系统 + 路由，以便 232MB 二进制不进入文档型 KV。

## 实现决策

1. **插件形态**：独立仓库 DSH Bundle 插件。`package.json` 声明 `dsh.bundle.patch` + `cordis.patch.yml`（host/client 双半区）；`dsh plugin --profile web add link:...` 安装；独立 npm 发布。复用 DSH 自定义插件加载链路与排障流程（deepseek-harness `docs/自定义插件/README.md`）。不复用 dsh-web-ui 任何包（ADR-0001）。
2. **host 半区模块**：自建素材服务链——`ctx.webServer.register` 注册 `/api/dsh-jx/*` 路由（导入 API + 素材文件服务，prefix 路由读本地文件）；`ctx.storageDomain`（zod 声明式 KV domain）存导入状态/路径/manifest 元数据。KV 不存素材二进制。
3. **client 半区模块**：注入四件套——管理界面（选 zip/选目录/进度/已导入列表）、角色浮层、设置卡、侧边栏入口。定位角色体验（openCodeMM 式），导入是前置。
4. **角色浮层**：右下角常驻透明层。`img { object-fit: contain; display: block }`，容器无 background / box-shadow / 背光。10 循环态 + 36 过渡态 WebP 用 `<img>` 播放（非 `<video>`）；`{state}.webp` 命名；循环段循环、过渡段播放一次后落入目标循环态。台词气泡 opacity+translateY 淡入淡出，播后自动隐去，`pointer-events: none`（仅状态切换钮可点）。
5. **角色浮层状态机**：状态切换统一走状态机模块（10 循环态节点 + 36 过渡边），UI 与宿主事件只发意图，不直接操作 DOM 切换。这是 client 半区的核心模块边界。
6. **设计系统**：官方三层 token 架构为唯一设计基准（ADR-0002，固化于根 `DESIGN.md`）。L3 组件只消费 `--dsw-alias-*` / `--dsw-specific-*`；唐风炫技（烫金标题/朱砂印章/金描滚动条）走 `--jx-*` 专属轨；暗/亮走 `body[data-ds-dark-theme]`，浅色变体 `:not([data-ds-dark-theme])`。深浅两套令牌双值必须同时覆盖。
7. **品牌**：保留官方小鲸鱼 logo（FishLogo.tsx 精确 SVG path，`fill=currentColor` 随 `--dsw-alias-brand-text`）。
8. **FX 特效系统**：五类特效（shimmer/fall/grain/breathe/micro）默认开、可独立关，由 `html` 上 `fx-*` 类 + `localStorage('jx-fx')` 控制；全关 = 与原版皮肤无差异。
9. **素材基线**：`assets/character/`（46 webp）、`assets/fonts/`（2 woff2，从 art.ts base64 提取）、`assets/preview/`（2 png）全部进 git。字体作为运行字体加载。
10. **字体**：JIANGXIAO_FONT_MASHANZHENG（楷体）+ JIANGXIAO_FONT_NOTOSERIFSC（宋体）woff2 通过 `@font-face` 加载，不再 base64 内联。

## 测试决策

- **好测试的定义**：只测外部行为（HTTP 响应、KV 读写结果、浮层状态转移），不测实现细节（内部函数、CSS 类名、中间变量）。
- **Seam 1（最高层，host）**：宿主 HTTP 路由层。以真实 HTTP 请求打 `/api/dsh-jx/*` 路由：导入 API 的请求/响应契约、素材文件的响应头与字节流、错误路径（素材缺失/非法文件名）。路由 handler 即被测单元，不 mock webServer。
- **Seam 2（client）**：角色浮层状态机。输入状态意图，断言输出（当前态、过渡段序列、落入的循环态），覆盖 10 态互通与过渡只播一次的约束。
- **KV 元数据**：经 `ctx.storageDomain` 打开的 domain 做读写断言，不测 zod schema 内部。
- **测试先例**：本仓库为空仓库，无既有测试先例；对齐宿主生态的测试习惯（deepseek-harness 子系统级测试），测试文件随实现时新建，不预设框架之外的基础设施。
- 视觉/令牌正确性（深浅双主题覆盖、禁用项）以 DESIGN.md 人工审查 + 静态原型比对为准，不自动化。

## 超出范围

- 设定 PNG（49.6MB）与 mp4 中间产物（81MB）的复制与使用。
- 复用或对接 dsh-pet / skin-center / dsh-skins 的任何代码。
- 整套皮肤 remap（含 `--aion-*` 等 DSH 专属渲染目标）——仅 remap 插件 UI 用到的语义别名。
- 宿主能力扩展（webServer/storage 均用宿主原生 API）。
- 打包工具（pack.mjs 式 zip 打包脚本）——导入 API 接收 zip，但本规格不涵盖独立打包工具的重建；如需，另立功能。
- 静态原型 demo（`.temp/preview/jiangxiao-demo.html`）的产品化——它只是设计预览，不进 git、不进插件产物。

## 补充说明

- 素材生态三段：**openCodeMM（素材源）→ dsh-web-ui-jx（本插件）→ deepseek-harness（宿主）**。
- 素材体积注意：仓库 +232MB，克隆时间变长是已接受的代价（Q5 决策：可克隆即用优先）。
- 领域词汇以 `CONTEXT.md` 为准；架构决策以 ADR-0001/0002 为准；视觉以 `DESIGN.md` 为唯一基准。
- 导入 API 的 zip 格式契约沿用参考 memorial 的决策方向（.zip 素材包），具体契约在实现时随 API 一起定稿并回写 ADR。
