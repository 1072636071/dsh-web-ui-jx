/**
 * session-bubble-preview — 气泡内容弹框纯逻辑模块（ADR-0031 / ADR-0032）。
 *
 * 角色：hover 会话气泡浮现的「气泡内容弹框」（CONTEXT.md 词汇）背后的可测
 * 地基——路由 JSON 的边界解析（含问话配对回复）、左列选中态解析、弹框的
 * 固定几何与视口钳制定位。纯逻辑模块：不操作 DOM、不依赖 React/HTTP，对齐
 * session-bubbles.ts / overlay-position 的 state-machine 单例模式；DOM 薄壳
 * 在 SessionBubbleList 组件与 SessionBubblePreview 组件。
 *
 * 语义钉死（ADR-0032）：
 *   - 弹框固定尺寸（宽 560 / 高 320），三列：左列问话摘要行、中列选中问话全文、
 *     右列该问话配对的 LLM 回复；不再折叠胶囊（竖排可滚动替代「+N」）；
 *   - 弹框默认选中最后一条问话 = 最新一轮问答（resolveSelectedIndex 无 hover
 *     回落最后），「默认展开最后一条」恒成立；
 *   - hover 某摘要行 → 选中切换（resolveSelectedIndex）；latch 语义——选中
 *     保持到下次 hover 或换预览目标（组件不再上报），越界输入回落最后兜底；
 *   - 摘要行显示截断摘要（truncateSummary：空白折叠单行 + 超长省略号），完整
 *     问话与配对回复分别显示在中/右列；
 *   - 弹框几何纯函数化（computePopupPlacement）：按固定尺寸输入钳制——默认挂
 *     气泡左侧，左缘放不下翻转挂右侧，两侧都放不下钳制进视口。
 *
 * @module dsh-session-bubble
 */

// ---------------------------------------------------------------------------
// 类型（与 host 路由契约 / DOM 几何解耦的 structural 形状）
// ---------------------------------------------------------------------------

/** 一条问答（host 路由 `{seq, text, reply}` 契约的 client 投影）. */
export interface PromptLike {
  readonly seq: number;
  readonly text: string;
  /** 配对的 LLM 回复文本；无回复（末轮未回/被中断）为 null。 */
  readonly reply: string | null;
}

/** 解析后的弹框数据. */
export interface SessionPreviewData {
  readonly title: string | null;
  readonly prompts: readonly PromptLike[];
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
// 常量（固定几何单源：TS 定义 → 组件 inline style 注入 → 定位纯函数钳制）
// ---------------------------------------------------------------------------

/** 问话摘要行截断摘要最大字符数（超出加省略号）. */
export const SUMMARY_MAX_CHARS = 24;

/** 弹框固定宽度 px（三列横排，与 CSS module 同步——定位纯函数不测量，钉死几何）. */
export const POPUP_WIDTH_PX = 560;

/**
 * 弹框固定高度 px（ADR-0032：由 maxHeight 改固定 height，根治切换问话时随内容
 * 伸缩的高度抖动——内容不足留白、超出各列内滚动，盒体尺寸恒定）。
 */
export const POPUP_HEIGHT_PX = 320;

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
 * 调用方静默降级不弹框（防御性边界，不信任网络 JSON）。`reply` 向后兼容：
 * 缺省字段 / 非字符串非 null 一律回落 null（旧 host 响应或退化条目不致整体判失败）。
 *
 * @param json - `response.json()` 的未知形状。
 * @returns 合法则 `{title, prompts:[{seq,text,reply}]}`，否则 null。
 */
export function parsePreviewResponse(json: unknown): SessionPreviewData | null {
  if (typeof json !== "object" || json === null) return null;
  const { title, prompts } = json as { title?: unknown; prompts?: unknown };
  if (title !== null && typeof title !== "string") return null;
  if (!Array.isArray(prompts)) return null;
  const parsed: PromptLike[] = [];
  for (const item of prompts) {
    if (typeof item !== "object" || item === null) return null;
    const { seq, text, reply } = item as {
      seq?: unknown;
      text?: unknown;
      reply?: unknown;
    };
    if (typeof seq !== "number" || typeof text !== "string") return null;
    parsed.push({
      seq,
      text,
      reply: typeof reply === "string" ? reply : null,
    });
  }
  return { title: title ?? null, prompts: parsed };
}

// ---------------------------------------------------------------------------
// resolveSelectedIndex：默认最后一个 / hover 切换
// ---------------------------------------------------------------------------
/**
 * 解析当前选中摘要行的 prompts 下标（中/右列显示哪一轮问答）。
 *
 * - hover 命中合法下标 → 该下标（hover 某摘要行 → 中/右列切换）；
 * - 无 hover / hover 越界（列表刚变化、竞态）→ 回落最后一个（默认展开最新
 *   一轮问答）；
 * - 空列表 → null（列显示无问话占位）。
 *
 * @param count - prompts 总数。
 * @param hoveredIndex - 当前 hover 摘要行的原下标（undefined = 无 hover）。
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
// truncateSummary：摘要行截断摘要
// ---------------------------------------------------------------------------

/**
 * 问话 → 摘要行文案：首尾修剪、内部空白（含换行）折叠为单空格、超长截断加
 * 省略号。中/右列不受本函数影响（显示完整原文）。
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
