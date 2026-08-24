/**
 * display-arbiter — 浮层显示层仲裁（纯逻辑）。
 *
 * 深化动机（架构审查候选者 2）：显示层覆盖（紧急抢焦 / poke / 一次性表演 /
 * 摸鱼彩蛋 / 工作轮换 / 并行驻留 / 焦点跟随）的互斥规则此前只存在于 runtime
 * computeSnapshot 的分支书写顺序里，新增显示层必须读懂全函数才知道插在哪。
 * 本模块把「哪个显示层胜出」收敛为一个具名纯函数：优先级成为接口承诺，
 * 每条优先级边可独立测试。
 *
 * 优先级（高 → 低，显式，对齐 ADR-0016 四态收敛后的显示层管线）：
 *   emergency > poke > performance > easter-egg > working-rotation
 *   > parallel-working > focus-working / focus-idle / focus-follow > idle
 *
 * 各层的播放计划构造（via-idle 中转、退场计划、轮换起播）依赖 runtime 的
 * 会话/姿态闭包，仍归 runtime——仲裁只裁决「谁显示」。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。
 *
 * @module dsh-web-ui-jx/client
 */

import type { OverlayState } from "./overlay-state-machine.ts";

// ---------------------------------------------------------------------------
// 仲裁
// ---------------------------------------------------------------------------

/** 显示层种类（仲裁输出）. */
export type DisplayLayerKind =
  /** 紧急抢焦：任意会话 permission/error 接管显示（ADR-0016 紧急即时原则）. */
  | "emergency"
  /** 点击惊吓显示层覆盖（ADR-0011）. */
  | "poke"
  /** 一次性表演（done/nod-smile/frown-wave，PRD 决策 7）. */
  | "performance"
  /** 并行驻留期间的摸鱼彩蛋（ADR-0010 D7 + ADR-0016 彩蛋池收敛）. */
  | "easter-egg"
  /** working 显示层轮换在播（thinking/reading 各 2 整圈，ADR-0016 决策 5）. */
  | "working-rotation"
  /** 并行驻留：≥2 会话 running 显示 working（惰性起播工作轮换，ADR-0010 D2）. */
  | "parallel-working"
  /** 焦点会话 working：工作轮换（惰性起播）. */
  | "focus-working"
  /** 焦点会话 idle：变体轮换（ADR-0013）. */
  | "focus-idle"
  /** 焦点会话其他循环态：直接显示循环（permission/error 理论已被紧急层
   *  接管，本层为防御性兜底）. */
  | "focus-follow"
  /** 无焦点会话或焦点条目缺失：浮层停留 idle（变体轮换）. */
  | "idle";

/** 仲裁输入（各显示层的在场状态）. */
export interface DisplayArbiterInput {
  /** 紧急显示层在场（emergency !== undefined）. */
  readonly emergencyActive: boolean;
  /** poke 进行中（含回落段）. */
  readonly pokeActive: boolean;
  /** 一次性表演进行中（含退场段）. */
  readonly performanceActive: boolean;
  /** 摸鱼彩蛋进行中（含退场段）. */
  readonly easterEggActive: boolean;
  /** working 显示层轮换在播. */
  readonly workingRotationActive: boolean;
  /** 是否并行驻留（≥2 会话 running 且至少一个非 idle）. */
  readonly parallelHold: boolean;
  /** 焦点会话的当前循环态；undefined = 无焦点会话或焦点条目缺失. */
  readonly focusState: OverlayState | undefined;
}

/**
 * 裁决当前应显示的显示层。
 *
 * 优先级（高 → 低，逐条短路）：
 *   1. emergency —— 紧急抢焦最优先（打断其余层由 runtime 在状态侧执行）；
 *   2. poke —— 点击惊吓显示层覆盖，无会话时也可用；
 *   3. performance —— 一次性表演（done/权限反馈）；
 *   4. easter-egg —— 摸鱼彩蛋（仅并行驻留期间会被排程在场）；
 *   5. working-rotation —— 工作轮换在播（含待整圈边界切出的 done 驻留）；
 *   6. parallel-working —— 并行驻留，惰性起播工作轮换；
 *   7. focus-working / focus-idle / focus-follow —— 跟随焦点会话；
 *   8. idle —— 无焦点或焦点条目缺失。
 *
 * @param input - 各显示层的在场状态。
 * @returns 胜出的显示层种类。
 */
export function resolveDisplayLayer(
  input: DisplayArbiterInput,
): DisplayLayerKind {
  if (input.emergencyActive) return "emergency";
  if (input.pokeActive) return "poke";
  if (input.performanceActive) return "performance";
  if (input.easterEggActive) return "easter-egg";
  if (input.workingRotationActive) return "working-rotation";
  if (input.parallelHold) return "parallel-working";
  if (input.focusState === undefined) return "idle";
  if (input.focusState === "working") return "focus-working";
  if (input.focusState === "idle") return "focus-idle";
  return "focus-follow";
}
