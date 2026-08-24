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
 * 收起区拖拽（ADR-0022 D2/D3/D4/D7/D9，工单02）：保留模式下仅 completed 类
 * 气泡行可移除（isBubbleRowDraggable 统一判定：自身 flags + 组内无运行中
 * 成员——有子代理还在运行就不是可移除的气泡，队长追加需求 #2；门控臂态/
 * 绿线指示/键盘收起）；pointerdown 记起点 + setPointerCapture，
 * 位移超 DRAG_THRESHOLD_PX(8px) 进入拖动态——直接写 DOM style.transform 跟手
 * （不经 React state，避免高频重渲染）；pointerup 以 elementFromPoint →
 * closest("[data-jx-zone]") 解析落点，resolveDragAction 判定：dismiss ⇒
 * addDismissed 记账（投影变化走既有 leaving 淡出）、click 放行原生路径、
 * 其余弹回原位（CSS transition 弹回，reduced-motion 直接复位）。拖拽发生过
 * 必吞合成 click（容器 onClickCapture 消费一次 suppressClickRef，防「拖完又
 * 跳转」）。收起区常驻渲染于整列正下方 8px（data-jx-zone="dismiss"），归档区
 * 本片不渲染。running/pending 气泡挂 .dragForbidden 禁止态；可拖条目 aria-label
 * 追加拖拽说明；Delete/Backspace 收起聚焦气泡（当前会话允许，归档无键盘路径）；
 * completed 上升沿清除 dismissed 记账（旧收起不吞新提醒）。
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
  DRAG_THRESHOLD_PX,
  isBubbleRowDraggable,
  resolveDragAction,
  type BubbleEntry,
  type BubbleGroup,
  type BubbleKeepContext,
  type DragEntryFlags,
  type DropZoneKind,
  type SessionListEntry,
} from "../state-machine/session-bubbles.ts";
import { deriveSessionListEntries } from "../state-machine/session-list-adapter.ts";
import {
  subscribeMaxSessionBubbles,
  getMaxSessionBubblesSnapshot,
} from "../session-bubbles-config.ts";
import {
  addDismissed,
  addKept,
  clearDismissed,
  getArchiveDragEnabledSnapshot,
  getDismissedSnapshot,
  getKeepEnabledSnapshot,
  getKeptSnapshot,
  pruneDismissed,
  pruneKept,
  subscribeArchiveDragEnabled,
  subscribeDismissed,
  subscribeKeepEnabled,
  subscribeKept,
} from "../state-machine/session-bubble-keep-config.ts";
import styles from "../styles/session-bubbles.module.css";

/** 气泡退出动画时长 ms（DESIGN.md §6 退出快于进入）. */
const BUBBLE_EXIT_MS = 100;

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
// GroupBubble — 顶层归组气泡（内部组件）
// ---------------------------------------------------------------------------

