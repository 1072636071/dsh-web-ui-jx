/**
 * SessionBubblePreview — 气泡内容弹框（hover 预览会话问话，ADR-0031 / PRD 14 工单 02/03）。
 *
 * 鼠标 hover 会话气泡浮现的 tooltip 浮层：会话标题 + 一排问话胶囊 + 问话详情区。
 * 默认展开最后一个胶囊（详情区显示最新问话完整内容）；hover 某胶囊 → 详情区
 * 切换；点击胶囊 → 与点击气泡同一跳转路径（sessions.open + kept 记账），跳转
 * 后收起弹框。折叠/选中/摘要/视口定位等决策全部走
 * state-machine/session-bubble-preview.ts 纯逻辑（可测 seam），本文件只做
 * React 接线 + hover 生命周期 + fetch 缓存。
 *
 * hover 生命周期（用户故事 10/11/15）：
 *   - 气泡 pointerenter → debounce（HOVER_SHOW_DELAY_MS）后浮现；弹框已开时
 *     切目标即时跟随（不串会话）；
 *   - 气泡 pointerleave → 宽限期（HIDE_GRACE_MS）后消失，期间指针移入弹框
 *     则取消（弹框可交互：胶囊 hover/点击/滚动）；
 *   - 弹框 pointerleave → 同宽限期消失。
 *
 * 数据链路（D6 debounce + 缓存）：hover 命中才 fetch
 * `/api/dsh-jx/session/<id>/messages`（host `sessionController.inspect`
 * 无副作用读）；缓存 key = `sessionId:updatedAt`——会话有新活动（updatedAt
 * 上升）自动失效，无定时器、无手动失效面；in-flight 去重防同 key 并发重复
 * 打路由；缓存容量上限防极长会话列表下无界增长（超限逐出最早条目）。
 *
 * 交互分流（D6 / 用户故事 12/13）：弹框经 createPortal 挂 document.body
 * （position:fixed 视口坐标——浮层祖先带 transform，盒内 fixed 会失效），
 * 挂 data-jx-interactive 不触发整盒拖动；既有气泡点击/保留记账/手柄收起
 * 语义零改动（本组件只新增 pointerenter/leave 旁路监听）。
 *
 * 样式消费语义别名 + --jx-* 专属轨（session-bubble-preview.module.css），
 * 深浅双主题可读、无颜色字面量；prefers-reduced-motion 下动画全关
 * （instant 切换）。
 *
 * @module dsh-session-bubble
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  capsuleLayout,
  computePopupPlacement,
  parsePreviewResponse,
  resolveSelectedIndex,
  POPUP_GAP_PX,
  POPUP_MAX_HEIGHT_PX,
  POPUP_WIDTH_PX,
  type AnchorRect,
  type SessionPreviewData,
} from "./session-bubble-preview.ts";
import styles from "./styles/session-bubble-preview.module.css";

// ---------------------------------------------------------------------------
// hover 节奏常量
// ---------------------------------------------------------------------------

/** hover 气泡到弹框浮现的防抖时长 ms（掠过的泡不弹，D6 debounce）. */
const HOVER_SHOW_DELAY_MS = 180;

/** 指针离开气泡/弹框后的宽限期 ms（允许穿越 8px 间隙进入弹框）. */
const HIDE_GRACE_MS = 160;

/** 弹框退出动画时长 ms（DESIGN.md §6 退出快于进入；对齐气泡列 BUBBLE_EXIT_MS）. */
const PREVIEW_EXIT_MS = 100;

/** 结果缓存条目上限（超限逐出最早写入，防无界增长）. */
const PREVIEW_CACHE_MAX = 64;

// ---------------------------------------------------------------------------
// fetch + 缓存（模块级：跨气泡/跨挂载共享；热重载随模块重建自然清零）
// ---------------------------------------------------------------------------

const previewCache = new Map<string, SessionPreviewData>();
const inflight = new Map<string, Promise<SessionPreviewData | null>>();

