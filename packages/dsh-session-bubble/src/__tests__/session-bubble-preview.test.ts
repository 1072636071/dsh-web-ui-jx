/**
 * 气泡内容弹框纯逻辑测试（工单 02/03 验收，ADR-0032 测试决策）。
 *
 * seam：输入 fetch 拿到的 JSON / 问答列表 / 几何矩形，输出可渲染的行摘要、
 * 选中索引与弹框视口位置。纯逻辑（vitest node 环境），不依赖 React/DOM——
 * 对齐 session-bubbles.test.ts 先例（组件手势接线不测，构建验收兜底）。
 *
 * 覆盖：
 *   - parsePreviewResponse：合法 JSON 透传（含配对 reply）；reply 向后兼容
 *     （缺省/非法类型回落 null）；形状异常（非对象 / prompts 非数组 / 条目字段
 *     类型错误）→ null（client 侧不崩、静默降级不弹框）；
 *   - resolveSelectedIndex：hover 命中 → 对应下标；无 hover → 最后一条；
 *     越界 hover → 回落最后；空列表 → null；
 *   - truncateSummary：空白折叠单行、超长截断加省略号、不超长原样；
 *   - computePopupPlacement：固定尺寸下默认挂左、左缘放不下翻转挂右、两侧都
 *     放不下钳制进视口、纵向底对齐并钳制视口内。
 */

import { describe, expect, it } from "vitest";
import {
  computePopupPlacement,
  parsePreviewResponse,
  resolveSelectedIndex,
  truncateSummary,
  POPUP_MARGIN_PX,
  type PromptLike,
} from "../session-bubble-preview.ts";

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function prompts(n: number): PromptLike[] {
  return Array.from({ length: n }, (_, i) => ({
    seq: i + 1,
    text: `问话 ${i + 1}`,
    reply: `回复 ${i + 1}`,
  }));
}

// ---------------------------------------------------------------------------
// parsePreviewResponse
// ---------------------------------------------------------------------------

