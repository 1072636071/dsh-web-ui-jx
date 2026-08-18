/**
 * CharacterOverlay — 角色浮层组件。
 *
 * 右下角常驻定位（position: fixed），用 <img> 播放角色 webp 素材。
 * 接入 overlayStateMachine：状态机输出应播放的素材序列（过渡段 → 循环态），
 * CharacterOverlay 据此设 img src，过渡段播放一次（setTimeout durationMs）
 * 后推进到循环态，循环态持续循环。
 *
 * DESIGN.md §4 角色浮层专规：
 *   - 透明无底：img { object-fit: contain; display: block }，容器无 background /
 *     无 box-shadow / 无背光 / 无光晕（无 filter）。
 *   - 装饰层 pointer-events: none，不拦截底层 UI 交互；仅 StateSwitcher 的按钮
 *     单独设 pointer-events: auto。
 *   - 台词气泡：淡入淡出（opacity + translateY），播放后自动隐去；
 *     pointer-events: none（工单 06）。
 *
 * 深浅双主题：角色 webp 本身 alpha 透明，不受主题影响；浮层无需主题选择器、
 * 不消费颜色令牌（透明无底）。StateSwitcher / SpeechBubble 消费语义别名。
 *
 * 状态机驱动：UI 只通过 useSyncExternalStore 订阅状态机快照、按 playback 序列
 * 播放，不直接操作 DOM 切换状态。切换意图由 StateSwitcher 的按钮 dispatch。
 *
 * 台词气泡触发（工单 06）：
 *   - 演示触发：currentState 变化时显示对应台词（STATE_SPEECH，idle 不弹）。
 *   - 外部触发：props.speech 的 nonce 变化即显示新台词（供后续工单调用）。
 *
 * @module dsh-web-ui-jx/client
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "../styles/overlay.module.css";
import {
  subscribeOverlayStateMachine,
  getOverlayStateMachineSnapshot,
  DEFAULT_TRANSITION_DURATION_MS,
  type OverlayState,
  type StateMachineSnapshot,
  type PlaybackItem,
} from "../state-machine/overlay-state-machine.ts";
import { StateSwitcher } from "./StateSwitcher.tsx";
import { SpeechBubble, DEFAULT_BUBBLE_DURATION_MS } from "./SpeechBubble.tsx";

/**
 * 各循环态的演示台词（状态切换时触发，工单 06 演示用）。
 * idle 不配台词（切回 idle 不弹气泡，避免频繁打扰）。
 */
const STATE_SPEECH: Partial<Record<OverlayState, string>> = {
  thinking: "思考中…",
  reading: "阅读中…",
  replying: "正在回复…",
  working: "处理中…",
  error: "出错了，请重试",
  welcome: "你好，我是姜晓",
  done: "已完成",
  permission: "需要你的授权",
  listening: "聆听中…",
};

/** 外部触发的台词（通过 props 注入，供后续工单调用）. */
export interface SpeechTrigger {
  /** 台词文本. */
  text: string;
  /** 显示时长 ms（可选，默认 3000）. */
  duration?: number | undefined;
  /** 触发 nonce（变化即触发新台词，用于强制重新挂载）. */
  nonce: number | string;
}

/** CharacterOverlay props. */
export interface CharacterOverlayProps {
  /** 浮层宽度 px（默认 180）. */
  width?: number | undefined;
  /** 浮层高度 px（默认 260）. */
  height?: number | undefined;
  /** extra class for layout placement. */
  className?: string | undefined;
  /** 外部触发台词（nonce 变化即触发新台词显示）. */
  speech?: SpeechTrigger | undefined;
}

/**
 * 从播放计划取当前应播的项（index 越界则停在末尾 loop）。
 *
 * @param playback - 播放计划序列。
 * @param index - 当前播放索引。
 * @returns 当前应播的 playback 项。
 */
function currentItem(
  playback: readonly PlaybackItem[],
  index: number,
): PlaybackItem {
  const safeIndex = Math.min(index, playback.length - 1);
  return playback[safeIndex];
}

/**
 * Render the character overlay.
 *
 * @param props.width - 浮层宽度 px（默认 180）.
 * @param props.height - 浮层高度 px（默认 260）.
 * @param props.className - extra class for layout placement.
 * @returns 右下角常驻角色浮层，<img> 播放状态机输出的素材序列.
 */
export function CharacterOverlay({
  width = 180,
  height = 260,
  className,
  speech,
}: CharacterOverlayProps) {
  const snapshot: StateMachineSnapshot = useSyncExternalStore(
    subscribeOverlayStateMachine,
    getOverlayStateMachineSnapshot,
  );

  // 播放序列索引：跟踪当前播到第几个 playback 项。
  // snapshot 变化（切换）时重置为 0；transition 播完推进到下一个。
  const [index, setIndex] = useState(0);
  const [snapshotRef, setSnapshotRef] = useState(snapshot);
  if (snapshot !== snapshotRef) {
    setSnapshotRef(snapshot);
    setIndex(0);
  }

  // 台词气泡状态：{ text, duration, key } | null。key 变化即重新挂载 SpeechBubble，
  // 强制重新触发淡入动画。onDone 时置 null 卸载（播放后自动隐去）。
  const [bubble, setBubble] = useState<{
    text: string;
    duration: number;
    key: number;
  } | null>(null);
  const bubbleKeyRef = useRef(0);

  // 演示触发：currentState 变化时显示对应台词（idle 不弹）。
  // 与 snapshotRef 同模式：render 期间检测变化并同步 ref，避免 useEffect 闭包陈旧。
  const prevStateRef = useRef<OverlayState>(snapshot.currentState);
  if (snapshot.currentState !== prevStateRef.current) {
    prevStateRef.current = snapshot.currentState;
    const speechText = STATE_SPEECH[snapshot.currentState];
    if (speechText) {
      bubbleKeyRef.current += 1;
      setBubble({
        text: speechText,
        duration: DEFAULT_BUBBLE_DURATION_MS,
        key: bubbleKeyRef.current,
      });
    }
  }

  // 外部 speech prop 触发：nonce 变化即触发新台词（供后续工单调用）。
  const speechNonce = speech?.nonce;
  const prevSpeechNonceRef = useRef<number | string | undefined>(speechNonce);
  if (speech && speechNonce !== prevSpeechNonceRef.current) {
    prevSpeechNonceRef.current = speechNonce;
    bubbleKeyRef.current += 1;
    setBubble({
      text: speech.text,
      duration: speech.duration ?? DEFAULT_BUBBLE_DURATION_MS,
      key: bubbleKeyRef.current,
    });
  }

  const item = currentItem(snapshot.playback, index);

  // 过渡段播放完毕推进：transition 项 setTimeout(durationMs) 后 index++。
  // 停在末尾 loop 时不推进（循环态持续循环）。
  useEffect(() => {
    if (index >= snapshot.playback.length - 1) return; // 停在末尾 loop
    const current = snapshot.playback[index];
    if (!current || current.kind !== "transition") return;
    const duration = current.durationMs ?? DEFAULT_TRANSITION_DURATION_MS;
    const timer = setTimeout(() => setIndex((i) => i + 1), duration);
    return () => clearTimeout(timer);
  }, [index, snapshot]);

  return (
    <div
      className={`${styles.overlay}${className ? " " + className : ""}`}
      style={{ width, height }}
    >
      <img className={styles.image} src={item.url} alt="" draggable={false} />
      {bubble && (
        <SpeechBubble
          key={bubble.key}
          text={bubble.text}
          duration={bubble.duration}
          onDone={() => setBubble(null)}
        />
      )}
      <StateSwitcher />
    </div>
  );
}
