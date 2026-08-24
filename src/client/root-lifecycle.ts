/**
 * root-lifecycle — 插件 React root 容器的挂载/清扫生命周期（ADR-0017/0019）。
 *
 * 背景：宿主存在运行期插件重载机制（client-hmr rebuilt 帧、动态包 runner
 * invalidate + 重建），`apply()` 会在不刷新页面的情况下被多次执行。若旧 React
 * 树未卸载，会在 body 上叠加孤儿浮层（多只完整姜晓同位重叠）。本模块集中承载
 * 「挂载前清扫残留」这一真实行为，让入口 `apply()` 保持纯接线。
 *
 * 接口契约：
 *   - `sweepResidualRoots(doc)`：清扫两类残留 root 容器——
 *     1. 带 `data-dsh-jx-root` 标记的规范容器（ADR-0017 起 apply 挂载的形态）；
 *     2. 旧版**无标记**容器（ADR-0017 之前的 bundle 生成，标记选择器覆盖不住，
 *        按浮层特征 `[data-jx-character]` 兜底识别，ADR-0019 加固）。
 *     先借容器上暂存的 root 引用完整卸载（终止其内部订阅与 effects），再移除节点；
 *     unmount 失败不阻断（旧 fiber 已死，最坏退化为摘除 DOM）。
 *   - `createRootContainer()`：创建带 `data-dsh-jx-root` 标记的容器（ADR-0017
 *     D1/D2：标记 + 暂存 root 引用供跨模块闭包清扫）。
 *
 * 约束（ADR-0017 D3）：后续任何新增的 body 直挂 DOM 代码必须纳入本模块的
 * 清理路径。
 *
 * @module dsh-web-ui-jx/client
 */

/** 容器元素形状：暂存 React root 引用（ADR-0017 D2 跨闭包清扫用）. */
export interface RootHostElement extends HTMLElement {
  /** 本容器对应的 React root；挂载后立即写入（ADR-0017 D2）. */
  __jxRoot?: { unmount(): void } | undefined;
}

/**
 * 判定一个 body 直接子元素是否为姜晓插件自身的「逃逸残留」React root 容器。
 *
 * ADR-0017 起 `apply()` 挂载的容器都带 `data-dsh-jx-root` 标记；但在那之前的
 * 旧版本（及宿主侧历史缓存的服务态）生成的容器**不带该标记**，却以 React root
 * 直接挂在 `document.body` 下渲染姜晓浮层。识别依据就一个：**body 直接子、
 * 无标记、但内含本插件浮层特征 `[data-jx-character]`**。宿主或其他插件不会
 * 在 body 直接子元素里挂我们的浮层却不打标记，故该判断不会误伤；带标记的
 * 规范容器已由主路径（标记选择器）处理，这里也不会重复命中。
 *
 * @param el - body 直接子元素候选。
 * @returns true 表示是本插件无标记的残留浮层容器。
 */
export function isJxResidualRoot(el: HTMLElement): boolean {
  // 已带规范标记 → 由标记选择器路径清扫，这里不算。
  if (el.hasAttribute("data-dsh-jx-root")) return false;
  // 含本插件浮层特征（直接或间接包含 [data-jx-character]）即视为残留宿主。
  return el.querySelector('[data-jx-character]') !== null;
}

/**
 * 清扫残留的插件根容器（ADR-0017 D2）：先借暂存引用完整卸载旧 root
 * （终止其内部订阅与 effects），再移除节点。unmount 失败不阻断新挂载
 * （旧 fiber 已死，最坏退化为摘除 DOM——仍好于叠加孤儿浮层）。
 *
 * 兼容两类残留：
 *   1. 规范容器（带 `data-dsh-jx-root` 标记）——ADR-0017 起 apply 挂载的形态；
 *   2. 旧版无标记容器——历史 bundle 生成的 React root 容器（不带标记逃逸清扫，
 *      渲染多只姜晓并叠加）。按 {@link isJxResidualRoot} 识别后一并清理。
 *
 * @param doc - 承载插件容器的文档。
 */
export function sweepResidualRoots(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll("[data-dsh-jx-root]"))) {
    const stale = el as RootHostElement;
    try {
      stale.__jxRoot?.unmount();
    } catch {
      // 旧 root 卸载失败：静默继续摘除节点。
    }
    stale.remove();
  }

  // ADR-0017 加固（ADR-0019）：旧版无标记的逃逸容器不会命中上面的标记选择器，
  // 需按 isJxResidualRoot 逐个识别清理，堵住「硬刷新后仍多只姜晓」的缺口。
  for (const el of Array.from(doc.body.children)) {
    if (!(el instanceof HTMLElement)) continue;
    if (!isJxResidualRoot(el)) continue;
    const stale = el as RootHostElement;
    try {
      stale.__jxRoot?.unmount();
    } catch {
      // 同上：unmount 失败退化为摘除 DOM。
    }
    el.remove();
  }
}

/**
 * 创建带 `data-dsh-jx-root` 标记的插件 root 容器（ADR-0017 D1）。
 *
 * 调用方在 `createRoot(container)` 后应把 root 暂存到
 * `(container as RootHostElement).__jxRoot`，供未来清扫（含跨模块闭包）完整卸载。
 *
 * @param doc - 目标文档。
 * @returns 已标记、未挂载的容器元素。
 */
export function createRootContainer(doc: Document): RootHostElement {
  const container = doc.createElement("div");
  container.dataset.dshJxRoot = "";
  return container as RootHostElement;
}
