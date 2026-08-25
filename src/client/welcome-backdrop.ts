/**
 * welcome-backdrop — 欢迎背景整页壁纸层（ADR-0024 D1/D2/D3）。
 *
 * 结构（body 直挂，fixed 全视口，z-index:-1 垫于全部宿主内容之下）：
 *   <div data-jx-backdrop aria-hidden="true">
 *     <div data-jx-backdrop-base>   ← 实底基色（深浅主题各随 --jx-surface-0）
 *     <img data-jx-backdrop-img>    ← 壁纸图（opacity = 壁纸不透明度滑杆）
 *     <div data-jx-backdrop-veil>   ← 压暗/提亮纱（固定调参，深暗纱浅白纱）
 *   </div>
 *
 * 联动（ADR-0024 D2）：背景开启时在 body 上写 --jx-panel-alpha（0–1），
 * jiangxiao.css 的 --jx-surface-* 以 rgb(R G B / var(--jx-panel-alpha)) 消费，
 * 宿主面板随之半透明；关闭时移除该属性，面板回纯色。
 *
 * 生效门槛：皮肤开（body[data-dsh-jiangxiao]）且背景开——皮肤关闭时整层
 * 卸载（壁纸属皮肤观感，一键按回宿主原皮不应残留壁纸）。
 *
 * ADR-0017 可重入约束：本模块的 body 直挂 DOM 必须随 ctx.effect 清理；
 * 入口另提供 sweepResidualBackdrops 兜「已作废模块实例逃逸」的容器裸摘
 * （对齐 sweepResidualFxLayers 先例）。
 *
 * @module dsh-web-ui-jx/client
 */

import {
  getBackdropEnabled,
  getBubbleAlpha,
  getInputAlpha,
  getPanelOpacity,
  getSelectorAlpha,
  getSidebarAlpha,
  getTipAlpha,
  getVeilOpacity,
  getWallOpacity,
  subscribeBackdrop,
} from "./welcome-backdrop-config.ts";
import { getSkinEnabled } from "./skin.ts";

/** 壁纸图 URL（经 /api/dsh-jx 素材路由本机服务，ADR-0024 D1）。 */
export const WELCOME_BACKDROP_URL =
  "/api/dsh-jx/welcome/welcome-16-9.webp";

/** 背景层容器标记属性。 */
export const BACKDROP_ATTR = "data-jx-backdrop";

/** 壁纸激活标记（ADR-0027 D5）：body + html 双端写，CSS 中和/玻璃规则在其
 *  作用域内才生效。挂载写、卸层清。 */
export const BACKDROP_ACTIVE_ATTR = "data-jx-wallpaper-active";

/** 壁纸层容器 z-index（负值垫于全部宿主内容之下，ADR-0027 D3）。 */
const BACKDROP_Z_INDEX = -3;

/** 被探测器判定「盖住壁纸」的表面标记（ADR-0027 D1）。 */
export const SURFACE_ATTR = "data-jx-backdrop-surface";

/** 中和规则 style 的标记属性（对齐参考项目 scene neutralizer）。 */
const NEUTRALIZER_ATTR = "data-jx-scene-neutralizer";

/** 视为「全视口表面」的最小高度占比。 */
const MIN_VIEWPORT_SURFACE_HEIGHT = 0.9;

/** 结算时视为 modal/浮层的最大 z-index（超过则放行不中和）。 */
const MAX_SURFACE_OVERLAY_Z_INDEX = 100;

/** 五个区域独立 alpha：CSS 变量 → 读取器（ADR-0025 D1）。写入与移除共用此映射。 */
const REGION_ALPHA_VARS = {
  "--jx-panel-sidebar-alpha": getSidebarAlpha,
  "--jx-panel-input-alpha": getInputAlpha,
  "--jx-panel-bubble-alpha": getBubbleAlpha,
  "--jx-panel-tip-alpha": getTipAlpha,
  "--jx-panel-selector-alpha": getSelectorAlpha,
} as const;

/** 移除全局激活标记 + 面板 alpha + 五区域 alpha 变量（背景关/dispose 共用）。 */
function unmarkBackdropActive(doc: Document = document): void {
  doc.body.removeAttribute(BACKDROP_ACTIVE_ATTR);
  doc.documentElement.removeAttribute(BACKDROP_ACTIVE_ATTR);
}

