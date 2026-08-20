/**
 * SessionBubbleList — 会话气泡列组件（ADR-0007）。
 *
 * 角色浮层左侧竖排的常驻气泡列：一气泡 = 一运行中/已结束未查看会话。
 * 气泡列整体位于角色盒外左侧（由 .bubbleList position:absolute;
 * right: calc(100% + 8px) + bottom:0 + column-reverse 实现）。
 *
 * 数据源：`sessions?: ISessions` prop（由 CharacterOverlay 传入）。
 *   - 用 useSyncExternalStore 订阅 sessions.list（SnapshotStore<SessionListState>）。
 *     订阅原始 SessionListState（SDK store 保证稳定引用），用 useMemo 派生
 *     SessionListEntry[]，避免 getSnapshot 返回新对象导致无限重渲染。
 *   - 调 selectBubbleEntries 过滤/折叠。
 *   - sessions 缺省时气泡列不渲染（静默空转，与 session-follow 无 sessions 行为一致）。
 *
 * 配置：订阅 session-bubbles-config store，上限变化即时生效。
 *
 * 交互（ADR-0007 决策 4）：
 *   - 气泡 pointer-events:auto + cursor:pointer，点击调 sessions.open(id) 跳转。
 *   - 气泡挂 data-jx-interactive 不触发整盒拖动（复用 ADR-0006 排除机制）。
 *   - 当前会话气泡金描边高亮，点击无动作。
 *
 * 折叠（ADR-0007 决策 5）：超出上限折叠为「+N」弱化气泡，点击原地展开全部，再点收起。
 *
 * 动效（ADR-0007 决策 7）：出现 150ms 淡入 / 消失 100ms 淡出（退出快于进入）。
 *   退出动效通过 leavingEntries 状态实现：气泡从 visible 消失时移入 leavingEntries，
 *   渲染 leaving class 触发 CSS exit 动画，BUBBLE_EXIT_MS 后移除。重排无动画。
 *   prefers-reduced-motion 全关。
 *
 * 布局（ADR-0007 决策 3）：整体在角色盒外左侧竖排（right: calc(100% + 8px)），
 * bottom:0 + flex-direction: column-reverse 自下而上生长。随浮层盒整体移动。
 *
 * 样式只消费语义别名 + --jx-gold 专属轨，无颜色字面量、无主题选择器。
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
import type {
  ISessions,
  SessionId,
  SessionListState,
} from "@deepseek-ai/dsh-client-runtime/client";
import {
  displayTitle,
  selectBubbleEntries,
  type BubbleEntry,
  type SessionListEntry,
} from "../state-machine/session-bubbles.ts";
import {
  subscribeMaxSessionBubbles,
  getMaxSessionBubblesSnapshot,
} from "../session-bubbles-config.ts";
import styles from "../styles/session-bubbles.module.css";

/** 气泡退出动画时长 ms（DESIGN.md §6 退出快于进入）. */
const BUBBLE_EXIT_MS = 100;

// ---------------------------------------------------------------------------
// 空会话列表快照（sessions 缺省时 useSyncExternalStore 的占位）
// ---------------------------------------------------------------------------

const EMPTY_ITEMS: readonly SessionListEntry[] = [];

function noopSubscribe(): () => void {
  return () => {};
}
function undefinedGetSnapshot(): undefined {
  return undefined;
}

// ---------------------------------------------------------------------------
// 从 SDK SessionListState 派生 SessionListEntry[]（纯函数）
// ---------------------------------------------------------------------------

/**
 * 把 SDK SessionListState（ids + byId）投影为气泡列关心的 SessionListEntry[]。
 *
 * 只取 sessionId / title / running / completed；保持 ids 顺序。
 */
