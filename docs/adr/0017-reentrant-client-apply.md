# ADR-0017 — client apply 可重入（修多只姜晓重叠）

## 状态

已接受（2026-08 grill 会话「多会话并行时多只姜晓重叠」定案）。

## 背景

用户实测报告：同时存在多个工作中的会话时，屏幕上出现多只完整姜晓重叠。

排查确认挂载链路本身无罪：每页只有一个 `AppWebEntry.run()` → 一个 cordis Context → 本插件 client 半区经 `loader.create` 恰好激活一次；模块系统对同一 bundle 的重复注册会响亮报错（`client-modules: duplicate factory registration`）。真正根因是**宿主运行期插件重载机制 × 本插件 apply 不可重入**两级叠加：

1. **宿主有合法的运行期重载路径**（`packages/client/hmr/src/client/index.ts`）：client 插件监听 `/plugins/events` SSE，收到本插件的 `rebuilt` 帧即执行「invalidate（作废旧 factory + 已物化记录）→ prefetch 新 bundle → registry-first teardown 排空旧 fiber 的 effect disposers → 移除自有 `<style data-plugin>` 标签 → `entry.refresh()` 重新物化 → **再次执行 `apply()`**」，全程不刷新页面。动态包 runner（`cordis-client-runner`）亦有同型 invalidate + 重建路径。dev 模式下工作区文件变动即触发 rebuilt 帧——多个 agent 会话并行工作时文件 churn 密集，重载频繁。
2. **apply 从未清理自己的挂载**（`src/client/index.ts`）：每次 apply 都 `document.body.appendChild(container)` + `createRoot(container)`；注册的唯一 `ctx.effect` 清理只做 `runtime.dispose()`，**从不 `root.unmount()`、从不移除容器**。于是每次重载：旧 React 树整体滞留 DOM（`<img>` webp 自主循环播放；气泡列订阅的宿主 sessions 服务仍活着，继续驱动已脱离管理的旧树更新）→ 新 apply 在同一默认位置再挂一只。N 次重载 = N 只完整姜晓完美重叠。

## 决策

**D1 — 规范清理补全**：`apply()` 内将 `root.unmount()` 与容器移除纳入 `ctx.effect` 清理器（与既有 runtime.dispose 同一 disposer 返回值串联）。cordis 卸载语义从此覆盖全部挂载物，任何走正常 disposers 的卸载路径不再泄漏。

**D2 — 防御性自愈清扫**：`apply()` 入口先清扫文档中残留的 `[data-dsh-jx-root]` 容器再挂载新容器。挂载时把 root 实例暂存在容器元素上（如 `container.__jxRoot`），清扫时先 `__jxRoot?.unmount()` 再移除节点——跨模块闭包（HMR invalidate 后旧 root 引用不可达）也能被完整卸载，而非仅摘除 DOM 留下活订阅空转。

**被否决的替代方案**：

- *仅规范清理（D1 不带 D2）*：HMR 的失败窗口（prefetch 失败后重试自旧帧重来）与任何未走 disposers 的异常路径仍会叠加；且对升级前已泄漏的存量无能为力。
- *发现即拒绝（入口见 `[data-dsh-jx-root]` 就 return）*：若残留实例属于已作废的旧模块闭包，其内部状态（定时器、订阅）永远无人清理，拒绝挂载还会让新版本代码上不了屏。

## 后果

- 「apply 可重入」成为本插件 client 半区的存活约束，写入 `src/client/index.ts` 头注；后续任何新增 body 直挂 DOM 的代码必须同样纳入 ctx.effect 清理或入口清扫。
- 清扫以 `[data-dsh-jx-root]` 属性识别自家容器，不触碰宿主或其他插件的节点；容器上的 root 暂存属性属实现细节，命名以实现处注释为准。
- 跨闭包 unmount 能终止旧树的订阅回调（React 18 `root.unmount` 会拆掉整树 effects），比裸摘节点多回收一份空转渲染开销；但 HMR 帧竞争下的极端时序仍以宿主语义为准，本 ADR 只保证「下一次 apply 前页面至多一只姜晓」。
- 变体轮换开关、皮肤开关等 localStorage 持久化状态不受重载影响（新模块实例按原键重读），浮层位置同理由 `overlayPositionStore` 初始化时从 localStorage 恢复。
- 回归测试口径：jsdom 下连续调用两次 `apply(ctx)`，文档中 `[data-dsh-jx-root]` 恰有一个；第一次 ctx 卸载后容器计数归零。