/** 移除全局面板 alpha + 五区域 alpha 变量（背景关/dispose 共用，ADR-0025）。 */
function clearBackdropCssVars(): void {
  document.body.style.removeProperty("--jx-panel-alpha");
  for (const name of Object.keys(REGION_ALPHA_VARS)) {
    document.body.style.removeProperty(name);
  }
}

// ---------------------------------------------------------------------------
// 表面探测器 + 中和规则（ADR-0027 D1，方案 A）
// ---------------------------------------------------------------------------

/** 元素的 `backgroundColor` 是否「可见 ≠ 透明」——中和目标判定的依据之一。 */
function hasVisibleBackground(color: string): boolean {
  const normalized = color.trim().toLowerCase();
  if (normalized === "" || normalized === "transparent") return false;
  const match = normalized.match(/^[a-z-]+\((.*)\)$/);
  if (match === null) return true;
  const args = match[1];
  const slash = args.lastIndexOf("/");
  if (slash >= 0) return visibleAlpha(args.slice(slash + 1));
  const channels = args.split(",");
  return channels.length === 4 ? visibleAlpha(channels[3] ?? "") : true;
}

/** 解析 alpha 数值是否非 0（rgba 四通道形态）。 */
function visibleAlpha(value: string): boolean {
  const alpha = Number.parseFloat(value);
  return Number.isFinite(alpha) && alpha > 0;
}

/**
 * 是否排除该表面（modal/浮层/自营层放行，不中和）：modal 语义（dialog / modal
 * 属性 / ARIA-modal）与较大 z-index（>100）的表面必须保留其底，避免把用户
 * 正在交互的浮层也抹透明。
 */
function isExcludedSurface(el: HTMLElement, zIndex: string): boolean {
  // 语义排除：自营壁纸层、modal/浮层、宿主 overlay、以及「插件面板」——
  // 插件面板各自的底不应被全局中和（它不是整幅 app 根，玻璃由方案 B 处理）。
  const semantic = el.closest(
    `[${BACKDROP_ATTR}], dialog, [role="dialog"], [aria-modal="true"], [data-shell-overlay], [data-slot="shell.overlay"], [data-dsh-plugin]`,
  ) !== null;
  if (semantic) return true;
  const numericZIndex = Number.parseFloat(zIndex);
  return Number.isFinite(numericZIndex) && numericZIndex > MAX_SURFACE_OVERLAY_Z_INDEX;
}

/**
 * 表面判定：覆盖 ≥90% 视口高度 + 非透明底 + 非 excluded。这些「整幅 app/对话
 * 根」面板的底色是宿主写死的不透明底、不吃 jx token，中和之壁纸才能露出。
 */
export function isWallpaperSurface(el: HTMLElement): boolean {
  const win = el.ownerDocument?.defaultView;
  if (win === null || win === undefined) return false;
  let rectHeight = 0;
  let viewportHeight = 0;
  let background = "";
  let zIndex = "";
  try {
    rectHeight = el.getBoundingClientRect().height;
    viewportHeight =
      el.ownerDocument.documentElement.clientHeight || win.innerHeight || 0;
    const cs = win.getComputedStyle(el);
    background = cs.backgroundColor;
    zIndex = cs.zIndex;
  } catch {
    return false;
  }
  const fillsViewport =
    viewportHeight > 0 && rectHeight >= viewportHeight * MIN_VIEWPORT_SURFACE_HEIGHT;
  return fillsViewport && hasVisibleBackground(background) && !isExcludedSurface(el, zIndex);
}

/** 栈式 DFS 遍历子树并对每个 HTML 元素应用回调（无短路，纯遍历）。 */
function walkElements(root: Element, visit: (el: HTMLElement) => void): void {
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (node instanceof HTMLElement) visit(node);
    for (const child of Array.from(node.children)) stack.push(child);
  }
}

/** 对给定子树「全视口不透明表面」打标记（根为 body 时即全域扫描；根为新增
 *  子树时即增量重标）。命中 surface 判定且未打标则加标记。幂等。 */
function tagSurfaces(root: Element): void {
  walkElements(root, (node) => {
    if (node !== document.body && !node.hasAttribute(SURFACE_ATTR) && isWallpaperSurface(node)) {
      node.setAttribute(SURFACE_ATTR, "");
    }
  });
}

