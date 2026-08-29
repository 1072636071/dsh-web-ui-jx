/**
 * SessionBubbleDetail — 会话气泡悬停详情窗（工单 16-02 / 16-04）。
 *
 * 书页卡片视觉：纸感背景（`--jx-paper-bg` / `--jx-paper-edge` 深浅双值随主题，
 * 见 bubble-theme.css）、顶部书眉（状态点 + 会话标题 + AI 动态标题副题行）、
 * 内容区预览行（最后用户消息 / 最后助手消息 / in-flight 占位）、底部书脊。
 *
 * 数据（悬停挂载时按需生成，非轮询）：
 *   - 预览：mount 时经 `previewTransport.fetchPreview` 拉取；骨架屏 + 失败静默
 *     （不占位不报错）；缓存由父层注入的 transport 包装器（createPreviewCache）
 *     承担，跨悬停复用。
 *   - AI 动态标题（16-04）：预览 settle 后再经 `dynamicTitleTransport` 生成
 *     （以 lastUserText 为上下文）；未配置 API 时副题行整体隐藏（无占位）。
 *
 * 交互：卡片本体 pointer-events:auto + `data-jx-interactive`（不触发整盒拖动）；
 * `onPointerEnter` / `onPointerLeave` 透传给父层做 hover 保活；点击卡片打开会话。
 *
 * 定位由父层注入 `style`（absolute + top/bottom + left/right 换侧），本组件
 * 不自管理绝对定位。
 *
 * 只消费语义别名 + --jx-* 专属轨，无颜色字面量、无主题选择器。
 *
 * @module dsh-session-bubble
 */

import { useEffect, useState } from "react";
import type { PreviewTransport, SessionPreview } from "./detail/detail-data.ts";
import type { DynamicTitleResult, DynamicTitleTransport } from "./detail/dynamic-title.ts";
import styles from "./styles/session-bubble-detail.module.css";

/** 详情窗条目（由 SessionBubbleList 从 BubbleEntry 投影）. */
export interface SessionBubbleDetailEntry {
  readonly sessionId: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly running: boolean;
  readonly completed: boolean;
  readonly isCurrent: boolean;
}

/** SessionBubbleDetail props. */
export interface SessionBubbleDetailProps {
  /** 悬停的气泡条目投影. */
  entry: SessionBubbleDetailEntry;
  /** 点击卡片打开会话（父层处理当前会话 no-op）. */
  onOpen: () => void;
  /** 预览 transport（可选；缺失时详情窗仅显示标题，完整可用）. */
  previewTransport?: PreviewTransport | undefined;
  /** AI 动态标题 transport（可选；缺失或未配置时副题行隐藏）. */
  dynamicTitleTransport?: DynamicTitleTransport | undefined;
  /** 卡片获得指针（父层取消 hide 定时器）. */
  onPointerEnter?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** 卡片失去指针（父层启动 hide 定时器）. */
  onPointerLeave?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** 父层注入的定位样式（absolute + 换侧 + 纵向对齐）. */
  style?: React.CSSProperties;
}

/** 预览加载态. */
type PreviewState =
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly preview: SessionPreview }
  | { readonly phase: "error" };

/**
 * 内容字符护栏（有界 DOM；对齐 CSS 3 行截断的保守上界，避免多字节文本折行
 * 溢出详情窗高度）。
 *
 * @param text - 原文。
 * @param maxChars - 截断上界（默认 160）。
 * @returns 截断后文本（超长尾部接 …）。
 */
export function clampText(text: string, maxChars = 160): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

/**
 * 渲染书页卡片详情窗。
 *
 * @param props.entry - 悬停会话。
 * @param props.onOpen - 打开会话回调。
 * @param props.previewTransport - 预览 transport（可选）。
 * @param props.dynamicTitleTransport - AI 动态标题 transport（可选）。
 * @param props.onPointerEnter / onPointerLeave - hover 保活透传。
 * @param props.style - 父层定位样式。
 * @returns 书页卡片。
 */
