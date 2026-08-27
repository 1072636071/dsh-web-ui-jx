/**
 * SessionBubbleList — 会话气泡列组件（ADR-0007 / ADR-0018 归组模型）。
 *
 * 角色浮层左侧竖排的常驻气泡列，归组模型（ADR-0018）：一个顶层归组气泡 =
 * 一个根祖先会话及其全部通过范围过滤的 subagent 后代——一条多代理工作流
 * 无论派生多少层子孙恒占一个气泡，「占满」问题消失。无谱系字段的普通会话
 * 退化为单例组，体验与改造前完全一致。
 *
 * 气泡列整体位于角色盒外左侧（由 .bubbleList position:absolute;
 * right: calc(100% + 8px) + bottom:0 + column-reverse 实现）。
 *
 * 数据源：`sessions?: ISessions` prop（由 CharacterOverlay 传入）。
 *   - 用 useSyncExternalStore 订阅 sessions.list（SnapshotStore<SessionListState>）。
 *     订阅原始 SessionListState（SDK store 保证稳定引用），用 useMemo 派生
 *     SessionListEntry[]（含 parentId / origin 谱系透传），避免 getSnapshot
 *     返回新对象导致无限重渲染。
 *   - 调 buildBubbleGroups 归组/折叠（ADR-0018 D8 纯函数 seam）。
 *   - sessions 缺省时气泡列不渲染（静默空转，与 session-follow 无 sessions 行为一致）。
 *
 * 配置：订阅 session-bubbles-config store，上限变化即时生效。
 *
 * 保留模式（ADR-0022 D1/D6，工单 01）：订阅 session-bubble-keep-config 的
 * 总开关①与 kept/dismissed 快照，组装 BubbleKeepContext 传给两处
 * buildBubbleGroups（开关关 = 投影层总开关退化路径，输出与现状全等）；
 * 点击气泡照旧 sessions.open(id)，开关开且非当前会话时追加 addKept(id)
 * 记账（SDK 清除 completed 位不可拦截，客户端记账使气泡留存，含跨页面
 * 刷新）；宿主列表镜像变化时惰性裁剪记账集合（prune 仅确有删除才写盘）。
 *
 * 交互（ADR-0007 决策 4 + ADR-0022 D1）：气泡 pointer-events:auto +
 * cursor:pointer，点击调 sessions.open(id) 跳转对应会话（根气泡开根会话，
 * 子气泡开子会话）；保留模式开启时跳转后记账 kept（见上）；挂
 * data-jx-interactive 不触发整盒拖动（复用 ADR-0006 排除机制）；
 * 当前会话气泡点击无动作、不记账。
 *
 * 悬停详情窗（工单 16-02/16-04）：气泡行挂 `data-hover-key`，`.bubbleList`
 * 容器以 pointerover/out 事件委托实现进入/离开延迟（300ms/200ms）与触屏
 * 长按（500ms）打开；书页卡片（SessionBubbleDetail）贴气泡展开、视口边缘
 * 自动换侧 + 纵向对齐翻转，随盒整体移动；卡片 data-jx-interactive 不触发
 * 整盒拖动，点击卡片打开会话。预览数据（previewTransport）悬停时按需拉取
 * （骨架屏 + 失败静默）；AI 动态标题（dynamicTitleTransport，工单 16-04）
 * 以书眉副题行呈现，未配置 API 时整行隐藏。
 *
 * 子代理徽标（ADR-0018 D4/D5，工单03 按钮化）：▸N/▾N 计后代总数
 * （badge.total，收起 ▸ / 展开 ▾），置于标题右侧 flex-shrink:0 不换行
 * 不挤压；role=button + tabIndex 键盘可激活（Enter/Space），onClick /
 * onKeyDown stopPropagation 阻断冒泡——不触发根气泡跳转、data-jx-interactive
 * 不触发整盒拖动；aria-label 报告剩余子会话数（「展开/收起 N 个子会话」），
 * aria-expanded 反映生效展开态。存在运行中后代（badge.running > 0）时前缀
 * 金色呼吸迷你点（复用 dot-breathe 动画语义，reduced-motion 静态）。
 *
 * 展开状态（ADR-0018 D5/D6）：各组独立维护手动展开态（manualExpanded:
 * Set<rootId>）；生效展开态 = 手动展开 || containsCurrent——current 在该组
 * 后代中时强制展开（手动收起无效，已接受的权衡），current 离开后自动回落
 * 手动状态（派生计算，无需清理副作用）。
 *
 * 子气泡（ADR-0018 D5）：生效展开时渲染于父气泡之后（DOM 序配合列的
 * column-reverse ⇒ 视觉位于父上方）；margin-right:12px + 列右缘对齐
 * （align-items:flex-end）= 右缘对齐布局下向左缩进 12px；弱化背景
 * （--jx-surface-1 墨阶下沉一级）+ 左侧 1px 竖连接线（--dsw-alias-border-l1
 * 素线轨）；组内顺序 = 宿主列表原序（members 由纯逻辑层保证）。点击子气泡
 * sessions.open(sessionId)；当前会话子气泡金描边且点击无动作；各自保留自身
 * pending 样式（朱砂描边 + 涟漪点）。展开只平铺一级（递归树形展示超出范围）。
 *
 * 当前传播与紧急描边（队长裁定，记入工单02评论）：containsCurrent ⇒ 根气泡
 * 金描边（root.isCurrent || containsCurrent 组合判定，D6）；group.pending
 * （纯逻辑层组级聚合标志）⇒ 根气泡挂 .pending 朱砂描边且 aria-label 追加
 * 「等待确认」——描边传播紧急信号，状态点仍表示根会话自身状态。
 *
 * 折叠（ADR-0007 决策 5 + ADR-0018 D3）：maxVisible 只约束顶层归组气泡数；
 * 溢出折叠为「+N」弱化气泡，点击原地展开全部顶层组，再点收起。pending 组
 * 豁免折叠、永驻可见（ADR-0020 pending-interaction-bubble-effect 组级聚合，纯逻辑层实施）。
 *
 * 动效（ADR-0007 决策 7；退出快于进入见 DESIGN.md §6）：出现 150ms 淡入 /
 * 消失 100ms 淡出。退出动效通过 leaving 状态实现，跟踪粒度双层：
 *   - 整组从顶层可见集消失 → 捕获子树单元（组 + 当时可见成员）整体淡出
 *     （键 rootId，避免组/子重复登记）；
 *   - 单个子气泡消失而父组仍在（收起该组 / 成员被查看移出过滤范围）→ 按
 *     子粒度捕获淡出（键 `${rootId}:${sessionId}`），渲染位置紧随其父组。
 *   渲染 leaving class 触发 CSS exit 动画，BUBBLE_EXIT_MS 后移除。重排无动画。
 *   prefers-reduced-motion 全关。
 *
 * 布局（ADR-0007 决策 3）：整体在角色盒外左侧竖排（right: calc(100% + 8px)），
 * bottom:0 + flex-direction: column-reverse 自下而上生长。随浮层盒整体移动。
 *
 * 收起区拖拽（ADR-0022 D2/D3/D4/D7/D9，工单02）→ ADR-0026 改型：
 * 保留模式下仅 completed 类气泡行可移除（isBubbleRowDraggable 统一判定）。
 * 左侧手柄点击直接收起（addDismissed 记账），无拖拽手势、无投放区。
 * 键盘 Delete/Backspace 收起聚焦气泡（当前会话允许）。
 *
 * 样式只消费语义别名 + --jx-* 专属轨，无颜色字面量、无主题选择器。
 *
 * @module dsh-web-ui-jx/client
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ISessions,
  IWorkspaces,
  SessionId,
  SessionListState,
} from "@deepseek-ai/dsh-client-runtime/client";
import {
  buildBubbleGroups,
  displayTitle,
  isBubbleRowDraggable,
  type BubbleEntry,
  type BubbleGroup,
  type BubbleKeepContext,
  type DragEntryFlags,
  type SessionListEntry,
} from "./session-bubbles.ts";
import { deriveSessionListEntries } from "./session-list-adapter.ts";
import {
  getMaxSessionBubblesSnapshot,
  subscribeMaxSessionBubbles,
} from "./session-bubbles-config.ts";
import {
  addDismissed,
  addKept,
  addSeen,
  clearDismissed,
  getDismissedSnapshot,
  getKeepEnabledSnapshot,
  getKeptSnapshot,
  getSeenSnapshot,
  pruneDismissed,
  pruneKept,
  pruneSeen,
  subscribeDismissed,
  subscribeKeepEnabled,
  subscribeKept,
  subscribeSeen,
} from "./session-bubble-keep-config.ts";
import type { PreviewTransport } from "./detail/detail-data.ts";
import type { DynamicTitleTransport } from "./detail/dynamic-title.ts";
import { SessionBubbleDetail, type SessionBubbleDetailEntry } from "./SessionBubbleDetail.tsx";
import styles from "./styles/session-bubbles.module.css";
import "./styles/bubble-theme.css";

/** 气泡退出动画时长 ms（DESIGN.md §6 退出快于进入）. */
const BUBBLE_EXIT_MS = 100;

