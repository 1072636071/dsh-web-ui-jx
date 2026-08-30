# 里程碑计划：深化/优化/性能批次（18–21 联合交付）

**源目录：** `.scratch/23-deepen-perf-program/`（跨 `.scratch/18-perf-hotfix`、`.scratch/19-fx-wallpaper-performance`、`.scratch/20-cache-network-bundle`、`.scratch/21-capability-test-coverage` 四个 topic）

**工单数：** 19 · **里程碑数：** 5 · **状态：** pending

> 每个里程碑结束时代码库必须处于**可发布状态**：CI 绿、无半成品、可回滚。里程碑之间严格串行；里程碑内无依赖的工单可并行。
> 推进：逐工单 `/jxx-implement` → 里程碑上线门禁 → 勾选验收 → 置 `shipped` → 进入下一里程碑。
> 工单状态真相源在各自 topic 的 `issues/`（`Status:` 行）；本文件 `**状态：**` 行记录里程碑进度，跨 topic 手动维护（脚本 `set-status` 不适用于跨目录文件）。

## 进度总览

| 里程碑 | 工单 |
|--------|------|
| M1 | 18-01, 18-02, 18-03, 18-04 |
| M2 | 19-01, 19-02, 19-03, 19-04, 19-05 |
| M3 | 20-01, 20-02, 20-03, 20-04 |
| M4 | 20-05, 20-06, 20-07 |
| M5 | 21-01, 21-02, 21-03 |

## M1

**状态：** shipped

**工单：** 18-01, 18-02, 18-03, 18-04

**组内顺序：** 无依赖，可并行

**用户视角交付：** 外部行为不变（纯优化批）：修复 host 半区双份 `writeJson` 的维护陷阱；素材 304 请求不再整文件读盘、热点素材响应更快；浮层状态推进时气泡列不再整棵重渲染、长会话更跟手；发布者确认 host 产物不含 React 组件、体积可控。

**可独立上线判据：** 四项全部为行为等价或纯增益优化，无 schema/API/存储格式变化；既有测试零改动全绿 + `build/verify` 全绿即完成；无半成品——四个改动相互独立、各自完整。

**回滚方式：** 直接 revert（仅优化无破坏；四项可单独 revert）。

**验收信号：**

- [x] `tests/host/` 全量测试零改动全绿
- [x] 304 命中路径不再 `readFile`（`asset-routes` 测试锁定），未命中路径响应头与现状逐字节等价
- [x] `SessionBubbleList` 已包 `React.memo` 且 runtime emit 语义零改动
- [x] `lib/index.js` 无 `SessionBubbleList` / `useState` / `createElement` 痕迹
- [x] `npm run build && npm run verify` 全绿

## M2

**状态：** shipped

**工单：** 19-01, 19-02, 19-03, 19-04, 19-05

**组内顺序：** 无依赖，可并行（19-05 为实测驱动，实测无成本则关单）

**用户视角交付：** 流式输出时壁纸打标不再阻塞主线程；毛玻璃只作用于必要区域、滚动与重绘更快；warp 特效行为与文档一致（明确「无淡出」——粒子/涟漪自带淡出动画，无常驻帧循环）；点击不再触发强制同步布局；飘落特效实测为纯合成层（静态 drop-shadow 不阻路径，关单不实施）。

**可独立上线判据：** 全部为渲染性能优化；H1/M2 改视觉但经暗/亮双主题回归确认与 ADR-0024/0027 契约一致；19-03 必须二选一落地（不留「写了不接」状态）；19-05 实测驱动、无成本即关单不硬上。

**回滚方式：** 直接 revert；H1/M2 若视觉回归失败可单独 revert。

**验收信号：**

- [x] `welcome-backdrop.test.ts` rAF 批处理/前置过滤扩展用例全绿（新增 4 用例，33 项全绿）
- [x] H1/M2 暗/亮双主题视觉回归通过（截图对比）——playwright 真实浏览器独立复刻页暗/亮双主题截图核验中和/玻璃/降级三项 CSS 契约（宿主全量观感留待上线门禁复核，见评论）
- [x] 19-03 二选一落地且 `warp-controller.test.ts` 对齐语义（选②「无淡出」，删 onFrame/fadePhase/WarpConfig 死代码，12 项全绿）
- [x] `warp.ts` 无 `void el.offsetWidth` 强制同步布局（涟漪改 WAAPI）
- [x] 全量测试 + build + verify 全绿（36 文件 576 项；build 双半区；verify 22 项）

