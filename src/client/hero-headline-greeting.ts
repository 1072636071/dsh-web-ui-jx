/**
 * hero-headline-greeting — 占用宿主 `conversation.hero.headline` slot 的接线模块。
 *
 * ── 集成事实（已核实，务必遵守）──
 *  - 宿主已合入 slot `conversation.hero.headline`（kind single / scope root），
 *    owner props = { className?: string }；空态 hero 会传入宿主的标题样式类，
 *    占用者应把它应用到自己的文本节点，否则字体/字号与宿主不一致（见 HeroHeadline）。
 *   插件缺席（disabled / 未安装）时宿主回落原文案「探索未至之境」，无空白标题。
 *  - npm 上的 @deepseek-ai/dsh-client-ui-conversation@0.1.2-alpha.5（9/2 发布）
 *    **不含**该 slot，故本工单**不**添加 peerDependency（ADR-0033 的依赖项推迟到
 *    宿主发布含 slot 的版本后再加）。
 *
 * ── ADR-0033 临时形态（TEMPORARY）──
 * 为在不引入 peerDependency 的前提下让 TS 通过，本文件对 SlotMap 做**本地模块扩充**
 * 声明 `conversation.hero.headline`（owner { className?: string }），与宿主运行时声明
 * 同键。运行期实际渲染点由宿主提供，本插件只按字符串键占用（运行时字符串占用）。
 *
 * ── 切换条件（SWITCH，宿主发布含 slot 的版本后执行）──
 *   1) 加 peerDependency @deepseek-ai/dsh-client-ui-conversation（devDep 即可，取类型）；
 *   2) import 该包的 client 类型（其 SlotMap 扩充自带 owner 类型），删除下方本地扩充；
 *   3) HERO_HEADLINE_SLOT 保持字符串常量不变（运行期键不变）。
 *
 * 清理路径（ADR-0017 可重入约束）：ctx.slots.inject 内部经调用方 ctx.effect 自动清理
 * （fiber 卸载 = 级联卸载），无需手动挂清理器；HMR 重跑 apply 时 occupant 随之卸载。
 *
 * @module dsh-web-ui-jx/client
 */

import type { ClientContext, SlotRegistry } from "@deepseek-ai/dsh-client-runtime/client";
import { HeroHeadline } from "./components/HeroHeadline.tsx";
import { getGreetingEnabled, greetingEnabledStore } from "./greeting-enabled.ts";

// —— ADR-0033 临时形态：本地 SlotMap 扩充（见文件头注释 SWITCH）——
// 与宿主运行期声明同键；一旦宿主发布含 slot 的类型包，删此块并改 import 真实类型。
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "conversation.hero.headline": {
      kind: "single";
      scope: "root";
      owner: { className?: string };
    };
  }
}

/** hero 标题 slot 运行期键（ADR-0033 临时形态，见文件头注释）。 */
export const HERO_HEADLINE_SLOT = "conversation.hero.headline" as const;

/**
 * 占用 hero 标题 slot：注册时段问候组件。
 *
 * 经 ctx.slots.inject 注册——该调用通过调用方的 ctx.effect 自动清理
 * （fiber 卸载 = 级联卸载，ADR-0017 可重入约束），无需手动挂清理器。
 *
 * 响应式开关（ADR-0036 D8）：本函数订阅 `greetingEnabledStore` 快照——
 *   - 开（默认）：占用 slot，渲染时段问候文案；
 *   - 关：注销 slot（dispose inject），slot 回到未占用态，宿主回落原文案
 *     「探索未至之境」（ADR-0033 fallback 行为），即「个性化问候」整体静默。
 * 切换即时生效：开关翻转经订阅者同步占用/注销，无需重挂整棵 React 树。
 * 整个订阅 + 占用生命周期包在 ctx.effect 内，fiber 卸载（插件重载/HMR）
 * 时级联清理（ADR-0017），无遗留占用。
 *
 * 防御：宿主未提供 slots 服务时（如测试假 ctx、或宿主版本未含该服务），
 * 跳过占用，宿主回落原文案（ADR-0033 fallback 行为），不抛错、不 hack。
 *
 * @param ctx - client root context（需注入 slots 服务）。
 */
export function registerHeroHeadlineGreeting(ctx: ClientContext): void {
  const slots = (ctx as { slots?: SlotRegistry | undefined }).slots;
  if (slots === undefined) return;
  // 占用/注销随开关反应式切换，整体纳入本 effect 生命周期（ADR-0017）。
  ctx.effect(() => {
    let disposeInject: (() => void) | undefined;
    const sync = (): void => {
      if (getGreetingEnabled()) {
        if (disposeInject === undefined) {
          disposeInject = slots.inject(HERO_HEADLINE_SLOT, () =>
            slots.register({ name: HERO_HEADLINE_SLOT }, HeroHeadline),
          );
        }
      } else if (disposeInject !== undefined) {
        // 关：注销占用，宿主回落原文案（ADR-0033 fallback）。
        disposeInject();
        disposeInject = undefined;
      }
    };
    sync();
    const unsub = greetingEnabledStore.subscribe(sync);
    return () => {
      unsub();
      disposeInject?.();
    };
  }, "dsh-web-ui-jx: hero headline greeting");
}