// ---------------------------------------------------------------------------
// 悬停详情窗（工单 16-02 / 16-04）：进入/离开延迟 + 视口边缘换侧 + 触屏长按
// ---------------------------------------------------------------------------

/** 悬停进入延迟 ms（快速划过气泡列不弹详情窗）. */
const HOVER_ENTER_MS = 300;

/** 悬停离开延迟 ms（从气泡移到详情窗的过渡缓冲）. */
const HOVER_LEAVE_MS = 200;

/** 触屏长按进入详情 ms. */
const LONG_PRESS_MS = 500;

/** 详情窗固定宽度（与 session-bubble-detail.module.css 的 .detailCard width 一致）. */
const DETAIL_CARD_WIDTH = 264;

/** 详情窗与气泡列/视口边缘的间距. */
const DETAIL_MARGIN = 8;

/** 详情窗定位结果：显示侧（左/右）+ 纵向对齐（顶/底）+ 相对容器偏移. */
interface DetailPlacement {
  readonly side: "left" | "right";
  readonly align: "top" | "bottom";
  /** 相对气泡列容器的 top（align 'top' 时使用）. */
  readonly top: number;
  /** 相对气泡列容器的 bottom（align 'bottom' 时使用）. */
  readonly bottom: number;
}

/** 悬停详情状态：条目投影 + 定位. */
interface HoverDetailState extends DetailPlacement {
  readonly entry: SessionBubbleDetailEntry;
  readonly key: string;
}

