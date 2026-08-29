/**
 * session-bubble-preview — 气泡内容弹框纯逻辑模块（ADR-0031 / PRD 14 工单 02/03）。
 *
 * 角色：hover 会话气泡浮现的「气泡内容弹框」（CONTEXT.md 词汇）背后的可测
 * 地基——路由 JSON 的边界解析、问话胶囊的折叠/选中/截断摘要、弹框的视口
 * 钳制定位。纯逻辑模块：不操作 DOM、不依赖 React/HTTP，对齐
 * session-bubbles.ts / overlay-position 的 state-machine 单例模式；DOM 薄壳
 * 在 SessionBubbleList 组件与 SessionBubblePreview 组件。
 *
 * 语义钉死（PRD D3/D4 + 用户故事 5/6/7/8）：
 *   - 弹框默认选中最后一个胶囊 = 最新问话——折叠策略「保尾丢头」（foldCapsules
 *     折叠最旧的、可见尾部恒含最新问话），「默认展开最后一个胶囊」恒成立；
 *   - hover 某胶囊 → 选中切换（resolveSelectedIndex）；latch 语义——选中
 *     保持到下次 hover 或换预览目标（组件不再上报），越界输入回落最后兜底；
 *   - 胶囊显示截断摘要（truncateSummary：空白折叠单行 + 超长省略号），完整
 *     问话显示在详情区；
 *   - 弹框几何纯函数化（computePopupPlacement）：默认挂气泡左侧，左缘放不下
 *     翻转挂右侧，两侧都放不下钳制进视口（气泡列在浮层盒外左侧，弹框可能
 *     超出视口左缘——PRD 补充说明）。
 *
 * @module dsh-session-bubble
 */

// ---------------------------------------------------------------------------
// 类型（与 host 路由契约 / DOM 几何解耦的 structural 形状）
// ---------------------------------------------------------------------------

/** 一条问话（host 路由 `{seq, text}` 契约的 client 投影）. */
export interface PromptLike {
  readonly seq: number;
  readonly text: string;
}

/** 解析后的弹框数据. */
export interface SessionPreviewData {
  readonly title: string | null;
  readonly prompts: readonly PromptLike[];
}

/** 一个问话胶囊：原 prompts 下标 + seq + 截断摘要. */
export interface PreviewCapsule {
  /** 在完整 prompts 列表中的下标（选中映射不漂移）. */
  readonly index: number;
  /** 源事件 seq（官方定位能力开放后接线）. */
  readonly seq: number;
  /** 截断摘要（胶囊紧凑排版显示文案）. */
  readonly summary: string;
}

/** 折叠结果. */
export interface FoldedCapsules {
  readonly visible: readonly PreviewCapsule[];
  /** 被折叠的更旧问话数（弹框内「+N」chip）. */
  readonly moreCount: number;
}

/** 视口矩形（getBoundingClientRect 关心字段的投影）. */
export interface AnchorRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 尺寸（宽/高）. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** 弹框定位结果（视口坐标，position:fixed 消费）. */
export interface PopupPlacement {
  readonly left: number;
  readonly top: number;
  /** 是否翻转挂到气泡右侧（视口钳制留痕，供调试与样式分支）. */
  readonly flipped: boolean;
}

// ---------------------------------------------------------------------------
// 常量（实施定阈值，PRD D4「参考 maxVisible 模式」）
// ---------------------------------------------------------------------------

/** 胶囊截断摘要最大字符数（超出加省略号）. */
export const CAPSULE_SUMMARY_MAX_CHARS = 24;

/** 弹框一行胶囊区的可见上限（超出折叠最旧为「+N」）. */
export const MAX_VISIBLE_CAPSULES = 12;

/** 弹框固定宽度 px（与 CSS module 同步——定位纯函数不测量，钉死几何）. */
export const POPUP_WIDTH_PX = 280;

