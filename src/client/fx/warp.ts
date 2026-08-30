/**
 * warp 特效 — 鼠标彗星粒子 + 涟漪。
 *
 * 鼠标移动时在光标前方生成一个亮核，沿运动反方向抛出一串渐变粒子形成彗尾
 * （首亮尾暗、前大后小），粒子各自扩张淡出；按下（pointerdown）在落点绽开一圈
 * 墨涟漪。停下即停，不常驻、不挡内容。
 *
 * 语义：只在运动时回应的鼠标跟手特效，帮定位鼠标的"小工具"。
 * 无控制器级停止淡出（19-03 明确「无淡出」）：拖尾/涟漪各自自带 520ms/720ms
 * 淡出动画，停止移动后最后一批粒子在 ~520ms 内自然隐去；控制器只负责降级与
 * 接合门控，无常驻帧循环、无「写了不接」的死代码。
 * 性能：纯 transform+opacity（GPU 合成层），节点池化复用，无 backdrop-filter /
 *       SVG filter / 每帧位移图计算；涟漪同样走 WAAPI（19-04，无强制 reflow）。
 * 降级：pointer:coarse / prefers-reduced-motion 由控制器 noop，永不触发。
 *
 * 装饰层 pointer-events: none，不拦截底层 UI 交互。
 * 零堆叠：startWarp/stopWarp 幂等，重复调用安全。
 *
 * @module dsh-web-ui-jx/client
 */

import { createWarpController } from "./warp-controller.ts";

/** 拖尾粒子池上限。 */
const MAX_TRAIL = 40;
/** 涟漪上限（按下触发，每次一个）。 */
const MAX_RIPPLE = 6;
/** 拖尾生成最小位移（px），低于此不产新粒子（节流）。 */
const TRAIL_MIN_DIST = 8;
/** 单次彗尾粒子数（随速度波动）。 */
const TRAIL_MIN_COUNT = 3;
const TRAIL_MAX_COUNT = 7;
/** 彗尾粒子沿反方向间距（px）。 */
const TRAIL_GAP = 12;
/** 彗核基准直径（px）。 */
const CORE_SIZE = 34;

/** 容器（承载所有拖尾/涟漪节点）。 */
let container: HTMLDivElement | null = null;
/** 控制器（降级判定 + 生命周期）。 */
let controller: ReturnType<typeof createWarpController> | null = null;
/** pointermove/pointerdown 处理句柄。 */
let onPointerMove: ((e: PointerEvent) => void) | null = null;
let onPointerDown: ((e: PointerEvent) => void) | null = null;
/** 拖尾节点池（循环复用）。 */
let trailPool: HTMLDivElement[] = [];
/** 涟漪节点池。 */
let ripplePool: HTMLDivElement[] = [];
/** 上次产点的坐标（用于 TRAIL_MIN_DIST 节流）。 */
let lastX = 0;
let lastY = 0;
/** 是否已启动（幂等标志）。 */
let started = false;

/** 取一个拖尾点节点（池化复用，超出上限复用最旧）。 */
function acquireTrail(): HTMLDivElement {
  let el = trailPool.find((n) => !n.parentNode);
  if (!el) {
    if (trailPool.length >= MAX_TRAIL) {
      el = trailPool[0];
      el.remove();
    } else {
      el = document.createElement("div");
      el.setAttribute("data-jx-fx-warp-trail", "");
      trailPool.push(el);
    }
  }
  return el;
}

/** 取一个涟漪节点（池化复用）。 */
function acquireRipple(): HTMLDivElement {
  let el = ripplePool.find((n) => !n.parentNode);
  if (!el) {
    if (ripplePool.length >= MAX_RIPPLE) {
      el = ripplePool[0];
      el.remove();
    } else {
      el = document.createElement("div");
      el.setAttribute("data-jx-fx-warp-ripple", "");
      ripplePool.push(el);
    }
  }
  return el;
}

/** trail 动画时值（首次生成粒子时创建一次）。 */
const TRAIL_KEYFRAMES: Array<Keyframe> = [
  { transform: "translate3d(0,0,0) translate(-50%,-50%) scale(1)", opacity: 1 },
  { transform: "translate3d(0,0,0) translate(-50%,-50%) scale(2.4)", opacity: 0 },
];

/** trail 动画时值选项（生成粒子时创建一次）。 */
const TRAIL_OPTIONS: KeyframeAnimationOptions = {
  duration: 520,
  iterations: 1,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  fill: "forwards",
};

/** ripple 动画时值（对齐 fx.css 原 jx-warp-ripple 关键帧；19-04 改 WAAPI 驱动，
 *  移除 CSS 动画重触发所需的强制 reflow）。 */
const RIPPLE_KEYFRAMES: Array<Keyframe> = [
  {
    opacity: 0.5,
    transform: "translate3d(0,0,0) translate(-50%,-50%) scale(0.15)",
  },
  {
    opacity: 0,
    transform: "translate3d(0,0,0) translate(-50%,-50%) scale(1.05)",
  },
];

/** ripple 动画时值选项。 */
const RIPPLE_OPTIONS: KeyframeAnimationOptions = {
  duration: 720,
  iterations: 1,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  fill: "forwards",
};

/**
 * 在 (x,y) 生成一颗彗星粒子。
 *
 * 用 Web Animations API 驱动（与 fall.ts 一致、可用 JS 精确重启），动画结束即
 * 从 DOM 移除回收到池，持续移动可持续产粒。动画属性走 GPU transform/opacity。
 *
 * @param x - 视口 x。
 * @param y - 视口 y。
 * @param size - 粒子直径（px）。
 * @param opacity - 起始透明度（经 WAAPI from 态，等价于原 --p-opacity 梯度）。
 * @param delay - 延迟（ms），尾端粒子稍晚起步让链有流动感。
 */
