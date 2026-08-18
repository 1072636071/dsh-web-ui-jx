/**
 * SpeechBubble — 台词气泡组件。
 *
 * DESIGN.md §4 角色浮层专规：台词气泡淡入淡出（opacity + translateY），
 * 播放后自动隐去；`pointer-events: none`（不拦截鼠标）。
 *
 * 动效（DESIGN.md §6）：
 *   - 淡入：opacity 0→1 + translateY(8px→0)，150ms，自然减速 cubic-bezier(0.16,1,0.3,1)。
 *   - 显示：duration ms 后触发淡出。
 *   - 淡出：opacity 1→0 + translateY(0→-8px)，100ms（退出快于进入）。
 *   - 淡出完成后通过 onDone 回调通知父组件卸载（播放后自动隐去，无需用户手动关闭）。
 *   - prefers-reduced-motion 下动画全关（瞬间显示/隐去），由 setTimeout 兜底保证卸载。
 *
 * 卸载驱动（双保险）：
 *   - 主路径：leaving 态 onAnimationEnd 触发 onDone（非 reduced-motion 下精确同步动画结束）。
 *   - 兜底路径：leaving 态开始后 BUBBLE_EXIT_MS 的 setTimeout 调 onDone。
 *     修复 reduced-motion 下 animation:none → onAnimationEnd 不触发 → 气泡永不卸载的 bug。
 *   - doneRef 去重：保证 onDone 至多调用一次（两条路径谁先触发都用 ref 拦截后者）。
 *
 * 样式只消费语义别名（--dsw-specific-bubble 背景 / --dsw-alias-label-primary 文字 /
 * --dsw-alias-border-l1 边框），无颜色字面量、无主题选择器。深浅双主题由 L2 remap
 * 自动处理：暗 = --jx-surface-2 深底 + --jx-text-strong 浅字；浅 = --jx-surface-2
 * 浅底 + --jx-text-strong 深字，WCAG AA 对比度由令牌双值保证（暗 #1a1620/#f2ead8、
 * 浅 #efe3d0/#2a241a，均远超 4.5:1）。
 *
 * @module dsh-web-ui-jx/client
 */

import { useEffect, useRef, useState } from "react";
import styles from "../styles/speech-bubble.module.css";

/** 默认显示时长 ms（淡入后到淡出前），播放后自动淡出. */
export const DEFAULT_BUBBLE_DURATION_MS = 3000;
/** 淡入时长 ms（DESIGN.md §6 常规 150ms）. */
export const BUBBLE_ENTER_MS = 150;
/** 淡出时长 ms（退出快于进入，DESIGN.md §6）. */
export const BUBBLE_EXIT_MS = 100;

/** SpeechBubble props. */
export interface SpeechBubbleProps {
  /** 台词文本. */
  text: string;
  /** 显示时长 ms（淡入完成后到淡出触发前），默认 3000. */
  duration?: number | undefined;
  /** 淡出完成回调（父组件据此卸载气泡，实现"播放后自动隐去"）. */
  onDone?: (() => void) | undefined;
}

/**
 * Render the speech bubble.
 *
 * 挂载即播放淡入动画；duration ms 后切到淡出态；淡出动画结束或 BUBBLE_EXIT_MS 兜底
 * 超时后调 onDone 通知卸载（双保险，reduced-motion 下由兜底保证）。
 *
 * @param props.text - 台词文本.
 * @param props.duration - 显示时长 ms（默认 3000）.
 * @param props.onDone - 淡出完成回调.
 * @returns 台词气泡，淡入 → 显示 → 淡出 → onDone.
 */
export function SpeechBubble({
  text,
  duration = DEFAULT_BUBBLE_DURATION_MS,
  onDone,
}: SpeechBubbleProps) {
  // leaving=false：淡入 + 显示阶段；leaving=true：淡出阶段。
  const [leaving, setLeaving] = useState(false);
  // onDone 是否已调用（避免 onAnimationEnd 与 setTimeout 兜底双触发）。
  const doneRef = useRef(false);

  // 显示 duration ms 后自动触发淡出（播放后自动隐去，无需用户手动关闭）。
  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  // 兜底卸载：leaving 态开始后 BUBBLE_EXIT_MS 调 onDone。
  // prefers-reduced-motion 下 animation:none → onAnimationEnd 不触发，由本兜底保证卸载。
  // 非 reduced-motion 下 onAnimationEnd 通常先触发，doneRef 去重避免双调用。
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone?.();
    }, BUBBLE_EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  return (
    <div
      className={`${styles.bubble}${leaving ? " " + styles.leaving : ""}`}
      role="status"
      aria-live="polite"
      onAnimationEnd={() => {
        // 仅在淡出动画结束（leaving 态）时通知卸载；淡入结束不触发。
        // 当前 leaving 态只挂一个 bubble-out 动画，onAnimationEnd 必来自它。
        if (leaving && !doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }}
    >
      {text}
    </div>
  );
}
