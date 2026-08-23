// @vitest-environment jsdom
/**
 * client apply 可重入回归测试（ADR-0017 验收口径）。
 *
 * 背景：宿主存在运行期插件重载机制（client-hmr rebuilt 帧 → invalidate →
 * entry.refresh() 重跑 apply()；动态包 runner 有同型路径），apply 在页面
 * 存活期内可能被多次执行。此前 apply 从不卸载旧 React 树、不移除容器，
 * 每次重载叠加一只孤儿浮层（多只完整姜晓完美重叠，多会话并行工作时
 * 文件 churn 密集而加速）。
 *
 * 本文件锁定 ADR-0017 的三条不变量：
 *   1. 连续两次 apply：文档中 [data-dsh-jx-root] 恰有一个，且为新容器；
 *   2. 入口清扫完整卸载残留容器上暂存的旧 root（跨闭包自愈路径）；
 *   3. ctx 卸载（effect disposer）：root.unmount 被调、容器移除归零。
 *
 * 测试环境注意：jsdom 无 Web Animations API（Element.animate），而 applyFx
 * 默认启动 fall 特效会调用 leaf.animate——文件头 polyfill 一个最小桩
 * （cancel 空实现即可覆盖 startFall/stopFall 路径；warp 仅在 pointermove
 * 时才触达 animate，测试不派发指针事件）。
 */

import { describe, expect, it } from "vitest";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { apply } from "../../src/client/index.ts";

// ---------------------------------------------------------------------------
// jsdom 缺口补齐：最小 Web Animations API 桩（fall 启动路径需要）
// ---------------------------------------------------------------------------

interface MinimalAnimation {
  cancel(): void;
}

if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.animate !== "function"
) {
  (Element.prototype as unknown as {
    animate: () => MinimalAnimation;
  }).animate = () => ({
    cancel: () => {},
  });
}

// jsdom 缺口补齐：最小 matchMedia 桩（reduced-motion / pointer:coarse 判定用）。
interface MinimalMediaQueryList {
  matches: boolean;
  media: string;
  onchange: unknown;
  addEventListener(): void;
  removeEventListener(): void;
  addListener(): void;
  removeListener(): void;
  dispatchEvent(): boolean;
}

if (
  typeof window !== "undefined" &&
  typeof window.matchMedia !== "function"
) {
  const stubMql = (query: string): MinimalMediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: stubMql,
  });
}

// ---------------------------------------------------------------------------
// 最小 fake ClientContext
// ---------------------------------------------------------------------------

/** effect 清理器类型（与 ctx.effect 注册 fn 的返回值一致）. */
type Disposer = () => void;

/** 带暂存 root 的容器元素形状（与 src/client/index.ts 的 RootHostElement 对齐）. */
interface RootHostLike extends HTMLElement {
  __jxRoot?: { unmount(): void } | undefined;
}

/**
 * 构造最小 fake ctx：get 恒 undefined（无 sessions → runtime 不创建，
 * CharacterOverlay 走 IDLE 兜底渲染）；effect 立即执行 fn 并收集其返回的
 * 清理器供手动触发（镜像 cordis「fn 即时执行、返回值即 disposer」语义的
 * 最小面）。
 */
function makeFakeCtx(sink: Disposer[]): ClientContext {
  const fake = {
    get: (_key: string): unknown => undefined,
    effect: (fn: () => unknown, _name?: string): unknown => {
      const result = fn();
      if (typeof result === "function") sink.push(result as Disposer);
      return undefined;
    },
  };
  return fake as unknown as ClientContext;
}

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

