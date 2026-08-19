# CONTEXT.md — 词汇表

本仓库的领域术语与决策词汇。技术值不译；术语一经确定立即登记，避免后续讨论
基于过时定义。

## 项目定位

| 术语           | 定义                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dsh-web-ui-jx  | 本项目（`dsh-web-ui-jx`）：一个**独立 DSH Bundle 插件**，实现姜晓角色素材 UI。参考 `dsh-web-ui` 的 jiangxiao 皮肤做法，但**不复用 dsh-web-ui 任何包**（ADR-0001）。 |
| 素材（assets） | 插件运行所需的真实资源，存放于本仓库 `assets/`：`character/`（46 角色 webp）、`fonts/`（2 woff2）、`preview/`（2 png）。全部进 git。                                |
| 角色浮层       | client 半区注入的透明角色层，播放 10 态 WebP，可 10 态切换 + 台词气泡；**整盒可拖动**（ADR-0006）：`pointer-events:auto` 反转穿透原则，`transform` 定位 + `localStorage('jx-overlay-pos')` 持久化 + 视口内钳制，SettingsCard 提供重置入口。 |
| 会话气泡列     | 角色浮层左侧竖排的常驻气泡列（ADR-0007），自下而上生长：一气泡 = 一运行中（`running`）/已结束未查看（`completed`）会话，标题 + 状态点（运行中金呼吸 / 已完成石绿）；气泡本体可点击（反转台词气泡穿透原则），点击经 `sessions.open(id)` 跳转会话；当前会话金描边；数量上限默认 5（1-10 可配置，SettingsCard「角色」section），超出折叠为「+N」原地展开。 |
| 角色 section    | SettingsCard 的第四个可折叠 section（ADR-0007 起）：会话气泡数量上限配置（数字输入，持久化 `localStorage('jx-max-session-bubbles')`），后续角色相关设置归属地。 |
| 侧边栏入口     | client 半区注入的左侧边缘 rail（`SidebarEntry`），收起为 36px 竖条，展开为 380px 设置卡（ADR-0004 加宽，原 320px）。含 ESC 监听 + 遮罩点击 + X 关闭。              |
| 设置卡         | `SidebarEntry` 展开后的内容卡（`SettingsCard`），含三个独立可折叠 section：皮肤开关 / 特效开关 / 管理界面（ADR-0004）。                                            |
| 管理界面       | 素材管理面板（`ImportPanel` + `AssetList`），ADR-0004 起内嵌于 `SettingsCard` 第三个 section，不再作为右上角 `position:fixed` 浮层。                              |

## 设计系统

| 术语                | 定义                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 墨金卷轴（深色）    | 深色主题名：黑金 · 鎏金。墨黑底面、暗金文字、鎏金流光、朱砂印章。                                                                                                                                      |
| 宣纸梅花（浅色）    | 浅色主题名：宣纸 · 梅花。米白底面、粉梅、深金文字。                                                                                                                                                    |
| 官方三层 token 架构 | 唯一设计基准（ADR-0002）：L1 base（`--dsw-*` 字族/动效）→ L2 skin remap（`body[data-dsh-jiangxiao]` 将 static/alias/specific remap 到唐风色板）→ L3 组件（只消费语义别名）。固化于项目根 `DESIGN.md`。 |
| 暗/亮信号           | 官方主题信号 `body[data-ds-dark-theme]`；浅色变体 = `:not([data-ds-dark-theme])`。                                                                                                                     |

## FX 特效系统

| 术语              | 定义                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| warp              | 鼠标光线扭曲特效：pointermove 驱动，鼠标周围局部（半径 200px）SVG feDisplacementMap 像素位移扭曲 + 微弱 --jx-moon 月色边缘光，移动时显示、停下 400ms 淡出。替换原 breathe（ADR-0005）。 |
| breathe（已移除） | 原墨光呼吸背景：全屏 body::before radial-gradient + opacity 0.04↔0.08 呼吸，8s 周期，纯 CSS。已被 warp 替换删除（ADR-0005）。                          |

## 宿主生态（外部引用）

| 术语           | 定义                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSH 宿主运行时 | `E:\work\sp\deepseek-harness`（`@deepseek-ai/dsh-root`）。本插件的宿主：提供 `ctx.webServer.register`（路由）与 `ctx.storageDomain`（KV 元数据）。 |
| 素材源         | `E:\work\sp\openCodeMM\opencode\packages\app\public\character\`（46 角色 webp 源，已复制到本仓库 `assets/`）。                                     |

## 已定决策

| 术语     | 定义                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0001 | 独立 DSH Bundle 插件而非皮肤（host/client 双半区，`dsh plugin add` 安装，独立 npm 发布）。                                                                           |
| ADR-0002 | 官方三层 token 架构为唯一设计基准，固化进 `DESIGN.md`；组件只消费语义别名。                                                                                          |
| ADR-0003 | zip 素材包格式契约：顶层 `manifest.json`（可选）+ `character/`/`fonts/`/`preview/` 子目录，扩展名白名单 webp/woff2/png，路径穿越防御；无 manifest 时从文件列表推断。 |
| ADR-0004 | 管理界面内嵌侧边栏作为可折叠 section（取代右上角固定浮层）。`SettingsCard` 三 section 各自折叠；侧边栏展开 320→380px；移除 `managementVisible` 状态与「进入管理界面」按钮。 |
| ADR-0005 | 用 warp（鼠标光线扭曲）替换 breathe（墨光呼吸背景）。SVG feDisplacementMap 局部扭曲 + --jx-moon 边缘光，pointermove 跟手 + 停下 400ms 淡出；pointer:coarse 与 reduced-motion 降级。 |
| ADR-0006 | 角色浮层可拖动（整盒可拖 + 位置持久化 + 视口钳制 + SettingsCard 重置入口）。反转 DESIGN.md §4 的「装饰层不拦截指针」原则，整盒 `pointer-events:auto`，`transform` 定位，`localStorage('jx-overlay-pos')` 持久化，resize 重钳制。 |
| ADR-0007 | 角色浮层会话气泡列（常驻 + 可点击跳转）。气泡范围 = `running`/`completed` 会话，左侧竖排自下而上，点击 `sessions.open(id)` 跳转；反转「气泡不拦截指针」规（仅气泡本体）；上限默认 5 可配置（SettingsCard「角色」section），超出折叠「+N」展开。 |

详见 `docs/adr/`。
