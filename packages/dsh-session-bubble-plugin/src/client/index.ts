/**
 * dsh-session-bubble-plugin browser half — 会话气泡薄壳。
 *
 * 在 document.body 上挂载一个极简 fixed 容器，承载 dsh-session-bubble 库的
 * SessionBubbleList：归组/保留/拖拽/跨刷新留存全部由库提供（单一事实源）。
 * 无浮层、无素材、无设置卡（ADR-0029 D9 薄壳最小化；保留模式默认开，
 * 薄壳不带设置入口）。
 *
 * 主题：库自带 `--jx-*` 深浅双值默认层（bubble-theme.css），随宿主官方信号
 * `data-ds-dark-theme` 切换；宿主同名变量自然覆盖。
 *
 * @module dsh-session-bubble-plugin/client
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type { IWorkspaces } from "@deepseek-ai/dsh-api-workspace-controller/client";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  SessionBubbleList,
  type PendingInteractionsSource,
} from "../../../dsh-session-bubble/src/index.ts";
import "./root.css";

/** 薄壳容器：暂存 React root 引用，供清扫时先 unmount 再移除（ADR-0017 D2）. */
type BubbleShellContainer = HTMLDivElement & { __bubbleRoot?: Root };

/** Client services required（气泡列需会话数据源 + 归档权威工作区 +
 * 待交互源——宿主 SDK 升级后 pendingInteraction 由 uiSession.pendingInteractions 承载）. */
export const inject: string[] = ["sessions", "workspaces", "uiSession"];

/** 宿主 uiSession 服务的结构子集（只消费 pendingInteractions 观察源）. */
interface UiSessionLike {
  readonly pendingInteractions?: PendingInteractionsSource | undefined;
}

/**
 * 薄壳根组件：fixed 容器包裹气泡列。
 *
 * @param props.sessions - 会话数据源（气泡列订阅）.
 * @param props.workspaces - 工作区数据源（归档排除集派生 + archiveSession）.
 * @param props.pendingInteractions - 宿主待交互源（朱砂待交互呈现事实源）.
 * @returns fixed 容器内的气泡列.
 */
function BubbleShell({
  sessions,
  workspaces,
  pendingInteractions,
}: {
  sessions?: ISessions | undefined;
  workspaces?: IWorkspaces | undefined;
  pendingInteractions?: PendingInteractionsSource | undefined;
}) {
  return createElement(
    "div",
    { className: "dsh-bubble-shell" },
    createElement(SessionBubbleList, { sessions, workspaces, pendingInteractions }),
  );
}

/**
 * Client plugin body：挂载 fixed 容器并渲染气泡列。
 *
 * ADR-0017 可重入约束同根插件：容器与 React root 随 ctx.effect 清理器
 * 完整卸载；入口先清扫残留容器再挂新盒。
 *
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // ADR-0017 D2：防御性清扫残留容器（HMR 重载/重建场景下旧容器可能滞留）。
  // 先 unmount 暂存 root（完整释放订阅）再移除，避免逃逸旧树空转。
  for (const el of Array.from(
    document.querySelectorAll("body > [data-dsh-bubble-shell]"),
  )) {
    const ref = (el as BubbleShellContainer).__bubbleRoot;
    if (ref !== undefined) {
      try {
        ref.unmount();
      } catch {
        // unmount 失败不阻断（旧 fiber 已死，最坏退化为摘除 DOM），
        // 与根插件 root-lifecycle.ts 的 ADR-0017 D2 先例一致。
      }
    }
    el.remove();
  }

  const container = document.createElement("div") as BubbleShellContainer;
  container.dataset.dshBubbleShell = "true";
  document.body.appendChild(container);
  const root = createRoot(container);
  // 暂存 root 供未来清扫完整卸载（ADR-0017 D2）。
  container.__bubbleRoot = root;
  root.render(
    createElement(BubbleShell, {
      sessions: ctx.get("sessions"),
      workspaces: ctx.get("workspaces"),
      pendingInteractions: (ctx.get("uiSession") as UiSessionLike | undefined)
        ?.pendingInteractions,
    }),
  );

  // ADR-0017 D1：root 卸载与容器移除随 fiber 走。
  ctx.effect(
    () => {
      return () => {
        root.unmount();
        container.remove();
      };
    },
    "dsh-session-bubble-plugin: client root lifecycle",
  );
}