/** 弹框最大高度 px（与 CSS module 同步；钳制按最坏高度算，宁可保守）. */
export const POPUP_MAX_HEIGHT_PX = 260;

/** 弹框与气泡的间隙 px / 视口边缘安全边距 px. */
export const POPUP_GAP_PX = 8;
export const POPUP_MARGIN_PX = 8;

// ---------------------------------------------------------------------------
// parsePreviewResponse：fetch 边界形状防御
// ---------------------------------------------------------------------------

/**
 * 校验并解析 `/api/dsh-jx/session/<id>/messages` 响应 JSON。
 *
 * 任何形状异常（非对象、prompts 非数组、条目字段类型错误）返回 null——
 * 调用方静默降级不弹框（防御性边界，不信任网络 JSON）。
 *
 * @param json - `response.json()` 的未知形状。
 * @returns 合法则 `{title, prompts}`，否则 null。
 */
export function parsePreviewResponse(json: unknown): SessionPreviewData | null {
  if (typeof json !== "object" || json === null) return null;
  const { title, prompts } = json as { title?: unknown; prompts?: unknown };
  if (title !== null && typeof title !== "string") return null;
  if (!Array.isArray(prompts)) return null;
  const parsed: PromptLike[] = [];
  for (const item of prompts) {
    if (typeof item !== "object" || item === null) return null;
    const { seq, text } = item as { seq?: unknown; text?: unknown };
    if (typeof seq !== "number" || typeof text !== "string") return null;
    parsed.push({ seq, text });
  }
  return { title: title ?? null, prompts: parsed };
}

// ---------------------------------------------------------------------------
// foldCapsules：保尾丢头折叠（「最后一个胶囊 = 最新问话」恒成立）
// ---------------------------------------------------------------------------

/**
 * 把问话列表折叠为可见胶囊 + 「+N」。
 *
 * 策略与气泡列折叠同源但方向相反——胶囊必须**保尾丢头**：超上限时折叠
 * 最旧的问话，可见尾部恒含最新问话（「默认展开最后一个胶囊」恒成立的
 * 结构保证）。`index` 记录原列表下标，选中索引映射不因折叠漂移。
 *
 * @param prompts - 完整问话列表（时序正序）。
 * @param maxVisible - 可见胶囊上限（展开态传 prompts.length）。
 * @returns { visible, moreCount }。
 */
export function foldCapsules(
  prompts: readonly PromptLike[],
  maxVisible: number = MAX_VISIBLE_CAPSULES,
): FoldedCapsules {
  const cap = Math.max(0, Math.floor(maxVisible));
  const moreCount = Math.max(0, prompts.length - cap);
  const start = moreCount; // 保尾丢头：折叠线之前全是更旧问话
  const visible = prompts.slice(start).map((p, i) => ({
    index: start + i,
    seq: p.seq,
    summary: truncateSummary(p.text, CAPSULE_SUMMARY_MAX_CHARS),
  }));
  return { visible, moreCount };
}

/**
 * 折叠/展开两态的胶囊布局（弹框 chip 渲染的唯一数据源）。
 *
 * 审查 S1 修复钉死的行为：展开态**仍报告折叠线的 moreCount**——「收起」
 * chip 的渲染依据不能依赖折叠态的 moreCount（展开后恒为 0 会让「收起」
 * 永不显示、展开成单行道）。展开 = 全量胶囊 + 收起 chip；折叠 = 保尾丢头。
 *
 * @param prompts - 完整问话列表（时序正序）。
 * @param maxVisible - 折叠线（上限）。
 * @param expanded - 弹框内胶囊区是否已展开（「+N」chip 切换）。
 */
export function capsuleLayout(
  prompts: readonly PromptLike[],
  maxVisible: number = MAX_VISIBLE_CAPSULES,
  expanded: boolean = false,
): FoldedCapsules {
  const collapsed = foldCapsules(prompts, maxVisible);
  if (!expanded) return collapsed;
  return {
    visible: foldCapsules(prompts, prompts.length).visible,
    moreCount: collapsed.moreCount,
  };
}

