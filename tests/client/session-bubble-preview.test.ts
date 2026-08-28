/**
 * 气泡内容弹框纯逻辑测试（工单 02/03 验收，PRD 测试决策）。
 *
 * seam：输入 fetch 拿到的 JSON / 问话列表 / 几何矩形，输出可渲染的胶囊布局、
 * 选中索引与弹框视口位置。纯逻辑（vitest node 环境），不依赖 React/DOM——
 * 对齐 session-bubbles.test.ts 先例（组件手势接线不测，构建验收兜底）。
 *
 * 覆盖：
 *   - parsePreviewResponse：合法 JSON 透传；形状异常（非对象 / prompts 非数组 /
 *     条目字段类型错误）→ null（client 侧不崩、静默降级不弹框）；
 *   - foldCapsules：≤ 上限全展示 moreCount=0；超限折叠最旧（保尾丢头）——
 *     「最后一个胶囊 = 最新问话」恒成立（默认展开最后一个的前提）；展开态
 *     全量 + moreCount=0；index 恒为原 prompts 下标（选中映射不漂移）；
 *   - resolveSelectedIndex：hover 命中 → 对应下标；无 hover → 最后一条；
 *     越界 hover → 回落最后；空问话 → null；
 *   - truncateSummary：空白折叠单行、超长截断加省略号、不超长原样；
 *   - computePopupPlacement：默认弹框挂气泡左侧（含 gap）；左缘放不下 →
 *     翻转挂右侧；左右均放不下 → 钳制进视口；纵向底对齐气泡并钳制视口内。
 */

import { describe, expect, it } from "vitest";
import {
  capsuleLayout,
  computePopupPlacement,
  foldCapsules,
  parsePreviewResponse,
  resolveSelectedIndex,
  truncateSummary,
  POPUP_MARGIN_PX,
  type PromptLike,
} from "../../src/client/state-machine/session-bubble-preview.ts";

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function prompts(n: number): PromptLike[] {
  return Array.from({ length: n }, (_, i) => ({
    seq: i + 1,
    text: `问话 ${i + 1}`,
  }));
}

// ---------------------------------------------------------------------------
// parsePreviewResponse
// ---------------------------------------------------------------------------

