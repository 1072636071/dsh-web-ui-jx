/**
 * overlay-img-guard — 浮层 img 节点自愈守卫（DOM 健康硬保证）。
 *
 * 背景：实测发现浮层盒（[data-jx-character]）内出现多张完全相同的 <img>
 * 直接子节点（同类名同 src，刷新后仍可复现）。React 渲染路径经全量排查
 * 不可能产出该结构（组件恒渲染 1 张主图 + 焦点切换瞬态 1 张 underlay），
 * 属外部来源向盒内插入节点。与其追缉不可控的外部写入方，不如在盒边界
 * 上建立不变量并强制执行：
 *
 *   不变量：浮层盒的直接子级 <img> 集合 ≡ React 当前挂载的 ref 集合
 *          （主图 + 可选 underlay，恒 ≤ 2）。
 *
 * 机制：MutationObserver（childList）监听浮层盒，任何直接子级 img 不在
 * ref 白名单中即移除。observer 回调是微任务、在整批 DOM 变更（含 React
 * commit）结束后才触发，keep 集合读取的是 commit 后的最终 ref，不会误裁
 * React 正在交接的节点；effect 建观察时同步 prune 一次，兜住 observer
 * 建立前窗口内的残留。
 *
 * 只盯 img 直接子节点（观测到的唯一泄漏向量）：bubbleList/stateLabel/
 * SpeechBubble 等 React 子树不受干涉，嵌套在非直接子级里的 img（若有）
 * 不属于本守卫管辖。
 *
 * @module dsh-web-ui-jx/client
 */

/** 守卫实例. */
export interface OverlayImgGuard {
  /** 立即按白名单裁剪一次（幂等）. */
  prune(): void;
  /** 断开 MutationObserver（组件卸载时调用）. */
  disconnect(): void;
}

/**
 * 在浮层盒上建立 img 直接子节点白名单守卫。
 *
 * @param box - 浮层盒元素（[data-jx-character]）。
 * @param keep - 取当前 React 挂载的 img ref 白名单（prune 时实时读取）。
 * @param onPruned - 裁剪回调（诊断上报用；count 为本批移除数量）。
 * @returns 守卫实例。
 */
export function createOverlayImgGuard(
  box: HTMLElement,
  keep: () => ReadonlySet<Element>,
  onPruned?: (count: number) => void,
): OverlayImgGuard {
  function prune(): void {
    let removed = 0;
    const whitelist = keep();
    for (const img of Array.from(box.querySelectorAll(":scope > img"))) {
      if (whitelist.has(img)) continue;
      img.remove();
      removed += 1;
    }
    if (removed > 0 && onPruned !== undefined) onPruned(removed);
  }

  const observer = new MutationObserver(() => {
    prune();
  });
  observer.observe(box, { childList: true });
  // 建观察时同步裁剪一次，兜住 observer 建立前窗口内的残留。
  prune();

  return {
    prune,
    disconnect: () => {
      observer.disconnect();
    },
  };
}
