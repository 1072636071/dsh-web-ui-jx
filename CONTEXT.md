# CONTEXT.md — 词汇表

本仓库的领域术语与决策词汇。技术值不译；术语一经确定立即登记，避免后续讨论基于过时定义。
机制细节一律指向 `docs/adr/` 对应决策，本文件只保留词汇与边界，不充当 spec。

## 项目定位

| 术语 | 定义 |
| --- | --- |
| dsh-web-ui-jx | 本项目：**独立 DSH Bundle 插件**（host/client 双半区），实现姜晓角色素材 UI。参考 `dsh-web-ui` 的 jiangxiao 皮肤做法，但不复用其任何包（ADR-0001）。 |
| 素材（assets） | 插件运行所需的真实资源，存放于 `assets/`：`character/`（webp：34 个 = 14 循环素材（idle/permission/error 循环态、thinking/reading 工作轮换、done/nod-smile/frown-wave 表演体、happy/angry/surprised 表情、3 idle 变体）+ 20 过渡段，四态收敛素材重组后；welcome 三件套已随 ADR-0023 移除（原「ADR-0016 素材重组」引用系笔误））、`fonts/`（2 woff2）、`preview/`（2 png）。全部进 git（ADR-0003）。 |
| 素材处理工具 | `tools/` 下 Python 脚本。**绿幕转码现行管线 = `openmm_chroma_convert.py`**（openCodeMM 方式：ffmpeg YUV chromakey + auto-color，不做 despill/白平衡，ADR-0021——自研 despill 管线 `variant_video_convert.py` 因偏红四案降级留档）；另有循环修复（`anim_loop_repair.py`）/ 运动诊断（`diag_classic_motion.py`）/ 变体白点重定靶（`variant_color_match.py`，仅**换生成批次**时向状态主素材白点对齐）。用法见 `tools/README.md`。 |
| 角色浮层 | client 半区注入的透明角色层：四态状态机驱动的 WebP 播放序列 + 台词气泡；整盒可拖动（ADR-0006，反转装饰层穿透原则）；待机支持变体轮换（ADR-0013）。 |
| 循环态 | 持续循环播放的稳态节点（`OverlayState`，素材 `{state}.webp`）：idle / working / permission / error 四态（ADR-0016）。working 的画面由显示层轮换 thinking/reading 素材担当。 |
| 过渡段 | 两端点间的单次播放素材 `transition-{from}-{to}.webp`；无直接边时经 idle 中转。6 个**中间态表情**（shy-smile/shush/nod-smile/frown-wave/chin-rest/cheek-rest）只作过渡段端点、无循环素材；ADR-0009 起活化（permission 情绪化 + idle 低频点缀）。 |
| 生活化表情 | ADR-0009 新增 3 表情（各 `idle↔表情` 2 边）：happy = 会话完成（done）；angry = 审批等待升级线（ADR-0014：卡住 ≥30s）；surprised = 点击惊吓一次播完即回（ADR-0011）。 |
| 点击惊吓（poke） | 点击姜晓触发的显示层覆盖（ADR-0011）：pointerup 位移 <5px 且 ≤300ms 判点击（拖动/长按/`[data-jx-interactive]` 不触发）；runtime 覆盖序列「当前态→idle→surprised→循环 3s→idle→当前态」；显式弹惊吓台词并抑制自动双弹；摸鱼彩蛋互斥、紧急态可打断。 |
| 焦点层防抖 | runtime 焦点呈现层缓冲（ADR-0010 D1 + ADR-0016 收敛）：仅 working 进入防抖约 2000ms（防连续回合/多会话切焦抖动）；permission/error 硬切例外；working 回落保护由 done 表演整圈边界切出承担。 |
| 一次性表演 | 边沿触发、播完自动回落、不占循环态的固定演出序列（`PerformanceKind`，设计沿革见 ADR-0023 背景）：done（收工）/ nod-smile（批准）/ frown-wave（拒绝）/ surprised（poke 惊吓）/ happy、angry（摸鱼彩蛋）。入场无表演：浮层首次出现直接落待机（ADR-0023）。 |
| 循环自然三原则 | 切换只发生在整圈边界；跨姿态必经过渡段；过渡段首尾帧与源/目标循环首帧对齐（ADR-0016）。 |
| 并行驻留 | 多会话全局忙碌表达（ADR-0010 D2）：≥2 会话 running 且至少一个非 idle 时，浮层驻留 working 不跟随焦点演变；紧急态仍抢焦，消退后重评条件。 |
| 摸鱼彩蛋 | 并行驻留期间的随机表情点缀（ADR-0010 D3）：非紧急态下每 2–5 分钟随机播「working→idle→彩蛋→idle→working」，不抢焦、不写入会话 SM 状态。 |
| 会话级状态机 | 角色浮层状态机形态（ADR-0008）：`Map<sessionId, SM>` 每会话一实例，随 `sessions.list.ids` 同步生灭；浮层只渲染焦点会话的 playback；跨会话切换不播过渡（直接切 loop + 150ms 淡入淡出）。 |
| 焦点会话 | 焦点仲裁胜者（ADR-0008）：当前打开会话最优先；error/permission 可紧急抢焦、消退即交还，手动切焦则保留。 |
| 智能体等待 | 审批等待的时间启发式判据（ADR-0014，**决策已定、待实施**）：每会话记 `blockedSince`，runningCalls 卡住 ≥10s 进 permission、≥30s 升级 angry，目标变化即清零；`snapshot.pending` 上升沿保留为即时快路径。 |
| 会话气泡列 | 浮层左侧竖排常驻气泡列（ADR-0007）：标题 + 状态点的可点击气泡（入选范围 running/completed），点击经 `sessions.open(id)` 跳转，当前会话金描边；上限默认 10（1–10 可配），超出折叠「+N」。归组模型已实施（ADR-0018）：基本单元为**归组气泡**（根祖先 + 全部 subagent 后代），展开的子列表不占名额，详见「子代理归组」。 |
| 子代理归组 | 气泡列归组折叠方案（ADR-0018，已实施）：以**根祖先**（沿 `parentId` 上溯至首个 `origin ≠ 'subagent'` 会话；孤儿回退自成顶层）锚定，后代并入一个**归组气泡** + **子代理徽标**（▸N/▾N 计后代总数，运行中后代带金呼吸点），点徽标原地展开子气泡（不占 maxVisible 名额）；current 在后代时描边传播并强制展开。 |
| 保留模式 | 会话气泡列的可开关交互范式（ADR-0022）：单击气泡 = 跳转 + 本地 kept 集合计账保留——SDK 的 completed 位「打开即清」不可拦截，故由客户端记账直至显式移除；关闭 = **除归档排除外**回到「点击即跳转即消失」现状（ADR-0007 原契约经 ADR-0028 决策 4 收窄：归档是宿主级事实，不受显示开关否决）。 |
| 完成见闻集 | 客户端持久记账的完成态集合 seen（localStorage `jx-bubble-keep-seen`，ADR-0028）：SDK 的 completed 位是连接内活事实、刷新即失忆，凡投影中观察到 `completed === true` 即记入，使完成气泡跨刷新留存；隐藏优先级低于 dismissed/archived，仅总开关①开时参与投影。 |
| 投放区 | 保留模式开启时气泡列旁的两个拖拽落点统称（ADR-0022）：收起区 + 归档区；拖拽是移除的唯一手势（双击判定方案已否决）；仅 completed 类气泡可拖，running/pending 禁止。 |
| 收起区 | 投放区之一（近放，气泡列正下方）：拖入 = 记入本地 dismissed 集合（localStorage `jx-bubble-keep-*` 持久化），气泡隐藏、不动 SDK、完全可逆——管「暂时不想看」。 |
| 归档区 | 投放区之一（远放，角色脚边，警示视觉 + hover 提示）：拖入 = 调 `workspaces.archiveSession` 真归档（侧边栏同步隐藏、日志保留），**不可逆**（契约层无 unarchive）；拒绝当前会话气泡（规避归档当前会话清空选择的副作用）；由配置②「拖拽归档」独立开关控制。 |
| 变体动作 | 长驻态多动作轮换（ADR-0013）：形状「中性姿态→动作→中性姿态」（**中性帧** = 主素材首帧，各变体首尾对齐），只播一遍、随机不重复串成无限列表，段间停 ~400ms；命名 `{state}-vN.webp`（主素材 v1 入池）；首批 idle/working 各 v2–v4；SettingsCard「角色」section 开关默认开。 |
| 播放计划结构等价 | UI 播放推进契约（ADR-0016）：新旧 playback 长度相同且各项 kind/url 逐项相同 ⇒ 同一计划沿用进度，否则归零重播。必须结构比较而非裸引用——poke/彩蛋/并行驻留分支每次重建数组（新引用同内容），runtime 又无条件 emit（**快照引用抖动**）。落地于播放游标（`playback-cursor.ts`）。 |
| 状态身份倒挂 | 反模式现象名（issue 08 症状）：某状态造型仅在离开该状态的过渡首帧可见（permission 因过渡链被打断，批准后退场才被看到）。 |
| 侧边栏入口 | client 半区注入的左侧边缘 rail（`SidebarEntry`）：收起 36px 竖条，展开 380px 设置卡；ESC / 遮罩 / X 关闭。 |
| 设置卡 | `SidebarEntry` 展开后的内容卡（`SettingsCard`），四个独立可折叠 section：皮肤开关 / 特效开关 / 管理界面 / 角色（ADR-0004 建三 section，ADR-0007 增角色 section）。 |
| 管理界面 | 素材管理面板（`ImportPanel` + `AssetList`），内嵌设置卡第三个 section（ADR-0004），不再是右上角浮层。 |
| 角色 section | 设置卡第四 section（ADR-0007 起）：会话气泡上限（`localStorage('jx-max-session-bubbles')`）、动作轮换开关（`jx-variant-rotation`）、状态标签开关等角色相关设置的归属地。 |
| 插件重载 | 宿主运行期热替换（ADR-0017）：client-hmr 收到 `rebuilt` 帧 → 作废模块 → 重拉 bundle → 排空 disposers → 重跑 `apply()`，全程不刷新页面。**apply 可重入是 client 半区存活硬约束**（挂载物必须纳入 ctx.effect 清理 + 入口清扫残留）。 |
| 孤儿浮层 | 旧 apply 挂载、fiber 已死但 DOM 滞留的 React 树，表现为多只姜晓重叠。清扫覆盖两类（ADR-0017/0019）：带 `data-dsh-jx-root` 标记的规范容器 + 无标记但内含 `[data-jx-character]` 的逃逸容器（旧版 bundle 产物），先经暂存的 `__jxRoot` unmount 再移除。 |
| 姜晓（角色设定） | 浮层角色人设（`docs/character-profile.md`）：古风贵族少女剑士，冷冽聪明；异时间线赛博大明的智能助手。台词场景表见 `docs/character-lines.md`。 |