describe("parsePreviewResponse — 路由 JSON 边界防御（含 reply）", () => {
  it("合法响应透传 title 与 prompts（每条含配对 reply）", () => {
    const json = {
      title: "会话甲",
      prompts: [{ seq: 3, text: "你好", reply: "你好，有什么可以帮您" }],
    };
    expect(parsePreviewResponse(json)).toEqual({
      title: "会话甲",
      prompts: [{ seq: 3, text: "你好", reply: "你好，有什么可以帮您" }],
    });
  });

  it("title 可为 null（无 session/title 事件），prompts 可为空数组", () => {
    expect(parsePreviewResponse({ title: null, prompts: [] })).toEqual({
      title: null,
      prompts: [],
    });
  });

  it("reply 向后兼容：缺省字段 / null / 非字符串一律回落 null（不整批判失败）", () => {
    expect(
      parsePreviewResponse({ title: "t", prompts: [{ seq: 1, text: "q" }] }),
    ).toEqual({ title: "t", prompts: [{ seq: 1, text: "q", reply: null }] });
    expect(
      parsePreviewResponse({
        title: "t",
        prompts: [
          { seq: 1, text: "q", reply: null },
          { seq: 2, text: "q2", reply: 123 },
        ],
      }),
    ).toEqual({
      title: "t",
      prompts: [
        { seq: 1, text: "q", reply: null },
        { seq: 2, text: "q2", reply: null },
      ],
    });
  });

  it("形状异常一律 null：非对象 / prompts 非数组 / 条目字段类型错误", () => {
    expect(parsePreviewResponse(null)).toBeNull();
    expect(parsePreviewResponse("string")).toBeNull();
    expect(parsePreviewResponse({ title: "t" })).toBeNull();
    expect(parsePreviewResponse({ title: "t", prompts: {} })).toBeNull();
    expect(
      parsePreviewResponse({ title: "t", prompts: [{ seq: 1, text: 2 }] }),
    ).toBeNull();
    expect(
      parsePreviewResponse({ title: "t", prompts: [{ seq: "a", text: "b" }] }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveSelectedIndex
// ---------------------------------------------------------------------------

describe("resolveSelectedIndex — 默认最后一个 / hover 切换", () => {
  it("无 hover → 选中最后一个（默认展开最新一轮问答）", () => {
    expect(resolveSelectedIndex(5, undefined)).toBe(4);
    expect(resolveSelectedIndex(1, undefined)).toBe(0);
  });

  it("hover 命中 → 对应下标（hover 摘要行切中/右列）", () => {
    expect(resolveSelectedIndex(5, 0)).toBe(0);
    expect(resolveSelectedIndex(5, 2)).toBe(2);
  });

  it("hover 越界（列表刚变化/竞态）→ 回落最后一个", () => {
    expect(resolveSelectedIndex(5, 9)).toBe(4);
    expect(resolveSelectedIndex(5, -1)).toBe(4);
  });

  it("空列表 → null（列显示无问话占位）", () => {
    expect(resolveSelectedIndex(0, undefined)).toBeNull();
    expect(resolveSelectedIndex(0, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// truncateSummary
// ---------------------------------------------------------------------------

describe("truncateSummary — 摘要行截断摘要", () => {
  it("多行/连续空白折叠为单空格后截断", () => {
    expect(truncateSummary("第一行\n第二行   尾巴", 100)).toBe(
      "第一行 第二行 尾巴",
    );
  });

  it("超长截断加省略号；不超长原样返回", () => {
    const long = "啊".repeat(40);
    const s = truncateSummary(long, 24);
    expect(s.length).toBe(25); // 24 字 + …
    expect(s.startsWith("啊".repeat(24))).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(truncateSummary("短问话", 24)).toBe("短问话");
  });

  it("首尾空白修剪", () => {
    expect(truncateSummary("  带空白的问话 \n", 100)).toBe("带空白的问话");
  });
});

// ---------------------------------------------------------------------------
// computePopupPlacement（固定尺寸：POPUP_WIDTH_PX × POPUP_HEIGHT_PX）
// ---------------------------------------------------------------------------

describe("computePopupPlacement — 弹框视口钳制/翻转", () => {
  const popup = { width: 560, height: 320 };
  const viewport = { width: 1280, height: 800 };

  it("默认挂气泡左侧：右缘 = 气泡左缘 - gap，底对齐气泡底缘", () => {
    const anchor = { left: 800, top: 376, right: 932, bottom: 400 };
    const pos = computePopupPlacement(anchor, popup, viewport, 8);
    expect(pos.left).toBe(800 - 8 - 560);
    expect(pos.top).toBe(400 - 320);
    expect(pos.flipped).toBe(false);
  });

  it("左缘空间不足 → 翻转挂气泡右侧", () => {
    // 浮层贴近屏幕左缘：气泡左缘放不下弹框宽 → 翻到右侧
    const anchor = { left: 200, top: 300, right: 332, bottom: 324 };
    const pos = computePopupPlacement(anchor, popup, viewport, 8);
    expect(pos.flipped).toBe(true);
    expect(pos.left).toBe(332 + 8);
  });

  it("左右均放不下 → 钳制进视口（不超出边缘）", () => {
    const tiny = { width: 580, height: 800 };
    const anchor = { left: 100, top: 300, right: 232, bottom: 324 };
    const pos = computePopupPlacement(anchor, popup, tiny, 8);
    expect(pos.left).toBeGreaterThanOrEqual(POPUP_MARGIN_PX);
    expect(pos.left + popup.width).toBeLessThanOrEqual(580 - POPUP_MARGIN_PX);
  });

  it("固定高度：纵向贴近视口底部时钳制——弹框整体留在视口内", () => {
    // 底对齐会顶出下缘时钳制到 viewport.height - margin - height。
    const anchor = { left: 800, top: 771, right: 932, bottom: 795 };
    const pos = computePopupPlacement(anchor, popup, viewport, 8);
    expect(pos.top).toBe(800 - POPUP_MARGIN_PX - 320);
    expect(pos.top + popup.height).toBeLessThanOrEqual(800 - POPUP_MARGIN_PX);
  });
});