/** 保留模式拖拽手势回调包（父层稳定引用，useMemo 包裹；门控在父层 pointerdown 内）. */
interface BubbleDragHandlers {
  /** 按下：记录起点并尝试指针捕获（仅可移除行实际生效）. */
  readonly onPointerDown: (
    e: React.PointerEvent<HTMLElement>,
    id: string,
    flags: DragEntryFlags,
    groupRunningMembers: number,
  ) => void;
  /** 移动：超阈值进入拖动态后直接写 DOM transform 跟手（不走 React state）. */
  readonly onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  /** 松手：落点解析 zone → resolveDragAction 判定（click 放行 / dismiss 记账 / 其余弹回）. */
  readonly onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  /** 打断（pointercancel）：复位弹回、吞合成 click、不记账. */
  readonly onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
}

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
   * 保留模式总开关（ADR-0022 D6）：驱动可拖态判定 / 禁止态样式 / aria 说明；
   * false = 完全现状外观与交互（无拖拽语义）.
   */
  dragEnabled: boolean;
  /** 拖拽手势回调包（工单02）. */
  dragHandlers: BubbleDragHandlers;
  /** Delete/Backspace 收起回调；仅保留模式 && 该条目可拖时由父层提供. */
  onDismissKey?: (() => void) | undefined;
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
  dragHandlers,
  onDismissKey,
}: GroupBubbleProps) {
  const root = group.root;
  const handleClick = useCallback(() => {
    if (root.isCurrent || leaving) return;
    onOpen(root.sessionId);
  }, [root.isCurrent, root.sessionId, onOpen, leaving]);

  // 键盘激活合并（工单02 C12）：Enter/Space = 点击语义；Delete/Backspace =
  // 收起聚焦气泡（onDismissKey 由父层按「保留模式 && 可拖」提供；归档刻意
  // 无键盘路径）。stopPropagation 防止按键同时触发徽标折叠等上层行为。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && onDismissKey) {
        e.preventDefault();
        e.stopPropagation();
        onDismissKey();
      }
    },
    [handleClick, onDismissKey],
  );

  // 保留模式拖拽判定输入（ADR-0022 D4）：根条目自身的三标志投影。
  const rootFlags: DragEntryFlags = toDragFlags(root);
  // 可拖 = 保留模式开 && 仅 completed 类 && 组内无运行中成员（队长追加需求
  // #2：有子代理还在运行就不是可移除的气泡——badge.running 为组内运行中
  // 成员计数，归组模型已折叠全部嵌套后代）。禁止态只在保留模式下呈现——
  // 总开关关时完全回到现状外观（回归护栏精神）。
  const draggable = dragEnabled && isBubbleRowDraggable(rootFlags, group.badge.running);

  // 徽标激活：阻断冒泡是硬约束（D5）——鼠标点击不落到根气泡 onClick 上
  //（否则触发 sessions.open 跳转），键盘 Enter/Space 不冒泡到根气泡的
  // handleKeyDown（否则一次按键同时展开+跳转）。
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
  // 描边传播：根本身命中或 current 在后代中 → 金描边（D6）。
  const highlighted = root.isCurrent || group.containsCurrent;
  // 组级紧急信号（ADR-0020 pending-interaction-bubble-effect 组级聚合，队长裁定）：根或任一入选成员等待交互。
  const isPending = group.pending;
  // 状态点保持根会话自身语义（ADR-0020 pending-interaction-bubble-effect 分组裁定）：朱砂涟漪点仅当根本身
  // 等待交互；否则金呼吸（运行中）/ 石绿实心（已完成）。
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
    dragEnabled && !draggable ? styles.dragForbidden : "",
    // 可移除指示线（队长追加需求）：保留模式下可拖拽收纳的条目——左缘绿竖线
    draggable ? styles.draggable : "",
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
      }${draggable ? "，可拖至收起区移除，或按 Delete 收起" : ""}`}
      aria-current={root.isCurrent ? "true" : undefined}
      data-jx-interactive=""
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(e) =>
        dragHandlers.onPointerDown(e, root.sessionId, rootFlags, group.badge.running)
      }
      onPointerMove={dragHandlers.onPointerMove}
      onPointerUp={dragHandlers.onPointerUp}
      onPointerCancel={dragHandlers.onPointerCancel}
    >
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
   * 保留模式总开关（ADR-0022 D6）：驱动可拖态判定 / 禁止态样式 / aria 说明；
   * false = 完全现状外观与交互（无拖拽语义）.
   */
  dragEnabled: boolean;
  /** 拖拽手势回调包（工单02）. */
  dragHandlers: BubbleDragHandlers;
  /**
   * 所属归组的运行中成员数（group.badge.running，队长追加需求 #2）：组内
   * 仍有运行中子代理时该行不可移除——与根气泡同一行级判定.
   */
  groupRunningMembers: number;
  /** Delete/Backspace 收起回调；仅保留模式 && 该条目可拖时由父层提供. */
  onDismissKey?: (() => void) | undefined;
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
  dragHandlers,
  groupRunningMembers,
  onDismissKey,
}: ChildBubbleProps) {
  const handleClick = useCallback(() => {
    if (entry.isCurrent || leaving) return;
    onOpen(entry.sessionId);
  }, [entry.isCurrent, entry.sessionId, onOpen, leaving]);

  // 键盘激活合并（工单02 C12）：Enter/Space = 点击；Delete/Backspace = 收起。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && onDismissKey) {
        e.preventDefault();
        e.stopPropagation();
        onDismissKey();
      }
    },
    [handleClick, onDismissKey],
  );

  // 成员自身的拖拽判定三标志投影（ADR-0022 D4）。
  const entryFlags: DragEntryFlags = toDragFlags(entry);
  // 行级可移除判定（队长追加需求 #2）：与根气泡同规则——组内仍有运行中
  // 子代理（groupRunningMembers > 0）时整组不可移除。
  const draggable =
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
    dragEnabled && !draggable ? styles.dragForbidden : "",
    // 可移除指示线（队长追加需求）：同根气泡语义
    draggable ? styles.draggable : "",
    leaving ? styles.leaving : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role="button"
      tabIndex={leaving ? -1 : 0}
      aria-label={`会话：${title}${isPending ? "（等待确认）" : ""}${
        entry.isCurrent ? "（当前）" : ""
      }${draggable ? "，可拖至收起区移除，或按 Delete 收起" : ""}`}
      aria-current={entry.isCurrent ? "true" : undefined}
      data-jx-interactive=""
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(e) =>
        dragHandlers.onPointerDown(e, entry.sessionId, entryFlags, groupRunningMembers)
      }
      onPointerMove={dragHandlers.onPointerMove}
      onPointerUp={dragHandlers.onPointerUp}
      onPointerCancel={dragHandlers.onPointerCancel}
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
export function SessionBubbleList({ sessions, workspaces }: SessionBubbleListProps) {
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

  // 订阅保留模式配置（ADR-0022 D6）：总开关① + 开关② + kept/dismissed 快照。
  const keepEnabled: boolean = useSyncExternalStore(
    subscribeKeepEnabled,
    getKeepEnabledSnapshot,
  );
  const archiveDragEnabled: boolean = useSyncExternalStore(
    subscribeArchiveDragEnabled,
    getArchiveDragEnabledSnapshot,
  );
  const keptIds: ReadonlySet<string> = useSyncExternalStore(
    subscribeKept,
    getKeptSnapshot,
  );
  const dismissedIds: ReadonlySet<string> = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
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
      archived: archivedIds,
    }),
    [keepEnabled, keptIds, dismissedIds, archivedIds],
  );

  // 派生 items + current（仅 rawState 变化时重算）。
  const items = useMemo(
    () =>
      rawState === undefined ? EMPTY_ITEMS : deriveSessionListEntries(rawState),
    [rawState],
  );
  const current = rawState?.current;

  // 惰性裁剪（ADR-0022 D1，工单 01）：宿主列表镜像变化时，把记账集合中已
  // 不在列表的 id 清除（集合不膨胀）。pruneKept/pruneDismissed 仅在确有删除
  // 时才写 localStorage 并通知——无删除路径零副作用，不产生写循环。rawState
  // 缺省（无数据源/挂载早期）时不裁剪，避免空列表误清持久化记忆；仍在列表
  // 外的 id 在投影层本就被惰性忽略（双保险）。
  useEffect(() => {
    if (rawState === undefined) return;
    const validIds = new Set<string>();
    for (const item of items) validIds.add(item.sessionId);
    pruneKept(validIds);
    pruneDismissed(validIds);
  }, [rawState, items]);

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

  // ---- 保留模式拖拽手势（ADR-0022 D2/D3/D9，工单02）----------------------
  // 手势状态全走 ref：跟随用直接 DOM style.transform，不经 React state
  // （pointermove 高频触发，state 化会每帧重渲染整列）。
  //
  // 迷雾实测结论（map.md 迷雾①）：setPointerCapture 后浏览器仍会在捕获元素
  // 上合成 click（pointerdown/up 目标同为被捕获元素，大位移拖拽也不例外），
  // 因此「拖拽发生过 ⇒ 必须显式吞掉紧随的合成 click」——由 suppressClickRef
  // + 容器 onClickCapture 捕获阶段消费一次实现；未超阈值的按下-松手不置位
  // suppressClickRef，原生 click（跳转+记账）完全不受影响。
  interface BubbleGesture {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly id: string;
    readonly flags: DragEntryFlags;
    readonly el: HTMLElement;
    /** 是否已超阈值进入拖动态（false = 仍是潜在点击，up 时放行原生 click）。 */
    active: boolean;
  }
  const bubbleGestureRef = useRef<BubbleGesture | null>(null);
  const suppressClickRef = useRef(false);
  // 弹回挂起清理句柄（审查 N10）：springBackBubble 登记的监听/定时器取消器。
  const springBackCleanupsRef = useRef<Set<() => void>>(new Set());

  const handleBubblePointerDown = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      id: string,
      flags: DragEntryFlags,
      groupRunningMembers: number,
    ) => {
      // 新按压 = 新交互周期（审查 S2）：清掉上一次 pointercancel 可能残留的
      // 吞 click 标记——cancel 后浏览器通常不再合成 click，标记无人消费会
      // 残留并吞掉下一次正常点击。同手势的 up→click 消费序列恒先于下一次
      // pointerdown，此处重置不会误清未消费的当次标记。
      suppressClickRef.current = false;
      if (!keepEnabled) return; // 总开关关 = 无拖拽范式（现状回归）
      // 行级可移除判定（D4 + 队长追加需求 #2）：自身 running/pending 不进
      // 臂态；组内仍有运行中成员时整组同样不进（进行中的工作流不许收纳）。
      if (!isBubbleRowDraggable(flags, groupRunningMembers)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return; // 仅主键启动
      bubbleGestureRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        id,
        flags,
        el: e.currentTarget,
        active: false,
      };
      // 指针捕获：拖出气泡范围仍持续收到 move/up（触屏必需）。
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 个别环境无活动指针时抛错——降级为仅元素内跟踪，不影响点击。
      }
    },
    [keepEnabled],
  );

  /** 弹回原位：清 transform；reduced-motion 直接复位，否则 CSS transition 弹回。 */
  const springBackBubble = useCallback((el: HTMLElement) => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.style.transform = "";
      return;
    }
    el.style.transition = "transform 180ms cubic-bezier(0.16, 1, 0.3, 1)";
    el.style.transform = "";
    // 审查 N10：弹回的 transitionend 监听与兜底定时器登记到组件级集合，
    // 卸载时集中取消并复位——不随组件生命周期自动清理的句柄不留悬挂。
    const clear = () => {
      window.clearTimeout(timer);
      el.removeEventListener("transitionend", clear);
      el.style.transition = "";
      springBackCleanupsRef.current.delete(cancel);
    };
    const timer = window.setTimeout(clear, 260);
    const cancel = () => {
      window.clearTimeout(timer);
      el.removeEventListener("transitionend", clear);
      // 卸载路径直接复位内联样式，不留半态。
      el.style.transition = "";
      el.style.transform = "";
      springBackCleanupsRef.current.delete(cancel);
    };
    springBackCleanupsRef.current.add(cancel);
    el.addEventListener("transitionend", clear);
  }, []);

  // 卸载清理（审查 N10）：取消全部挂起的弹回句柄（监听 + 兜底定时器）并
  // 直接复位内联样式，对齐 React 生命周期纪律。
  useEffect(() => {
    const pending = springBackCleanupsRef.current;
    return () => {
      for (const cancel of pending) cancel();
      pending.clear();
    };
  }, []);

  const handleBubblePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const g = bubbleGestureRef.current;
      if (g === null || g.pointerId !== e.pointerId) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        g.active = true; // 超阈值进入拖态（ADR-0022 D9）
      }
      g.el.style.transform = `translate(${dx}px, ${dy}px)`;
    },
    [],
  );

  const handleBubblePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const g = bubbleGestureRef.current;
      if (g === null || g.pointerId !== e.pointerId) return;
      bubbleGestureRef.current = null;
      if (g.active) suppressClickRef.current = true; // 打断也吞合成 click
      springBackBubble(g.el); // 零记账
    },
    [springBackBubble],
  );

  const handleBubblePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const g = bubbleGestureRef.current;
      if (g === null || g.pointerId !== e.pointerId) return;
      bubbleGestureRef.current = null;
      if (!g.active) return; // 未超阈值 ⇒ 原生 click 自然发生（跳转+记账不动）
      // 拖拽发生过 ⇒ 必吞紧随的合成 click（防「拖完又跳转」，见迷雾注）。
      suppressClickRef.current = true;
      // 落点解析：elementFromPoint → 最近 [data-jx-zone] 祖先（收起区/归档区
      // 均挂此标记；zone 归一化为 DropZoneKind，喂判定矩阵）。
      const hit =
        typeof document !== "undefined"
          ? document.elementFromPoint(e.clientX, e.clientY)
          : null;
      const zoneAttr = hit
        ?.closest("[data-jx-zone]")
        ?.getAttribute("data-jx-zone");
      const zone: DropZoneKind | undefined =
        zoneAttr === "dismiss" || zoneAttr === "archive" ? zoneAttr : undefined;
      const verdict = resolveDragAction({
        movedPx: Math.hypot(e.clientX - g.startX, e.clientY - g.startY),
        zone,
        flags: g.flags,
      });
      if (verdict === "dismiss") {
        // 本地隐藏记账 → 投影变化 → 既有 leaving 淡出机制接管视觉移除
        //（复用 ADR-0018 D9 双层退出跟踪，勿另写动画）。
        addDismissed(g.id);
        return;
      }
      if (verdict === "archive") {
        // 真归档（ADR-0022 D3/D8，工单03）：归档权威在 SDK——调
        // workspaces.archiveSession；成功后宿主 archivedSessionIds 快照更新
        // ⇒ 排除集派生变化 ⇒ 投影移除该会话（气泡淡出 + 侧边栏同步隐藏，
        // 永不复活）。失败静默：无错误 UI，气泡不消失即为失败信号。
        // 当前泡×归档已被判定矩阵拦为 forbidden（D5），不会走到这里。
        void workspaces?.archiveSession(g.id as SessionId).catch(() => {
          // 静默吞掉 RPC 失败（ADR-0022 D3「失败静默」约定）。
        });
        return;
      }
      // forbidden / 未命中：弹回原位，零记账。
      springBackBubble(g.el);
    },
    [springBackBubble, workspaces],
  );

  // 手势回调包（稳定引用：子组件 props 与其 useCallback deps 不抖动）。
  const dragHandlers = useMemo<BubbleDragHandlers>(
    () => ({
      onPointerDown: handleBubblePointerDown,
      onPointerMove: handleBubblePointerMove,
      onPointerUp: handleBubblePointerUp,
      onPointerCancel: handleBubblePointerCancel,
    }),
    [
      handleBubblePointerDown,
      handleBubblePointerMove,
      handleBubblePointerUp,
      handleBubblePointerCancel,
    ],
  );

  // 容器级捕获阶段消费一次合成 click：拖拽后的防跳转闸门。React 合成事件
  // 捕获阶段自外向内，先于气泡自身 onClick 执行——stopPropagation 后气泡
  // 点击处理器不再触发。未发生拖拽时零介入（ref 为 false 直通）。
  const handleContainerClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
    [],
  );

  // 键盘收起（ADR-0022 D7）：Delete/Backspace 收起聚焦气泡；当前会话允许
  // （纯本地操作无副作用）；归档刻意无键盘路径（危险操作保持拖拽仪式感）。
  const handleDismissKey = useCallback(
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
      <div className={styles.bubbleList} onClickCapture={handleContainerClickCapture}>
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
              dragHandlers={dragHandlers}
              onDismissKey={
                rootDraggable ? () => handleDismissKey(group.rootId) : undefined
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
                    dragHandlers={dragHandlers}
                    groupRunningMembers={group.badge.running}
                    onDismissKey={
                      memberDraggable
                        ? () => handleDismissKey(member.sessionId)
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
                dragHandlers={dragHandlers}
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
            dragHandlers={dragHandlers}
          />
          {children.map((child) => (
            <ChildBubble
              key={`leaving-${child.key}`}
              entry={child.entry}
              onOpen={handleOpen}
              leaving
              dragEnabled={keepEnabled}
              dragHandlers={dragHandlers}
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
      {/* 收起区（近放，ADR-0022 D3 / PRD 用户故事 2/18，工单02）：保留模式下
          常驻于整列正下方留 8px 间隙、右缘与列对齐——.bubbleList 自身是
          position:absolute 包含块，子级 top: calc(100% + 8px) 即锚定其盒下方。
          挂 data-jx-zone="dismiss" 供 pointerup 落点解析（elementFromPoint →
          closest）。静态呈现无动画，prefers-reduced-motion 天然无需降级分支。 */}
      {keepEnabled && (
        <div
          className={styles.dismissZone}
          data-jx-zone="dismiss"
          role="note"
          aria-label="收起区：把气泡拖到这里可暂时隐藏该会话提醒，也可对气泡按 Delete 收起"
        >
          <span aria-hidden="true">收起</span>
        </div>
      )}
      </div>
      {/* 归档区（远放·角色脚边，ADR-0022 D3 / PRD 用户故事 3/5/8/9/18，工单03）：
          双开关门控——总开关①与「拖拽归档会话」②同时开启才渲染（②关 = 仅剩
          收起区）。锚定浮层盒（.overlay 是 position:fixed 包含块）正下方居中，
          与列下收起区横向相隔整个盒宽——远近分置本身即防误触栏。朱砂警示描边 +
          title hover 提示「归档后从列表隐藏，不可恢复」。挂
          data-jx-zone="archive" 接入既有落点解析；当前泡×归档 forbidden 由
          判定矩阵在落点拦截（D5），归档调用失败静默（ADR-0022 D3）。 */}
      {keepEnabled && archiveDragEnabled && (
        <div
          className={styles.archiveZone}
          data-jx-zone="archive"
          role="note"
          aria-label="归档区：把气泡拖到这里将归档该会话——从列表隐藏且不可恢复"
          title="归档后从列表隐藏，不可恢复"
        >
          <span aria-hidden="true">归档</span>
        </div>
      )}
    </Fragment>
  );
}
