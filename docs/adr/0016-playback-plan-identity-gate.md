# ADR-0016 — 播放计划结构等价门槛（修审批动画延迟）

## 状态

已接受（2026-08 grill 会话「审批动画延迟」定案；实施 issue `.scratch/06-session-level-state-machine/issues/08-permission-anim-stuck.md`）。

> 编号注：初稿曾占用 0014，与并发会话的 ADR-0014（审批等待时间启发式判据）撞号，让位改排 0016。两个决策互补：ADR-0014 解决「何时进入 permission」（pending 上升沿 + runningCalls 卡住兜底）；本 ADR 解决「进入了 permission 画面能不能走出来并被人看见」。

## 背景

用户实测报告：会话需要用户审批时，浮层不立刻播放 permission 动画，批准完成后反而播放了。排查（SDK 帧时序、宿主 api-proxy、runtime 差分/硬切、UI 订阅链路逐环验证 + 纯逻辑仿真复现）确认数据链路无罪：`approval/requested` 帧到达即通知（微任务级），runtime 硬切白名单当拍派发。真正根因在**呈现层两级叠加**：

1. **快照引用抖动（主因）**：`overlay-session-runtime.processSnapshot` 结尾无条件 `emit()`，即使会话帧内容无变化，每次也产生新的 `RuntimeSnapshot` 引用；`CharacterOverlay` 只要快照引用变化就把播放索引 `index` 归零。审批等待期间任何会话帧滴漏（工具树投影、队列镜像、其他会话事件等）都会不断归零索引，入场过渡链（经 idle 中转两段、单段实测 3484ms、合计约 7s）永远走不完，permission 循环不可达。仿真复现：等待期每秒一次无变化帧，30s 后画面仍停在第一段过渡。
2. **状态身份倒挂（症状机制）**：批准瞬间降沿补态替换 playback 并归零索引，新计划第一段 `transition-permission-idle` 首帧即 permission 造型——「要权限的动画」成为批准后看到的第一个画面。

排查中同时确认两条同族遮蔽路径（另行立案，不在本 ADR 范围）：poke 序列遮蔽紧急态约 8s（issue 09）；并行驻留全程遮蔽焦点会话自身紧急态（issue 10）。

## 决策

**D1 — UI 侧播放计划结构等价门槛**：`CharacterOverlay` 的播放索引重置门槛从「`RuntimeSnapshot` 引用变化」改为「**播放计划结构等价被打破**」：新快照的 `playback` 与上一计划长度相同且各项 `kind`/`url` 逐项相同 ⇒ 视为同一计划，沿用当前索引继续推进；否则归零重播。

**为什么是结构等价而非裸引用比较**：`computeSnapshot` 的 poke／摸鱼彩蛋／并行驻留分支每次调用都重建 playback 数组（新引用、同内容），裸引用比较治不了这三处的同类卡死；而 SM 直通路径（含 permission 硬切）的 `sm.playback` 引用稳定，结构等价对它们同样成立。判定以纯函数抽出（如 `playbackPlanEquals`）。

**runtime 无条件 emit 语义保留**：`emit()` 继续每次调用，UI 侧门槛吸收引用抖动。runtime 层去抖（实质不变不 emit）被否决——改动面大且需重新验证 `useSyncExternalStore` 通知语义（`focusNonce` 等字段的更新时机），收益重复。

**紧急态即达增强缓议**：permission/error 入场跳过过渡段直接 cross-fade 落循环态（150ms，同焦点切换机制）可把可读延迟从约 7s 压到瞬时，本次不实施，立案待人工决定（issue 11）。过渡段 7s 串联的可读性成本由该 issue 承接。

## 后果

- playback 数组的**内容**（长度 + 各项 `kind`/`url`）成为 UI 推进契约：任何一层重建数组只要内容不变都不再打断播放链；反过来，想强制重播某计划必须改变其内容（如加 nonce 字段）。
- `CharacterOverlay` 需缓存上一计划引用做逐项比较（计划最长 4 项，比较成本可忽略）。
- 变体轮换（ADR-0013）不受影响：轮换推进时 url 变化，结构等价自然被打破，索引本就该归零；loop 项索引恒为 0，归零无副作用。
- 已知残留（不在本 ADR 关闭范围）：poke 遮蔽（issue 09）、并行驻留遮蔽焦点紧急态（issue 10）、紧急态 7s 可读延迟（issue 11）。
- 仿真证据（`.temp/scripts/` 下 approval-timing-sim / approval-visible-sim / probe-transition-durations，临时目录不入库）在实施 issue 08 时固化为 `tests/` 回归用例。