describe("client apply 可重入（ADR-0017）", () => {
  it("连续两次 apply：文档恰有一个 [data-dsh-jx-root]，且为新容器", () => {
    const first: Disposer[] = [];
    apply(makeFakeCtx(first));
    const firstContainer = document.querySelector("[data-dsh-jx-root]");
    expect(firstContainer).not.toBeNull();

    // 模拟宿主重载：同一文档上再次执行 apply。
    const second: Disposer[] = [];
    apply(makeFakeCtx(second));

    const containers = document.querySelectorAll("[data-dsh-jx-root]");
    expect(containers.length).toBe(1);
    expect(containers[0]).not.toBe(firstContainer); // 新盒替换旧盒

    for (const d of [...second, ...first]) d();
    expect(document.querySelectorAll("[data-dsh-jx-root]").length).toBe(0);
  });

  it("入口清扫：残留容器的暂存 root 被 unmount，节点被移除（跨闭包自愈）", () => {
    // 手工放置一个带假 root 的残留容器（模拟已作废模块闭包留下的孤儿）。
    const leftover = document.createElement("div");
    leftover.dataset.dshJxRoot = "";
    let unmounted = 0;
    const stale: RootHostLike = leftover;
    stale.__jxRoot = {
      unmount: () => {
        unmounted += 1;
      },
    };
    document.body.appendChild(leftover);

    const disposers: Disposer[] = [];
    apply(makeFakeCtx(disposers));

    expect(unmounted).toBe(1); // 完整卸载而非仅摘 DOM
    expect(leftover.isConnected).toBe(false); // 残留节点被移除
    expect(document.querySelectorAll("[data-dsh-jx-root]").length).toBe(1);

    for (const d of disposers) d();
    expect(document.querySelectorAll("[data-dsh-jx-root]").length).toBe(0);
  });

  it("ctx 卸载：root.unmount 后容器归零（规范清理路径）", () => {
    const disposers: Disposer[] = [];
    apply(makeFakeCtx(disposers));
    expect(document.querySelectorAll("[data-dsh-jx-root]").length).toBe(1);
    expect(disposers.length).toBeGreaterThanOrEqual(1);

    for (const d of disposers) d();
    expect(document.querySelectorAll("[data-dsh-jx-root]").length).toBe(0);
  });

  it("清扫对无暂存 root 的残留容器安全（降级为摘除节点，不抛错）", () => {
    const bare = document.createElement("div");
    bare.dataset.dshJxRoot = "";
    document.body.appendChild(bare);

    const disposers: Disposer[] = [];
    expect(() => apply(makeFakeCtx(disposers))).not.toThrow();
    expect(bare.isConnected).toBe(false);
    expect(document.querySelectorAll("[data-dsh-jx-root]").length).toBe(1);

    for (const d of disposers) d();
  });

  it("入口清扫加固：旧版无标记容器（React container + 浮层）被卸载移除", () => {
    // 模拟 ADR-0017 之前的旧 bundle 生成的逃逸容器：不带 data-dsh-jx-root
    // 标记，但挂有 React 18 的 __reactContainer$ 运行时键，且内含本插件的
    // 浮层特征（[data-jx-character]）。这类容器此前逃逸清扫，导致硬刷新后
    // 仍多只姜晓叠加。
    const leftover = document.createElement("div");
    const ow = leftover as RootHostLike;
    let unmounted = 0;
    ow.__jxRoot = {
      unmount: () => {
        unmounted += 1;
      },
    };
    // 模拟 React root 标记（React 18 容器元素上的 __reactContainer$xxx 键）。
    Object.defineProperty(leftover, "__reactContainer$fakeRoot", {
      value: {},
      writable: false,
    });
    // 内含浮层特征：放一个姜晓浮层容器。
    const char = document.createElement("div");
    char.dataset.jxCharacter = "";
    const img = document.createElement("img");
    img.src = "/api/dsh-jx/character/idle.webp";
    char.appendChild(img);
    leftover.appendChild(char);
    document.body.appendChild(leftover);

    const disposers: Disposer[] = [];
    apply(makeFakeCtx(disposers));

    // 加固后：无标记残留 root 被完整卸载并移除。
    expect(unmounted).toBe(1);
    expect(leftover.isConnected).toBe(false);
    // 规范新容器仍在。
    expect(document.querySelectorAll("[data-dsh-jx-root]").length).toBe(1);

    for (const d of disposers) d();
    expect(document.querySelectorAll("[data-dsh-jx-root]").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FX 装饰层生命周期（ADR-0017 覆盖面补全：fall/warp 的 body 直挂容器与
// window 监听此前不随 fiber 清理，HMR 每次重载叠加一层装饰层——与孤儿浮层
// 同族缺陷。锁定三条不变量：随卸载清理 / 重复 apply 不堆叠 / 逃逸残留可清扫）
// ---------------------------------------------------------------------------

describe("FX 装饰层可重入（ADR-0017 覆盖面补全）", () => {
  it("ctx 卸载：fall/warp 装饰层容器移除，html fx-* 类摘除", () => {
    const disposers: Disposer[] = [];
    apply(makeFakeCtx(disposers));
    // 默认全开：fall/warp 装饰层各挂一层，html 挂 fx-* 类。
    expect(document.querySelectorAll("body > [data-jx-fx-fall]").length).toBe(1);
    expect(document.querySelectorAll("body > [data-jx-fx-warp]").length).toBe(1);
    expect(document.documentElement.classList.contains("fx-fall")).toBe(true);

    for (const d of disposers) d();
    expect(document.querySelectorAll("body > [data-jx-fx-fall]").length).toBe(0);
    expect(document.querySelectorAll("body > [data-jx-fx-warp]").length).toBe(0);
    expect(document.documentElement.classList.contains("fx-fall")).toBe(false);
    expect(document.documentElement.classList.contains("fx-warp")).toBe(false);
  });

  it("连续两次 apply（不经 disposer）：装饰层不堆叠（入口清扫兜底）", () => {
    const disposers: Disposer[] = [];
    apply(makeFakeCtx(disposers));
    // 模拟宿主重载：旧 fiber 未走 disposer 的异常路径下再次 apply。
    apply(makeFakeCtx(disposers));

    expect(document.querySelectorAll("body > [data-jx-fx-fall]").length).toBe(1);
    expect(document.querySelectorAll("body > [data-jx-fx-warp]").length).toBe(1);

    for (const d of disposers) d();
    expect(document.querySelectorAll("body > [data-jx-fx-fall]").length).toBe(0);
    expect(document.querySelectorAll("body > [data-jx-fx-warp]").length).toBe(0);
  });

  it("入口清扫：摘除无归属的逃逸装饰层容器（旧模块实例残留）", () => {
    // 模拟已作废模块闭包留下的逃逸装饰层（其 stop 函数不可达）。
    const strayFall = document.createElement("div");
    strayFall.setAttribute("data-jx-fx-fall", "");
    const strayWarp = document.createElement("div");
    strayWarp.setAttribute("data-jx-fx-warp", "");
    document.body.appendChild(strayFall);
    document.body.appendChild(strayWarp);

    const disposers: Disposer[] = [];
    apply(makeFakeCtx(disposers));

    expect(strayFall.isConnected).toBe(false);
    expect(strayWarp.isConnected).toBe(false);
    // 新实例自己的一层仍在。
    expect(document.querySelectorAll("body > [data-jx-fx-fall]").length).toBe(1);
    expect(document.querySelectorAll("body > [data-jx-fx-warp]").length).toBe(1);

    for (const d of disposers) d();
  });
});
