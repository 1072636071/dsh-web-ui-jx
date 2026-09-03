/**
 * hero-headline-greeting — 占用宿主 `conversation.hero.headline` slot 的接线模块。
 *
 * ── 集成事实（已核实，务必遵守）──
 *  - 本地宿主源码已合入 slot `conversation.hero.headline`（kind single / scope root，
 *    owner props = { className?: string }）；空态 hero 会传入宿主的标题样式类，
 *    占用者应把它应用到自己的文本节点，否则字体/字号与宿主不一致（见 HeroHeadline）。
 *    插件缺席（disabled / 未安装）时宿主回落原文案「探索未至之境」，无空白标题。
 *  - npm 发布的 @deepseek-ai/dsh-client-ui-conversation（含 0.1.2-rc.1）**不含**该
 *    slot，故无官方类型可用：本模块按字符串键占用，依赖本地宿主声明；slots 服务
 *    缺失时跳过占用（见 registerHeroHeadlineGreeting 防御分支），不抛错、不 hack。
 *    宿主发布含该 slot 的版本后，再切换为 import 官方 slot 类型。
 *
 * 清理路径（ADR-0017 可重入约束）：ctx.slots.inject 内部经调用方 ctx.effect 自动清理
 * （fiber 卸载 = 级联卸载），无需手动挂清理器；HMR 重跑 apply 时 occupant 随之卸载。
 *
 * @module dsh-web-ui-jx/client
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";

import { HeroHeadline } from "./components/HeroHeadline.tsx";
import { getGreetingEnabled, greetingEnabledStore } from "./greeting-enabled.ts";

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
/** slots 服务的消费面（仅用 inject/register；npm 0.1.2 官方未发布
 * conversation.hero.headline 槽位，宿主本地声明时按字符串键占用）。 */
interface SlotsLike {
  inject(name: string, fn: () => (() => void) | undefined): (() => void) | undefined;
  register(spec: unknown, component: unknown): (() => void) | undefined;
}

export function registerHeroHeadlineGreeting(ctx: ClientContext): void {
  const slots = (ctx as { slots?: SlotsLike | undefined }).slots;
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
