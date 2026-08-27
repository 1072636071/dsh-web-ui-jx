// @vitest-environment jsdom
/**
 * 气泡左侧手柄点击收起 —— ADR-0026 改型测试。
 *
 * 背景：「整泡拖拽面」（ADR-0022 工单02）收敛为「气泡外部左侧手柄点击直接收起」。
 * 本文件覆盖手柄的 DOM 存在性判定与点击交互。
 *
 * 需要 DOM 类型，故本文件单独声明 jsdom 环境（vitest 配置注释约定的
 * 按文件覆盖机制）；仓内其余纯逻辑测试维持 node 环境惯例不变。
 */
import { describe, expect, it } from "vitest";
import { isBubbleHandleHit } from "../session-bubbles.ts";

describe("isBubbleHandleHit: 手柄命中判定（ADR-0026 遗留原语）", () => {
  /** 从 HTML 片段取首个元素的最小构造器。 */
  function makeEl(html: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html;
    const el = host.firstElementChild;
    if (el === null) throw new Error("bad fixture html");
    return el;
  }

  it("手柄自身命中 ⇒ true", () => {
    expect(
      isBubbleHandleHit(makeEl('<span data-jx-drag-handle=""></span>')),
    ).toBe(true);
  });

  it("手柄内部装饰元素经 closest 命中 ⇒ true", () => {
    const inner = makeEl('<span data-jx-drag-handle=""><i></i></span>')
      .firstElementChild as Element;
    expect(isBubbleHandleHit(inner)).toBe(true);
  });

  it("气泡本体 / 标题等非手柄目标 ⇒ false", () => {
    const bubble = makeEl(
      '<div class="bubble"><span class="title"></span></div>',
    );
    expect(isBubbleHandleHit(bubble)).toBe(false);
    expect(isBubbleHandleHit(bubble.querySelector(".title"))).toBe(false);
  });

  it("null / 非 Element 目标 ⇒ false（防御性短路）", () => {
    expect(isBubbleHandleHit(null)).toBe(false);
    expect(isBubbleHandleHit(window)).toBe(false);
  });
});