## 设计系统

| 术语 | 定义 |
| --- | --- |
| 墨金卷轴（深色） | 深色主题名：黑金 · 鎏金。墨黑底面、暗金文字、鎏金流光、朱砂印章。 |
| 宣纸梅花（浅色） | 浅色主题名：宣纸 · 梅花。米白底面、粉梅、深金文字。 |
| 官方三层 token 架构 | 唯一设计基准（ADR-0002）：L1 base（`--dsw-*`）→ L2 skin remap（`body[data-dsh-jiangxiao]`）→ L3 组件（只消费语义别名）。固化于根目录 `DESIGN.md`。 |
| 暗/亮信号 | 官方主题信号 `body[data-ds-dark-theme]`；浅色变体 = `:not([data-ds-dark-theme])`。 |
| 欢迎背景 | 整页视口背景图层：姜晓欢迎立绘（2560×1440，16:9）垫于全部宿主内容之下；素材随插件打包 `assets/welcome/`，经 `/api/dsh-jx` 本机路由服务，不依赖外网；设置卡开关可整体关闭（ADR-0024）。 |
| 面板区域不透明度（区域 alpha） | 在全局 `--jx-panel-alpha` 之上，对宿主 `--dsw-specific-*` 可独立 remap 的**区域**各设专属 alpha 变量（`--jx-panel-{sidebar,input,bubble,tip,selector}-alpha`），实现按面板区域独立滑块（ADR-0025）。宿主 specific 变量真名以 `design-platform.css` 为准（如侧栏是 `sidebar-fill`、目标/Todo/Queue 卡同用 `tip`），不得按插件捏造名 remap。 |