/** 清除全部表面标记（卸层/清扫时调用）。 */
function clearSurfaceMarks(doc: Document = document): void {
  for (const el of Array.from(doc.querySelectorAll(`[${SURFACE_ATTR}]`))) {
    el.removeAttribute(SURFACE_ATTR);
  }
}

/** 毛玻璃恒定模糊（px，ADR-0027 D2/D8：模糊固定、透明度随现有区域 alpha）。 */
export const GLASS_BLUR_PX = 10;

/** 全浮层玻璃化的宿主表面选择器（对齐参考项目 wallpaper-exclusive 覆盖矩阵：
 *  输入卡/气泡/代码块/内联 code/sidebar/通用浮层/popper/插件面板/底部面板/
 *  设置表面。语义锚点优先；不命中时靠下方兜底后缀选择器回填。 */
const GLASS_SURFACE_SELECTORS = [
  "[data-composer-card]",                            // 输入卡
  '[data-slot="sidebar"]',                          // 侧栏背景
  "[role=\"dialog\"]", "[role=\"menu\"]",            // 通用浮层
  "[role=\"listbox\"]", "[role=\"tooltip\"]",
  "[data-radix-popper-content-wrapper]",            // popper
  "[data-dsh-surface=\"settings\"]",                // 设置表面
  "[data-dsh-plugin]",                              // 各插件面板（task-board/ssh/git-graph/...）
  "[data-composer-seat]",                           // composer seat
  // 气泡 / 代码块 / 内联 code（语义锚点缺失时用稳定后缀兜底）
  "[data-chat-anchor-key] [class*=\"bubble\"]",
  "[class*=\"md-code-block\"]",
  "code",
] as const;

/** 稳定后缀兜底选择器：宿主某面板无顶层语义锚点但类名含上述后缀时兜住（对齐
 *  参考 patches.css 回填口径）。与主矩阵作用域一致（body[data-jx-wallpaper-active]）。 */
const GLASS_FALLBACK_SELECTORS = [
  "[class*=\"_bottomPanel\"]",
  "[class*=\"_sessionRow\"]",
  "[class*=\"_workspaceRow\"]",
] as const;

/** 由主矩阵 + 兜底后缀共同构成的实际玻璃目标选择器（作用域前缀由调用方补）。 */
const ALL_GLASS_SELECTORS = [
  ...GLASS_SURFACE_SELECTORS,
  ...GLASS_FALLBACK_SELECTORS,
] as const;

/** 注入/确保中和规则 style；标记缺失则惰性（无激活标记时规则不生效）。 */
function ensureNeutralizer(): void {
  if (document.head === null || document.head.querySelector(`style[${NEUTRALIZER_ATTR}]`) !== null) {
    return;
  }
  const style = document.createElement("style");
  style.setAttribute(NEUTRALIZER_ATTR, "");
  style.textContent = `
    body[data-jx-wallpaper-active] [${SURFACE_ATTR}] {
      background-color: transparent !important;
      background-image: none !important;
    }
    /* 壁纸层自身排除任何干扰（指针穿透 + 不拦截） */
    body[data-jx-wallpaper-active] [${BACKDROP_ATTR}] {
      pointer-events: none !important;
    }
    /* 方案 B 全浮层毛玻璃（ADR-0027 D2）：blur 恒定；background-color 继承
       既有的 --jx-surface/区域 alpha（经 --jx-panel-alpha 已随面板滑块半透明），
       此处只补 blend 毛玻璃，不重写底。 */
    body[data-jx-wallpaper-active] ${ALL_GLASS_SELECTORS.join(",\n    body[data-jx-wallpaper-active] ")} {
      -webkit-backdrop-filter: blur(${GLASS_BLUR_PX}px);
      backdrop-filter: blur(${GLASS_BLUR_PX}px);
    }
    /* ADR-0027 D4 性能降级：prefers-reduced-motion 下毛玻璃全关，回纯 alpha +
       压纱兜底（对齐 DESIGN §6 reduced-motion 全关惯例）。 */
    @media (prefers-reduced-motion: reduce) {
      body[data-jx-wallpaper-active] ${ALL_GLASS_SELECTORS.join(",\n      body[data-jx-wallpaper-active] ")} {
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
      }
    }
  `;
  document.head.appendChild(style);
}

/** 移除中和规则 style（卸层/清扫时调用）。 */
function removeNeutralizer(doc: Document = document): void {
  doc.head.querySelector(`style[${NEUTRALIZER_ATTR}]`)?.remove();
}