/**
 * 拉取会话问话预览：缓存命中直接返回；同 key 并发去重；解析失败/网络失败
 * 返回 null（调用方显示失败占位，不写缓存——下次 hover 可重试）。
 *
 * @param sessionId - 会话 id。
 * @param updatedAt - 会话列表快照的 updatedAt（并入缓存 key，新活动自动失效）。
 */
function loadPreview(
  sessionId: string,
  updatedAt: number,
): Promise<SessionPreviewData | null> {
  const key = `${sessionId}:${updatedAt}`;
  const cached = previewCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const running = inflight.get(key);
  if (running !== undefined) return running;
  const task = (async (): Promise<SessionPreviewData | null> => {
    try {
      const res = await fetch(
        `/api/dsh-jx/session/${encodeURIComponent(sessionId)}/messages`,
      );
      if (!res.ok) return null;
      const data = parsePreviewResponse(await res.json());
      if (data === null) return null;
      if (previewCache.size >= PREVIEW_CACHE_MAX) {
        // Map 迭代序 = 写入序：逐出最早条目
        const oldest = previewCache.keys().next();
        if (!oldest.done) previewCache.delete(oldest.value);
      }
      previewCache.set(key, data);
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

// ---------------------------------------------------------------------------
// useBubblePreview — hover 生命周期 + 数据装载（SessionBubbleList 接线用）
// ---------------------------------------------------------------------------

/** 当前预览目标（气泡视口矩形 + 标识 + 缓存键原料）. */
export interface PreviewTarget {
  readonly sessionId: string;
  /** 气泡列派生的显示标题（路由 title 缺位时的回落）. */
  readonly title: string;
  readonly rect: AnchorRect;
  /** 会话列表快照的 updatedAt（并入缓存 key，新活动自动失效）. */
  readonly updatedAt: number;
  /** 是否当前会话（点击胶囊跳转对当前会话是 no-op，与点击气泡同语义）. */
  readonly isCurrent: boolean;
}

/**
 * 气泡 pointerenter 旁路上报（气泡层原料）：sessionId/显示标题/视口矩形由
 * 气泡自报，updatedAt 与 isCurrent 由列表层从 sessions 快照补齐后升级为
 * PreviewTarget。对象参数替代三参 clump（审查 Data Clumps 项）。
 */
export interface PreviewRequest {
  readonly sessionId: string;
  readonly title: string;
  readonly rect: AnchorRect;
}

/** useBubblePreview 返回值. */
export interface BubblePreviewState {
  /** 可见的弹框目标（null = 弹框未开）. */
  readonly target: PreviewTarget | null;
  /** 弹框数据（target 已定时 null = 加载中，'error' 由内部状态收敛为无数据占位）. */
  readonly data: SessionPreviewData | null;
  /** 数据加载失败（显示失败占位，hover 下次可重试）. */
  readonly failed: boolean;
  /** hover 胶囊命中的 prompts 下标（undefined = 无 hover，选中回落最后）. */
  readonly hoveredIndex: number | undefined;
  /** 弹框内胶囊区展开全部（「+N」chip 切换）. */
  readonly capsulesExpanded: boolean;
  /** 气泡 pointerenter 旁路（不拦截既有交互）. */
  onBubbleEnter: (target: PreviewTarget) => void;
  /** 气泡 pointerleave 旁路. */
  onBubbleLeave: () => void;
  /** 弹框 pointerenter（取消隐藏）. */
  onPopupEnter: () => void;
  /** 弹框 pointerleave（宽限期隐藏）. */
  onPopupLeave: () => void;
  /** hover 某胶囊 → 详情区切换（latch：选中保持到下次 hover/换目标，移开不回弹——审查动画轮修复①）. */
  onCapsuleHover: (index: number) => void;
  /** 切换弹框内胶囊展开全部/收起. */
  onToggleCapsules: () => void;
  /** 关闭弹框（胶囊点击跳转后调用；立即进入退出动画相）. */
  close: () => void;
  /** 弹框处于退出动画相（父层据此渲染 .closing class，100ms 后卸载）. */
  readonly closing: boolean;
}

/**
 * 气泡预览 hover 状态机 hook。定时器全部经 ref 管理并在卸载时清理
 * （ADR-0017 可重入精神：组件卸载零残留）。
 */
export function useBubblePreview(): BubblePreviewState {
  const [target, setTarget] = useState<PreviewTarget | null>(null);
  const [data, setData] = useState<SessionPreviewData | null>(null);
  const [failed, setFailed] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(
    undefined,
  );
  const [capsulesExpanded, setCapsulesExpanded] = useState(false);
  // 退出动画相（审查动画轮修复②）：隐藏先挂 .closing 淡出 100ms 再卸载——
  // 与气泡列 .leaving 同一模式；宽限期与退出相是两段独立计时。
  const [closing, setClosing] = useState(false);

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // closing 的 ref 镜像：定时器调度只在 ref 判定的分支里发生
  // （StrictMode 双调用 state updater 不得有副作用）。
  const closingRef = useRef(false);
  // 当前展示目标镜像（异步回包时判定「还预览着谁」，防串会话回写）。
  const targetRef = useRef<PreviewTarget | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  /**
   * 装载目标数据（缓存命中即亮）：异步回包守卫比对 sessionId + updatedAt
   * 双键（审查 S3：同会话新旧 key 竞态下，旧响应不得覆盖新响应的显示）。
   */
  const loadInto = useCallback((next: PreviewTarget) => {
    const cached = previewCache.get(`${next.sessionId}:${next.updatedAt}`);
    if (cached !== undefined) {
      setData(cached);
      setFailed(false);
      return;
    }
    setData(null);
    setFailed(false);
    void loadPreview(next.sessionId, next.updatedAt).then((result) => {
      const live = targetRef.current;
      if (
        live === null ||
        live.sessionId !== next.sessionId ||
        live.updatedAt !== next.updatedAt
      ) {
        return;
      }
      if (result === null) {
        setFailed(true);
      } else {
        setData(result);
      }
    });
  }, []);

  /** 真正卸载：清全部展示态（退出动画播完或无动画路径的终点）。 */
  const finishClose = useCallback(() => {
    clearExitTimer();
    closingRef.current = false;
    setClosing(false);
    targetRef.current = null;
    setTarget(null);
    setData(null);
    setFailed(false);
    setHoveredIndex(undefined);
    setCapsulesExpanded(false);
  }, [clearExitTimer]);

  /** 撤销退出相（淡出未完即被重进）：取消卸载计时、恢复展示。 */
  const cancelClose = useCallback(() => {
    if (!closingRef.current) return;
    clearExitTimer();
    closingRef.current = false;
    setClosing(false);
  }, [clearExitTimer]);

  /** 进入退出动画相：先淡出 PREVIEW_EXIT_MS 再卸载（重复调度幂等）。 */
  const beginClose = useCallback(() => {
    if (targetRef.current === null || closingRef.current) return;
    clearHideTimer();
    closingRef.current = true;
    setClosing(true);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      finishClose();
    }, PREVIEW_EXIT_MS);
  }, [clearHideTimer, finishClose]);

  /** 切换预览目标：重置选中/展开态 + 装载数据（退出相中被重进则取消卸载）。 */
  const present = useCallback(
    (next: PreviewTarget) => {
      cancelClose();
      targetRef.current = next;
      setTarget(next);
      setHoveredIndex(undefined);
      setCapsulesExpanded(false);
      loadInto(next);
    },
    [loadInto, cancelClose],
  );

  const onBubbleEnter = useCallback(
    (next: PreviewTarget) => {
      clearHideTimer();
      clearShowTimer();
      cancelClose();
      if (targetRef.current !== null) {
        // 同一会话往返（气泡 ↔ 弹框穿越间隙）：保留展开/选中态，但刷新
        // 视口矩形与缓存键原料（审查 S2：气泡列重排后旧 rect 定位过期、
        // 新活动 updatedAt 需重取数据）。
        const prev = targetRef.current;
        if (prev.sessionId === next.sessionId) {
          targetRef.current = next;
          setTarget(next);
          if (prev.updatedAt !== next.updatedAt) loadInto(next);
          return;
        }
        // 弹框已开切到别的泡：即时跟随（连续预览多泡不串、不再防抖）
        present(next);
        return;
      }
      // 弹框未开：防抖浮现（掠过的泡不弹）
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        present(next);
      }, HOVER_SHOW_DELAY_MS);
    },
    [clearHideTimer, clearShowTimer, cancelClose, present, loadInto],
  );

  /** 宽限期隐藏调度（气泡离开与弹框离开同一语义）：到期进入退出动画相。 */
  const scheduleHide = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      beginClose();
    }, HIDE_GRACE_MS);
  }, [clearShowTimer, clearHideTimer, beginClose]);

  const onBubbleLeave = scheduleHide;

  const onPopupEnter = useCallback(() => {
    clearHideTimer();
    cancelClose();
  }, [clearHideTimer, cancelClose]);

  const onPopupLeave = scheduleHide;

  const onToggleCapsules = useCallback(() => {
    setCapsulesExpanded((e) => !e);
  }, []);

  /** 显式关闭（胶囊点击跳转后）：跳过宽限期，直接进退出动画相。 */
  const close = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    beginClose();
  }, [clearShowTimer, clearHideTimer, beginClose]);

  // 卸载清理：弹框随组件消亡，定时器不残留（热重载可重入）。
  useEffect(() => {
    return () => {
      if (showTimerRef.current !== null) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current);
    };
  }, []);

  return {
    target,
    data,
    failed,
    hoveredIndex,
    capsulesExpanded,
    closing,
    onBubbleEnter,
    onBubbleLeave,
    onPopupEnter,
    onPopupLeave,
    onCapsuleHover: setHoveredIndex,
    onToggleCapsules,
    close,
  };
}

