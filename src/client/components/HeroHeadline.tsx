/**
 * HeroHeadline — 占用宿主 `conversation.hero.headline` slot 的时段问候组件。
 *
 * 集成契约（ADR-0033 已核实）：宿主空态 hero 会向该 slot 的 owner 传入标题
 * 样式类 className；占用者必须把 className 应用到自己的文本节点，否则字体/字号
 * 与宿主不一致。本组件用 `<span className={className}>` 承载问候文案。
 *
 * 渲染语义（ADR-0035 D5）：挂载时算一次问候文案（useState 初始化即冻结），
 * 不挂 timer —— 新建会话会重挂 hero，本身即刷新时机，跨档不自动刷新。
 *
 * 个性化问候总开关（ADR-0036 D8）**不在本组件**：占用/注销由接线模块
 * `hero-headline-greeting.ts` 统一收敛（关 → dispose 注入，slot 回到未占用态，
 * 宿主回落原文案）。组件保持纯展示：订阅用户名、挂载时算一次文案。
 *
 * @module dsh-web-ui-jx/client
 */

import { useSyncExternalStore, useState } from "react";
import { selectGreetingText } from "../state-machine/greeting.ts";
import { userNameStore } from "../user-name-setting.ts";

/** hero 标题 slot owner 入参（宿主传入的标题样式类，应应用到文本节点）。 */
export interface HeroGreetingOwnerProps {
  /** 宿主空态 hero 的标题样式类；占用者应应用到自己的文本节点以保持字体/字号一致。 */
  className?: string | undefined;
}

/**
 * hero 标题 slot 占用组件。
 *
 * 渲染语义（ADR-0035 D5）：时段在挂载时算一次（useState 初始化冻结），不挂 timer
 * —— 新建会话会重挂 hero，本身即刷新时机。用户名经 `userNameStore` 订阅，名字
 * 变化响应式反映到 hero（ADR-0034/0036）：有效 → 带名文案，否则不带名。
 *
 * @param props.className - 宿主传入的标题样式类（有则应用到文本节点）。
 * @returns 时段问候文本节点。
 */
export function HeroHeadline(props: HeroGreetingOwnerProps) {
  // ADR-0035 D5：挂载时算一次时段（冻结），不挂 timer。
  const [date] = useState(() => new Date());
  // ADR-0034/0036：订阅用户名，名字变化响应式反映到 hero 文案。
  const name = useSyncExternalStore(userNameStore.subscribe, userNameStore.getSnapshot);
  const text = selectGreetingText(date, name);
  return <span className={props.className}>{text}</span>;
}
