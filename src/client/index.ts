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
import type {
  ISessions,
  IWorkspaces,
} from "@deepseek-ai/dsh-client-runtime/client";
import { createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import {
  createDshDynamicTitleTransport,
  createDshPreviewTransport,
  createDynamicTitleStore,
  createPreviewCache,
  type DynamicTitleTransport,
  type PendingInteractionsSource,
  type PreviewTransport,
} from "../../packages/dsh-session-bubble/src/index.ts";
import { CharacterOverlay } from "./components/CharacterOverlay.tsx";
import { SidebarEntry } from "./components/SidebarEntry.tsx";
import { useNewSessionGreeting } from "./new-session-greeting.ts";
import { applyFx, teardownFx } from "./fx/index.ts";
import {
  createRootContainer,
  sweepResidualRoots,
  type RootHostElement,
} from "./root-lifecycle.ts";
import { createOverlaySessionRuntime } from "./state-machine/overlay-session-runtime.ts";
import type { OverlaySessionRuntime } from "./state-machine/overlay-session-runtime.ts";
import { clearDurationCache } from "./webp-duration.ts";
import {
  getVariantRotationEnabled,
  subscribeVariantRotationEnabled,
} from "./state-machine/overlay-settings.ts";
import { initSkin } from "./skin.ts";
import { registerHeroHeadlineGreeting } from "./hero-headline-greeting.ts";
import {
  startWelcomeBackdrop,
  sweepResidualBackdrops,
} from "./welcome-backdrop.ts";
import "./styles/base.css";
import "./styles/jiangxiao.css";
import "./styles/fx.css";

/** Client services required（令牌基座 + 动画挂钩需 sessions；ADR-0022 D3/D8
 * 归档排除/真归档需 workspaces；待交互快路径需 uiSession——宿主 SDK 升级后
 * pendingInteraction 信号由 uiSession.pendingInteractions 承载；hero 标题 slot
 * 占用需 slots——ADR-0033 临时形态，运行期键见 hero-headline-greeting.ts）. */
export const inject: string[] = ["sessions", "workspaces", "uiSession", "slots"];

/** 宿主 uiSession 服务的结构子集（只消费 pendingInteractions 观察源）. */
interface UiSessionLike {
  readonly pendingInteractions?: PendingInteractionsSource | undefined;
}

/**
 * 清扫残留的 FX 装饰层容器（ADR-0017 可重入约束覆盖面补全）。
 *
 * fall/warp 的装饰层容器由 applyFx → startFall/startWarp 直挂 body。
 * 正常路径由 ctx.effect 清理器（teardownFx）移除；本函数只兜「已作废
 * 模块实例」逃逸的容器——其 stop 函数随模块失效不可达，只能按标记裸摘。
 * 本实例可能存活的装饰层由调用方先跑 teardownFx 复位，不在此处理。
 *
 * @param doc - 承载插件容器的文档。
 */
function sweepResidualFxLayers(doc: Document): void {
  for (const el of Array.from(
    doc.querySelectorAll("body > [data-jx-fx-fall], body > [data-jx-fx-warp]"),
  )) {
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
 * ADR-0022 D3/D8：CharacterOverlay 接收 workspaces prop（气泡列归档排除集
 * 派生 + archiveSession 真归档调用）。
 *
 * @param props.sessions - 会话数据源（传入 CharacterOverlay 供气泡列订阅）.
 * @param props.runtime - 会话级状态机 runtime（焦点会话 playback 驱动浮层）.
 * @param props.workspaces - 工作区数据源（归档权威在 SDK，传入气泡列）.
 * @returns CharacterOverlay + SidebarEntry.
 */
function RootApp({
  sessions,
  runtime,
  workspaces,
  previewTransport,
  dynamicTitleTransport,
  pendingInteractions,
}: {
  sessions?: ISessions | undefined;
  runtime?: OverlaySessionRuntime | undefined;
  workspaces?: IWorkspaces | undefined;
  previewTransport?: PreviewTransport | undefined;
  dynamicTitleTransport?: DynamicTitleTransport | undefined;
  pendingInteractions?: PendingInteractionsSource | undefined;
}) {
  // 姜晓新建会话台词（工单 04）：切到空会话时经既有 speech 通道弹请安台词。
  const greetingSpeech = useNewSessionGreeting(sessions);
  return createElement(
    Fragment,
    null,
    createElement(CharacterOverlay, {
      sessions,
      runtime,
      workspaces,
      previewTransport,
      dynamicTitleTransport,
      pendingInteractions,
      speech: greetingSpeech,
    }),
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
 * 详情窗数据链路（工单 16-02/16-04）：经 `ctx.connection.api` 构建预览
 * transport（createPreviewCache 缓存包装）与 AI 动态标题 transport
 * （createDynamicTitleStore 缓存/节流包装，host 半区 /api/dsh-jx/ai-title
 * 路由，浏览器零 key 暴露）；connection 缺失时两者缺省，详情窗仅显示标题。
 *
 * ADR-0017 可重入约束：宿主存在运行期插件重载机制（client-hmr rebuilt 帧、
 * 动态包 runner invalidate+重建），本函数会在不刷新页面的情况下被再次执行。
 * 因此：挂载物（React root + [data-dsh-jx-root] 容器 + fall/warp 装饰层）
 * 必须在 ctx.effect 清理器中完整卸载；入口先清扫残留容器/装饰层再挂新盒。
 * 任何后续新增的 body 直挂 DOM 代码必须同样纳入这两条清理路径。
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
  // 同约束覆盖 FX 装饰层：先 teardownFx 停掉本实例可能存活的 fall/warp
  //（容器 + window 监听 + fx-* 类一并复位，避免「DOM 已摘但模块以为还在
  // 跑」的半状态），再按标记摘除已作废模块实例逃逸的装饰层容器（其 stop
  // 函数随模块失效不可达，只能裸摘）。
  teardownFx();
  sweepResidualFxLayers(document);
  // 同约束覆盖欢迎背景壁纸层（ADR-0024）：裸摘已作废模块实例逃逸的
  // body > [data-jx-backdrop] 容器（其清理函数随模块失效不可达）。
  sweepResidualBackdrops(document);

  // ADR-0017 D1/D2：创建带标记的容器并暂存 root 引用，供未来清扫完整卸载。
  const container = createRootContainer(document);
  const root = createRoot(container);
  // 暂存 root 供未来清扫（含跨模块闭包）完整卸载（ADR-0017 D2）。
  (container as RootHostElement).__jxRoot = root;
  document.body.appendChild(container);
  // 并列渲染 CharacterOverlay（右下角角色浮层）与 SidebarEntry（左侧边缘
  // 侧边栏入口，含设置卡 + 内嵌管理界面 section）。浮层与侧边栏均
  // position:fixed 自带定位，不参与容器流式布局，互不干扰。
  // ADR-0007：sessions 传入 CharacterOverlay 供会话气泡列订阅。
  // ADR-0008：runtime 传入 CharacterOverlay，浮层订阅焦点会话 playback。
  // ADR-0022 D3/D8：workspaces 传入气泡列——archivedSessionIds 归档排除 +
  // archiveSession 真归档（归档权威在 SDK，本地不重复记账）。
  const sessions = ctx.get("sessions");
  const workspaces = ctx.get("workspaces");
  // 宿主 SDK 升级后的待交互快路径源（uiSession.pendingInteractions）：
  // 角色浮层状态机的 pending 边沿 + 气泡列的朱砂待交互呈现共用。
  const uiSession = ctx.get("uiSession") as UiSessionLike | undefined;
  const pendingInteractions = uiSession?.pendingInteractions;
  const runtime =
    sessions !== undefined
      ? createOverlaySessionRuntime(sessions, {
          // ADR-0013 D7：动作轮换开关由设置存储提供（默认开）。
          variantRotationEnabled: getVariantRotationEnabled,
          ...(pendingInteractions !== undefined ? { pendingInteractions } : {}),
        })
      : undefined;
  // 详情窗数据链路（工单 16-02/16-04）：经 connection.api 拉预览（缓存包装器），
  // 动态标题走 host 半区 /api/dsh-jx/ai-title 路由（缓存/节流包装器）。
  // connection 缺失时两者均为 undefined → 详情窗仅显示标题，完整可用。
  const connection = ctx.get("connection");
  const previewTransport =
    connection !== undefined
      ? createPreviewCache(createDshPreviewTransport(connection.api))
      : undefined;
  const dynamicTitleTransport =
    connection !== undefined
      ? createDynamicTitleStore(createDshDynamicTitleTransport())
      : undefined;
  root.render(
    createElement(RootApp, {
      sessions,
      runtime,
      workspaces,
      previewTransport,
      dynamicTitleTransport,
      pendingInteractions,
    }),
  );

  // 启动 FX 特效系统（随 fiber 走完整生命周期：ADR-0017 可重入约束——
  // fall/warp 的 body 直挂装饰层容器、window 指针监听、reduced-motion
  // 监听必须在 HMR 重载/卸载时移除，否则每次重载叠加一层装饰层）。
  ctx.effect(
    () => {
      applyFx();
      return () => {
        teardownFx();
      };
    },
    "dsh-web-ui-jx: fx lifecycle",
  );

  // 欢迎背景壁纸层（ADR-0024）：挂载/同步/卸载随 fiber 走完整生命周期。
  // startWelcomeBackdrop 返回的清理函数退订配置变化 + 卸层 + 清
  // --jx-panel-alpha；皮肤开关切换后的即时同步由 SettingsCard 调
  // syncWelcomeBackdrop()（皮肤变化不走 config 订阅）。
  ctx.effect(
    () => startWelcomeBackdrop(),
    "dsh-web-ui-jx: welcome backdrop lifecycle",
  );

  // hero 标题 slot 占用（ADR-0033 临时形态 + ADR-0035 时段问候 MVP）。
  // registerHeroHeadlineGreeting 经 ctx.slots.inject 注册，该调用内部通过
  // 本 ctx 的 effect 自动清理（fiber 卸载 = 级联卸载，ADR-0017 可重入约束），
  // 故无需在此额外挂清理器；插件缺席时宿主回落原文案，无空白标题。
  registerHeroHeadlineGreeting(ctx);

  // ADR-0008：runtime 生命周期随 ctx.effect（dispose 释放全部订阅 + tick timer）。
  // ADR-0013：开关变化触发 runtime.resetRotation() 重估轮换。
  if (runtime !== undefined) {
    const unsubVariantRotation = subscribeVariantRotationEnabled(() => {
      runtime.resetRotation();
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
  // 工单 20-01：一并清空 webp-duration 模块级时长缓存（ADR-0017 可重入约束）。
  ctx.effect(
    () => {
      return () => {
        root.unmount();
        container.remove();
        clearDurationCache();
      };
    },
    "dsh-web-ui-jx: client root lifecycle",
  );
}