## FX 特效系统

| 术语 | 定义 |
| --- | --- |
| warp | 鼠标光线扭曲特效（ADR-0005）：pointermove 驱动，半径 200px SVG feDisplacementMap 扭曲 + --jx-moon 边缘光，停下 400ms 淡出；pointer:coarse 与 reduced-motion 降级。替换已删除的 breathe。 |

## 宿主生态（外部引用）

| 术语 | 定义 |
| --- | --- |
| DSH 宿主运行时 | `E:\work\sp\deepseek-harness`（`@deepseek-ai/dsh-root`）：提供 `ctx.webServer.register`（路由）与 `ctx.storageDomain`（KV 元数据）。 |
| 素材源 | `E:\work\sp\openCodeMM\opencode\packages\app\public\character\`（源项目持续演进；本仓库 `assets/` 为入库快照，数量以本仓库为准）。 |

## 避免的别名

| 避免 | 规范名 | 说明 |
| --- | --- | --- |
| shocked | surprised | 惊吓表情规范名；素材文件与代码 state 均为 `surprised`。历史文档（memorial 归档、animation-inventory 早期版）中的 shocked 读作 surprised。 |

## 已定决策

| 术语 | 定义 |
| --- | --- |
| ADR-0001 | 独立 DSH Bundle 插件而非皮肤（host/client 双半区，`dsh plugin add` 安装，独立 npm 发布）。 |
| ADR-0002 | 官方三层 token 架构为唯一设计基准，固化进 `DESIGN.md`；组件只消费语义别名。 |
| ADR-0003 | zip 素材包契约：顶层可选 `manifest.json` + `character/`/`fonts/`/`preview/` 子目录，扩展名白名单 webp/woff2/png，路径穿越防御；无 manifest 从文件列表推断。 |
| ADR-0004 | 管理界面内嵌侧边栏可折叠 section（取代右上角固定浮层）；侧边栏展开 320→380px；移除 `managementVisible`。 |
| ADR-0005 | warp（鼠标光线扭曲）替换 breathe（墨光呼吸背景）。 |
| ADR-0006 | 角色浮层整盒可拖动 + `localStorage('jx-overlay-pos')` 持久化 + 视口钳制 + 重置入口；反转「装饰层不拦截指针」原则。 |
| ADR-0007 | 会话气泡列：常驻 + 可点击跳转，反转「气泡不拦截指针」规（仅气泡本体）；上限默认 10 可配，超出折叠「+N」。 |
| ADR-0008 | 会话级状态机 + 焦点仲裁；跨会话切换直接切 loop 不播过渡；过渡段时长播放期 ANMF 解析缓存、失败回退 800ms。 |
| ADR-0009 | 表情体系扩展：6 中间态表情活化；新增 3 生活化表情（happy=done、angry=审批等待升级线〔原 10s 语义后经 ADR-0014 修正〕、surprised=点击一次播完即回）。 |
| ADR-0010 | 焦点层防抖 + 并行驻留（≥2 running 驻留 working）+ 摸鱼彩蛋（2–5min 随机）；permission/error 恒硬切。防抖对象后经 ADR-0016 收敛为 working 进入约 2000ms。 |
| ADR-0011 | poke 显示层覆盖：<5px 且 ≤300ms 判点击；runtime 覆盖惊吓序列（不在焦点 SM dispatch），驻留 3s 回落；显式弹台词防双弹；紧急态优先。 |
| ADR-0012 | 循环缺陷资产侧修复：happy/angry/surprised 整段倒放烘焙 + working 局部镜像 splice；降采样 360×640 重编码，原件备份 `bak/`（不入 git）；运行期零改动。 |
| ADR-0013 | 多动作变体播放列表拼接：中性帧约定、随机不重复抽取、段间停 ~400ms、打断即弃重抽、SettingsCard 开关默认开。 |
| ADR-0014 | 审批等待时间启发式（**待实施**）：pending 上升沿即时快路径 + blockedSince 兜底（≥10s permission、≥30s angry）；修正 ADR-0009 angry 的 10s 语义为升级线；阈值建议可配。 |
| ADR-0015 | 10 经典循环态全部烘焙正反倒放（修重启突兀）：姿态缝度量不到速度反向盲区；真循环不裁帧整段镜像（idle 单圈 9916ms、working 11390ms）；variant-rotation 基础段时长按状态表对齐。 |
| ADR-0016 | 播放计划结构等价门槛（修审批动画延迟）：UI 只在 playback 内容变化时归零，吸收快照引用抖动；runtime emit 语义保留；紧急态 cross-fade 即达缓议（issue 11）。与 ADR-0014 互补（彼管何时进、此管能否被看见）。 |
| ADR-0017 | client apply 可重入（修多只姜晓重叠）：root.unmount + 容器移除纳入 ctx.effect 清理；入口防御性清扫 `[data-dsh-jx-root]` 残留（暂存 `__jxRoot` 支持跨闭包 unmount）。 |
| ADR-0018 | 会话气泡列子代理归组（根祖先锚定折叠；已实施）：归组气泡 = 根祖先 + 全部 subagent 后代；徽标原地展开；maxVisible 只管顶层；否决直接隐藏与缩进树。 |
| ADR-0019 | 清扫加固（修硬刷新后仍多只）：无标记但内含 `[data-jx-character]` 的 body 直挂容器一律 unmount + 移除；识别只用浮层特征（React 内部键在 jsdom/DOM 可见性不稳定，弃用）。 |
| ADR-0020 | 色度键 alpha 改用 despill-first 距离（修衣物发红/发紫）：源视频绿灰阴影被原始色距误判半透明，un-premultiply 压垮 G 通道 → 品红；去溢色后同类比较使绿幕归零、衣料 opaque、金饰受保护。 |
| ADR-0020-pending-interaction-bubble-effect | 等待用户交互的会话气泡朱砂印特效与折叠豁免：pendingInteraction 非空时气泡描边转朱砂、点位换涟漪扩散环、组级聚合豁免折叠；与 despill-first-alpha 同名异决策，引用须带全名。 |
| ADR-0022 | 会话气泡单击保留 + 拖拽收纳双投放区（收起 = 本地 dismissed 可逆 / 归档 = archiveSession 不可逆）；双击方案否决；两开关：①查看后保留气泡（总开关，默认开）②拖拽归档（默认开）；仅 completed 类可拖；归档区拒当前泡；派生层排除 archivedSessionIds 防复活。 |
| ADR-0023 | 移除 welcome 入场表演（彻底移除）：素材三件套、状态机节点与 idle↔welcome 边、`welcomeOnStart` 触发逻辑、台词标签全清（包体减约 15MB）；首次入场直接落待机无表演（否决复用现有表演顶替——业务语义稀释）；tools 历史脚本名单与 .scratch / memorial 历史记录不动。 |
| ADR-0024 | 欢迎背景整页壁纸层（待实施）：fixed cover 视口背景，WebP 随包经 /api/dsh-jx 本机服务；开启时 --jx-surface-* 联动半透明；壁纸/面板双滑杆可调（默认 85% / 75%）+ 总开关归皮肤开关 section；深浅双主题显示（浅色白纱）；PNG 直录与仅深色生效两案否决。 |
| ADR-0028 | 会话气泡跨刷新留存与归档排除修正（已实施）。四项决策（编号以 ADR 正文为准）：决策 1 完成见闻集 seen 持久记账——SDK completed 位是连接内活事实、刷新即失忆，跨刷新留存由客户端记账承担，投影中观察到 completed 即提交、与总开关无关；决策 2 裁剪相位门控——prune 仅在 `phase === "ready"` 后执行（根治挂载空列表误清 localStorage 记账）；决策 3 根归档 ⇒ 整组隐藏——running/pending 豁免成员暂留、全部静止后消失；决策 4 归档排除脱离总开关——宿主级事实不被客户端显示开关否决，「开关关=完全现状」护栏改写为「除归档排除外全等」。 |

详见 `docs/adr/`。