/** 长按起点（用于移动超阈值取消长按）. */
interface LongPressOrigin {
  readonly key: string;
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// 空会话列表快照（sessions 缺省时 useSyncExternalStore 的占位）
// ---------------------------------------------------------------------------

const EMPTY_ITEMS: readonly SessionListEntry[] = [];

/** 空归档集（workspaces 缺省/快照未就绪时 useSyncExternalStore 派生的占位，稳定引用）. */
const EMPTY_ARCHIVED: ReadonlySet<string> = new Set();

function noopSubscribe(): () => void {
  return () => {};
}
function undefinedGetSnapshot(): undefined {
  return undefined;
}

// SDK SessionListState → SessionListEntry[] 的投影已沉入
// state-machine/session-list-adapter.ts（架构审查候选者：接缝适配器，
// 可独立测试），本组件只消费。

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
// useHoverDetail — 悬停详情窗状态机（工单 16-02/16-04）
//
// 事件委托：气泡行挂 `data-hover-key`，`.bubbleList` 容器以 pointerover/out 委托
// 识别进入/离开哪个气泡（不改动 GroupBubble/ChildBubble 内部 onClick）。
// 进入延迟 300ms、离开延迟 200ms；触屏长按 500ms 打开；视口边缘自动换侧 +
// 纵向对齐翻转，保证任何位置的气泡详情窗完整可见。
// ---------------------------------------------------------------------------

/**
 * 悬停详情窗状态机 hook。
 *
 * @param containerRef - 气泡列容器 ref（定位基准）。
 * @param entryFor - sessionId → 详情条目投影（列表层提供，含 displayTitle 回落）。
 * @returns 详情状态 + 一组委托给容器的事件处理器。
 */
function useHoverDetail(
  containerRef: React.RefObject<HTMLDivElement | null>,
  entryFor: (sessionId: string) => SessionBubbleDetailEntry | undefined,
): {
  hoverDetail: HoverDetailState | null;
  onPointerOver: React.PointerEventHandler<HTMLDivElement>;
  onPointerOut: React.PointerEventHandler<HTMLDivElement>;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onPointerMove: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp: React.PointerEventHandler<HTMLDivElement>;
  onPointerCancel: React.PointerEventHandler<HTMLDivElement>;
  onClickCapture: React.MouseEventHandler<HTMLDivElement>;
  onCardPointerEnter: React.PointerEventHandler<HTMLDivElement>;
  onCardPointerLeave: React.PointerEventHandler<HTMLDivElement>;
} {
  const [hoverDetail, setHoverDetail] = useState<HoverDetailState | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 长按已触发标志：抑制紧随的合成 click + 触屏上不因指针离开即关详情. */
  const longPressedRef = useRef(false);
  /** 当前悬停行元素（pointerover 去重 + 定位基准）. */
  const hoverRowRef = useRef<HTMLElement | null>(null);
  /** 长按起点（移动超阈值取消）. */
  const longPressOriginRef = useRef<LongPressOrigin | null>(null);

  const clearEnter = useCallback(() => {
    if (enterTimerRef.current !== null) clearTimeout(enterTimerRef.current);
    enterTimerRef.current = null;
  }, []);
  const clearLeave = useCallback(() => {
    if (leaveTimerRef.current !== null) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = null;
  }, []);
  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressOriginRef.current = null;
  }, []);

  /** 计算详情窗定位：视口边缘换侧 + 纵向对齐翻转. */
  const buildPlacement = useCallback(
    (bubbleEl: HTMLElement, containerEl: HTMLElement): DetailPlacement => {
      const containerRect = containerEl.getBoundingClientRect();
      const bubbleRect = bubbleEl.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      // 水平侧：默认开向左侧（远离角色）；右侧空间不足/左侧更宽时换侧。
      const leftSpace = bubbleRect.left - DETAIL_MARGIN;
      const rightSpace = viewportW - (bubbleRect.right + DETAIL_MARGIN);
      let side: "left" | "right";
      if (leftSpace < DETAIL_CARD_WIDTH && rightSpace >= DETAIL_CARD_WIDTH) {
        side = "right";
      } else if (rightSpace < DETAIL_CARD_WIDTH && leftSpace >= DETAIL_CARD_WIDTH) {
        side = "left";
      } else {
        side = leftSpace >= rightSpace ? "left" : "right";
      }
      // 纵向：气泡在上半屏 → 卡片向下生长（top 对齐）；下半屏 → 向上（bottom 对齐）。
      const vpMid = viewportH / 2;
      const align: "top" | "bottom" =
        bubbleRect.top + bubbleRect.height / 2 < vpMid ? "top" : "bottom";
      return {
        side,
        align,
        top: bubbleRect.top - containerRect.top,
        bottom: containerRect.bottom - bubbleRect.bottom,
      };
    },
    [],
  );

  /** 立即展示某气泡的详情窗（定位基准 = 行元素 + 容器）. */
  const showDetail = useCallback(
    (key: string, bubbleEl: HTMLElement) => {
      const containerEl = containerRef.current;
      const entry = entryFor(key);
      if (!containerEl || !entry) return;
      setHoverDetail({ entry, key, ...buildPlacement(bubbleEl, containerEl) });
    },
    [containerRef, entryFor, buildPlacement],
  );

  /** 进入某气泡：清离开计时 → 进入延迟后展示. */
  const startHover = useCallback(
    (key: string, bubbleEl: HTMLElement) => {
      clearLeave();
      clearEnter();
      longPressedRef.current = false;
      enterTimerRef.current = setTimeout(() => {
        showDetail(key, bubbleEl);
      }, HOVER_ENTER_MS);
    },
    [clearLeave, clearEnter, showDetail],
  );

  /** 离开气泡列：清进入/长按计时 → 离开延迟后关闭. */
  const endHover = useCallback(() => {
    clearEnter();
    clearLongPress();
    // 触屏长按打开后不因指针离开即关（等下次点击外区关闭）。
    if (longPressedRef.current) return;
    clearLeave();
    leaveTimerRef.current = setTimeout(() => {
      setHoverDetail(null);
      hoverRowRef.current = null;
    }, HOVER_LEAVE_MS);
  }, [clearEnter, clearLongPress, clearLeave]);

  /** 详情窗获得指针：取消离开计时（保活）. */
  const onCardPointerEnter = useCallback(() => {
    clearLeave();
  }, [clearLeave]);

  /** 详情窗失去指针：启动离开计时. */
  const onCardPointerLeave = useCallback(() => {
    clearEnter();
    if (longPressedRef.current) return;
    clearLeave();
    leaveTimerRef.current = setTimeout(() => {
      setHoverDetail(null);
      hoverRowRef.current = null;
    }, HOVER_LEAVE_MS);
  }, [clearEnter, clearLeave]);

  /** 委托 pointerover：识别进入哪个气泡行（closest 命中 data-hover-key）. */
  const onPointerOver = useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (e) => {
      const rowEl = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-hover-key]") : null;
      if (!rowEl) return;
      const key = rowEl.dataset.hoverKey;
      if (!key) return;
      if (hoverRowRef.current === rowEl) return;
      hoverRowRef.current = rowEl;
      startHover(key, rowEl);
    },
    [startHover],
  );

  /** 委托 pointerout：离开气泡行时按 relatedTarget 决定是否启动离开计时. */
  const onPointerOut = useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (e) => {
      const rowEl = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-hover-key]") : null;
      if (!rowEl) return;
      const related = e.relatedTarget;
      // 移到详情窗/另一气泡行：各自的 enter 处理器接管（保活或重定悬停）。
      if (related instanceof Node && containerRef.current?.contains(related)) return;
      // 离开整个气泡列：启动离开计时。
      hoverRowRef.current = null;
      endHover();
    },
    [containerRef, endHover],
  );

  /** 委托 pointerdown：触屏长按进入详情. */
  const onPointerDown = useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (e) => {
      if (e.pointerType === "mouse") return;
      const rowEl = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-hover-key]") : null;
      if (!rowEl) return;
      // 徽标/拖拽手柄等交互子元素上不长按开详情（避免与按钮激活/收起冲突）：
      // 命中最近 data-jx-interactive 不是气泡行本身即视为交互子元素。
      if (
        e.target instanceof Element &&
        e.target.closest<HTMLElement>("[data-jx-interactive]") !== rowEl
      ) {
        return;
      }
      const key = rowEl.dataset.hoverKey;
      if (!key) return;
      clearLongPress();
      longPressOriginRef.current = { key, x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressedRef.current = true;
        clearEnter();
        showDetail(key, rowEl);
      }, LONG_PRESS_MS);
    },
    [clearLongPress, clearEnter, showDetail],
  );

  /** 委托 pointermove：长按期间移动超阈值则取消. */
  const onPointerMove = useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (e) => {
      const origin = longPressOriginRef.current;
      if (!origin) return;
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  /** 委托 pointerup/pointercancel：结束长按计时. */
  const onPointerUp = useCallback<React.PointerEventHandler<HTMLDivElement>>(() => {
    clearLongPress();
  }, [clearLongPress]);
  const onPointerCancel = onPointerUp;

  /** 捕获阶段点击：长按触发的合成 click 吞掉（不跳转会话）. */
  const onClickCapture = useCallback<React.MouseEventHandler<HTMLDivElement>>(
    (e) => {
      if (longPressedRef.current) {
        longPressedRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [],
  );

  // 详情打开期间：任意 pointerdown（含长按后停留态的再次触击、点气泡列内其他
  // 气泡、点详情卡、点列外）关闭详情并复位长按标志——触屏长按后的点击由捕获
  // 阶段 onClickCapture 抑制，此处负责把 stale 的长按标志清掉，保证下一次
  // 正常点击不被误吞；详情卡/气泡的打开动作由各自 onClick 负责。
  useEffect(() => {
    if (hoverDetail === null) return;
    const onDocPointerDown = (): void => {
      setHoverDetail(null);
      hoverRowRef.current = null;
      longPressedRef.current = false;
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [hoverDetail]);

  // 组件卸载：清全部计时器。
  useEffect(() => {
    return () => {
      if (enterTimerRef.current !== null) clearTimeout(enterTimerRef.current);
      if (leaveTimerRef.current !== null) clearTimeout(leaveTimerRef.current);
      if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  return {
    hoverDetail,
    onPointerOver,
    onPointerOut,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    onCardPointerEnter,
    onCardPointerLeave,
  };
}

// ---------------------------------------------------------------------------
// GroupBubble — 顶层归组气泡（内部组件）
// ---------------------------------------------------------------------------

/** GroupBubble props. */
interface GroupBubbleProps {
  /** 顶层归组数据（根条目 + 徽标 + current/pending 传播标志）. */
  group: BubbleGroup;
  /**
   * 生效展开态（ADR-0018 D6）：手动展开 || containsCurrent——驱动徽标箭头
   * 方向（▸/▾）与 aria-expanded；子气泡的实际渲染由列表层按同一判定插入.
   */
  expanded: boolean;
  /** 点击回调（传入根 sessionId）；当前根气泡不调用. */
  onOpen: (id: string) => void;
  /** 徽标激活回调：切换该组手动展开/收起（各组独立互不影响）. */
  onToggle: () => void;
  /** 退出态：true 时挂 leaving class 触发退出动画，不交互. */
  leaving?: boolean;
  /**
   * 保留模式总开关（ADR-0022 D6）：驱动可移除态判定 / 样式 / aria 说明；
   * false = 完全现状外观与交互（无收起语义）.
   */
  dragEnabled: boolean;
  /** 点击左侧手柄直接收起该会话；仅保留模式 && 该条目可移除时由父层提供. */
  onDismiss?: (() => void) | undefined;
}

/**
 * 渲染一个顶层归组气泡：根标题 + 根状态点 + 子代理徽标（按钮化，D4/D5）。
 *
 * - 金描边组合判定（D6 队长裁定）：root.isCurrent（根本身命中）或
 *   containsCurrent（current 落在本组后代中）→ 传播高亮。
 * - 朱砂描边（ADR-0020 pending-interaction-bubble-effect 组级聚合）：group.pending → .pending class +
 *   aria-label 追加「等待确认」；状态点仍按根本身自身状态渲染
 *   （dotPending 仅当根本身等待交互）——描边传播紧急信号、点位保持自身语义。
 * - 徽标即按钮（D4/D5）：role=button + tabIndex 键盘可激活；onClick /
 *   onKeyDown 对 Enter/Space 一律 stopPropagation——阻断冒泡到根气泡本体
 *   （点击不跳转、键盘不双重激活）；data-jx-interactive 双保险挂载
 *   （父气泡已带排除标记，closest() 命中同一属性，整盒拖动不触发）。
 *   aria-label 报告剩余子会话数，aria-expanded 反映生效展开态。
 *
 * 当前根气泡点击 no-op。leaving 态整组不交互（徽标 tabIndex 同步 -1）。
 *
 * 保留模式拖拽（工单02，ADR-0022 D4/C11/C12）：仅 completed 类条目可拖；
 * running/pending 气泡挂 .dragForbidden 禁止态（cursor:not-allowed + 弱化，
 * 朱砂紧急描边不受覆盖）；可拖条目 aria-label 追加拖拽/Delete 收起说明；
 * Delete/Backspace 收起聚焦气泡（当前会话允许——纯本地操作）。
 */
function GroupBubble({
  group,
  expanded,
  onOpen,
  onToggle,
  leaving,
  dragEnabled,
  onDismiss,
}: GroupBubbleProps) {
  const root = group.root;
  const handleClick = useCallback(() => {
    if (root.isCurrent || leaving) return;
    onOpen(root.sessionId);
  }, [root.isCurrent, root.sessionId, onOpen, leaving]);

  // 键盘激活合并：Enter/Space = 点击；Delete/Backspace = 收起。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && onDismiss) {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    },
    [handleClick, onDismiss],
  );

  // 可移除判定：保留模式开 && 仅 completed 类 && 组内无运行中成员。
  const rootFlags: DragEntryFlags = toDragFlags(root);
  const dismissible = dragEnabled && isBubbleRowDraggable(rootFlags, group.badge.running);

  // 徽标激活：阻断冒泡是硬约束——鼠标点击不落到根气泡 onClick 上。
  const handleBadgeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle();
    },
    [onToggle],
  );
  const handleBadgeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }
    },
    [onToggle],
  );

  const title = displayTitle(root);
  const highlighted = root.isCurrent || group.containsCurrent;
  const isPending = group.pending;
  const dotClass =
    root.pendingInteraction !== undefined
      ? styles.dotPending
      : root.running
        ? styles.dotRunning
        : styles.dotCompleted;
  const classes = [
    styles.bubble,
    highlighted ? styles.current : "",
    isPending ? styles.pending : "",
    dragEnabled && !dismissible ? styles.dragForbidden : "",
    dismissible ? styles.draggable : "",
    leaving ? styles.leaving : "",
  ].filter(Boolean).join(" ");

  const hasDescendants = group.badge.total > 0;

  return (
    <div
      className={classes}
      role="button"
      tabIndex={leaving ? -1 : 0}
      aria-label={`会话：${title}${isPending ? "（等待确认）" : ""}${
        root.isCurrent ? "（当前）" : ""
      }${dismissible ? "，点击左侧手柄收起，或按 Delete 收起" : ""}`}
      aria-current={root.isCurrent ? "true" : undefined}
      data-jx-interactive=""
      data-hover-key={root.sessionId}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* 左侧手柄：气泡外部，点击直接收起（ADR-0026 改型）。 */}
      {dismissible && (
        <span
          className={styles.dragHandle}
          role="button"
          tabIndex={0}
          aria-label="收起会话"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onDismiss?.();
            }
          }}
        />
      )}
      <span className={`${styles.dot} ${dotClass}`} aria-hidden="true" />
      <span className={styles.title}>{title}</span>
      {hasDescendants && (
        <span
          className={styles.badge}
          role="button"
          tabIndex={leaving ? -1 : 0}
          aria-label={`${expanded ? "收起" : "展开"} ${group.badge.total} 个子会话`}
          aria-expanded={expanded}
          data-jx-interactive=""
          onClick={handleBadgeClick}
          onKeyDown={handleBadgeKeyDown}
        >
          {group.badge.running > 0 && (
            <span className={styles.badgeRunningDot} />
          )}
          {/* 收起 ▸N / 展开 ▾N（PRD 实现决策 3 / ADR-0018 D4） */}
          {`${expanded ? "▾" : "▸"}${group.badge.total}`}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChildBubble — 组内子气泡（内部组件，工单03）
// ---------------------------------------------------------------------------

/** ChildBubble props. */
interface ChildBubbleProps {
  /** 组内成员条目（通过范围过滤的后代，携带自身 isCurrent/pending）. */
  entry: BubbleEntry;
  /** 点击回调（传入成员 sessionId）；当前会话子气泡不调用. */
  onOpen: (id: string) => void;
  /** 退出态：true 时挂 leaving class 触发退出动画，不交互. */
  leaving?: boolean;
  /**
   * 保留模式总开关（ADR-0022 D6）：驱动可移除态判定 / 样式 / aria 说明；
   * false = 完全现状外观与交互（无收起语义）.
   */
  dragEnabled: boolean;
  /**
   * 所属归组的运行中成员数（group.badge.running，队长追加需求 #2）：组内
   * 仍有运行中子代理时该行不可移除——与根气泡同一行级判定.
   */
  groupRunningMembers: number;
  /** 点击左侧手柄直接收起该会话；仅保留模式 && 该条目可移除时由父层提供. */
  onDismiss?: (() => void) | undefined;
}

/**
 * 渲染一个组内子气泡：成员标题 + 成员自身状态点。
 *
 * 样式走 .bubble.bubbleChild 组合：缩进/弱化背景/左连接线由 .bubbleChild
 * 承担（见 CSS 注释的金几何与令牌取色理由）；金描边（.current）、朱砂描边
 * （.pending）、涟漪点（.dotPending）等状态样式全部按成员自身标志挂载——
 * 子气泡各自保留自身 pending 样式、当前会话子气泡金描边。
 * 点击调 sessions.open(memberId) 直达子会话；当前会话子气泡点击无动作。
 * 出现/消失动效复用 .bubble 的 150ms enter / .leaving 100ms exit。
 *
 * 保留模式拖拽（工单02 + 队长追加需求 #2）：与 GroupBubble 同行级规则——
 * 仅 completed 类可移除、组内无运行中成员（groupRunningMembers）、
 * 禁止态样式、aria 说明、Delete/Backspace 收起。
 */
function ChildBubble({
  entry,
  onOpen,
  leaving,
  dragEnabled,
  groupRunningMembers,
  onDismiss,
}: ChildBubbleProps) {
  const handleClick = useCallback(() => {
    if (entry.isCurrent || leaving) return;
    onOpen(entry.sessionId);
  }, [entry.isCurrent, entry.sessionId, onOpen, leaving]);

  // 键盘激活合并：Enter/Space = 点击；Delete/Backspace = 收起。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && onDismiss) {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    },
    [handleClick, onDismiss],
  );

  const entryFlags: DragEntryFlags = toDragFlags(entry);
  const dismissible =
    dragEnabled && isBubbleRowDraggable(entryFlags, groupRunningMembers);

  const title = displayTitle(entry);
  const isPending = entry.pendingInteraction !== undefined;
  const dotClass = isPending
    ? styles.dotPending
    : entry.running
      ? styles.dotRunning
      : styles.dotCompleted;
  const classes = [
    styles.bubble,
    styles.bubbleChild,
    entry.isCurrent ? styles.current : "",
    isPending ? styles.pending : "",
    dragEnabled && !dismissible ? styles.dragForbidden : "",
    dismissible ? styles.draggable : "",
    leaving ? styles.leaving : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role="button"
      tabIndex={leaving ? -1 : 0}
      aria-label={`会话：${title}${isPending ? "（等待确认）" : ""}${
        entry.isCurrent ? "（当前）" : ""
      }${dismissible ? "，点击左侧手柄收起，或按 Delete 收起" : ""}`}
      aria-current={entry.isCurrent ? "true" : undefined}
      data-jx-interactive=""
      data-hover-key={entry.sessionId}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* 左侧手柄：气泡外部，点击直接收起。 */}
      {dismissible && (
        <span
          className={styles.dragHandle}
          role="button"
          tabIndex={0}
          aria-label="收起会话"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onDismiss?.();
            }
          }}
        />
      )}
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