function spawnParticle(
  x: number,
  y: number,
  size: number,
  opacity: number,
  delay: number,
): void {
  if (!container) return;
  const el = acquireTrail();
  // 定位用 left/top（不被动画 transform 覆盖）；尺寸经 style 传入。
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  // 取消残留动画，强制重新播放
  el.getAnimations().forEach((a) => a.cancel());
  container.appendChild(el);
  const anim = el.animate(
    [
      { ...TRAIL_KEYFRAMES[0], opacity },
      TRAIL_KEYFRAMES[1],
    ],
    { ...TRAIL_OPTIONS, delay },
  );
  // 动画结束即从 DOM 移除，回到池待复用（不依赖 CSS forwards 残留）
  anim.finished.then(() => {
    if (el.parentNode === container) el.remove();
  }).catch(() => {});
}

/**
 * 沿运动反方向抛出一串彗星粒子（前一帧位置为方向）。
 *
 * @param x - 当前鼠标 x。
 * @param y - 当前鼠标 y。
 * @param px - 上一帧指针 x（方向来源）。
 * @param py - 上一帧指针 y。
 */
function spawnTrail(x: number, y: number, px: number, py: number): void {
  if (!container || !controller || !controller.getSnapshot().visible) return;
  let dx = x - px;
  let dy = y - py;
  const d = Math.hypot(dx, dy);
  if (d === 0) return;
  dx /= d;
  dy /= d;
  // 速度越快，彗尾越长（粒子数越多、链越长）
  const count = Math.min(
    TRAIL_MAX_COUNT,
    Math.round(TRAIL_MIN_COUNT + (d / 900) * (TRAIL_MAX_COUNT - TRAIL_MIN_COUNT)),
  );
  let lastXpt = x;
  let lastYpt = y;
  for (let i = 1; i <= count; i++) {
    // 越靠尾部越小、越暗、稍晚起步
    const t = i / count;
    const size = Math.max(4, CORE_SIZE * (1 - t * 0.75));
    const opacity = Math.max(0.05, 0.7 * (1 - t * 0.8));
    const delay = (i - 1) * 24;
    // 沿反方向抛离，越靠尾被拖得越远，形成扫尾
    lastXpt = x - dx * i * TRAIL_GAP;
    lastYpt = y - dy * i * TRAIL_GAP;
    spawnParticle(lastXpt, lastYpt, size, opacity, delay);
  }
}

/**
 * 在 (x,y) 绽开一圈墨涟漪（19-04：Web Animations API 驱动，替代 CSS
 * `animation` 重置重触发——旧实现的 `void el.offsetWidth` 是显式强制 reflow，
 * 每次 pointerdown 一次强制同步布局；WAAPI 无此成本，且与 trail 粒子同构）。
 */
function spawnRipple(x: number, y: number): void {
  if (!container || !controller || !controller.getSnapshot().visible) return;
  const el = acquireRipple();
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  // 取消残留动画（池化复用），随后重放
  el.getAnimations().forEach((a) => a.cancel());
  container.appendChild(el);
  const anim = el.animate(RIPPLE_KEYFRAMES, RIPPLE_OPTIONS);
  // 动画结束即从 DOM 移除，回到池待复用（与 trail 粒子一致）
  anim.finished
    .then(() => {
      if (el.parentNode === container) el.remove();
    })
    .catch(() => {});
}

/**
 * 启动 warp 特效。
 *
 * 创建容器并监听 window pointermove（拖尾，位移节流）与 pointerdown（涟漪）。
 * 幂等：已启动时直接返回。
 */
export function startWarp(): void {
  if (started) return;
  started = true;

  container = document.createElement("div");
  container.setAttribute("data-jx-fx-warp", "");
  container.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:9997;overflow:visible;";
  document.body.appendChild(container);

  controller = createWarpController({
    pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });

  onPointerMove = (e: PointerEvent): void => {
    if (!controller) return;
    controller.onMove(e.clientX, e.clientY);
    if (!controller.getSnapshot().visible) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (dx * dx + dy * dy < TRAIL_MIN_DIST * TRAIL_MIN_DIST) return;
    const prevX = lastX;
    const prevY = lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    spawnTrail(e.clientX, e.clientY, prevX, prevY);
  };

  onPointerDown = (e: PointerEvent): void => {
    if (!controller || !controller.getSnapshot().visible) return;
    spawnRipple(e.clientX, e.clientY);
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
}

/**
 * 停止 warp 特效。
 *
 * 移除监听与容器，清空节点池。幂等：未启动时直接返回。
 */
export function stopWarp(): void {
  if (!started) return;
  started = false;

  if (onPointerMove) {
    window.removeEventListener("pointermove", onPointerMove);
    onPointerMove = null;
  }
  if (onPointerDown) {
    window.removeEventListener("pointerdown", onPointerDown);
    onPointerDown = null;
  }
  if (controller) {
    controller.destroy();
    controller = null;
  }
  if (container) {
    // 取消所有残留 WAAPI 动画并移除节点，避免 stop 后内存/动画残留
    container.querySelectorAll<Element>("[data-jx-fx-warp-trail], [data-jx-fx-warp-ripple]").forEach((n) => {
      n.getAnimations().forEach((a) => a.cancel());
      n.remove();
    });
    container.remove();
    container = null;
  }
  trailPool = [];
  ripplePool = [];
}