export function SessionBubbleDetail({
  entry,
  onOpen,
  previewTransport,
  dynamicTitleTransport,
  onPointerEnter,
  onPointerLeave,
  style,
}: SessionBubbleDetailProps) {
  const [preview, setPreview] = useState<PreviewState>({ phase: "loading" });
  const [dynamicTitle, setDynamicTitle] = useState<DynamicTitleResult | undefined>(undefined);

  // 预览：mount 时按需拉取（缓存由父层 transport 包装器承担）。
  useEffect(() => {
    if (!previewTransport) {
      setPreview({ phase: "error" });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setPreview({ phase: "loading" });
    void previewTransport
      .fetchPreview(
        { sessionId: entry.sessionId, title: entry.title, updatedAt: entry.updatedAt },
        controller.signal,
      )
      .then((result) => {
        if (!cancelled) setPreview({ phase: "ready", preview: result });
      })
      .catch(() => {
        // 失败静默：不占位不报错
        if (!cancelled) setPreview({ phase: "error" });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewTransport, entry.sessionId, entry.title, entry.updatedAt]);

  // AI 动态标题（16-04）：等预览 settle（拿到 lastUserText 上下文）后再生成。
  // 无预览 transport 时立即生成（lastUserText 为空）。未配置 → 副题行隐藏。
  const previewSettled = previewTransport === undefined || preview.phase !== "loading";
  useEffect(() => {
    if (!dynamicTitleTransport || !previewSettled) return;
    let cancelled = false;
    const lastUserText = preview.phase === "ready" ? preview.preview.lastUserText : "";
    void dynamicTitleTransport
      .generateTitle({
        sessionId: entry.sessionId,
        title: entry.title,
        updatedAt: entry.updatedAt,
        lastUserText,
      })
      .then((result) => {
        if (!cancelled) setDynamicTitle(result);
      })
      .catch(() => {
        if (!cancelled) setDynamicTitle(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [dynamicTitleTransport, previewSettled, preview, entry.sessionId, entry.title, entry.updatedAt]);

  // 副题行：仅 configured 时显示（未配置 / 无 transport / 失败 → 隐藏）。
  const subtitle =
    dynamicTitle?.kind === "configured" ? clampText(dynamicTitle.title, 40) : undefined;

  // 内容区：loading → 骨架；ready → 预览行；error → 空（静默）。
  let body: React.ReactNode;
  if (preview.phase === "loading") {
    body = (
      <>
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonLine} style={{ width: "72%" }} />
      </>
    );
  } else if (preview.phase === "ready") {
    const p = preview.preview;
    const hasContent = p.lastUserText.length > 0 || p.lastAssistantText.length > 0 || p.inFlight;
    if (hasContent) {
      body = (
        <>
          {p.lastUserText.length > 0 && (
            <span className={styles.detailLine}>
              <span className={styles.detailLineLabel}>你·</span>
              {clampText(p.lastUserText)}
            </span>
          )}
          {p.lastAssistantText.length > 0 && (
            <span className={styles.detailLine}>
              <span className={styles.detailLineLabel}>说·</span>
              {clampText(p.lastAssistantText)}
            </span>
          )}
          {p.inFlight && <span className={styles.inFlight}>正在思考…</span>}
        </>
      );
    } else {
      body = <span className={styles.emptyLine}>暂无内容</span>;
    }
  }

  // 状态点：与气泡列同轨（当前金 / 运行金呼吸 / 完成石绿 / 等待朱砂）。
  const dotClass = entry.isCurrent
    ? styles.dotCurrent
    : entry.running
      ? styles.dotRunning
      : styles.dotCompleted;

  return (
    <div
      className={styles.detailCard}
      style={style}
      data-jx-interactive=""
      role="region"
      aria-label={`会话详情：${entry.title}`}
      onClick={onOpen}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.detailHeader}>
        <span className={styles.headerTitleRow}>
          <span className={`${styles.headerDot} ${dotClass}`} aria-hidden="true" />
          <span className={styles.detailTitle}>{entry.title}</span>
        </span>
        {subtitle !== undefined && (
          <span className={styles.detailSubtitle}>
            <span className={styles.sealDot} aria-hidden="true" />
            <span className={styles.detailSubtitleText}>{subtitle}</span>
          </span>
        )}
      </div>
      <div className={styles.detailBody}>{body}</div>
      <div className={styles.detailFooter} aria-hidden="true" />
    </div>
  );
}
