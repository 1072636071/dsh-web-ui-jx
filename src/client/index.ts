/**
 * dsh-web-ui-jx browser half — 姜晓插件浏览器半区入口。
 *
 * 在 document.body 上挂载 React root 渲染 TokenDemo 演示组件，证明 client 半区
 * 注入链与设计令牌基座（L1 base + L2 jiangxiao remap）贯通。
 *
 * 样式注入（vite 构建时 CSS import 自动处理）：
 *   - base.css：L1 base 层（:root 字族/动效）+ @font-face（楷体/宋体 woff2）
 *   - jiangxiao.css：L2 skin remap（body[data-dsh-jiangxiao] 挂 --jx-* 双值 +
 *     --dsw-static/alias/specific remap 到唐风色板）
 *   - fx.css：L2 装饰层（五类 FX 特效，html 上 fx-* 类控制）
 *
 * 主题信号：body[data-ds-dark-theme] 由宿主控制（存在=暗，不存在=浅）；
 * L2 remap 的 --jx-* 双值自动跟随，组件无需主题选择器。本工单在 body 上
 * 设置 data-dsh-jiangxiao 触发 L2 remap 挂载。
 *
 * FX 特效系统（工单 09）：applyFx() 读取 localStorage('jx-fx') 在 html 上
 * 增删 fx-shimmer/fx-fall/fx-grain/fx-breathe/fx-micro 类，五类特效默认全开，
 * prefers-reduced-motion 下自动全关。
 *
 * 后续工单在此扩展为：
 *   - 工单 04：右下角常驻角色浮层（已注入 CharacterOverlay）
 *   - 工单 08：管理界面（ADR-0004 起内嵌 SettingsCard 第三个 section，
 *     不再作为右上角浮层独立渲染）
 *   - 工单 10：侧边栏入口与设置卡（已注入 SidebarEntry；设置卡含 FX 五类开关
 *     + 管理界面 section，调 setFxEnabled 即时生效 + 持久化）
 *
 * @module dsh-web-ui-jx/client
 */

import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ISessions } from "@deepseek-ai/dsh-client-runtime/client";
import { createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { CharacterOverlay } from "./components/CharacterOverlay.tsx";
import { SidebarEntry } from "./components/SidebarEntry.tsx";
import { applyFx } from "./fx/index.ts";
import { createOverlaySessionRuntime } from "./state-machine/overlay-session-runtime.ts";
import type { OverlaySessionRuntime } from "./state-machine/overlay-session-runtime.ts";
import {
  getVariantRotationEnabled,
  subscribeVariantRotationEnabled,
} from "./state-machine/overlay-settings.ts";
import { initSkin } from "./skin.ts";
import "./styles/base.css";
import "./styles/jiangxiao.css";
import "./styles/fx.css";

/** Client services required（令牌基座 + 动画挂钩需 sessions）. */
export const inject: string[] = ["sessions"];

/** 容器元素形状：暂存 React root 引用（ADR-0017 D2 跨闭包清扫用）. */
interface RootHostElement extends HTMLElement {
  /** 本容器对应的 React root；挂载后立即写入（ADR-0017 D2）. */
  __jxRoot?: Root | undefined;
}

/**
 * 判定一个 body 直接子元素是否为姜晓插件自身的「逃逸残留」React root 容器。
 *
 * ADR-0017 起 `apply()` 挂载的容器都带 `data-dsh-jx-root` 标记；但在那之前的
 * 旧版本（及宿主侧历史缓存的服务态）生成的容器**不带该标记**，却以 React root
 * 直接挂在 `document.body` 下渲染姜晓浮层。识别依据就一个：**body 直接子、
 * 无标记、但内含本插件浮层特征 `[data-jx-character]`**。宿主或其他插件不会
 * 在 body 直接子元素里挂我们的浮层却不打标记，故该判断不会误伤；带标记的
 * 规范容器已由主路径（标记选择器）处理，这里也不会重复命中。
 *
 * @param el - body 直接子元素候选。
 * @returns true 表示是本插件无标记的残留浮层容器。
 */
function isJxResidualRoot(el: HTMLElement): boolean {
  // 已带规范标记 → 由标记选择器路径清扫，这里不算。
  if (el.hasAttribute("data-dsh-jx-root")) return false;
  // 含本插件浮层特征（直接或间接包含 [data-jx-character]）即视为残留宿主。
  return el.querySelector('[data-jx-character]') !== null;
}

/**
 * 清扫残留的插件根容器（ADR-0017 D2）：先借暂存引用完整卸载旧 root
 * （终止其内部订阅与 effects），再移除节点。unmount 失败不阻断新挂载
 * （旧 fiber 已死，最坏退化为摘除 DOM——仍好于叠加孤儿浮层）。
 *
 * 兼容两类残留：
 *   1. 规范容器（带 `data-dsh-jx-root` 标记）——ADR-0017 起 apply 挂载的形态；
 *   2. 旧版无标记容器——历史 bundle 生成的 React root 容器（不带标记逃逸清扫，
 *      渲染多只姜晓并叠加）。按 {@link isJxResidualRoot} 识别后一并清理。
 *
 * @param doc - 承载插件容器的文档。
 */
function sweepResidualRoots(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll("[data-dsh-jx-root]"))) {
    const stale = el as RootHostElement;
    try {
      stale.__jxRoot?.unmount();
    } catch {
      // 旧 root 卸载失败：静默继续摘除节点。
    }
    stale.remove();
  }

  // ADR-0017 加固（本工单）：旧版无标记的逃逸容器不会命中上面的标记选择器，
  // 需按 isJxResidualRoot 逐个识别清理，堵住「硬刷新后仍多只姜晓」的缺口。
  for (const el of Array.from(doc.body.children)) {
    if (!(el instanceof HTMLElement)) continue;
    if (!isJxResidualRoot(el)) continue;
    const stale = el as RootHostElement;
    try {
      stale.__jxRoot?.unmount();
    } catch {
      // 同上：unmount 失败退化为摘除 DOM。
    }
    el.remove();
  }
}