// ---------------------------------------------------------------------------
// SessionBubblePopup — 弹框呈现（portal 挂 body，position:fixed）
// ---------------------------------------------------------------------------

/** SessionBubblePopup props. */
export interface SessionBubblePopupProps {
  /** 预览目标（非 null 时渲染）. */
  target: PreviewTarget;
  /** 弹框数据（null = 加载中或失败，配合 failed 区分占位文案）. */
  data: SessionPreviewData | null;
  /** 加载失败标记. */
  failed: boolean;
  /** hover 胶囊命中的 prompts 下标. */
  hoveredIndex: number | undefined;
  /** 胶囊区是否展开全部. */
  capsulesExpanded: boolean;
  /** 退出动画相：挂 .closing 播 100ms 淡出，动画播完由 hook 卸载. */
  closing: boolean;
  /** 弹框 pointerenter/leave（维持存活）. */
  onPopupEnter: () => void;
  onPopupLeave: () => void;
  /** 胶囊 hover 回调（latch 语义：选中保持到下次 hover 或换目标，不回弹）. */
  onCapsuleHover: (index: number) => void;
  /** 「+N」/「收起」chip 切换. */
  onToggleCapsules: () => void;
  /** 点击胶囊 → 跳转该会话（父层复用 handleOpen，语义与点击气泡一致）. */
  onOpenSession: () => void;
}