/**
 * BubbleEntry → 拖拽判定三标志投影（审查 N11：单点派生，替代四处字面量
 * 拼装——GroupBubble 根 / ChildBubble 成员 / 列表层两处 onDismissKey 门控）。
 */
function toDragFlags(entry: BubbleEntry): DragEntryFlags {
  return {
    running: entry.running,
    pendingInteraction: entry.pendingInteraction,
    isCurrent: entry.isCurrent,
  };
}

/**
 * 可见渲染项快照：退出跟踪的存储单元（组粒度 + 子气泡粒度）。
 *
 * - kind 'group'：顶层组节点，键 = rootId；
 * - kind 'child'：组内成员节点，键 = `${rootId}:${sessionId}`，groupId 供
 *   渲染时归位到其父组之下。
 */
type RenderItem =
  | { readonly kind: "group"; readonly key: string; readonly group: BubbleGroup }
  | {
      readonly kind: "child";
      readonly key: string;
      readonly groupId: string;
      readonly entry: BubbleEntry;
    };

/** 整组退出单元：组连同其当时可见的成员一起淡出（键 rootId）. */
interface LeavingUnit {
  readonly group: BubbleGroup;
  readonly children: readonly Extract<RenderItem, { kind: "child" }>[];
}

/** SessionBubbleList props. */
export interface SessionBubbleListProps {
  /** 会话数据源（缺省时气泡列不渲染）. */
  sessions?: ISessions | undefined;
  /**
   * 工作区数据源（ADR-0022 D3/D8，工单03）：`workspaces.list` 快照供
   * archivedSessionIds 归档排除集派生 + `archiveSession` 真归档调用；
   * 缺省时归档区不渲染、归档排除为空集（收起区不受影响）.
   */
  workspaces?: IWorkspaces | undefined;
  /**
   * 详情窗预览 transport（工单 16-02；可选）。提供时悬停气泡按需拉取
   * 预览（骨架屏 + 失败静默）；缺失时详情窗仅显示标题，完整可用。
   * 推荐传入 `createPreviewCache(createDshPreviewTransport(api))`。
   */
  previewTransport?: PreviewTransport | undefined;
  /**
   * AI 动态标题 transport（工单 16-04；可选）。提供时详情窗书眉显示动态
   * 标题副题行（未配置 API 时整行隐藏）；缺失时副题行不渲染。
   * 推荐传入 `createDynamicTitleStore(createDshDynamicTitleTransport())`。
   */
  dynamicTitleTransport?: DynamicTitleTransport | undefined;
}

