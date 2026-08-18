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
 *   - 工单 08：管理界面（已注入 ManagementUI，含导入面板 + 已导入列表）
 *   - 工单 10：侧边栏入口与设置卡（已注入 SidebarEntry，由它控制 ManagementUI
 *     显隐；设置卡含 FX 五类开关，调 setFxEnabled 即时生效 + 持久化）
 *
 * @module dsh-web-ui-jx/client
 */

import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { createElement, Fragment, useState } from "react";
import { createRoot } from "react-dom/client";
import { CharacterOverlay } from "./components/CharacterOverlay.tsx";
import { ManagementUI } from "./components/ManagementUI.tsx";
import { SidebarEntry } from "./components/SidebarEntry.tsx";
import { TokenDemo } from "./components/TokenDemo.tsx";
import { applyFx } from "./fx/index.ts";
import "./styles/base.css";
import "./styles/jiangxiao.css";
import "./styles/fx.css";

/** Client services required（令牌基座仅需 React 挂载到 document.body）. */
export const inject: string[] = [];

/**
 * 内部根组件：管理 ManagementUI 显隐状态，由 SidebarEntry 的「进入管理界面」
 * 回调控制。
 *
 * 工单 10：SidebarEntry 作为侧边栏入口常驻左侧边缘，点击展开为设置卡（含
 * FX 五类开关），设置卡内「进入管理界面」按钮触发 onOpenManagement 回调，
 * 将 managementVisible 设为 true，ManagementUI 显现。
 *
 * @returns TokenDemo + CharacterOverlay + SidebarEntry + ManagementUI（条件渲染）.
 */
function RootApp() {
  // managementVisible：ManagementUI 是否可见（默认 false，由侧边栏入口控制显隐）
  const [managementVisible, setManagementVisible] = useState(false);

  /** 侧边栏入口「进入管理界面」回调：显示 ManagementUI. */
  const handleOpenManagement = () => {
    setManagementVisible(true);
  };

  return createElement(
    Fragment,
    null,
    createElement(TokenDemo),
    createElement(CharacterOverlay),
    createElement(SidebarEntry, { onOpenManagement: handleOpenManagement }),
    createElement(ManagementUI, { visible: managementVisible }),
  );
}

/**
 * Client plugin body：在 document.body 上设置 data-dsh-jiangxiao 触发 L2
 * jiangxiao skin remap 挂载，并挂载 React root 渲染：
 *   - TokenDemo（令牌基座演示）
 *   - CharacterOverlay（右下角角色浮层，<img> 播放 idle.webp）
 *   - SidebarEntry（左侧边缘侧边栏入口，工单 10；展开后含设置卡 + 进入管理界面入口）
 *   - ManagementUI（右上角管理界面，由 SidebarEntry 控制显隐）
 * 最后启动 FX 特效系统（applyFx 读取 localStorage + reduced-motion 判定，
 * 在 html 上增删 fx-* 类）。
 *
 * @param _ctx - client root context（本工单暂不使用，后续工单用 slots/locale 等）.
 */
export function apply(_ctx: ClientContext): void {
  // 触发 L2 jiangxiao skin remap 挂载（body[data-dsh-jiangxiao] 选择器生效）
  document.body.dataset.dshJiangxiao = "";

  const container = document.createElement("div");
  container.dataset.dshJxRoot = "";
  document.body.appendChild(container);
  const root = createRoot(container);
  // 同一 root 下并列渲染 TokenDemo（令牌基座演示）、CharacterOverlay（右下角角色浮层）、
  // SidebarEntry（左侧边缘侧边栏入口，工单 10）与 ManagementUI（右上角管理界面，
  // 由 SidebarEntry 控制显隐）。浮层与侧边栏均 position:fixed 自带定位，
  // 不参与容器流式布局，互不干扰。
  root.render(createElement(RootApp));

  // 启动 FX 特效系统：读 localStorage('jx-fx') + prefers-reduced-motion 判定，
  // 在 html 上增删 fx-shimmer/fx-fall/fx-grain/fx-breathe/fx-micro 类。
  // 默认全开；reduced-motion 下全关。fall 飘落由 JS 创建装饰层 + Web Animations API。
  applyFx();
}