/**
 * 内部根组件：渲染 CharacterOverlay + SidebarEntry。
 *
 * ADR-0004 起 ManagementUI 内嵌 SettingsCard 第三个 section，不再独立渲染，
 * RootApp 无需 managementVisible 状态。
 * ADR-0007：CharacterOverlay 接收 sessions prop 供会话气泡列订阅。
 * ADR-0008：CharacterOverlay 接收 runtime prop（会话级状态机焦点会话 playback）。
 *
 * @param props.sessions - 会话数据源（传入 CharacterOverlay 供气泡列订阅）.
 * @param props.runtime - 会话级状态机 runtime（焦点会话 playback 驱动浮层）.
 * @returns CharacterOverlay + SidebarEntry.
 */
function RootApp({
  sessions,
  runtime,
}: {
  sessions?: ISessions | undefined;
  runtime?: OverlaySessionRuntime | undefined;
}) {
  return createElement(
    Fragment,
    null,
    createElement(CharacterOverlay, { sessions, runtime }),
    createElement(SidebarEntry),
  );
}

/**
 * Client plugin body：在 document.body 上设置 data-dsh-jiangxiao 触发 L2
 * jiangxiao skin remap 挂载，并挂载 React root 渲染：
 *   - CharacterOverlay（右下角角色浮层，<img> 播放 idle.webp）
 *   - SidebarEntry（左侧边缘侧边栏入口，工单 10；展开后含设置卡，设置卡内嵌
 *     皮肤/特效/管理三个可折叠 section，ADR-0004）
 * 最后启动 FX 特效系统（applyFx 读取 localStorage + reduced-motion 判定，
 * 在 html 上增删 fx-* 类）。
 *
 * ADR-0017 可重入约束：宿主存在运行期插件重载机制（client-hmr rebuilt 帧、
 * 动态包 runner invalidate+重建），本函数会在不刷新页面的情况下被再次执行。
 * 因此：挂载物（React root + [data-dsh-jx-root] 容器）必须在 ctx.effect
 * 清理器中完整卸载；入口先清扫残留容器再挂新盒。任何后续新增的 body 直挂
 * DOM 代码必须同样纳入这两条清理路径。
 *
 * @param _ctx - client root context（后续工单用 slots/locale 等）.
 */
export function apply(ctx: ClientContext): void {
  // 初始化唐风皮肤：按持久化开关设置 body[data-dsh-jiangxiao]（默认开）。
  // 一键开关由 SettingsCard 调 setSkinEnabled，此处只做启动时的初始同步。
  initSkin();

  // ADR-0017 D2：入口防御性清扫。残留的旧容器可能属于已作废模块闭包
  // （HMR invalidate 后旧 root 引用不可达），借容器上暂存的 root 引用
  // 完整卸载后再移除节点，避免孤儿浮层叠加（多只姜晓重叠）。
  sweepResidualRoots(document);

  const container = document.createElement("div");
  container.dataset.dshJxRoot = "";
  const root = createRoot(container);
  // 暂存 root 供未来清扫（含跨模块闭包）完整卸载（ADR-0017 D2）。
  (container as RootHostElement).__jxRoot = root;
  document.body.appendChild(container);
  // 并列渲染 CharacterOverlay（右下角角色浮层）与 SidebarEntry（左侧边缘
  // 侧边栏入口，含设置卡 + 内嵌管理界面 section）。浮层与侧边栏均
  // position:fixed 自带定位，不参与容器流式布局，互不干扰。
  // ADR-0007：sessions 传入 CharacterOverlay 供会话气泡列订阅。
  // ADR-0008：runtime 传入 CharacterOverlay，浮层订阅焦点会话 playback。
  const sessions = ctx.get("sessions");
  const runtime =
    sessions !== undefined
      ? createOverlaySessionRuntime(sessions, {
          // ADR-0013 D7：动作轮换开关由设置存储提供（默认开）。
          variantRotationEnabled: getVariantRotationEnabled,
        })
      : undefined;
  root.render(createElement(RootApp, { sessions, runtime }));

  // 启动 FX 特效系统。
  applyFx();

  // ADR-0008：runtime 生命周期随 ctx.effect（dispose 释放全部订阅 + tick timer）。
  // ADR-0013：开关变化触发 runtime.refresh() 重评估轮换。
  if (runtime !== undefined) {
    const unsubVariantRotation = subscribeVariantRotationEnabled(() => {
      runtime.refresh();
    });
    ctx.effect(
      () => {
        unsubVariantRotation();
        return runtime.dispose;
      },
      "dsh-web-ui-jx: overlay session runtime",
    );
  }

  // ADR-0017 D1：规范清理补全 —— root 卸载与容器移除随 fiber 走。
  // 此前只 dispose runtime，React 树滞留 DOM 成为孤儿浮层；本 effect
  // 无条件注册（sessions 缺失、runtime 未创建时同样要能清理挂载物）。
  ctx.effect(
    () => {
      return () => {
        root.unmount();
        container.remove();
      };
    },
    "dsh-web-ui-jx: client root lifecycle",
  );
}
