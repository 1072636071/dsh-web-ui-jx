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

/** 五个区域独立 alpha：CSS 变量 → 读取器（ADR-0025 D1）。写入与移除共用此映射。 */
const REGION_ALPHA_VARS = {
  "--jx-panel-sidebar-alpha": getSidebarAlpha,
  "--jx-panel-input-alpha": getInputAlpha,
  "--jx-panel-bubble-alpha": getBubbleAlpha,
  "--jx-panel-tip-alpha": getTipAlpha,
  "--jx-panel-selector-alpha": getSelectorAlpha,
} as const;

/** 移除全局面板 alpha + 五区域 alpha 变量（背景关/dispose 共用，ADR-0025）。 */
function clearBackdropCssVars(): void {
  document.body.style.removeProperty("--jx-panel-alpha");
  for (const name of Object.keys(REGION_ALPHA_VARS)) {
    document.body.style.removeProperty(name);
  }
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

  if (mount && backdropEl === null) {
    mountLayer();
  } else if (!mount && backdropEl !== null) {
    unmountLayer();
  }

  if (backdropEl !== null) {
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
  }
}

/** 实际构建并挂载背景层（仅 syncBackdrop 内部调用）。 */
function mountLayer(): void {
  const el = document.createElement("div");
  el.setAttribute(BACKDROP_ATTR, "");
  el.setAttribute("aria-hidden", "true");

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
  return () => {
    if (unsubConfig !== null) {
      unsubConfig();
      unsubConfig = null;
    }
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
}
