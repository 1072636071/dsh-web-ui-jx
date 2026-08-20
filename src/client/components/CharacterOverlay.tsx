/**
 * CharacterOverlay — 角色浮层组件。
 *
 * 用 <img> 播放角色 webp 素材。接入 overlayStateMachine：状态机输出应播放的
 * 素材序列（过渡段 → 循环态），CharacterOverlay 据此设 img src，过渡段播放
 * 一次（setTimeout durationMs）后推进到循环态，循环态持续循环。
 *
 * ADR-0006 可拖动决策（工单 02）：
 *   - 整盒可拖：pointer-events: auto，按住任意位置可拖（Pointer Events +
 *     setPointerCapture 统一鼠标/触控/触控笔）。
 *   - 定位：left:0/top:0 + transform: translate3d(x,y,0)（GPU 合成），
 *     位置由 overlayPositionStore 单例提供（读持久化或默认右下角）。
 *   - 拖动实时跟手（pointermove → store.set），pointerup 提交钳制结果 + 持久化。
 *   - window resize 监听 → store.setViewport 重钳制，浮层不跑到屏幕外。
 *   - 悬停 cursor: grab，拖动中 cursor: grabbing + opacity 0.85 + scale 1.02 提视；
 *     transition 仅作用于 opacity，不作用于 transform（跟手无延迟）；
 *     prefers-reduced-motion 下无过渡。
 *   - touch-action: none + user-select: none，触屏拖动不触发页面滚动/文本选中。
 *   - pointerdown 命中交互子元素（[data-jx-interactive]，未来 StateSwitcher
 *     按钮等）时不触发拖动。
 *
 * DESIGN.md §4 角色浮层专规（ADR-0006 更新后）：
 *   - 透明无底：img { object-fit: contain; display: block }，容器无 background /
 *     无 box-shadow / 无背光 / 无光晕（无 filter）。
 *   - 整盒可拖、交互层（反转原 pointer-events: none 穿透原则）。
 *   - 台词气泡：淡入淡出（opacity + translateY），播放后自动隐去；
 *     pointer-events: none（工单 06）；盒内绝对定位，随盒整体移动。
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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import styles from "../styles/overlay.module.css";
import {
  DEFAULT_TRANSITION_DURATION_MS,
  loopAssetUrl,
  type OverlayState,
  type PlaybackItem,
} from "../state-machine/overlay-state-machine.ts";
import {
  type OverlaySessionRuntime,
  type RuntimeSnapshot,
} from "../state-machine/overlay-session-runtime.ts";
import {
  subscribeOverlayPositionStore,
  getOverlayPositionSnapshot,
  overlayPositionStore,
  dragStart,
  dragMove,
  dragEnd,
  getViewportSize,
  type DragSession,
  type OverlayPosition,
  type OverlaySize,
  type ViewportSize,
} from "../state-machine/overlay-position.ts";
import { SpeechBubble, DEFAULT_BUBBLE_DURATION_MS } from "./SpeechBubble.tsx";
import { loadWebpDurationMs } from "../webp-duration.ts";
import { SessionBubbleList } from "./SessionBubbleList.tsx";
import type { ISessions } from "@deepseek-ai/dsh-client-runtime/client";

/** 拖动中提视缩放（ADR-0006 决策 5：scale 1.02）. */
const DRAG_SCALE = 1.02;

/** runtime 未注入时的 idle 兜底快照（测试或未传 runtime 时使用）. */
const IDLE_RUNTIME_SNAPSHOT: RuntimeSnapshot = {
  focusSessionId: undefined,
  currentState: "idle",
  playback: [{ kind: "loop", state: "idle", url: loopAssetUrl("idle") }],
  focusNonce: 0,
};

/** runtime 未注入时的 noop subscribe（useSyncExternalStore 兼容）. */
function noopSubscribe(): () => void {
  return () => {};
}

/** 检测 prefers-reduced-motion: reduce 初始值（SSR 守卫）. */
function initialReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 各循环态的演示台词（状态切换时触发，工单 06 演示用）。
 * 匹配设计 demo 的唐风角色语气。idle 不配台词（切回 idle 不弹气泡）。
 */