## M3

**状态：** shipped

**工单：** 20-01, 20-02, 20-03, 20-04

**组内顺序：** 无依赖，可并行

**用户视角交付：** 外部行为不变（内部优化）：过渡动画时长零整文件下载、首次播放更省流量与内存；悬浮预览高频打开同一会话不重复全量读日志；AI 动态标题不重复调 LLM、省 endpoint 额度；客户端标题缓存有界、TTL 不被最后一次响应全局覆写。

**可独立上线判据：** 全部为内部缓存/加载优化，外部行为不变；缓存失效时机按约束落地——inspect 缓存随 archived/retention 失效（ADR-0028）、新增模块级缓存均有清理入口（ADR-0017）；无半成品。

**回滚方式：** 直接 revert；所有缓存均为内存级，回滚代码后自动消失，无持久化残留。

**验收信号：**

- [x] 20-01：`webp-duration` 优先读 manifest 且回落逻辑有测试；`durationCache` 有清理入口
- [x] 20-02：inspect 缓存命中/失效/in-flight 合并测试全绿；归档后不返回陈旧数据
- [x] 20-03/20-04：ai-title 服务端缓存与去重、客户端 LRU 与按 entry TTL 测试全绿
- [x] 全量测试 + build + verify 全绿

## M4

**状态：** shipped

**工单：** 20-05, 20-06, 20-07

**组内顺序：** 无依赖，可并行（20-05 先单文件试压后全量；20-06 可行性驱动）

**用户视角交付：** 插件体积显著减小（assets ≈187 MB 治理全部 >6 MB 的 14 个文件；中文字体子集化单独立项）；client 产物压缩；双半区体积回归在发布前可感知。

**可独立上线判据：** 素材重编码经单文件试压确认视觉与循环自然三原则无损后全量治理，`build/verify` 全绿；20-06 压缩验证不可行则关单不硬上；20-07 以当前产物为基线、回归即失败。

**回滚方式：** H2 重编码不可逆 → 按 ADR-0012 先例保留原件备份（`bak/slim-reencode/`，不入 git）可还原；L3/L4 直接 revert。

**验收信号：**

- [x] `happy.webp` 单文件试压确认视觉与循环三原则无损（四态素材重验）
- [x] assets 总体积显著下降（记录治理前后数值：183MB → 142.2MB，-22%）
- [x] 素材视觉回归通过（暗/亮两主题）
- [x] `verify-release.mjs` 含双半区体积断言且当前产物通过
- [x] `npm run build && npm run verify` 全绿

## M5

**状态：** shipped

**工单：** 21-01, 21-02, 21-03

**组内顺序：** 无依赖，可并行

**用户视角交付：** 审批等待 ≥10s 时角色可靠进入 permission 表达、≥30s 升级为 angry（不再依赖偶然的 pending 上升沿）；SettingsCard 开关接线与拖拽手势（唯一移除手势）有测试护栏，后续改动有保护。

**可独立上线判据：** 21-01 为纯增量行为变化（无 schema/契约变化），时间接缝复用注入 `now()`/`tick`、零新定时器，10s/30s 边界测试锁定；21-02/21-03 为纯新增测试。无半成品。

**回滚方式：** 21-01 直接 revert（行为回到现状，测试同步移除）；测试类直接 revert。

**验收信号：**

- [x] 21-01：`blockedSince` 记账 + `tick` 扫描落地，10s/30s 边界用例全绿
- [x] 21-02：`SettingsCard` jsdom 测试（开关读写/订阅/重置/角色 section）全绿
- [x] 21-03：wontfix（拖拽系统已被 ADR-0026 改型移除，被要求测试行为不存在）；实际唯一移除手势护栏补全（键盘 Delete 用例）→ 全绿
- [x] 全量测试 + build + verify 全绿

## 交付规则

1. 里程碑之间**严格串行**：上一里程碑 `shipped` 后才开工下一里程碑。
2. 里程碑内按"组内顺序"推进工单，逐工单 `/jxx-implement`，工单之间清理上下文。
3. 里程碑末尾跑**上线门禁**：全员工单 `done` + 验收信号全勾选 + CI 绿 + 回滚方式已验证。
4. 门禁通过后把该里程碑置 `shipped` 并提交，再进入下一里程碑。
5. 中断后从本文件各里程碑的 `**状态：**` 行续接，不重做已完成里程碑。

