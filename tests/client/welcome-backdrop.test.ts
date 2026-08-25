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