/**
 * 渲染会话气泡列（归组模型 + 展开交互，ADR-0018）。
 *
 * sessions 缺省时返回 null（静默空转）。无可见顶层组、无折叠、无退出中
 * 内容且保留模式关闭时不返回任何内容（浮层保持素净；保留模式下投放区
 * 常驻，PRD 用户故事 18）。
 *
 * @param props.sessions - 会话数据源。
 * @param props.workspaces - 工作区数据源（归档权威在 SDK，ADR-0022 D8）。
 * @returns 会话气泡列（+ 投放区），或 null。
 */
export function SessionBubbleList({
  sessions,
  workspaces,
  previewTransport,
  dynamicTitleTransport,
}: SessionBubbleListProps) {
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

  // 订阅保留模式配置（ADR-0022 D6）：总开关① + kept/dismissed 快照。
  const keepEnabled: boolean = useSyncExternalStore(
    subscribeKeepEnabled,
    getKeepEnabledSnapshot,
  );
  const keptIds: ReadonlySet<string> = useSyncExternalStore(
    subscribeKept,
    getKeptSnapshot,
  );
  const dismissedIds: ReadonlySet<string> = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
  );
  // 完成见闻集（ADR-0028 决策 1）：订阅 + 投影接线，与 kept/dismissed 同构。
  const seenIds: ReadonlySet<string> = useSyncExternalStore(
    subscribeSeen,
    getSeenSnapshot,
  );

  // 订阅 workspaces.list 快照（ADR-0022 D8，工单03）：归档权威在 SDK——
  // archivedSessionIds 每次从宿主快照派生，本地不重复记账归档态。workspaces
  // 缺省时订阅 noop、快照 undefined ⇒ 排除集为空（收起区不受影响）。
  const rawWorkspaceState = useSyncExternalStore(
    workspaces ? workspaces.list.subscribe : noopSubscribe,
    workspaces ? workspaces.list.getSnapshot : undefinedGetSnapshot,
  );

  // 组装投影上下文：两处 buildBubbleGroups 调用共用。恒传 context——开关关
  // 时走投影层 keepEnabled=false 总开关退化路径（输出与现状逐条目全等，
  // 记账集合被忽略），行为等价于不接线。归档排除集为 SDK 快照派生 Set
  // （引用仅随快照变化），开关②不进投影（其职责是归档区显隐）。
  const archivedIds = useMemo<ReadonlySet<string>>(
    () =>
      rawWorkspaceState === undefined
        ? EMPTY_ARCHIVED
        : new Set<string>(rawWorkspaceState.archivedSessionIds),
    [rawWorkspaceState],
  );
  const keepContext = useMemo<BubbleKeepContext>(
    () => ({
      keepEnabled,
      kept: keptIds,
      dismissed: dismissedIds,
      seen: seenIds,
      archived: archivedIds,
    }),
    [keepEnabled, keptIds, dismissedIds, seenIds, archivedIds],
  );

  // 派生 items + current（仅 rawState 变化时重算）。
  const items = useMemo(
    () =>
      rawState === undefined ? EMPTY_ITEMS : deriveSessionListEntries(rawState),
    [rawState],
  );
  const current = rawState?.current;

  // ---- 悬停详情窗（工单 16-02/16-04）------------------------------------
  // 气泡列容器 ref：详情窗定位基准（absolute 相对容器，随盒整体移动）。
  const bubbleListRef = useRef<HTMLDivElement | null>(null);

  // sessionId → 详情条目投影（含 displayTitle 回落）。
  const entryFor = useCallback(
    (sessionId: string): SessionBubbleDetailEntry | undefined => {
      const item = items.find((it) => it.sessionId === sessionId);
      if (item === undefined) return undefined;
      return {
        sessionId: item.sessionId,
        title: displayTitle(item),
        updatedAt: item.updatedAt,
        running: item.running,
        completed: item.completed,
        isCurrent: item.sessionId === current,
      };
    },
    [items, current],
  );
  const {
    hoverDetail,
    onPointerOver,
    onPointerOut,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    onCardPointerEnter,
    onCardPointerLeave,
  } = useHoverDetail(bubbleListRef, entryFor);

  // 详情窗定位样式（换侧 + 纵向对齐）。
  const detailStyle: React.CSSProperties | undefined = hoverDetail
    ? {
        position: "absolute",
        ...(hoverDetail.align === "top"
          ? { top: hoverDetail.top }
          : { bottom: hoverDetail.bottom }),
        ...(hoverDetail.side === "left"
          ? { right: "calc(100% + 12px)" }
          : { left: "calc(100% + 12px)" }),
        zIndex: 40,
      }
    : undefined;

  // 惰性裁剪（ADR-0022 D1，工单 01；ADR-0028 决策 2 相位门控）：宿主列表
  // 基线就绪（phase === "ready"）后才允许裁剪。SDK sessions.list 的初始快照
  // 是「已定义但为空 + pending 相位」，仅判 undefined 挡不住挂载首帧的空基线
  // ——曾导致每次页面加载把 kept/dismissed 记账全量误清（ADR-0028 背景事实）。
  // pending 期一律跳过；仍在列表外的 id 在投影层本就被惰性忽略（双保险）。
  // pruneKept/pruneDismissed 仅在确有删除时才写 localStorage 并通知——无删除
  // 路径零副作用，不产生写循环。
  useEffect(() => {
    if (rawState === undefined || rawState.phase !== "ready") return;
    const validIds = new Set<string>();
    for (const item of items) validIds.add(item.sessionId);
    pruneKept(validIds);
    pruneDismissed(validIds);
    pruneSeen(validIds);
  }, [rawState, items]);

  // 完成见闻集记账（ADR-0028 决策 1 / D-seen1）：凡投影中观察到
  // completed === true 的条目即提交见闻集（addSeen 幂等，无上一帧对照表）。
  // 记账与总开关无关——记账是事实记录，投影由 keepContext.keepEnabled 门控；
  // 关闭期间完成的会话同样留有记忆，重开开关后不丢提醒。
  useEffect(() => {
    for (const item of items) {
      if (item.completed) addSeen(item.sessionId);
    }
  }, [items]);

  // dismissed 生命周期（PRD §dismissed 生命周期 / 用户故事 13，工单02）：
  // 会话新一轮 completed 上升沿（上一帧 !completed → 本帧 completed）清除其
  // dismissed 记账——旧收起不吞新完成提醒。prev ref 模式对齐上方 prevItemsRef；
  // 首帧仅建基线（无上一帧则无上升沿）；clearDismissed 幂等，无记账零副作用。
  const prevCompletedRef = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    if (rawState === undefined) {
      prevCompletedRef.current = null;
      return;
    }
    const prev = prevCompletedRef.current;
    const nextMap = new Map<string, boolean>();
    for (const item of items) nextMap.set(item.sessionId, item.completed);
    prevCompletedRef.current = nextMap;
    if (prev === null) return;
    for (const item of items) {
      if (prev.get(item.sessionId) === false && item.completed) {
        clearDismissed(item.sessionId);
      }
    }
  }, [rawState, items]);

  // 展开态：true 时显示全部顶层组（不折叠）；false 时按 maxVisible 折叠。
  const [expanded, setExpanded] = useState(false);

  // 各组独立手动展开态（ADR-0018 D5）：Set<rootId>。
  // 生效展开态 = manualExpanded.has(rootId) || containsCurrent（D6 派生判定，
  // 无需副作用清理——current 离开某组后 containsCurrent 自然转假，自动回落
  // 手动状态）。
  const [manualExpanded, setManualExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const handleOpen = useCallback(
    (id: string) => {
      // sessionId 源自 SDK SessionSummary.id（branded SessionId），纯逻辑模块
      // 用 string 解耦，此处边界 cast 回 SDK SessionId 调 sessions.open。
      sessions?.open(id as SessionId);
      // 单击保留记账（ADR-0022 D1）：开关开且非当前会话 ⇒ 跳转照旧 + 把 id
      // 记入本地 kept 集合（SDK 清除 completed 位不可拦截，由客户端记账使
      // 气泡持续可见）。当前会话点击在上游已是 no-op（ADR-0007 决策4），此处
      // id !== current 为双保险——不跳转的路径绝不记账。开关关时零记账、
      // 零配置副作用。
      if (keepEnabled && id !== current) addKept(id);
    },
    [sessions, keepEnabled, current],
  );

  const handleToggleExpand = useCallback(() => {
    setExpanded((e) => !e);
  }, []);

  const handleToggleGroup = useCallback((rootId: string) => {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) {
        next.delete(rootId);
      } else {
        next.add(rootId);
      }
      return next;
    });
  }, []);

  // ---- 保留模式收起（ADR-0022 D7 + ADR-0026 改型）------------------------
  // 手柄点击直接收起：子组件内部消费 onClick，父层只提供稳定 dismiss 回调。
  const handleDismiss = useCallback(
    (id: string) => {
      if (!keepEnabled) return;
      addDismissed(id);
    },
    [keepEnabled],
  );

  // 计算可见顶层组：折叠态按 maxVisible 截取，展开态显示全部。
  // 始终计算折叠结果以驱动 MoreBubble 显示（折叠时「+N」/ 展开时「收起」）。
  // 两处调用共用保留上下文（ADR-0022 D1：kept/dismissed 过滤在纯逻辑层）。
  const folded = useMemo(
    () => buildBubbleGroups(items, current, maxVisible, keepContext),
    [items, current, maxVisible, keepContext],
  );
  const expandedResult = useMemo(
    () =>
      buildBubbleGroups(items, current, Number.MAX_SAFE_INTEGER, keepContext),
    [items, current, keepContext],
  );
  const visibleGroups = expanded ? expandedResult.groups : folded.groups;
  // MoreBubble 显示条件：折叠时有溢出（「+N」）或展开时有被折叠的组（「收起」）。
  const showMore = folded.moreCount > 0;

  // 生效展开判定（D6）：手动展开 或 current 在该组后代中。
  const isEffectivelyExpanded = useCallback(
    (group: BubbleGroup) =>
      manualExpanded.has(group.rootId) || group.containsCurrent,
    [manualExpanded],
  );

  // 可见渲染项扁平序列（组 + 其生效展开时的成员），供退出跟踪做键级 diff。
  const visibleItems = useMemo<readonly RenderItem[]>(() => {
    const list: RenderItem[] = [];
    for (const group of visibleGroups) {
      list.push({ kind: "group", key: group.rootId, group });
      if (isEffectivelyExpanded(group)) {
        for (const member of group.members) {
          list.push({
            kind: "child",
            key: `${group.rootId}:${member.sessionId}`,
            groupId: group.rootId,
            entry: member,
          });
        }
      }
    }
    return list;
  }, [visibleGroups, isEffectivelyExpanded]);

  // ---- 退出动效（双层粒度，ADR-0018 D9）---------------------------------
  // 整组消失 → LeavingUnit（组 + 当时可见成员一起淡出，键 rootId）；
  // 单个子消失而父组仍在（收起该组 / 成员被查看移出）→ 子粒度捕获
  //（键 `${rootId}:${sessionId}`）。每键独立计时器，BUBBLE_EXIT_MS 后移除。
  const [leavingUnits, setLeavingUnits] = useState<readonly LeavingUnit[]>([]);
  const [leavingChildren, setLeavingChildren] = useState<
    readonly Extract<RenderItem, { kind: "child" }>[]
  >([]);
  const prevItemsRef = useRef<readonly RenderItem[]>(visibleItems);
  // 每个 leaving 键的独立计时器（组键 rootId / 子键 `${rootId}:${sessionId}`），
  // 避免跨条目计时器干扰。
  const leaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const prev = prevItemsRef.current;
    prevItemsRef.current = visibleItems;

    if (prev === visibleItems) return;

    const currentKeys = new Set(visibleItems.map((it) => it.key));

    // 整组消失：捕获子树单元（组成员取上一帧可见快照），成员不再重复登记。
    const newlyLeavingGroupItems = prev.filter(
      (it): it is Extract<RenderItem, { kind: "group" }> =>
        it.kind === "group" && !currentKeys.has(it.key),
    );
    const leavingGroupIds = new Set(newlyLeavingGroupItems.map((it) => it.key));
    const newlyLeavingUnits: LeavingUnit[] = newlyLeavingGroupItems.map(
      (it) => ({
        group: it.group,
        children: prev.filter(
          (c): c is Extract<RenderItem, { kind: "child" }> =>
            c.kind === "child" && c.groupId === it.key,
        ),
      }),
    );

    // 单个子消失且父组仍在：按子粒度登记（键 `${rootId}:${sessionId}`）。
    const newlyLeavingChildren =
      prev.filter(
        (it): it is Extract<RenderItem, { kind: "child" }> =>
          it.kind === "child" &&
          !currentKeys.has(it.key) &&
          !leavingGroupIds.has(it.groupId),
      ) ?? [];

    if (newlyLeavingUnits.length === 0 && newlyLeavingChildren.length === 0) {
      return;
    }

    // 合入退出状态（各自去重）。
    if (newlyLeavingUnits.length > 0) {
      setLeavingUnits((prevUnits) => {
        const existingIds = new Set(prevUnits.map((u) => u.group.rootId));
        const merged = [...prevUnits];
        for (const unit of newlyLeavingUnits) {
          if (!existingIds.has(unit.group.rootId)) merged.push(unit);
        }
        return merged;
      });
    }
    if (newlyLeavingChildren.length > 0) {
      setLeavingChildren((prevChildren) => {
        const existingKeys = new Set(prevChildren.map((c) => c.key));
        const merged = [...prevChildren];
        for (const child of newlyLeavingChildren) {
          if (!existingKeys.has(child.key)) merged.push(child);
        }
        return merged;
      });
    }

    // 为每个退出键独立计时，互不干扰。
    for (const unit of newlyLeavingUnits) {
      const timer = setTimeout(() => {
        leaveTimersRef.current.delete(unit.group.rootId);
        setLeavingUnits((prevUnits) =>
          prevUnits.filter((u) => u.group.rootId !== unit.group.rootId),
        );
      }, BUBBLE_EXIT_MS);
      leaveTimersRef.current.set(unit.group.rootId, timer);
    }
    for (const child of newlyLeavingChildren) {
      const timer = setTimeout(() => {
        leaveTimersRef.current.delete(child.key);
        setLeavingChildren((prevChildren) =>
          prevChildren.filter((c) => c.key !== child.key),
        );
      }, BUBBLE_EXIT_MS);
      leaveTimersRef.current.set(child.key, timer);
    }
  }, [visibleItems]);

  // 组件卸载时清除所有 pending 计时器，避免 state 更新已卸载组件。
  useEffect(() => {
    return () => {
      for (const timer of leaveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      leaveTimersRef.current.clear();
    };
  }, []);

  // 无可见顶层组、无折叠、无退出中内容且无收起区时不渲染（浮层保持素净）；
  // 保留模式下收起区常驻（投放目标始终可得，PRD 用户故事 18）。
  if (
    visibleGroups.length === 0 &&
    !showMore &&
    leavingUnits.length === 0 &&
    leavingChildren.length === 0 &&
    !keepEnabled
  ) {
    return null;
  }

  return (
    <Fragment>
      <div
        className={`${styles.bubbleList} dsh-session-bubble-root`}
        ref={bubbleListRef}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
      {visibleGroups.map((group) => {
        const groupEffectiveExpanded = isEffectivelyExpanded(group);
        // 该组仍在退出中的成员（父组仍可见 → 紧随其活成员之后渲染淡出）。
        const groupLeavingChildren = leavingChildren.filter(
          (c) => c.groupId === group.rootId,
        );
        // 根行可移除 ⇒ 提供 Delete/Backspace 收起回调（ADR-0022 D7；组内
        // 运行中成员锁整组，队长追加需求 #2）。
        const rootDraggable = isBubbleRowDraggable(
          toDragFlags(group.root),
          group.badge.running,
        );
        return (
          <Fragment key={group.rootId}>
            <GroupBubble
              group={group}
              expanded={groupEffectiveExpanded}
              onOpen={handleOpen}
              onToggle={() => handleToggleGroup(group.rootId)}
              dragEnabled={keepEnabled}
              onDismiss={
                rootDraggable ? () => handleDismiss(group.rootId) : undefined
              }
            />
            {groupEffectiveExpanded &&
              group.members.map((member) => {
                const memberDraggable = isBubbleRowDraggable(
                  toDragFlags(member),
                  group.badge.running,
                );
                return (
                  <ChildBubble
                    key={`${group.rootId}:${member.sessionId}`}
                    entry={member}
                    onOpen={handleOpen}
                    dragEnabled={keepEnabled}
                    groupRunningMembers={group.badge.running}
                    onDismiss={
                      memberDraggable
                        ? () => handleDismiss(member.sessionId)
                        : undefined
                    }
                  />
                );
              })}
            {groupLeavingChildren.map((child) => (
              <ChildBubble
                key={`leaving-${child.key}`}
                entry={child.entry}
                onOpen={handleOpen}
                leaving
                dragEnabled={keepEnabled}
                groupRunningMembers={group.badge.running}
              />
            ))}
          </Fragment>
        );
      })}
      {/* 整组退出单元：组连同当时可见成员一起淡出（渲染于全部活组之后） */}
      {leavingUnits.map(({ group, children }) => (
        <Fragment key={`leaving-${group.rootId}`}>
          <GroupBubble
            group={group}
            expanded={false}
            onOpen={handleOpen}
            onToggle={() => handleToggleGroup(group.rootId)}
            leaving
            dragEnabled={keepEnabled}
          />
          {children.map((child) => (
            <ChildBubble
              key={`leaving-${child.key}`}
              entry={child.entry}
              onOpen={handleOpen}
              leaving
              dragEnabled={keepEnabled}
              groupRunningMembers={group.badge.running}
            />
          ))}
        </Fragment>
      ))}
      {showMore && (
        <MoreBubble
          expanded={expanded}
          moreCount={folded.moreCount}
          onToggle={handleToggleExpand}
        />
      )}
      {/* 悬停详情窗（工单 16-02/16-04）：书页卡片，随盒整体移动。 */}
      {hoverDetail !== null && (
        <SessionBubbleDetail
          entry={hoverDetail.entry}
          onOpen={() => handleOpen(hoverDetail.entry.sessionId)}
          previewTransport={previewTransport}
          dynamicTitleTransport={dynamicTitleTransport}
          onPointerEnter={onCardPointerEnter}
          onPointerLeave={onCardPointerLeave}
          style={detailStyle}
        />
      )}
      </div>
    </Fragment>
  );
}