/** 壁纸层整体清除：激活标记 + 表面标记 + 中和/玻璃 style（多个卸层入口共用，
 *  消除重复清理；sweep 清扫也复用它兜「作废模块」残留）。 */
function clearWallpaperMarkers(doc: Document = document): void {
  unmarkBackdropActive(doc);
  clearSurfaceMarks(doc);
  removeNeutralizer(doc);
}

/** 导航/切会话重建表面时，增量重扫打标的 MutationObserver（挂载期持有）。 */
let surfaceObserver: MutationObserver | null = null;

/** 启动 body 子树观察：新增/移除的表面由 handleSurfaceMutations 打标/清标。 */
function ensureSurfaceObserver(): void {
  if (surfaceObserver !== null) return;
  const win = document.defaultView;
  if (win === null || typeof win.MutationObserver !== "function") return;
  surfaceObserver = new win.MutationObserver(handleSurfaceMutations);
  surfaceObserver.observe(document.body, { childList: true, subtree: true });
}

/** 订阅期内的增量打标/清标：新增子树重扫、移除子树摘标。 */
function handleSurfaceMutations(records: MutationRecord[]): void {
  if (backdropEl === null) return; // 壁纸未激活，不维护标记
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof HTMLElement) tagSurfaces(node);
    }
    for (const node of record.removedNodes) {
      if (node instanceof HTMLElement) untagSubtree(node);
    }
  }
}

/** 对移除子树摘除标记。 */
function untagSubtree(root: HTMLElement): void {
  walkElements(root, (node) => {
    if (node.hasAttribute(SURFACE_ATTR)) node.removeAttribute(SURFACE_ATTR);
  });
}

/** 停止 surfaceObserver（dispose/扫净后调用）。 */
function stopSurfaceObserver(): void {
  surfaceObserver?.disconnect();
  surfaceObserver = null;
}

/** 当前挂载的层容器（单例；未挂载为 null）。 */
let backdropEl: HTMLDivElement | null = null;

/** subscribeBackdrop 的取消函数（挂载期间持有）。 */
let unsubConfig: (() => void) | null = null;

/**
 * 判断背景层当前是否应当挂载：皮肤开 且 背景总开关开。
 *
 * @returns true = 应挂载。
 */
function shouldBeMounted(): boolean {
  return getSkinEnabled() && getBackdropEnabled();
}

/**
 * 把当前配置同步到 DOM：挂/卸层 + 写壁纸透明度 + 写 --jx-panel-alpha。
 *
 * 幂等：已处于目标状态时为 no-op（订阅回调高频触发无害）。
 */
function syncBackdrop(): void {
  const mount = shouldBeMounted();

  if (mount && backdropEl !== null && !backdropEl.isConnected) {
    // ADR-0027 01 连接感知复挂：导航/切会话可能把 body 子树重建而摘出本层
    //（引用断连但配置/皮肤仍激活）。复用原层回拼 body，不重建、不丢子元素。
    document.body.insertBefore(backdropEl, document.body.firstChild);
  } else if (mount && backdropEl === null) {
    mountLayer();
  } else if (!mount && backdropEl !== null) {
    unmountLayer();
  }

  if (backdropEl !== null) {
    // 激活标记：挂载/复挂后保持就位（ADR-0027 D5 双端）。
    document.body.setAttribute(BACKDROP_ACTIVE_ATTR, "");
    document.documentElement.setAttribute(BACKDROP_ACTIVE_ATTR, "");
    // 方案 A：全域扫描不透明表面打标 + 注入中和规则（ADR-0027 D1）。
    ensureNeutralizer();
    tagSurfaces(document.body);
    const img = backdropEl.querySelector<HTMLImageElement>(
      "[data-jx-backdrop-img]",
    );
    if (img !== null) {
      img.style.opacity = String(getWallOpacity() / 100);
    }

    // 压纱层（veil）颜色：按主题叠暗纱/白纱，alpha = 压暗浓度滑杆。
    // inline 样式的优先级高于 jiangxiao.css 的固定 defaults，据此统一
    // 随着主题与滑杆即时更新，实现「压暗浓度」滑块。
    const veil = backdropEl.querySelector<HTMLDivElement>(
      "[data-jx-backdrop-veil]",
    );
    if (veil !== null) {
      const dark = document.body.hasAttribute("data-ds-dark-theme");
      const alpha = getVeilOpacity() / 100;
      veil.style.background = dark
        ? `rgb(11 9 13 / ${alpha})`
        : `rgb(250 245 238 / ${alpha})`;
    }
  }

  // 面板透明度：背景开启才写属性；关闭即移除（回落 jiangxiao.css 的 1）。
  // 皮肤关闭时属性残留无害（--jx-* 全部失效），但清掉更干净。
  if (mount) {
    document.body.style.setProperty(
      "--jx-panel-alpha",
      String(getPanelOpacity() / 100),
    );
    // 区域独立 alpha（ADR-0025 D1/D2）：仅背景开时写，关即移除回实色。
    for (const [name, read] of Object.entries(REGION_ALPHA_VARS)) {
      document.body.style.setProperty(name, String(read() / 100));
    }
  } else {
    clearBackdropCssVars();
    clearWallpaperMarkers();
  }
}

