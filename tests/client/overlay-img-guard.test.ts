// @vitest-environment jsdom
/**
 * overlay-img-guard 单元测试（浮层 img 节点自愈守卫）。
 *
 * 锁定不变量：浮层盒直接子级 <img> 集合 ≡ ref 白名单（恒 ≤ 2）。
 * 覆盖：
 *   - 建守卫时同步裁剪存量越界 img；
 *   - MutationObserver 裁剪运行期塞入的越界 img（含外部 appendChild 场景）；
 *   - 白名单内的 React 节点不受影响（含白名单动态收缩：underlay 退场后
 *     其节点从白名单移除，若仍挂盒内会被裁掉——与 React commit 时序一致）；
 *   - 只管辖直接子级：嵌套在子 div 里的 img 不动；
 *   - 非 img 直接子节点（气泡列等）不动；
 *   - 裁剪回调按批上报数量；disconnect 后停止观察。
 */

import { describe, expect, it, vi } from "vitest";
import { createOverlayImgGuard } from "../../src/client/components/overlay-img-guard.ts";

/** 造一个浮层盒：1 张白名单主图 + 可选越界 img. */
function makeBox(): {
  box: HTMLDivElement;
  main: HTMLImageElement;
  addStrayImg: (src?: string) => HTMLImageElement;
} {
  const box = document.createElement("div");
  box.setAttribute("data-jx-character", "");
  const main = document.createElement("img");
  main.src = "/api/dsh-jx/character/working-v4.webp";
  box.appendChild(main);
  document.body.appendChild(box);
  return {
    box,
    main,
    addStrayImg: (src = "/api/dsh-jx/character/error.webp") => {
      const img = document.createElement("img");
      img.src = src;
      box.appendChild(img);
      return img;
    },
  };
}

/** 等 MutationObserver 微任务批触发. */
async function flushObserver(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("overlay-img-guard（浮层 img 白名单不变量）", () => {
  it("建守卫时同步裁剪存量越界 img，白名单主图保留", () => {
    const { box, main, addStrayImg } = makeBox();
    addStrayImg();
    addStrayImg();
    expect(box.querySelectorAll(":scope > img").length).toBe(3);

    const onPruned = vi.fn();
    createOverlayImgGuard(box, () => new Set([main]), onPruned);

    const remaining = box.querySelectorAll(":scope > img");
    expect(remaining.length).toBe(1);
    expect(remaining[0]).toBe(main);
    expect(onPruned).toHaveBeenCalledWith(2);
  });

  it("运行期塞入越界 img（外部 appendChild）被 observer 即时裁掉", async () => {
    const { box, main, addStrayImg } = makeBox();
    const onPruned = vi.fn();
    createOverlayImgGuard(box, () => new Set([main]), onPruned);

    // 模拟实测场景：外部来源一次性塞入多张相同 img。
    addStrayImg("/api/dsh-jx/character/working-v4.webp");
    addStrayImg("/api/dsh-jx/character/working-v4.webp");
    addStrayImg("/api/dsh-jx/character/working-v4.webp");
    await flushObserver();

    const remaining = box.querySelectorAll(":scope > img");
    expect(remaining.length).toBe(1);
    expect(remaining[0]).toBe(main);
    expect(onPruned).toHaveBeenCalledWith(3);
  });

  it("白名单收缩：underlay 从白名单移除后，其残留节点被裁掉", async () => {
    const { box, main } = makeBox();
    const underlay = document.createElement("img");
    underlay.src = "/api/dsh-jx/character/transition-idle-working.webp";
    box.appendChild(underlay);

    let whitelist = new Set<Element>([main, underlay]);
    const guard = createOverlayImgGuard(box, () => whitelist);
    expect(box.querySelectorAll(":scope > img").length).toBe(2);

    // 模拟 underlay 退场：React ref 摘除 → 白名单收缩；节点若仍挂盒内即越界。
    whitelist = new Set<Element>([main]);
    box.appendChild(document.createElement("img")); // 触发一次 observer
    await flushObserver();

    const remaining = Array.from(box.querySelectorAll(":scope > img"));
    expect(remaining).toEqual([main]);
    guard.disconnect();
  });

  it("只管辖直接子级 img：嵌套 img 与非 img 直接子节点不动", async () => {
    const { box, main } = makeBox();
    const guard = createOverlayImgGuard(box, () => new Set([main]));

    // 嵌套 img（子 div 内）不在管辖范围。
    const child = document.createElement("div");
    const nested = document.createElement("img");
    child.appendChild(nested);
    box.appendChild(child);
    // 非 img 直接子节点（气泡列等 React 子树）不动。
    const bubbleList = document.createElement("div");
    box.appendChild(bubbleList);
    await flushObserver();

    expect(nested.isConnected).toBe(true);
    expect(bubbleList.isConnected).toBe(true);
    expect(box.querySelectorAll(":scope > img").length).toBe(1);
    guard.disconnect();
  });

  it("disconnect 后停止观察（卸载后不再裁）", async () => {
    const { box, main, addStrayImg } = makeBox();
    const guard = createOverlayImgGuard(box, () => new Set([main]));
    guard.disconnect();

    addStrayImg();
    await flushObserver();
    expect(box.querySelectorAll(":scope > img").length).toBe(2);
  });
});
