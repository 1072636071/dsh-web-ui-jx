// @vitest-environment jsdom
/**
 * SettingsCard 开关接线回归测试（工单 21-02，ADR-0004/0006/0007/0013/0022/0024）。
 *
 * seam：渲染 SettingsCard → 点击各开关 → 断言（DOM aria-checked / 底层持久化
 * getter / 订阅通知 / 角色 section 项 / 重置入口）。仿 `session-bubble-list.test.ts`
 * 渲染模式（createRoot + act），零新 seam。
 *
 * 覆盖：
 *   - 皮肤开关（唐风皮肤 / 欢迎背景）写入 → getter 反映 + body[data-dsh-jiangxiao]
 *   - 特效开关：五类逐一写入 → getFxState（html fx-* 类反射）反映
 *   - 角色 section：默认折叠 → 展开后含 状态标签/动作轮换/气泡上限/保留/拖拽归档
 *   - 订阅通知：状态标签切换 → subscribeShowStateLabel 收到新值
 *   - 重置浮层位置：点击 → overlayPositionStore.reset 被调用
 *   - 拖拽归档开关②主从：①关时②禁用
 *
 * fixture 约定：beforeEach 清 localStorage + reload/reset 全部设置到默认值，
 * 保证用例间与顺序无关（persistent-setting 单例内存缓存，见工厂注释）。
 * jsdom 缺 WAAPI/matchMedia：Element.animate 与 window.matchMedia 打桩。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { act } from "react-dom/test-utils";
import { SettingsCard } from "../../src/client/components/SettingsCard.tsx";
import { SKIN_ATTR, getSkinEnabled, initSkin, setSkinEnabled } from "../../src/client/skin.ts";
import {
  applyFx,
  FX_NAMES,
  getFxState,
  type FxName,
} from "../../src/client/fx/index.ts";
import {
  getShowStateLabel,
  getVariantRotationEnabled,
  setShowStateLabel,
  setVariantRotationEnabled,
  subscribeShowStateLabel,
} from "../../src/client/state-machine/overlay-settings.ts";
import {
  getBackdropEnabled,
  reloadBackdropConfig,
  setBackdropEnabled,
} from "../../src/client/welcome-backdrop-config.ts";
import {
  getArchiveDragEnabled,
  getKeepEnabled,
  getMaxSessionBubbles,
  setArchiveDragEnabled,
  setKeepEnabled,
  setMaxSessionBubbles,
} from "../../packages/dsh-session-bubble/src/index.ts";
import { overlayPositionStore } from "../../src/client/state-machine/overlay-position.ts";

// ---------------------------------------------------------------------------
// jsdom 环境桩（WAAPI / matchMedia）
// ---------------------------------------------------------------------------

const animateStub = vi.fn(() => ({ cancel: vi.fn() }));
const mqStub = {
  get matches() {
    return false; // 默认非 reduced-motion
  },
  media: "(prefers-reduced-motion: reduce)",
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(() => false),
};

beforeAll(() => {
  // fall/warp/背景层动画需要 Element.animate（jsdom 无 WAAPI）。
  Element.prototype.animate = animateStub as unknown as Element["animate"];
  window.matchMedia = vi.fn(() => mqStub as unknown as MediaQueryList);
});

// ---------------------------------------------------------------------------
// 挂载辅助
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root | undefined;

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(SettingsCard));
  });
}

function findByLabel(label: string): HTMLElement | null {
  return container.querySelector(`[aria-label="${label}"]`);
}

function toggle(label: string): void {
  const el = findByLabel(label);
  if (el === null) throw new Error(`missing toggle: ${label}`);
  act(() => {
    el.click();
  });
}

function toggleChecked(label: string): boolean {
  const el = findByLabel(label);
  if (el === null) throw new Error(`missing toggle: ${label}`);
  return el.getAttribute("aria-checked") === "true";
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // 清空持久化 + 重置各设置单例到默认（persistent-setting 内存缓存重同步）。
  window.localStorage.clear();
  document.body.innerHTML = "";
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-dsh-jx-backdrop-active");
  document.body.removeAttribute("data-dsh-jx-backdrop-active");
  document.body.removeAttribute(SKIN_ATTR);
  initSkin();
  reloadBackdropConfig();
  setShowStateLabel(true);
  setVariantRotationEnabled(true);
  setKeepEnabled(true);
  setArchiveDragEnabled(true);
  setMaxSessionBubbles(10);
  applyFx();
});

afterEach(() => {
  if (root !== undefined) {
    act(() => {
      root!.unmount();
    });
    root = undefined;
  }
  container.remove();
  document.body.innerHTML = "";
  document.documentElement.className = "";
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 皮肤开关 section（默认展开）
// ---------------------------------------------------------------------------

describe("SettingsCard: 皮肤开关", () => {
  it("唐风皮肤开关写入/读取：点击翻转 aria-checked + getSkinEnabled + body 属性", () => {
    mount();
    expect(getSkinEnabled()).toBe(true);
    expect(toggleChecked("切换唐风皮肤")).toBe(true);
    expect(document.body.hasAttribute(SKIN_ATTR)).toBe(true);

    toggle("切换唐风皮肤");
    expect(toggleChecked("切换唐风皮肤")).toBe(false);
    expect(getSkinEnabled()).toBe(false);
    expect(document.body.hasAttribute(SKIN_ATTR)).toBe(false);

    toggle("切换唐风皮肤");
    expect(toggleChecked("切换唐风皮肤")).toBe(true);
    expect(getSkinEnabled()).toBe(true);
  });

  it("欢迎背景开关写入/读取：getBackdropEnabled 反映", () => {
    mount();
    expect(getBackdropEnabled()).toBe(true);
    toggle("切换欢迎背景");
    expect(toggleChecked("切换欢迎背景")).toBe(false);
    expect(getBackdropEnabled()).toBe(false);
    toggle("切换欢迎背景");
    expect(getBackdropEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 特效开关 section（默认展开）
// ---------------------------------------------------------------------------

describe("SettingsCard: 特效开关", () => {
  it("五类 FX 逐一写入/读取：仅目标类翻转，其余保持先前状态", () => {
    mount();
    const labels: Record<FxName, string> = {
      shimmer: "切换鎏金流光",
      fall: "切换银杏飘落",
      grain: "切换墨韵暗纹",
      warp: "切换鼠标扭曲",
      micro: "切换微交互",
    };
    for (const name of FX_NAMES) {
      expect(getFxState()[name]).toBe(true);
      expect(toggleChecked(labels[name])).toBe(true);
    }
    // 逐类切换：断言仅目标类相对先前翻转，其余与先前一致（隔离语义）。
    for (const name of FX_NAMES) {
      const before = getFxState();
      toggle(labels[name]);
      const after = getFxState();
      expect(after[name]).toBe(!before[name]);
      expect(toggleChecked(labels[name])).toBe(after[name]);
      for (const other of FX_NAMES) {
        if (other !== name) expect(after[other]).toBe(before[other]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 角色 section（默认折叠，ADR-0007）
// ---------------------------------------------------------------------------

describe("SettingsCard: 角色 section", () => {
  it("默认折叠：不渲染角色项；展开后含 状态标签/动作轮换/气泡上限/保留/拖拽归档", () => {
    mount();
    expect(findByLabel("切换姜晓状态标签")).toBeNull();

    // 展开角色 section（aria-expanded 从 false 翻转为 true）
    const header = findByLabel("折叠角色设置");
    expect(header?.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      header!.click();
    });
    expect(header?.getAttribute("aria-expanded")).toBe("true");

    expect(findByLabel("切换姜晓状态标签")).not.toBeNull();
    expect(findByLabel("切换动作轮换")).not.toBeNull();
    expect(findByLabel("会话气泡数量上限")).not.toBeNull();
    expect(findByLabel("切换查看后保留气泡")).not.toBeNull();
    expect(findByLabel("切换拖拽归档会话")).not.toBeNull();
  });

  it("状态标签开关写入/读取 + 订阅通知：subscribeShowStateLabel 收到新值", () => {
    mount();
    const onShow = vi.fn();
    const unsub = subscribeShowStateLabel(onShow);

    act(() => {
      findByLabel("折叠角色设置")!.click();
    });
    expect(toggleChecked("切换姜晓状态标签")).toBe(true);
    expect(getShowStateLabel()).toBe(true);

    toggle("切换姜晓状态标签");
    expect(toggleChecked("切换姜晓状态标签")).toBe(false);
    expect(getShowStateLabel()).toBe(false);
    expect(onShow).toHaveBeenLastCalledWith(false);

    toggle("切换姜晓状态标签");
    expect(getShowStateLabel()).toBe(true);
    expect(onShow).toHaveBeenLastCalledWith(true);
    unsub();
  });

  it("动作轮换开关写入/读取：getVariantRotationEnabled 反映", () => {
    mount();
    act(() => {
      findByLabel("折叠角色设置")!.click();
    });
    expect(getVariantRotationEnabled()).toBe(true);
    toggle("切换动作轮换");
    expect(toggleChecked("切换动作轮换")).toBe(false);
    expect(getVariantRotationEnabled()).toBe(false);
  });

  it("会话气泡数量上限输入：修改 → setMaxSessionBubbles + getter 反映", () => {
    mount();
    act(() => {
      findByLabel("折叠角色设置")!.click();
    });
    const input = findByLabel("会话气泡数量上限") as HTMLInputElement;
    expect(Number(input.value)).toBe(getMaxSessionBubbles());
    const next = 3;
    act(() => {
      // React 受控输入用原生 value setter 才能被 onChange 识别为变更。
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, String(next));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(getMaxSessionBubbles()).toBe(next);
  });

  it("查看后保留气泡开关① + 拖拽归档开关②主从：①关 → ②禁用（灰显）", () => {
    mount();
    act(() => {
      findByLabel("折叠角色设置")!.click();
    });
    expect(getKeepEnabled()).toBe(true);
    expect(getArchiveDragEnabled()).toBe(true);
    expect(findByLabel("切换拖拽归档会话")?.getAttribute("aria-disabled")).toBe(
      "false",
    );

    // ① 关 → ② 禁用（灰显 + aria-disabled），① 开 → ② 恢复
    toggle("切换查看后保留气泡");
    expect(getKeepEnabled()).toBe(false);
    expect(findByLabel("切换拖拽归档会话")?.getAttribute("aria-disabled")).toBe(
      "true",
    );

    toggle("切换查看后保留气泡");
    expect(getKeepEnabled()).toBe(true);
    expect(findByLabel("切换拖拽归档会话")?.getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("① 关时 ② 不可点击（disabled 不触发 setArchiveDragEnabled）", () => {
    mount();
    act(() => {
      findByLabel("折叠角色设置")!.click();
    });
    toggle("切换查看后保留气泡"); // ① 关
    // ② 已 disabled：点击不改变 getArchiveDragEnabled
    const archive = findByLabel("切换拖拽归档会话") as HTMLButtonElement;
    expect(archive.disabled).toBe(true);
    toggle("切换拖拽归档会话");
    expect(getArchiveDragEnabled()).toBe(true); // 未被翻转
  });
});

// ---------------------------------------------------------------------------
// 重置浮层位置（ADR-0006 决策 6）
// ---------------------------------------------------------------------------

describe("SettingsCard: 重置浮层位置", () => {
  it("点击「重置浮层位置」调用 overlayPositionStore.reset", () => {
    const resetSpy = vi.spyOn(overlayPositionStore, "reset");
    mount();
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "重置浮层位置",
    );
    expect(btn).not.toBeUndefined();
    act(() => {
      btn!.click();
    });
    expect(resetSpy).toHaveBeenCalledTimes(1);
    resetSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 重启 DSH（memorial 017）
// ---------------------------------------------------------------------------

describe("SettingsCard: 重启 DSH", () => {
  it("渲染「重启 DSH」按钮：点击 fetch('POST /api/dsh-jx/restart')", () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(new Response('{"ok":true}', { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchSpy);

    mount();
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "重启 DSH",
    );
    expect(btn).not.toBeUndefined();
    act(() => {
      btn!.click();
    });

    // 点击只发一次 POST 到重启路由，不加确认弹窗。
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/dsh-jx/restart");
    expect(init.method).toBe("POST");
  });
});
