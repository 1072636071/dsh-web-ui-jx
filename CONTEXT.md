# CONTEXT.md — 词汇表

本仓库的领域术语与决策词汇。技术值不译；术语一经确定立即登记，避免后续讨论
基于过时定义。

## 项目定位

| 术语           | 定义                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dsh-web-ui-jx  | 本项目（`dsh-web-ui-jx`）：一个**独立 DSH Bundle 插件**，实现姜晓角色素材 UI。参考 `dsh-web-ui` 的 jiangxiao 皮肤做法，但**不复用 dsh-web-ui 任何包**（ADR-0001）。 |
| 素材（assets） | 插件运行所需的真实资源，存放于本仓库 `assets/`：`character/`（角色 webp：13 循环态 + 42 过渡段 + 6 变体）、`fonts/`（2 woff2）、`preview/`（2 png）。全部进 git。        |
| 素材处理工具   | `tools/` 下的 Python 素材处理脚本（循环缺陷修复 / 绿幕视频转码 / 运动轨迹诊断），用法与踩坑见 `tools/README.md`。依赖 Pillow + NumPy + imageio-ffmpeg。          |
| 角色浮层       | client 半区注入的透明角色层，播放 13 态 WebP，可态切换 + 台词气泡；**整盒可拖动**（ADR-0006）：`pointer-events:auto` 反转穿透原则，`transform` 定位 + `localStorage('jx-overlay-pos')` 持久化 + 视口内钳制，SettingsCard 提供重置入口；待机/工作态支持**变体动作轮换**（ADR-0013）。 |
| 变体动作       | 同一循环态的多段可轮换动作（ADR-0013）：形状「中性姿态→动作→中性姿态」，只播一遍，运行期随机不重复抽取串成播放列表；正式命名 `{state}-vN.webp`（主素材为 v1）；首批覆盖 idle（v2–v4）与 working（v2–v4），SettingsCard「角色」section 开关默认开。 |
| 中性帧         | 变体拼接的共享锚点（ADR-0013）：某状态主素材第一帧（= 过渡段落下姿态），所有变体首尾帧与其一致；参考图由主素材第一帧导出，供素材生成做首帧 conditioning。 |
| 会话气泡列     | 角色浮层左侧竖排的常驻气泡列（ADR-0007），自下而上生长：一气泡 = 一运行中（`running`）/已结束未查看（`completed`）会话，标题 + 状态点（运行中金呼吸 / 已完成石绿）；气泡本体可点击（反转台词气泡穿透原则），点击经 `sessions.open(id)` 跳转会话；当前会话金描边；数量上限默认 5（1-10 可配置，SettingsCard「角色」section），超出折叠为「+N」原地展开。 |
| 中间态表情     | 状态机过渡段端点表情（ADR-0009 活化前）：shy-smile/shush/nod-smile/frown-wave/chin-rest/cheek-rest 6 个，素材 16 边（idle↔6 表情 12 边 + permission↔nod-smile/frown-wave 4 边）；ADR-0009 起活化：permission 情绪化 + idle 低频随机点缀（30–60s 一次「idle→表情→idle」）。 |
| 智能体等待     | runningCalls>0（工作态）持续顶着不动视为「等待交互/审批」的时间判据（ADR-0014）：镜像 thinkingSince/doneSince tick 先例，每会话记 blockedSince；卡住 ≥10s 进 permission，≥30s 升级 angry；目标变化即清零。 |
| 生活化表情     | ADR-0009 新增 3 表情（各 `idle↔表情` 2 边新素材）：happy = 会话完成（done）触发；angry = 审批等待升级线（ADR-0014：卡住 ≥30s）触发；shocked = 被点击/拖动触发一次播完即回。 |
| 角色 section    | SettingsCard 的第四个可折叠 section（ADR-0007 起）：会话气泡数量上限配置（数字输入，持久化 `localStorage('jx-max-session-bubbles')`），后续角色相关设置归属地。 |
| 侧边栏入口     | client 半区注入的左侧边缘 rail（`SidebarEntry`），收起为 36px 竖条，展开为 380px 设置卡（ADR-0004 加宽，原 320px）。含 ESC 监听 + 遮罩点击 + X 关闭。              |
| 设置卡         | `SidebarEntry` 展开后的内容卡（`SettingsCard`），含三个独立可折叠 section：皮肤开关 / 特效开关 / 管理界面（ADR-0004）。                                            |
| 管理界面       | 素材管理面板（`ImportPanel` + `AssetList`），ADR-0004 起内嵌于 `SettingsCard` 第三个 section，不再作为右上角 `position:fixed` 浮层。                              |
| 会话级状态机   | 角色浮层状态机重构形态（ADR-0008）：`Map<sessionId, SM>`，每会话一个状态机实例 + `binding(id).session` 订阅，随 `sessions.list.ids` 同步创建/销毁；浮层只渲染焦点会话的 playback。 |
| 焦点会话       | 焦点仲裁的胜者（ADR-0008）：当前打开的会话（`sessions.list.current`）最优先；error（hasError）/ permission（pending）可紧急抢焦，事件消退即自动交还，用户手动切焦则保留手动焦点。 |
| 姜晓（角色设定）| 浮层角色人设（`docs/character-profile.md`）：古风、贵族、少女、剑士、很聪明、冷冽；异时间线赛博大明的智能助手。台词场景表见 `docs/character-lines.md`。                     |

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
| ADR-0008 | 会话级状态机 + 焦点仲裁（多会话适配）。`Map<sessionId, SM>` 每会话一实例，随 `list.ids` 同步生命周期；焦点 = 当前打开会话最优先，error/permission 紧急抢焦、消退即交还；跨会话切换不播状态机过渡（直接切 loop + 150ms 淡入淡出）；过渡段时长播放期 ANMF 解析按素材缓存、失败回退 800ms（800ms 假设仅覆盖真实时长 15–23%，截断缺陷）。 |
| ADR-0009 | 表情体系扩展。现有 6 中间态表情活化（permission 情绪化 + idle 随机点缀）；新增 3 生活化表情（happy=done、angry=审批等待升级线 30s、shocked=点击一次播完即回），各 2 边新素材；台词扩展见 `docs/character-lines.md`。 |
| ADR-0010 | 焦点层防抖 + 并行驻留 + 摸鱼彩蛋。工作态（thinking/reading/replying/working）目标稳定 3000ms 才切一次（pending 挂起）；permission/error 恒硬切（仍播过渡段）；≥2 会话并行时浮层驻留 working；驻留期 2–5 分钟随机触发彩蛋表情。 |
| ADR-0011 | 点击惊吓（poke）显示层覆盖。pointerup 位移 <5px 且 ≤300ms 判点击；runtime 显示层覆盖惊吓序列（不在焦点 SM 上 dispatch），驻留 3s 回落；点击路径显式弹台词、抑制自动双弹；紧急态优先并可打断 poke。 |
| ADR-0012 | 循环缺陷资产侧修复。happy/angry/surprised 整段倒放烘焙（裁淡入残留 + 裁死定格 + 镜像帧）；working 符咒爆亮局部镜像（回落段反演合成渐起段）；运行期零改动；修复资产降采样 360×640 重编码，原件备份 `bak/` 不进 git。 |
| ADR-0013 | 多动作变体播放列表拼接。idle/working 变体「中性帧→动作→中性帧」只播一遍，随机不重复抽取串成无限列表，段间中性帧停 ~400ms；主素材入池；打断后重抽；SettingsCard 开关默认开；命名 `{state}-vN.webp`。 |
| ADR-0014 | 审批等待时间启发式判据。`snapshot.pending` 上升沿保留为即时快路径；另以 runningCalls 卡住时间兜底：每会话 blockedSince，卡住 ≥10s 进 permission（硬切），≥30s 升级 angry，目标变化即清零；0→10s 窗口维持 working。angry 触发语义由 ADR-0009「10s」修正为升级线。「无法区分审批与工具长跑」系启发式固有代价，阈值可配。 |
| ADR-0015 | 10 经典循环态全部烘焙正反倒放（重启突兀）。首尾缝只度量姿态差、度量不到「方向单调素材循环点处速度瞬间反向」；`anim_loop_repair.py --pingpong-classic` 真循环不裁帧整段镜像（9 段 148 帧 9916ms、working 170 帧 11390ms），降采样 360×640、原件备份 `bak/`；`variant-rotation.ts` 基础段时长改按状态表对齐烘焙后单圈。 |

详见 `docs/adr/`。