## 评论

（交付过程中的阻塞、决策、偏差记录于此，新内容置于最前。）

- 2026-08-30：M5（21-01~21-03）上线门禁通过——21-01/02 `done`、21-03 `wontfix`（`/jxx-code-review` 双维度：标准发现「pending-review 非注册标签」「ADR-0014 阈值可配建议未实施」，spec 发现「M5 21-03 验收信号悬空卡门禁」「非焦点会话卡住 ≥30s 后被接管仍显 permission 而非 angry 的边缘」「settings-card 注释与实现不符」——按用户选择 A 修复：reconcileFocus 接管补判 angry（新增接管补判用例）、M5 验收信号改述 wontfix 处置、settings-card 注释修正 + beforeEach 补 setMaxSessionBubbles 重置、21-01/02 置 done；余为已记录偏差/酌情取舍）、全量测试 37 文件 614 项全绿、`build`+`verify` 24 项全绿、回滚方式验证（21-01 直接 revert + 测试同步移除）；M5 置 `shipped` 并提交。**偏差记录**：① **21-03 wontfix**——工单要求的拖拽手势测试（8px 臂态/禁止态/落点/合成 click 吞除/归档失败静默）描述的完整拖拽系统已被 ADR-0026「已改型」（2026-08-25）整体移除（BubbleGesture/suppressClickRef/dismissZone/archiveZone/归档功能），被要求行为不存在；`resolveDragAction` 矩阵已充分覆盖（@deprecated 保留），实际唯一移除手势 = 手柄点击 + 键盘 Delete（键盘路径本次补护栏用例）；② ADR-0014「阈值入 SettingsCard 可配」系建议非决策，本次硬编码 `PERMISSION_BLOCKED_MS/ANGRY_BLOCKED_MS` 常量，可配留待后续；③ pending 在场长候不升级 angry（快路径已即时 permission，blockedSince 随 pending 清零）——启发式聚焦 pending 缺席场景；④ 既有显示层/轮换/并行驻留/批准返回类测试 fixture 改 `runningCallsCount:0` 与启发式解耦（运行中无 active tool call，文件头约定文档化）——ADR-0014 以 runningCalls>0 为判据的固有耦合，非规避；⑤ `EmergencyDisplay` 增 `expression` 字段（permission/error/angry）承载长候升级，SM 保持 permission 使审批反馈链不受影响。**另注**：`npm run typecheck` 仍存在 pre-existing 错误（`packages/dsh-session-bubble/src/detail/detail-data.ts:86`，未改动文件，非本里程碑引入；M5 其余代码 typecheck 干净）。
- 2026-08-30：M4（20-05~20-07）上线门禁通过——三工单全部 `done`（`/jxx-code-review` 两轮标准/spec 双维度：首轮发现「pending-review 非注册标签」「slim 脚本未登记 tools/README」「verify 体积 check 重复 + 基线注释矛盾」「视觉回归/ADR 复核无书面落点、keep_names 方案字面未用」，按用户选择 A 修复——补 tools/README 登记（工具表+输出目录表）、verify 抽 `sizeCapCheck` 并更正基线注释（307→139KB 残留）、slim 脚本具名化（f/sz→fname/size、b/o→bytes_buf/offset）、工单 05/06/07 补实施评论+验收勾选；次轮发现项仅剩「pending-review 标签」与「slim 脚本命名」两项酌情异味，已修复并置 done）、全量测试 36 文件 596 项全绿、`build`+`verify` 24 项全绿（verify 新增 [7] 双半区体积基线）、回滚方式验证（`bak/slim-reencode/` 14 原件齐全 + L3/L4 直接 revert）；M4 置 `shipped` 并提交。**偏差记录**：① 20-05 治理范围实为 **14** 个 >6MB 文件（spec 写 13 系低估，实测含 6.3-6.4MB 边界）；② 30fps 反应态（happy/angry/surprised）抽帧到 15fps + q72，15fps 循环/过渡态仅 q72——总动画时长逐文件精确不变（逐帧时长 ×2 / 含 536ms 定格尾保留）、loop 标志保留；③ quality 90→72 偏离 ADR-0021 定稿值，以全帧 PSNR≥32.5 + 140×249 展示尺寸目检不可辨自证，记录为已披露取舍；④ transition-idle-error / transition-error-idle 两过渡态仅 q72 后仍 6.08/6.07MB（「总体积显著下降」达标、「单文件 <6MB」未全达标）；⑤ 20-06 未字面用 keep_names/reservedNames，改走「generateBundle 压缩后拼接」论证（wrapper 与 data-plugin-css 实测完整），client.js 314.9→142.6KB（-55%）；⑥ `pending-review` 标签为 jxx-implement 流程瞬态、非 triage-labels 注册角色，审查通过后即置 done；⑦ 视觉回归以「.temp/output/slim-gov/ 目检条 + 6 关键状态展示尺寸放大对比」验证，非完整宿主截图。**另注**：`npm run typecheck` 仍存在 pre-existing 错误（`packages/dsh-session-bubble/src/detail/detail-data.ts:86`，未改动文件，非本里程碑引入；M4 其余代码 typecheck 干净）。
- 2026-08-30：M3（20-01~20-04）上线门禁通过——四工单全部 `done`（`/jxx-code-review` 两轮标准/spec 双维度：首轮发现「host 缓存无界 + TTL+in-flight 三处重复」与「20-02 归档失效窗口」，按用户选择 A 修复——抽共享 `ttl-inflight-cache.ts`（短 TTL + in-flight 去重 + LRU 上限）供 host 两缓存复用、host 缓存补 maxEntries、session-messages TTL 5s→1s 收敛归档窗口、ai-title 生成分支合并、webp-duration manifest 命中不再写缓存；次轮无硬性违规，仅 import 置顶与测试注释过期等已修，余为已记录偏差/酌情异味）、全量测试 36 文件 596 项全绿、`build`+`verify` 22 项全绿、回滚方式为直接 revert 已验证；M3 置 `shipped` 并提交。**偏差记录**：① 20-02「随 archived/retention 失效」因 host 无归档订阅 seam 以两层自足护栏落地——短 TTL（1s）压归档后陈旧窗口 + inspect 抛错即弃缓存不返回陈旧数据，非订阅式联动失效；② `ttl-inflight-cache.ts` 载荷类型用 `string | undefined`（undefined 兼任 miss/失败哨兵）、`scripts/generate-duration-manifest.mjs` 与 `webp-duration.ts` 各一份 ANMF 解析（跨 .mjs 构建脚本与 client 模块无法共享，靠测试锁定一致）、`clearSessionMessagesCache(sessionId?)` 单参形态生产无调用方——均为酌情取舍非阻断。**另注**：`npm run typecheck` 存在与 M3 无关的 pre-existing 错误（`packages/dsh-session-bubble/src/detail/detail-data.ts:86`，未改动文件，非本里程碑引入；M3 其余代码 typecheck 干净）。
- 2026-08-30：M2（19-01~19-05）上线门禁通过——五工单全部 `done`（`/jxx-code-review` 两轮标准/spec 双维度零发现项；修复两项审查发现：WarpConfig/getConfig 死配置整体删除、GLASS_DEGRADED_SELECTORS 导出由测试消费）、全量测试 36 文件 576 项全绿、`build`+`verify` 22 项全绿、回滚方式为直接 revert 已验证；M2 置 `shipped` 并提交。**偏差记录**：① 19-03 选②「无淡出」，`visible` 保留为「已接合」门控（非死代码，PRD U2 措辞已同步）；② H1/M2 视觉回归以「playwright 独立复刻页暗/亮双主题截图」验证 CSS 契约（中和/玻璃/降级均成立），非完整宿主截图——建议宿主实机上线前补一张整体观感截图复核；③ 19-02「Profiler 实测」以 memorial 017 证据代偿（本环境无宿主实机 Profiler），已披露。
- 2026-08-30：M1（18-01~18-04）上线门禁通过——四工单全部 `done`（`/jxx-code-review` 两轮无发现项）、全量测试 36 文件 577 项全绿、`build`+`verify` 22 项全绿、回滚方式为直接 revert 已验证；M1 置 `shipped` 并提交。18-04 复核发现并修复 tree-shaking 失效（库包加 `sideEffects:false`，host 产物 221.78 KB → 179.79 KB、无 React）。
- 2026-08-30：由 memorial 017 全量盘点 → to-spec（5 PRD）→ to-tickets（19 工单）→ to-milestones（本文件，M1–M5）。分组依据：每里程碑结束可独立上线、回滚可定；工单全部无跨里程碑依赖。
