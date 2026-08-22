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
| 会话气泡列     | 角色浮层左侧竖排的常驻气泡列（ADR-0007 建立平铺模型；**ADR-0018 起改为归组模型**），自下而上生长：一**归组气泡** = 一顶层会话及其全部 running/completed subagent 后代，气泡 = 标题 + 状态点 + 子代理徽标；气泡本体可点击（反转台词气泡穿透原则）经 `sessions.open(id)` 跳转，徽标可点击展开/收起组内子气泡列表（左缩进弱化样式）；当前会话金描边，current 在后代中时描边传播至根祖先并强制展开该组；数量上限默认 5（1-10 可配置，SettingsCard「角色」section）只约束顶层归组气泡，超出折叠为「+N」原地展开。 |
| 根祖先         | 归组的锚点会话（ADR-0018）：从任一会话沿 `parentId` 向上溯，停在第一个 `origin ≠ 'subagent'` 的会话；上溯中断（父行不在列表中或成环）以停留节点为根，若其本身是 subagent 则自成顶层归组气泡。普通 fork 截断谱系传播（fork 出的会话不是任何人的后代）。 |
| 归组气泡       | 气泡列的基本单元（ADR-0018）：一个根祖先 + 其全部 subagent 后代的合称。顶层归组气泡数受 maxVisible 约束；组内子气泡展开不占名额、不受上限限制。各组独立维护手动展开态；`effectiveExpanded = manualExpanded ∥ containsCurrent`。 |
| 子代理徽标     | 归组气泡上的计数片（ADR-0018）：`▸N`/`▾N` 显示后代总数，存在运行中后代时前缀金呼吸迷你点（复用 `.dotRunning` 视觉语义）；点击切换该组子气泡列表展开/收起（stopPropagation 不触发跳转，`data-jx-interactive` 不触发拖动）。 |
| 中间态表情     | 状态机过渡段端点表情（ADR-0009 活化前）：shy-smile/shush/nod-smile/frown-wave/chin-rest/cheek-rest 6 个，素材 16 边（idle↔6 表情 12 边 + permission↔nod-smile/frown-wave 4 边）；ADR-0009 起活化：permission 情绪化 + idle 低频随机点缀（30–60s 一次「idle→表情→idle」）。 |
| 智能体等待     | runningCalls>0（工作态）持续顶着不动视为「等待交互/审批」的时间判据（ADR-0014）：镜像 thinkingSince/doneSince tick 先例，每会话记 blockedSince；卡住 ≥10s 进 permission，≥30s 升级 angry；目标变化即清零。 |
| 生活化表情     | ADR-0009 新增 3 表情（各 `idle↔表情` 2 边新素材）：happy = 会话完成（done）触发；angry = 审批等待升级线（ADR-0014：卡住 ≥30s）触发；shocked = 被点击/拖动触发一次播完即回。 |
| 角色 section    | SettingsCard 的第四个可折叠 section（ADR-0007 起）：会话气泡数量上限配置（数字输入，持久化 `localStorage('jx-max-session-bubbles')`），后续角色相关设置归属地。 |
| 侧边栏入口     | client 半区注入的左侧边缘 rail（`SidebarEntry`），收起为 36px 竖条，展开为 380px 设置卡（ADR-0004 加宽，原 320px）。含 ESC 监听 + 遮罩点击 + X 关闭。              |
| 设置卡         | `SidebarEntry` 展开后的内容卡（`SettingsCard`），含三个独立可折叠 section：皮肤开关 / 特效开关 / 管理界面（ADR-0004）。                                            |
| 管理界面       | 素材管理面板（`ImportPanel` + `AssetList`），ADR-0004 起内嵌于 `SettingsCard` 第三个 section，不再作为右上角 `position:fixed` 浮层。                              |
| 会话级状态机   | 角色浮层状态机重构形态（ADR-0008）：`Map<sessionId, SM>`，每会话一个状态机实例 + `binding(id).session` 订阅，随 `sessions.list.ids` 同步创建/销毁；浮层只渲染焦点会话的 playback。 |
| 焦点会话       | 焦点仲裁的胜者（ADR-0008）：当前打开的会话（`sessions.list.current`）最优先；error（hasError）/ permission（pending）可紧急抢焦，事件消退即自动交还，用户手动切焦则保留手动焦点。 |
| 快照引用抖动   | runtime 的 `processSnapshot`/`handleListChange` 无条件 `emit()` 导致的现象：即使会话帧内容无变化，每次也产生新的 `RuntimeSnapshot` 引用。UI 若按引用重置播放进度会被其打断（issue 08 根因）。 |
| 播放计划结构等价 | UI 播放索引的重置门槛（ADR-0016）：新旧 `playback` 长度相同且各项 `kind`/`url` 逐项相同 ⇒ 同一计划，沿用索引继续推进；否则归零重播。必须结构比较而非裸引用比较——poke/彩蛋/并行驻留分支每次重建数组（新引用同内容）。playback **内容**由此成为渲染契约：强制重播必须改变计划内容。 |
| 状态身份倒挂   | 反模式现象名（issue 08 症状）：某状态的造型仅在离开该状态的过渡首帧可见（permission 因过渡链被打断，批准后退场才被看到）。 |
| 姜晓（角色设定）| 浮层角色人设（`docs/character-profile.md`）：古风、贵族、少女、剑士、很聪明、冷冽；异时间线赛博大明的智能助手。台词场景表见 `docs/character-lines.md`。                     |
| 插件重载        | 宿主运行期对 client 插件的热替换机制（ADR-0017）：client-hmr 监听 `/plugins/events` SSE，收到本插件 `rebuilt` 帧即「作废模块 → 拉取新 bundle → 排空旧 fiber 的 effect disposers → 移除自有样式标签 → `entry.refresh()` 重新物化 → **重跑 `apply()`**」，全程不刷新页面；动态包 runner 有同型 invalidate + 重建路径。**apply 可重入是 client 插件存活的硬约束。** |
| 孤儿浮层        | 旧 apply 挂载、fiber 已死但 DOM 滞留的 React 树（ADR-0017 根因现象）：缺 unmount 清理时 `<img>` webp 自主循环、气泡订阅宿主 services 继续更新，视觉表现为多只完整姜晓同位重叠；多会话并行工作 → 文件 churn 密集 → 重载频繁，叠加加速。ADR-0019 起清扫覆盖两类：带 `data-dsh-jx-root` 标记的规范残留 + 旧版**无标记**浮层残留（ADR-0017 标记选择器覆盖不住的「逃逸容器」，修硬刷新后仍多只）。 |

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
| ADR-0016 | 播放计划结构等价门槛（修审批动画延迟）。UI 播放索引只在 playback 内容（长度+各项 kind/url）变化时归零，吸收 runtime 无条件 emit 的快照引用抖动；runtime emit 语义保留（runtime 层去抖被否决）；紧急态 cross-fade 即达增强缓议（issue 11）。与 ADR-0014 互补：彼管「何时进 permission」，此管「进了能否走出来被看见」。 |
| ADR-0017 | client apply 可重入（修多只姜晓重叠）。`apply()` 挂载的 React root 与 `[data-dsh-jx-root]` 容器在 ctx.effect 清理器中补全卸载（root.unmount + 容器移除）；入口防御性清扫残留容器（容器上暂存 root 引用供跨模块闭包 unmount）后再挂载。否决「仅规范清理」（HMR 失败窗口旧 fiber 未走 disposers 仍叠）与「发现即拒绝」（旧实例状态永远无人清理）。 |
| ADR-0019 | 清扫加固：按浮层特征兜底识别无标记残留 root（修硬刷新后仍多只）。ADR-0017 的标记选择器只清理带 `data-dsh-jx-root` 的容器；旧版本 bundle 生成的 React root 容器**不打标记**，逃逸清扫、持续渲染姜晓叠加。加固：`sweepResidualRoots` 再遍历 body 直接子元素，凡不带标记却内含 `[data-jx-character]` 浮层的元素一律 unmount + 移除。识别只用浮层特征（不依赖 `__reactContainer$`，其在 jsdom/真实 DOM 的 `Object.keys` 可见性不稳定）。否决「仅凭 React 内部键判别」（测试即踩坑）。 |
| ADR-0018 | 会话气泡列子代理归组（根祖先锚定折叠，治多代理工作流霸榜占满）。一归组气泡 = 根祖先 + 其全部 subagent 后代；徽标 `▸N`/`▾N` + 金呼吸点示运行中后代；点徽标原地展开子气泡（左缩进弱化样式）；maxVisible 只管顶层；current 在后代 ⇒ 根气泡金描边 + 强制展开；孤儿回退自成顶层；否决直接隐藏（丢导航）与缩进树（不治本）。 |

详见 `docs/adr/`。
