// @vitest-environment jsdom
/**
 * welcome-backdrop 配置 + 运行时测试（ADR-0024 验收口径）。
 *
 * 覆盖范围：
 *   1. 配置读写（localStorage 持久化、钳制、默认值）。
 *   2. 背景层挂载/卸载生命周期（mount → sync → unmount）。
 *   3. CSS 变量联动（--jx-panel-alpha 随开关/滑杆变化）。
 *   4. 残余清扫（ADR-0017 可重入约束覆盖面）。
 *   5. 皮肤联动（皮肤关 → 层卸载，无论背景开关状态）。
 *
 * @module dsh-web-ui-jx/tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BACKDROP_ENABLED,
  DEFAULT_PANEL_OPACITY,
  DEFAULT_VEIL_OPACITY,
  DEFAULT_WALL_OPACITY,
  clampBackdropOpacity,
  getBackdropEnabled,
  getBubbleAlpha,
  getInputAlpha,
  getPanelOpacity,
  getSelectorAlpha,
  getSidebarAlpha,
  getTipAlpha,
  getVeilOpacity,
  getWallOpacity,
  setBackdropEnabled,
  setBubbleAlpha,
  setInputAlpha,
  setPanelOpacity,
  setSelectorAlpha,
  setSidebarAlpha,
  setTipAlpha,
  setVeilOpacity,
  setWallOpacity,
  subscribeBackdrop,
} from "../../src/client/welcome-backdrop-config.ts";
import {
  SKIN_ATTR,
  initSkin,
  setSkinEnabled,
} from "../../src/client/skin.ts";
import {
  BACKDROP_ACTIVE_ATTR,
  BACKDROP_ATTR,
  startWelcomeBackdrop,
  sweepResidualBackdrops,
  syncWelcomeBackdrop,
} from "../../src/client/welcome-backdrop.ts";

// ---------------------------------------------------------------------------
// 测试前清场
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  document.body.style.cssText = "";
  // 默认皮肤开（apply 入口行为）；皮肤设置已收敛为 persistent-setting 工厂
  // 实例（内存缓存），localStorage.clear 后须 reload 重同步缓存（initSkin）。
  document.body.setAttribute(SKIN_ATTR, "");
  initSkin();
});

// ---------------------------------------------------------------------------
// 配置模块
// ---------------------------------------------------------------------------

describe("welcome-backdrop-config", () => {
  it("默认值：总开关 on、壁纸 100、面板 50、压暗 25", () => {
    expect(getBackdropEnabled()).toBe(DEFAULT_BACKDROP_ENABLED);
    expect(getWallOpacity()).toBe(DEFAULT_WALL_OPACITY);
    expect(getPanelOpacity()).toBe(DEFAULT_PANEL_OPACITY);
    expect(getVeilOpacity()).toBe(DEFAULT_VEIL_OPACITY);
  });

  it("钳制：越界值回落到 [0,100]", () => {
    expect(clampBackdropOpacity(-10, 50)).toBe(0);
    expect(clampBackdropOpacity(110, 50)).toBe(100);
    expect(clampBackdropOpacity(33.7, 50)).toBe(34);
    expect(clampBackdropOpacity(NaN, 50)).toBe(50);
  });

  it("写入后读取一致", () => {
    setBackdropEnabled(false);
    setWallOpacity(60);
    setPanelOpacity(40);
    setVeilOpacity(35);
    expect(getBackdropEnabled()).toBe(false);
    expect(getWallOpacity()).toBe(60);
    expect(getPanelOpacity()).toBe(40);
    expect(getVeilOpacity()).toBe(35);
  });

  it("五区域 alpha：默认 50、读写一致", () => {
    expect(getSidebarAlpha()).toBe(50);
    expect(getInputAlpha()).toBe(50);
    expect(getBubbleAlpha()).toBe(50);
    expect(getTipAlpha()).toBe(50);
    expect(getSelectorAlpha()).toBe(50);

    setSidebarAlpha(30);
    setInputAlpha(80);
    setBubbleAlpha(65);
    setTipAlpha(20);
    setSelectorAlpha(95);
    // 越界钳制（issue 01：与壁纸/压暗同标准）
    setSidebarAlpha(-10);
    setInputAlpha(150);
    setBubbleAlpha(NaN);
    expect(getSidebarAlpha()).toBe(0);
    expect(getInputAlpha()).toBe(100);
    expect(getBubbleAlpha()).toBe(50);
    // 还原供后续断言
    setSidebarAlpha(30);
    setInputAlpha(80);
    setBubbleAlpha(65);
    expect(getSidebarAlpha()).toBe(30);
    expect(getInputAlpha()).toBe(80);
    expect(getBubbleAlpha()).toBe(65);
    expect(getTipAlpha()).toBe(20);
    expect(getSelectorAlpha()).toBe(95);
  });

  it("订阅回调在任意配置项写入时触发", () => {
    let calls = 0;
    const unsub = subscribeBackdrop(() => {
      calls += 1;
    });
    setBackdropEnabled(false);
    expect(calls).toBe(1);
    setWallOpacity(50);
    expect(calls).toBe(2);
    setPanelOpacity(50);
    expect(calls).toBe(3);
    setVeilOpacity(30);
    expect(calls).toBe(4);
    unsub();
    setBackdropEnabled(true);
    expect(calls).toBe(4); // 退订后不再触发
  });
});

// ---------------------------------------------------------------------------
// 背景层运行时
// ---------------------------------------------------------------------------

describe("welcome-backdrop runtime", () => {
  it("启动时挂载背景层（皮肤开 + 背景开默认）", () => {
    const dispose = startWelcomeBackdrop();
    const el = document.querySelector(`[${BACKDROP_ATTR}]`);
    expect(el).not.toBeNull();
    expect(el?.parentElement).toBe(document.body);
    // 三明治结构：base + img + veil
    expect(el?.querySelector("[data-jx-backdrop-base]")).not.toBeNull();
    expect(el?.querySelector("[data-jx-backdrop-img]")).not.toBeNull();
    expect(el?.querySelector("[data-jx-backdrop-veil]")).not.toBeNull();
    dispose();
  });

  it("关闭背景开关后卸载层并清 CSS 变量", () => {
    const dispose = startWelcomeBackdrop();
    expect(document.querySelector(`[${BACKDROP_ATTR}]`)).not.toBeNull();
    expect(document.body.style.getPropertyValue("--jx-panel-alpha")).not.toBe("");

    setBackdropEnabled(false);
    syncWelcomeBackdrop();

    expect(document.querySelector(`[${BACKDROP_ATTR}]`)).toBeNull();
    expect(document.body.style.getPropertyValue("--jx-panel-alpha")).toBe("");
    dispose();
  });

  it("壁纸/面板/压暗浓度同步到 DOM", () => {
    const dispose = startWelcomeBackdrop();
    const img = document.querySelector<HTMLImageElement>(
      "[data-jx-backdrop-img]",
    );
    const veil = document.querySelector<HTMLDivElement>(
      "[data-jx-backdrop-veil]",
    );

    setWallOpacity(50);
    syncWelcomeBackdrop();
    expect(img?.style.opacity).toBe("0.5");

    setPanelOpacity(30);
    syncWelcomeBackdrop();
    expect(document.body.style.getPropertyValue("--jx-panel-alpha")).toBe(
      "0.3",
    );

    // 浅色主题（无 data-ds-dark-theme）默认叠白纱，压暗浓度写入后即时更新。
    // jsdom 会把 rgb(R G B / A) 规范化为 rgba(R, G, B, A)。
    setVeilOpacity(40);
    syncWelcomeBackdrop();
    expect(veil?.style.background).toContain("250, 245, 238");
    expect(veil?.style.background).toContain("0.4");

    dispose();
  });

  it("区域 alpha：背景开时写入 body、关闭时移除", () => {
    const dispose = startWelcomeBackdrop();

    setSidebarAlpha(30);
    setInputAlpha(80);
    setBubbleAlpha(65);
    setTipAlpha(20);
    setSelectorAlpha(95);
    syncWelcomeBackdrop();

    expect(document.body.style.getPropertyValue("--jx-panel-sidebar-alpha")).toBe("0.3");
    expect(document.body.style.getPropertyValue("--jx-panel-input-alpha")).toBe("0.8");
    expect(document.body.style.getPropertyValue("--jx-panel-bubble-alpha")).toBe("0.65");
    expect(document.body.style.getPropertyValue("--jx-panel-tip-alpha")).toBe("0.2");
    expect(document.body.style.getPropertyValue("--jx-panel-selector-alpha")).toBe("0.95");

    setBackdropEnabled(false);
    syncWelcomeBackdrop();
    expect(document.body.style.getPropertyValue("--jx-panel-sidebar-alpha")).toBe("");
    expect(document.body.style.getPropertyValue("--jx-panel-input-alpha")).toBe("");
    expect(document.body.style.getPropertyValue("--jx-panel-bubble-alpha")).toBe("");
    expect(document.body.style.getPropertyValue("--jx-panel-tip-alpha")).toBe("");
    expect(document.body.style.getPropertyValue("--jx-panel-selector-alpha")).toBe("");
    dispose();
  });

  it("皮肤关闭时即时卸载层（无论背景开关状态）", () => {
    const dispose = startWelcomeBackdrop();
    expect(document.querySelector(`[${BACKDROP_ATTR}]`)).not.toBeNull();

    setSkinEnabled(false);
    syncWelcomeBackdrop();

    expect(document.querySelector(`[${BACKDROP_ATTR}]`)).toBeNull();
    expect(document.body.style.getPropertyValue("--jx-panel-alpha")).toBe("");
    dispose();
  });

  it("dispose 清理器：卸层 + 退订 + 清 CSS 变量", () => {
    const dispose = startWelcomeBackdrop();
    expect(document.querySelector(`[${BACKDROP_ATTR}]`)).not.toBeNull();

    dispose();

    expect(document.querySelector(`[${BACKDROP_ATTR}]`)).toBeNull();
    expect(document.body.style.getPropertyValue("--jx-panel-alpha")).toBe("");
  });

  it("残余清扫：裸摘已作废模块逃逸的容器（ADR-0017）", () => {
    const stale = document.createElement("div");
    stale.setAttribute(BACKDROP_ATTR, "");
    document.body.appendChild(stale);

    sweepResidualBackdrops(document);

    expect(stale.isConnected).toBe(false);
    expect(document.querySelectorAll(`[${BACKDROP_ATTR}]`).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 表面探测器 + 中和规则（ADR-0027 D1，方案 A）
// ---------------------------------------------------------------------------

describe("welcome-backdrop surface neutralizer (ADR-0027 02)", () => {
  function makeFullViewportSurface() {
    const el = document.createElement("div");
    // jsdom 不跑布局，rect.height 恒 0；stub 返回全视口覆盖（layout seam）。
    el.getBoundingClientRect = () =>
      ({ height: window.innerHeight, width: window.innerWidth, top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth } as DOMRect);
    el.style.backgroundColor = "rgb(0, 0, 0)";
    el.style.setProperty("position", "absolute");
    document.body.appendChild(el);
    return el;
  }

  it("全视口不透明表面被标记 data-jx-backdrop-surface", () => {
    const dispose = startWelcomeBackdrop();
    const surface = makeFullViewportSurface();
    syncWelcomeBackdrop();
    expect(surface.hasAttribute("data-jx-backdrop-surface")).toBe(true);
    dispose();
  });

  it("非不透明(透明)背景表面不被标记", () => {
    const dispose = startWelcomeBackdrop();
    const surface = document.createElement("div");
    surface.style.height = `${window.innerHeight}px`;
    surface.style.backgroundColor = "transparent";
    document.body.appendChild(surface);
    syncWelcomeBackdrop();
    expect(surface.hasAttribute("data-jx-backdrop-surface")).toBe(false);
    dispose();
  });

  it("小表面积（未覆盖视口<90%）不被标记", () => {
    const dispose = startWelcomeBackdrop();
    const small = document.createElement("div");
    small.style.height = "50px";
    small.style.backgroundColor = "rgb(0, 0, 0)";
    document.body.appendChild(small);
    syncWelcomeBackdrop();
    expect(small.hasAttribute("data-jx-backdrop-surface")).toBe(false);
    dispose();
  });

  it("modal/plugin/dialog 表面不被标记（放行）", () => {
    const dispose = startWelcomeBackdrop();
    const modal = document.createElement("div");
    modal.getBoundingClientRect = () =>
      ({ height: window.innerHeight, width: window.innerWidth, top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth } as DOMRect);
    modal.style.backgroundColor = "rgb(0, 0, 0)";
    modal.setAttribute("role", "dialog");
    // 大 z-index（>100）也排除
    modal.style.zIndex = "1000";
    document.body.appendChild(modal);

    // 插件面板（data-dsh-plugin）即使全视口不透明也不应被全局中和（方案 B 玻璃处理）
    const plugin = document.createElement("div");
    plugin.getBoundingClientRect = () =>
      ({ height: window.innerHeight, width: window.innerWidth, top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth } as DOMRect);
    plugin.style.backgroundColor = "rgb(0, 0, 0)";
    plugin.setAttribute("data-dsh-plugin", "task-board");
    document.body.appendChild(plugin);

    syncWelcomeBackdrop();
    expect(modal.hasAttribute("data-jx-backdrop-surface")).toBe(false);
    expect(plugin.hasAttribute("data-jx-backdrop-surface")).toBe(false);
    dispose();
  });

  it("中和 style 注入而激活标记存在时生效、关闭后移除", () => {
    const dispose = startWelcomeBackdrop();
    const surface = makeFullViewportSurface();
    syncWelcomeBackdrop();

    // 激活时注入带 data-jx-scene-neutralizer 的 style（对齐参考项目）。
    const style = document.querySelector(
      'head style[data-jx-scene-neutralizer]',
    );
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("data-jx-backdrop-surface");
    expect(surface.hasAttribute("data-jx-backdrop-surface")).toBe(true);

    setBackdropEnabled(false);
    syncWelcomeBackdrop();
    dispose();
  });

  it("卸载后清除表面标记且中和 style 移除", () => {
    const dispose = startWelcomeBackdrop();
    const surface = makeFullViewportSurface();
    syncWelcomeBackdrop();
    expect(surface.hasAttribute("data-jx-backdrop-surface")).toBe(true);

    dispose();

    expect(surface.hasAttribute("data-jx-backdrop-surface")).toBe(false);
    expect(document.querySelector('head style[data-jx-scene-neutralizer]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 全浮层毛玻璃（ADR-0027 D2，方案 B）
// ---------------------------------------------------------------------------

describe("welcome-backdrop glass (ADR-0027 03)", () => {
  it("激活时注入的玻璃样式含 backdrop-filter blur", () => {
    const dispose = startWelcomeBackdrop();
    const style = document.querySelector("head style[data-jx-scene-neutralizer]");
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("backdrop-filter: blur(10px)");
    dispose();
  });

  it("玻璃覆盖输入卡/侧栏/通用浮层等表面选择器", () => {
    const dispose = startWelcomeBackdrop();
    const style = document.querySelector("head style[data-jx-scene-neutralizer]");
    const content = style?.textContent ?? "";
    for (const sel of [
      "[data-composer-card]",
      '[data-slot="sidebar"]',
      "[role=\"dialog\"]",
      "[data-dsh-surface=\"settings\"]",
      'bubble',
      "[class*=\"md-code-block\"]",
      "[data-dsh-plugin]",
      "[data-radix-popper-content-wrapper]",
    ]) {
      expect(content, sel).toContain(sel);
    }
    dispose();
  });

  it("玻璃规则仅在激活标记作用域内生效", () => {
    const dispose = startWelcomeBackdrop();
    const style = document.querySelector<HTMLStyleElement>(
      "head style[data-jx-scene-neutralizer]",
    );
    // 规则显式作用在 body[data-jx-wallpaper-active] 下，皮肤/插件默认样式不受污染。
    expect(style?.textContent).toContain("body[data-jx-wallpaper-active] [data-composer-card]");
    dispose();
  });
});

// ---------------------------------------------------------------------------
// reduced-motion 降级（ADR-0027 D4）
// ---------------------------------------------------------------------------

describe("welcome-backdrop reduced-motion (ADR-0027 04)", () => {
  it("注入样式含 prefers-reduced-motion 下毛玻璃全关", () => {
    const dispose = startWelcomeBackdrop();
    const style = document.querySelector<HTMLStyleElement>(
      "head style[data-jx-scene-neutralizer]",
    );
    expect(style?.textContent).toContain("@media (prefers-reduced-motion: reduce)");
    expect(style?.textContent).toContain("backdrop-filter: none");
    dispose();
  });
});

describe("welcome-backdrop layer base (ADR-0027 01)", () => {
  it("挂载时写 data-jx-wallpaper-active 双端标记（body + html）", () => {
    const dispose = startWelcomeBackdrop();
    expect(document.body.hasAttribute(BACKDROP_ACTIVE_ATTR)).toBe(true);
    expect(document.documentElement.hasAttribute(BACKDROP_ACTIVE_ATTR)).toBe(
      true,
    );
    dispose();
  });

  it("卸载/关闭后清除激活标记", () => {
    const dispose = startWelcomeBackdrop();
    expect(document.body.hasAttribute(BACKDROP_ACTIVE_ATTR)).toBe(true);

    setBackdropEnabled(false);
    syncWelcomeBackdrop();

    expect(document.body.hasAttribute(BACKDROP_ACTIVE_ATTR)).toBe(false);
    expect(document.documentElement.hasAttribute(BACKDROP_ACTIVE_ATTR)).toBe(
      false,
    );
    dispose();
  });

  it("壁纸层容器 z-index 为负值（栈位于宿主内容之下）", () => {
    const dispose = startWelcomeBackdrop();
    const el = document.querySelector<HTMLElement>(`[${BACKDROP_ATTR}]`);
    expect(el).not.toBeNull();
    // ADR-0027 D3：负 z-index，不与宿主 app 根（z-index:0/auto）同层互排。
    expect(Number(el?.style.zIndex)).toBeLessThan(0);
    dispose();
  });

  it("层被从 body 摘除后自动复挂（导航重建场景，ADR-0027 01）", () => {
    const dispose = startWelcomeBackdrop();
    const el = document.querySelector<HTMLElement>(`[${BACKDROP_ATTR}]`);
    expect(el).not.toBeNull();
    expect(el?.isConnected).toBe(true);

    // 模拟导航把 body 子树重建——本层被摘出、引用断连，但配置/皮肤仍激活。
    el?.remove();
    expect(el?.isConnected).toBe(false);

    // 订阅配置回调 / 外部同步触发 syncBackdrop，应把层复挂回 body。
    syncWelcomeBackdrop();

    const reattached = document.querySelector<HTMLElement>(`[${BACKDROP_ATTR}]`);
    expect(reattached).not.toBeNull();
    expect(reattached?.parentElement).toBe(document.body);
    expect(reattached).toBe(el); // 复用原有层元素，不重建
    dispose();
  });

  it("清扫同时清理逃逸容器残留（含未激活标记）", () => {
    const stale = document.createElement("div");
    stale.setAttribute(BACKDROP_ATTR, "");
    document.body.appendChild(stale);
    document.body.setAttribute(BACKDROP_ACTIVE_ATTR, "");
    const staleSurface = document.createElement("div");
    staleSurface.setAttribute("data-jx-backdrop-surface", "");
    document.body.appendChild(staleSurface);

    sweepResidualBackdrops(document);

    expect(stale.isConnected).toBe(false);
    expect(document.querySelectorAll(`[${BACKDROP_ATTR}]`).length).toBe(0);
    // 清扫兜清作废模块残留的激活标记 + 表面标记（ADR-0027 D5）。
    expect(document.body.hasAttribute(BACKDROP_ACTIVE_ATTR)).toBe(false);
    expect(staleSurface.hasAttribute("data-jx-backdrop-surface")).toBe(false);
  });
});