// ---------------------------------------------------------------------------
// resolveSelectedIndex：默认最后一个 / hover 切换
// ---------------------------------------------------------------------------
/**
 * 解析当前选中胶囊的 prompts 下标（详情区显示哪条完整问话）。
 *
 * - hover 命中合法下标 → 该下标（hover 某胶囊 → 详情区切换）；
 * - 无 hover / hover 越界（折叠线外、列表刚变化）→ 回落最后一个（默认展开
 *   最后一个胶囊）；
 * - 空列表 → null（详情区显示无问话占位）。
 *
 * @param count - prompts 总数。
 * @param hoveredIndex - 当前 hover 胶囊的原下标（undefined = 无 hover）。
 */
export function resolveSelectedIndex(
  count: number,
  hoveredIndex: number | undefined,
): number | null {
  if (count <= 0) return null;
  if (
    hoveredIndex !== undefined &&
    Number.isInteger(hoveredIndex) &&
    hoveredIndex >= 0 &&
    hoveredIndex < count
  ) {
    return hoveredIndex;
  }
  return count - 1;
}

// ---------------------------------------------------------------------------
// truncateSummary：胶囊截断摘要
// ---------------------------------------------------------------------------

/**
 * 问话 → 胶囊摘要：首尾修剪、内部空白（含换行）折叠为单空格、超长截断加
 * 省略号。详情区不受本函数影响（显示完整原文）。
 *
 * @param text - 完整问话文本。
 * @param maxChars - 摘要上限字符数。
 */
export function truncateSummary(text: string, maxChars: number): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars)}…`;
}

// ---------------------------------------------------------------------------
// computePopupPlacement：视口钳制/翻转
// ---------------------------------------------------------------------------

/**
 * 计算弹框视口位置（position:fixed 消费，气泡 rect 来自 getBoundingClientRect）。
 *
 * 规则（PRD 补充说明「弹框可能超出视口左缘——需视口钳制/翻转」）：
 *   1. 默认挂气泡左侧：右缘 = 气泡左缘 − gap；纵向底对齐气泡底缘；
 *   2. 左侧放不下（left < margin）→ 翻转挂气泡右侧（left = 气泡右缘 + gap）；
 *   3. 翻转后右侧也放不下 → 钳制进视口（右缘不越 viewport.width − margin，
 *      左缘不小于 margin——视口比弹框还窄时保左缘 margin）；
 *   4. 纵向钳制：整体留在视口内（视口比弹框矮时贴 margin）。
 *
 * @param anchor - 气泡视口矩形。
 * @param popup - 弹框尺寸（固定几何常量，与 CSS 同步）。
 * @param viewport - 视口尺寸。
 * @param gap - 弹框与气泡间隙。
 */
export function computePopupPlacement(
  anchor: AnchorRect,
  popup: Size,
  viewport: Size,
  gap: number = POPUP_GAP_PX,
): PopupPlacement {
  const maxLeft = Math.max(
    POPUP_MARGIN_PX,
    viewport.width - POPUP_MARGIN_PX - popup.width,
  );
  let left = anchor.left - gap - popup.width;
  let flipped = false;
  if (left < POPUP_MARGIN_PX) {
    left = anchor.right + gap;
    flipped = true;
  }
  if (left > maxLeft) left = maxLeft;
  if (left < POPUP_MARGIN_PX) left = POPUP_MARGIN_PX;

  const maxTop = Math.max(
    POPUP_MARGIN_PX,
    viewport.height - POPUP_MARGIN_PX - popup.height,
  );
  let top = anchor.bottom - popup.height;
  if (top > maxTop) top = maxTop;
  if (top < POPUP_MARGIN_PX) top = POPUP_MARGIN_PX;

  return { left, top, flipped };
}