describe("parsePreviewResponse — 路由 JSON 边界防御", () => {
  it("合法响应透传 title 与 prompts", () => {
    const json = { title: "会话甲", prompts: [{ seq: 3, text: "你好" }] };
    expect(parsePreviewResponse(json)).toEqual({
      title: "会话甲",
      prompts: [{ seq: 3, text: "你好" }],
    });
  });

  it("title 可为 null（无 session/title 事件），prompts 可为空数组", () => {
    expect(parsePreviewResponse({ title: null, prompts: [] })).toEqual({
      title: null,
      prompts: [],
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
// foldCapsules
// ---------------------------------------------------------------------------

describe("foldCapsules — 胶囊折叠（保尾丢头）", () => {
  it("不超上限：全部展示，moreCount=0", () => {
    const folded = foldCapsules(prompts(5), 12);
    expect(folded.visible.length).toBe(5);
    expect(folded.moreCount).toBe(0);
    expect(folded.visible.map((c) => c.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("超上限：折叠最旧的（+N），最后一个可见胶囊恒指向最新问话", () => {
    const folded = foldCapsules(prompts(20), 12);
    expect(folded.moreCount).toBe(8);
    expect(folded.visible.length).toBe(12);
    // 保尾丢头：可见 = 原下标 8..19
    expect(folded.visible[0]!.index).toBe(8);
    const last = folded.visible[folded.visible.length - 1]!;
    expect(last.index).toBe(19);
    expect(last.seq).toBe(20);
  });

  it("展开态（maxVisible=Infinity 语义）：全量、moreCount=0", () => {
    const folded = foldCapsules(prompts(20), 20);
    expect(folded.visible.length).toBe(20);
    expect(folded.moreCount).toBe(0);
  });

  it("空问话列表 → 空胶囊、moreCount=0", () => {
    expect(foldCapsules([], 12)).toEqual({ visible: [], moreCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// resolveSelectedIndex
// ---------------------------------------------------------------------------

describe("resolveSelectedIndex — 默认最后一个 / hover 切换", () => {
  it("无 hover → 选中最后一个（默认展开最后问话）", () => {
    expect(resolveSelectedIndex(5, undefined)).toBe(4);
    expect(resolveSelectedIndex(1, undefined)).toBe(0);
  });

  it("hover 命中 → 对应下标（hover 胶囊切详情区）", () => {
    expect(resolveSelectedIndex(5, 0)).toBe(0);
    expect(resolveSelectedIndex(5, 2)).toBe(2);
  });

  it("hover 越界（折叠线外/竞态）→ 回落最后一个", () => {
    expect(resolveSelectedIndex(5, 9)).toBe(4);
    expect(resolveSelectedIndex(5, -1)).toBe(4);
  });

  it("空列表 → null（详情区显示无问话占位）", () => {
    expect(resolveSelectedIndex(0, undefined)).toBeNull();
    expect(resolveSelectedIndex(0, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// truncateSummary
// ---------------------------------------------------------------------------

describe("truncateSummary — 胶囊截断摘要", () => {
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
// computePopupPlacement
// ---------------------------------------------------------------------------

describe("computePopupPlacement — 弹框视口钳制/翻转", () => {
  const popup = { width: 280, height: 220 };
  const viewport = { width: 1280, height: 800 };

  it("默认挂气泡左侧：右缘 = 气泡左缘 - gap，底对齐气泡底缘", () => {
    const anchor = { left: 600, top: 300, right: 732, bottom: 324 };
    const pos = computePopupPlacement(anchor, popup, viewport, 8);
    expect(pos.left).toBe(600 - 8 - 280);
    expect(pos.top).toBe(324 - 220);
    expect(pos.flipped).toBe(false);
  });

  it("左缘空间不足 → 翻转挂气泡右侧", () => {
    // 浮层贴近屏幕左缘：气泡左缘 200 < margin + width + gap
    const anchor = { left: 200, top: 300, right: 332, bottom: 324 };
    const pos = computePopupPlacement(anchor, popup, viewport, 8);
    expect(pos.flipped).toBe(true);
    expect(pos.left).toBe(332 + 8);
  });

  it("左右均放不下 → 钳制进视口（不超出边缘）", () => {
    const tiny = { width: 300, height: 800 };
    const anchor = { left: 100, top: 300, right: 232, bottom: 324 };
    const pos = computePopupPlacement(anchor, popup, tiny, 8);
    expect(pos.left).toBeGreaterThanOrEqual(POPUP_MARGIN_PX);
    expect(pos.left + popup.width).toBeLessThanOrEqual(300 - POPUP_MARGIN_PX);
  });

  it("纵向：贴近视口底部时钳制——弹框整体留在视口内", () => {
    // 底对齐会顶出下缘：724 起算 top=504 尚可；取 bottom=795 → top=575 越界，
    // 钳制到 viewport.height - margin - height = 572。
    const anchor = { left: 600, top: 771, right: 732, bottom: 795 };
    const pos = computePopupPlacement(anchor, popup, viewport, 8);
    expect(pos.top).toBe(800 - POPUP_MARGIN_PX - 220);
    expect(pos.top + popup.height).toBeLessThanOrEqual(
      800 - POPUP_MARGIN_PX,
    );
  });
});

// ---------------------------------------------------------------------------
// capsuleLayout：展开/收起两态（工单 03「展开/收起可用」回归护栏）
// ---------------------------------------------------------------------------

describe("capsuleLayout — 展开态仍报告折叠数（「收起」chip 可达）", () => {
  it("未超限：两态都是全展示、moreCount=0（不渲染 chip）", () => {
    for (const expanded of [false, true]) {
      const layout = capsuleLayout(prompts(5), 12, expanded);
      expect(layout.visible.length).toBe(5);
      expect(layout.moreCount).toBe(0);
    }
  });

  it("折叠态：保尾丢头 +N（与 foldCapsules 同语义）", () => {
    const layout = capsuleLayout(prompts(20), 12, false);
    expect(layout.visible.length).toBe(12);
    expect(layout.moreCount).toBe(8);
  });

  it("展开态：全量胶囊 + moreCount 仍为折叠线外数量——「收起」chip 有渲染依据（审查 S1 修复）", () => {
    const layout = capsuleLayout(prompts(20), 12, true);
    expect(layout.visible.length).toBe(20);
    expect(layout.visible.map((c) => c.index)).toEqual(
      Array.from({ length: 20 }, (_, i) => i),
    );
    expect(layout.moreCount).toBe(8);
  });

  it("maxVisible 参数化：折叠线随上限移动", () => {
    const layout = capsuleLayout(prompts(6), 2, true);
    expect(layout.visible.length).toBe(6);
    expect(layout.moreCount).toBe(4);
  });
});