function deriveItems(state: SessionListState): readonly SessionListEntry[] {
  const items: SessionListEntry[] = [];
  for (const id of state.ids) {
    const summary = state.byId[id];
    if (summary === undefined) continue;
    items.push({
      sessionId: summary.id,
      title: summary.title,
      running: summary.running,
      completed: summary.completed ?? false,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// 共享键盘激活（Enter/Space 触发，与 button 行为一致）
// ---------------------------------------------------------------------------

function useActivationKey(onActivate: () => void) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
    [onActivate],
  );
}

// ---------------------------------------------------------------------------
// SessionBubble — 单气泡（内部组件）
// ---------------------------------------------------------------------------

/** SessionBubble props. */
interface SessionBubbleProps {
  /** 气泡条目. */
  entry: BubbleEntry;
  /** 点击回调（传入 sessionId）；当前会话气泡不调用. */
  onOpen: (id: string) => void;
  /** 退出态：true 时挂 leaving class 触发退出动画，不交互. */
  leaving?: boolean;
}

/**
 * 渲染单个会话气泡：标题 + 状态点 + 点击 + 高亮。
 *
 * 挂 data-jx-interactive 不触发整盒拖动；role=button 键盘可激活；
 * aria-label 含会话标题。当前会话气泡点击 no-op。leaving 态不交互。
 */
function SessionBubble({ entry, onOpen, leaving }: SessionBubbleProps) {
  const handleClick = useCallback(() => {
    if (entry.isCurrent || leaving) return;
    onOpen(entry.sessionId);
  }, [entry.isCurrent, entry.sessionId, onOpen, leaving]);

  const handleKeyDown = useActivationKey(handleClick);

  const title = displayTitle(entry);
  const dotClass = entry.running ? styles.dotRunning : styles.dotCompleted;
  const classes = [
    styles.bubble,
    entry.isCurrent ? styles.current : "",
    leaving ? styles.leaving : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role="button"
      tabIndex={leaving ? -1 : 0}
      aria-label={`会话：${title}${entry.isCurrent ? "（当前）" : ""}`}
      aria-current={entry.isCurrent ? "true" : undefined}
      data-jx-interactive=""
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className={`${styles.dot} ${dotClass}`} aria-hidden="true" />
      <span className={styles.title}>{title}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MoreBubble — 「+N」/「收起」气泡（内部组件）
// ---------------------------------------------------------------------------

/** MoreBubble props. */
interface MoreBubbleProps {
  /** moreCount > 0 时显示「+N」；展开态显示「收起」. */
  expanded: boolean;
  /** 折叠数量. */
  moreCount: number;
  /** 点击回调：切换展开/收起. */
  onToggle: () => void;
}

/** 渲染「+N」或「收起」弱化气泡. */
function MoreBubble({ expanded, moreCount, onToggle }: MoreBubbleProps) {
  const handleKeyDown = useActivationKey(onToggle);
  const label = expanded ? "收起" : `+${moreCount}`;

  return (
    <div
      className={`${styles.bubble} ${styles.more}`}
      role="button"
      tabIndex={0}
      aria-label={expanded ? "收起会话气泡列" : `展开剩余 ${moreCount} 个会话`}
      data-jx-interactive=""
      onClick={onToggle}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.title}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionBubbleList — 气泡列（导出组件）
// ---------------------------------------------------------------------------

/** SessionBubbleList props. */
export interface SessionBubbleListProps {
  /** 会话数据源（缺省时气泡列不渲染）. */
  sessions?: ISessions | undefined;
}

/**
 * 渲染会话气泡列。
 *
 * sessions 缺省时返回 null（静默空转）。无 running/completed 会话时返回 null
 * （浮层保持素净，PRD 用户故事 13）。
 *
 * @param props.sessions - 会话数据源。
 * @returns 会话气泡列，或 null。
 */
export function SessionBubbleList({ sessions }: SessionBubbleListProps) {
  // 订阅 sessions.list 原始快照（SDK store 保证稳定引用，避免无限重渲染）。
  // sessions 缺省时订阅 noop、getSnapshot 返回 undefined。
  const rawState: SessionListState | undefined = useSyncExternalStore(
    sessions ? sessions.list.subscribe : noopSubscribe,
    sessions ? sessions.list.getSnapshot : undefinedGetSnapshot,
  );

  // 订阅上限配置（即时生效）。
  const maxVisible: number = useSyncExternalStore(
    subscribeMaxSessionBubbles,
    getMaxSessionBubblesSnapshot,
  );

  // 派生 items + current（仅 rawState 变化时重算）。
  const items = useMemo(
    () => (rawState === undefined ? EMPTY_ITEMS : deriveItems(rawState)),
    [rawState],
  );
  const current = rawState?.current;

  // 展开态：true 时显示全部会话气泡（不折叠）；false 时按 maxVisible 折叠。
  const [expanded, setExpanded] = useState(false);

  const handleOpen = useCallback(
    (id: string) => {
      // sessionId 源自 SDK SessionSummary.id（branded SessionId），纯逻辑模块
      // 用 string 解耦，此处边界 cast 回 SDK SessionId 调 sessions.open。
      sessions?.open(id as SessionId);
    },
    [sessions],
  );

  const handleToggleExpand = useCallback(() => {
    setExpanded((e) => !e);
  }, []);

  // 计算可见气泡：折叠态按 maxVisible 截取，展开态显示全部。
  // 始终计算折叠结果以驱动 MoreBubble 显示（折叠时「+N」/ 展开时「收起」）。
  const folded = useMemo(
    () => selectBubbleEntries(items, current, maxVisible),
    [items, current, maxVisible],
  );
  const expandedResult = useMemo(
    () => selectBubbleEntries(items, current, Number.MAX_SAFE_INTEGER),
    [items, current],
  );
  const visible = expanded ? expandedResult.visible : folded.visible;
  // MoreBubble 显示条件：折叠时有溢出（「+N」）或展开时有被折叠的条目（「收起」）。
  const showMore = folded.moreCount > 0;

  // 退出动效：跟踪从 visible 消失的条目，渲染 leaving class 100ms 后移除。
  const [leavingEntries, setLeavingEntries] = useState<readonly BubbleEntry[]>(
    [],
  );
  const prevVisibleRef = useRef<readonly BubbleEntry[]>(visible);
  // 每个 leaving 条目的独立计时器（按 sessionId 索引），避免跨条目计时器干扰。
  const leaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const prev = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (prev === visible) return;

    const currentIds = new Set(visible.map((e) => e.sessionId));
    const newlyLeaving = prev.filter((e) => !currentIds.has(e.sessionId));
    if (newlyLeaving.length === 0) return;

    // 合入 leavingEntries（去重）。
    setLeavingEntries((prevLeaving) => {
      const existingIds = new Set(prevLeaving.map((e) => e.sessionId));
      const merged = [...prevLeaving];
      for (const entry of newlyLeaving) {
        if (!existingIds.has(entry.sessionId)) merged.push(entry);
      }
      return merged;
    });

    // 为每个 leaving 条目独立计时，互不干扰。
    for (const entry of newlyLeaving) {
      const timer = setTimeout(() => {
        leaveTimersRef.current.delete(entry.sessionId);
        setLeavingEntries((prevLeaving) =>
          prevLeaving.filter((e) => e.sessionId !== entry.sessionId),
        );
      }, BUBBLE_EXIT_MS);
      leaveTimersRef.current.set(entry.sessionId, timer);
    }
  }, [visible]);

  // 组件卸载时清除所有 pending 计时器，避免 state 更新已卸载组件。
  useEffect(() => {
    return () => {
      for (const timer of leaveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      leaveTimersRef.current.clear();
    };
  }, []);

  // 无可见气泡、无折叠、无退出中气泡时不渲染（浮层保持素净）。
  if (visible.length === 0 && !showMore && leavingEntries.length === 0) {
    return null;
  }

  // leaving 条目的 id 集合（避免与 visible 重复渲染）。
  const visibleIds = new Set(visible.map((e) => e.sessionId));
  const renderingLeaving = leavingEntries.filter(
    (e) => !visibleIds.has(e.sessionId),
  );

  return (
    <div className={styles.bubbleList}>
      {visible.map((entry) => (
        <SessionBubble key={entry.sessionId} entry={entry} onOpen={handleOpen} />
      ))}
      {renderingLeaving.map((entry) => (
        <SessionBubble
          key={`leaving-${entry.sessionId}`}
          entry={entry}
          onOpen={handleOpen}
          leaving
        />
      ))}
      {showMore && (
        <MoreBubble
          expanded={expanded}
          moreCount={folded.moreCount}
          onToggle={handleToggleExpand}
        />
      )}
    </div>
  );
}