/** 实际构建并挂载背景层（仅 syncBackdrop 内部调用）。 */
function mountLayer(): void {
  const el = document.createElement("div");
  el.setAttribute(BACKDROP_ATTR, "");
  el.setAttribute("aria-hidden", "true");
  // 负 z-index：垫于全部宿主内容之下，不与宿主 app 根同层互排（ADR-0027 D3）。
  el.style.zIndex = String(BACKDROP_Z_INDEX);

  const base = document.createElement("div");
  base.setAttribute("data-jx-backdrop-base", "");

  const img = document.createElement("img");
  img.setAttribute("data-jx-backdrop-img", "");
  img.src = WELCOME_BACKDROP_URL;
  img.alt = "";
  img.draggable = false;

  const veil = document.createElement("div");
  veil.setAttribute("data-jx-backdrop-veil", "");

  el.append(base, img, veil);
  // 插入 body 首位：确保所有后续内容自然覆盖本层（ADR-0024 D1）
  document.body.insertBefore(el, document.body.firstChild);
  backdropEl = el;
}

/** 实际卸载背景层（仅 syncBackdrop 内部调用）。 */
function unmountLayer(): void {
  backdropEl?.remove();
  backdropEl = null;
  clearWallpaperMarkers();
}

/**
 * 启动欢迎背景层：按当前配置挂载 + 订阅配置/皮肤变化即时同步。
 *
 * 皮肤开关（setSkinEnabled）不经订阅通知，这里额外订阅 storage 语义之外的
 * 途径：由 apply() 在 setSkinEnabled 后调 syncWelcomeBackdrop() 即可，本模块
 * 只订阅 welcome-backdrop-config 的变化。返回清理函数供 ctx.effect。
 *
 * @returns 清理函数：退订 + 卸层 + 清 --jx-panel-alpha。
 */
export function startWelcomeBackdrop(): () => void {
  syncBackdrop();
  unsubConfig = subscribeBackdrop(syncBackdrop);
  // 导航/切会话重建 #root 子表面后，增量重扫打标（ADR-0027 01 复挂对齐）。
  ensureSurfaceObserver();
  return () => {
    if (unsubConfig !== null) {
      unsubConfig();
      unsubConfig = null;
    }
    stopSurfaceObserver();
    unmountLayer();
    clearBackdropCssVars();
  };
}

/**
 * 外部触发的即时同步入口（皮肤开关切换后调用——皮肤变化不走 config 订阅）。
 */
export function syncWelcomeBackdrop(): void {
  syncBackdrop();
}

/**
 * 清扫残留的背景层容器（ADR-0017 可重入约束覆盖面，对齐 sweepResidualFxLayers）。
 *
 * 只兜「已作废模块实例」逃逸的容器——其清理函数随模块失效不可达，只能按
 * 标记裸摘；本实例可能存活的层由 startWelcomeBackdrop 返回的清理函数负责。
 *
 * @param doc - 承载插件的文档。
 */
export function sweepResidualBackdrops(doc: Document): void {
  for (const el of Array.from(
    doc.querySelectorAll(`body > [${BACKDROP_ATTR}]`),
  )) {
    el.remove();
  }
  // 同时兜清作废模块残留：「作废模块实例」的清理函数随模块失效不可达，但其
  // 可能已注入了激活标记/表面标记/中和 style；一并摘掉，避免残留触发 CSS 规则。
  clearWallpaperMarkers(doc);
}