/**
 * 渲染气泡内容弹框：标题 + 问话胶囊行（+N chip）+ 详情区。
 *
 * 定位：computePopupPlacement 纯函数（默认挂气泡左侧、放不下翻转/钳制），
 * 视口尺寸取弹框出现时刻的 innerWidth/innerHeight（瞬态浮层，无需 resize
 * 订阅）。弹框自身挂 data-jx-interactive——portal 在 body 下不经浮层祖先，
 * 但仍需排除整盒拖动的 document 级 pointerdown 判定（CharacterOverlay
 * closest('[data-jx-interactive]') 从任意 target 向上查）。
 */
export function SessionBubblePopup({
  target,
  data,
  failed,
  hoveredIndex,
  capsulesExpanded,
  closing,
  onPopupEnter,
  onPopupLeave,
  onCapsuleHover,
  onToggleCapsules,
  onOpenSession,
}: SessionBubblePopupProps) {
  const prompts = data?.prompts ?? [];
  // 折叠/展开两态统一走 capsuleLayout：展开态仍报告折叠线 moreCount，
  // 「收起」chip 恒可渲染（审查 S1：展开不得成单行道）。
  const folded = useMemo(
    () => capsuleLayout(prompts, undefined, capsulesExpanded),
    [prompts, capsulesExpanded],
  );
  const selectedIndex = resolveSelectedIndex(
    prompts.length,
    hoveredIndex,
  );
  const selected =
    selectedIndex === null ? undefined : prompts[selectedIndex];
  const placement = useMemo(
    () =>
      computePopupPlacement(
        target.rect,
        { width: POPUP_WIDTH_PX, height: POPUP_MAX_HEIGHT_PX },
        { width: window.innerWidth, height: window.innerHeight },
        POPUP_GAP_PX,
      ),
    [target.rect],
  );

  // portal 目标快照：渲染期取一次即可（body 全程存在；卸载竞态由 React
  // 对 portal 的常规清理兜底）。
  const container = document.body;

  const title = data?.title ?? target.title;

  return createPortal(
    <div
      className={`${styles.preview} ${closing ? styles.closing : ""}`}
      /* 几何单源（审查去重项）：宽/最大高由定位常量注入 inline style，
       * CSS 不再重复字面量——computePopupPlacement 的钳制输入与实际尺寸
       * 永不漂移。底缘锚定（审查动画轮修复③）：placement.top 是最坏高度
       * 盒的顶缘，top+maxHeight 配 CSS translate:0 -100% 让实际底缘精确
       * 落在钳制后的目标线——内容高矮不再造成「悬空上浮」；translate 是
       * 独立属性，与淡入/淡出 keyframes 的 transform 正交组合，reduced-
       * motion 关动画时锚定不受影响 */
      style={{
        left: placement.left,
        top: placement.top + POPUP_MAX_HEIGHT_PX,
        width: POPUP_WIDTH_PX,
        maxHeight: POPUP_MAX_HEIGHT_PX,
      }}
      data-jx-interactive=""
      role="dialog"
      aria-label={`会话内容预览：${title}`}
      onPointerEnter={onPopupEnter}
      onPointerLeave={onPopupLeave}
    >
      <div className={styles.header} title={title}>
        {title}
      </div>
      {/* 选中 latch（审查动画轮修复①）：不在行 pointerleave 回弹最后——
          否则鼠标移到详情区读旧问话全文的瞬间内容被切走，「划过→阅读」
          动线断裂。选中保持到下次 hover 胶囊 / 换预览目标 / 弹框重开。 */}
      <div className={styles.capsuleRow}>
        {folded.moreCount > 0 && (
          <span
            className={`${styles.capsule} ${styles.foldChip}`}
            role="button"
            tabIndex={0}
            aria-label={
              capsulesExpanded ? "收起问话胶囊" : `展开更早 ${folded.moreCount} 条问话`
            }
            onClick={onToggleCapsules}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleCapsules();
              }
            }}
          >
            {capsulesExpanded ? "收起" : `+${folded.moreCount}`}
          </span>
        )}
        {folded.visible.map((capsule) => (
          <span
            key={capsule.seq}
            className={`${styles.capsule} ${
              selectedIndex === capsule.index ? styles.capsuleActive : ""
            }`}
            role="button"
            tabIndex={0}
            title={capsule.summary}
            aria-current={selectedIndex === capsule.index ? "true" : undefined}
            onPointerEnter={() => onCapsuleHover(capsule.index)}
            onFocus={() => onCapsuleHover(capsule.index)}
            onClick={() => {
              onOpenSession();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenSession();
              }
            }}
          >
            {capsule.summary}
          </span>
        ))}
      </div>
      <div className={styles.detail}>
        {failed ? (
          <span className={styles.placeholder}>预览加载失败</span>
        ) : data === null ? (
          <span className={styles.placeholder}>加载中…</span>
        ) : prompts.length === 0 ? (
          <span className={styles.placeholder}>暂无问话</span>
        ) : (
          selected?.text
        )}
      </div>
    </div>,
    container,
  );
}