const STATE_SPEECH: Partial<Record<OverlayState, string>> = {
  thinking: "容姜晓思量片刻……",
  reading: "正在阅卷，稍候。",
  replying: "为大人细细道来。",
  working: "遵命，这就去办。",
  error: "此事有蹊跷，容我再查。",
  welcome: "大人来了，姜晓候久。",
  done: "此事已毕，大人过目。",
  permission: "此事需大人首肯。",
  listening: "姜晓静候大人示下。",
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
  /** 浮层宽度 px（默认 140，匹配设计 demo 的 character-stage）. */
  width?: number | undefined;
  /** 浮层高度 px（默认 249，匹配设计 demo 的 character-stage）. */
  height?: number | undefined;
  /** extra class for layout placement. */
  className?: string | undefined;
  /** 外部触发台词（nonce 变化即触发新台词显示）. */
  speech?: SpeechTrigger | undefined;
  /** 会话数据源（ADR-0007：传入 ctx.sessions 供会话气泡列订阅）. */
  sessions?: ISessions | undefined;
  /** 会话级状态机 runtime（ADR-0008：焦点会话 playback 驱动浮层）. */
  runtime?: OverlaySessionRuntime | undefined;
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
  width = 140,
  height = 249,
  className,
  speech,
  sessions,
  runtime,
}: CharacterOverlayProps) {
  // ADR-0008：订阅会话级 runtime 快照（焦点会话 playback）。
  // runtime 为 undefined 时（如测试或未注入）回落到 idle 兜底快照。
  const snapshot: RuntimeSnapshot = useSyncExternalStore(
    runtime?.subscribe ?? noopSubscribe,
    runtime?.getSnapshot ?? (() => IDLE_RUNTIME_SNAPSHOT),
  );

  // ADR-0006 决策 2：位置由 overlayPositionStore 单例提供（读持久化或默认右下角）。
  const position: OverlayPosition = useSyncExternalStore(
    subscribeOverlayPositionStore,
    getOverlayPositionSnapshot,
  );
  // posRef 保存最新位置供 pointerdown 闭包读取（避免 callback 依赖 position 频繁重建）。
  const posRef = useRef(position);
  posRef.current = position;

  // ADR-0006 决策 7：拖动会话 + 拖动中标志。dragging 驱动 cursor/opacity/scale 提视。
  const [dragging, setDragging] = useState(false);
  const dragSession = useRef<DragSession | null>(null);
  // viewportRef 保存最新视口供 pointermove/up 读取（resize 时同步更新）。
  const viewportRef = useRef<ViewportSize>(getViewportSize());
  // 浮层尺寸（dragMove/dragEnd 钳制用，复用 OverlaySize 类型避免内联字面量重复）。
  // useMemo 稳定引用，避免 handlePointerMove/Up 的 useCallback 每次渲染重建。
  const overlaySize: OverlaySize = useMemo(
    () => ({ width, height }),
    [width, height],
  );

  // prefers-reduced-motion 响应式订阅（DESIGN.md §6「全关」精神：reduced-motion 下
  // 禁用 scale 提视）。useState + useEffect 监听 matchMedia change，会话中切换即时更新。
  const [reducedMotion, setReducedMotion] = useState<boolean>(
    initialReducedMotion,
  );

  // ADR-0006 决策 4：window resize 监听 → store.setViewport 重钳制，浮层不跑到屏幕外。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = (): void => {
      const v = getViewportSize();
      viewportRef.current = v;
      overlayPositionStore.setViewport(v);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // prefers-reduced-motion 变化监听（响应式更新 reducedMotion state）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent): void => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => {
      mq.removeEventListener("change", handler);
    };
  }, []);

  // ADR-0006 决策 7：pointerdown 启动拖动。命中交互子元素（[data-jx-interactive]，
  // 未来 StateSwitcher 按钮等）时不启动（留给子元素处理）。
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const interactive =
        e.target instanceof Element &&
        e.target.closest("[data-jx-interactive]") !== null;
      const start = dragStart(
        { x: e.clientX, y: e.clientY },
        posRef.current,
        interactive,
      );
      if (!start.active) return;
      dragSession.current = start.session;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  // ADR-0006 决策 2/4：pointermove 跟手（dragMove 钳制到视口）→ store.move 仅内存
  // 更新 + 通知（不写 localStorage，避免高频 I/O）。持久化在 pointerup 由 set 提交
  // （ADR-0006 决策 3「拖动结束钳制后写入」）。
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSession.current;
      if (!session) return;
      const next = dragMove(
        session,
        { x: e.clientX, y: e.clientY },
        viewportRef.current,
        overlaySize,
      );
      overlayPositionStore.move(next);
    },
    [overlaySize],
  );

  // ADR-0006 决策 2/3：pointerup 提交钳制结果（dragEnd）+ set 持久化，结束会话。
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSession.current;
      if (!session) return;
      const next = dragEnd(
        session,
        { x: e.clientX, y: e.clientY },
        viewportRef.current,
        overlaySize,
      );
      overlayPositionStore.set(next);
      dragSession.current = null;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture 已释放或未设置，静默忽略。
      }
    },
    [overlaySize],
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

  // 过渡段播放完毕推进：transition 项按真实素材时长（webp 素材 ANMF 解析，
  // 工单 01）setTimeout 后 index++；解析失败回退默认时长。停在其他情况
  // （index 在末尾 loop）不推进（循环态持续循环）。
  // 兜底 timer：解析期间先按回退时长起 timer，解析完成后未推进则改设真实
  // 时长——fetch 挂起/解析不落定时 800ms 后仍推进，播放链路不冻结。
  // 工单 02 治理工单 01 遗留：effect 依赖 [index, item.url] 而非 [index, snapshot]，
  // 快照引用变化但当前过渡项 url 不变时不重置计时。runtime 已隔离非焦点会话事件
  // （只有焦点会话变化才 emit），此处用 item（由 snapshot.playback + index 派生）
  // 而非直接读 snapshot.playback[index]，避免闭包 snapshot 但不列入依赖的 stale 风险。
  useEffect(() => {
    if (item.kind !== "transition") return; // loop 项或越界（currentItem 钳制到末尾 loop）
    let cancelled = false;
    const advance = () => setIndex((i) => i + 1);
    let timer = setTimeout(advance, DEFAULT_TRANSITION_DURATION_MS);
    void loadWebpDurationMs(item.url).then((durationMs) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(advance, durationMs ?? DEFAULT_TRANSITION_DURATION_MS);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [index, item.url]);

  // ADR-0008 决策 3：焦点切换 150ms 淡入淡出（cross-fade 双 img 层）。
  // focusNonce 变化时，旧 item.url 作为 underlay 淡出，新 item.url 在上层淡入。
  // underlay 160ms 后移除（CSS animation 150ms 淡出 + 10ms 余量）。
  // render 期间 setState 模式（React 允许，见 React docs "storing information from
  // previous renders"）：从 prevItemUrl 捕获旧 url，条件检查避免循环。
  const prevFocusNonceRef = useRef(snapshot.focusNonce);
  const prevItemUrlRef = useRef(item.url);
  const [underlay, setUnderlay] = useState<{
    url: string;
    key: number;
  } | null>(null);
  if (snapshot.focusNonce !== prevFocusNonceRef.current) {
    setUnderlay({ url: prevItemUrlRef.current, key: prevFocusNonceRef.current });
    prevFocusNonceRef.current = snapshot.focusNonce;
  }
  prevItemUrlRef.current = item.url;

  useEffect(() => {
    if (underlay === null) return;
    const t = setTimeout(() => setUnderlay(null), 160);
    return () => clearTimeout(t);
  }, [underlay]);

  // ADR-0006 决策 2/5：transform: translate3d(x,y,0) scale(s)，GPU 合成。
  // scale 仅拖动时 1.02 提视；prefers-reduced-motion 下禁用 scale（对@see reducedMotion，
  // 响应式订阅 matchMedia）。transform 无 transition（跟手无延迟，CSS 已声明）。
  const scale = dragging && !reducedMotion ? DRAG_SCALE : 1;

  return (
    <div
      className={`${styles.overlay}${dragging ? " " + styles.dragging : ""}${className ? " " + className : ""}`}
      style={{
        width,
        height,
        transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
      }}
      data-jx-character=""
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {underlay && !reducedMotion && (
        <img
          key={underlay.key}
          className={styles.imageUnderlay}
          src={underlay.url}
          alt=""
          draggable={false}
        />
      )}
      <img
        key={snapshot.focusNonce}
        className={styles.image}
        src={item.url}
        alt=""
        draggable={false}
      />
      <SessionBubbleList sessions={sessions} />
      {bubble && (
        <SpeechBubble
          key={bubble.key}
          text={bubble.text}
          duration={bubble.duration}
          onDone={() => setBubble(null)}
        />
      )}
    </div>
  );
}
