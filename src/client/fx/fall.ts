/**
 * fall 特效 — 银杏(暗)/梅花(浅)飘落。
 *
 * DESIGN.md §5：12 片 Web Animations API，GPU transform（translate3d）。
 * 深浅双主题：暗色=银杏色（--jx-ginkgo），浅色=梅花色（--jx-seal-bright）。
 * 颜色与形状由 fx.css 的 `[data-jx-fx-fall] span` 选择器驱动（CSS 变量自动
 * 跟随主题），本模块只负责创建元素与 transform/opacity 动画。
 *
 * 装饰层 pointer-events: none，不拦截底层 UI 交互。
 * 零堆叠：startFall/stopFall 幂等，重复调用安全。
 *
 * @module dsh-web-ui-jx/client
 */

/** 飘落叶片数量（DESIGN.md §4：<= 8 片）. */
const LEAF_COUNT = 8;

/** 8 片叶子的设计尺寸（px），匹配设计 demo 的 deco-leaf 规格. */
const LEAF_SIZES: Array<[number, number]> = [
  [48, 64],
  [38, 52],
  [56, 72],
  [32, 44],
  [44, 60],
  [36, 50],
  [50, 68],
  [28, 40],
];

/** 单片叶子动画参数（关键帧 + 时长 + 延迟）. */
interface LeafPlan {
  keyframes: Keyframe[];
  duration: number;
  delay: number;
}

/** 飘落容器（固定全屏装饰层）. */
let container: HTMLDivElement | null = null;

/** 活跃动画句柄（用于 stopFall 取消）. */
let animations: Animation[] = [];

/**
 * 生成单片叶子的随机飘落计划（GPU transform 关键帧 + 时长 + 延迟）。
 *
 * 从视口顶部上方飘落到底部下方，伴随横向漂移与旋转，opacity 淡入淡出。
 * 用 translate3d 触发 GPU 合成层。时长 18s-28s（DESIGN.md §4）。
 *
 * @param index - 叶片序号（0..LEAF_COUNT-1），用于相位错开。
 * @returns 叶子动画计划。
 */
function buildLeafPlan(index: number): LeafPlan {
  // 横向起点均匀分布 + 小随机扰动（匹配 demo 的 110vw/90vw/75vw 等分布）
  const startX = (index / LEAF_COUNT) * 100 + (Math.random() * 10 - 5);
  // 横向漂移终点
  const endX = startX + (Math.random() * 30 - 15);
  // 旋转角度（±540deg~900deg，匹配 demo 的多样旋转）
  const rotateEnd = (Math.random() > 0.5 ? 1 : -1) * (540 + Math.random() * 360);
  // 时长 18s ~ 28s（DESIGN.md §4：--jx-leaf-fall-min=18s, max=28s）
  const duration = 18000 + Math.random() * 10000;
  // 起始延迟错开（负延迟让初始就分布在不同阶段）
  const delay = -(index / LEAF_COUNT) * duration;

  return {
    keyframes: [
      {
        transform: `translate3d(${startX}vw, -10vh, 0) rotate(0deg)`,
        opacity: 0,
        offset: 0,
      },
      {
        opacity: 0.5,
        offset: 0.08,
      },
      {
        transform: `translate3d(${startX + (endX - startX) * 0.5}vw, 50vh, 0) rotate(${rotateEnd * 0.5}deg)`,
        opacity: 0.45,
        offset: 0.5,
      },
      {
        opacity: 0.42,
        offset: 0.9,
      },
      {
        transform: `translate3d(${endX}vw, 110vh, 0) rotate(${rotateEnd}deg)`,
        opacity: 0,
        offset: 1,
      },
    ],
    duration,
    delay,
  };
}

/**
 * 启动飘落特效。
 *
 * 创建固定全屏装饰层 + 8 片 SVG 叶子，每片用 Web Animations API 做 GPU transform
 * 动画。叶子尺寸按 LEAF_SIZES 表分配（匹配设计 demo 的 8 种规格）。
 * 颜色/形状由 fx.css 的 `[data-jx-fx-fall] span` SVG background-image 驱动。
 * 幂等：已启动时直接返回。
 */
export function startFall(): void {
  if (container) return; // 已启动，幂等

  container = document.createElement("div");
  container.setAttribute("data-jx-fx-fall", "");
  // 装饰层固定全屏，不拦截指针，contain:strict 隔离布局/绘制
  container.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden;contain:strict;";
  document.body.appendChild(container);

  animations = [];
  for (let i = 0; i < LEAF_COUNT; i++) {
    const leaf = document.createElement("span");
    const [w, h] = LEAF_SIZES[i % LEAF_SIZES.length];
    // 叶片尺寸由 inline style 设定，SVG 背景由 fx.css 驱动
    leaf.style.cssText = `position:absolute;top:0;left:0;display:block;pointer-events:none;will-change:transform,opacity;width:${w}px;height:${h}px;`;
    container.appendChild(leaf);

    const plan = buildLeafPlan(i);
    const anim = leaf.animate(plan.keyframes, {
      duration: plan.duration,
      delay: plan.delay,
      iterations: Infinity,
      easing: "linear",
    });
    animations.push(anim);
  }
}

/**
 * 停止飘落特效。
 *
 * 取消所有动画并移除装饰层。幂等：未启动时直接返回。
 */
export function stopFall(): void {
  for (const anim of animations) {
    anim.cancel();
  }
  animations = [];
  if (container) {
    container.remove();
    container = null;
  }
}
