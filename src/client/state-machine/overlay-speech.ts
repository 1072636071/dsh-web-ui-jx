/**
 * overlay-speech — 角色浮层台词决策（纯逻辑）。
 *
 * 深化动机（架构审查候选者 1）：台词映射（STATE_SPEECH）、惊吓台词池随机
 * （SURPRISE_LINES）与「点击惊吓抑制自动双弹」规则（ADR-0011 D4）此前焊在
 * CharacterOverlay 里，测试无法穿过接口命中。本模块把「状态变化 → 台词决策」
 * 收敛为一个小接口：decide(prev, next) → 台词 | 无 + 抑制标志。
 *
 * 抑制语义（ADR-0011 D4）：抑制仅由点击惊吓路径显式置位（suppressAuto）——
 * poke 入场/退场期间不弹自动台词，避免双弹；摸鱼彩蛋的 surprised 走自动路径
 * 正常弹惊吓台词，不受抑制影响。离开 surprised 即解除抑制。
 *
 * 台词场景表的人设依据见 docs/character-lines.md；本模块只承载触发规则。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。随机数经 random 注入（测试可控）。
 *
 * @module dsh-web-ui-jx/client
 */

import type {
  OverlayState,
  PerformanceKind,
} from "./overlay-state-machine.ts";

/** 当前可显示在浮层上的状态类型（4 循环态 + 一次性表演态，ADR-0016）。 */
export type SpeechDisplayState = OverlayState | PerformanceKind;

/** 各循环态的演示台词（状态切换时触发）。
 *  ADR-0016 四态收敛 + 表演态（done/nod-smile/frown-wave/happy/angry）；
 *  welcome 入场表演已随 ADR-0023 移除。
 *  thinking/reading 为 working 显示层轮换素材，不配独立台词（标签恒为工作中）。
 *  匹配设计 demo 的唐风角色语气。idle 不配台词（切回 idle 不弹气泡）。
 *  句尾颜文字为线条型冷感风格（memorial 017 D12/D16 定稿，逐字照用）；
 *  颜文字不计入「一句 12 字内」的字数约束（D17）。 */
const STATE_SPEECH: Partial<Record<SpeechDisplayState, string>> = {
  working: "遵命，这就去办。(・∀・)",
  error: "此事有蹊跷，容我再查。(-_-;)",
  permission: "此事需大人首肯。(`・ω・´)ゞ",
  done: "此事已毕，大人过目。(￣▽￣)",
  "nod-smile": "大人英明，姜晓这便去办。(￣ー￣)b",
  "frown-wave": "既如此，姜晓告退。(´･_･`)",
  happy: "大人笑了，姜晓也欢喜。(´▽｀)",
  angry: "久候无应，姜晓有些不耐。(¬_¬)",
};

/** 惊吓台词池（点击触发随机一句；摸鱼彩蛋随机惊吓亦从池取，ADR-0011 D4）。 */
const SURPRISE_LINES: readonly string[] = [
  "吓！(ﾟДﾟ)",
  "何人！(ﾟωﾟ)",
  "休要动手动脚！(ﾟДﾟ)ﾉ",
  "咦？可是吓到大人了？(´･ω･`)",
];

/** 台词决策结果. */
export interface SpeechDecision {
  /** 应显示的台词文本；undefined = 不弹气泡. */
  readonly text: string | undefined;
  /** 决策后自动台词是否处于抑制态（点击惊吓期间，ADR-0011 D4）. */
  readonly suppressAuto: boolean;
}

/** 台词决策器实例. */
export interface OverlaySpeech {
  /**
   * 状态变化 → 台词决策（ADR-0011 D4）：
   *   - 抑制中（点击惊吓入场/退场）不弹自动台词；
   *   - 切入 surprised 弹随机惊吓台词（自动路径，如摸鱼彩蛋）；
   *   - 离开 surprised 解除抑制；
   *   - 其余状态查 STATE_SPEECH（idle 无台词）。
   * 调用方应在状态真变时调用。
   */
  decide(
    prevState: SpeechDisplayState,
    nextState: SpeechDisplayState,
  ): SpeechDecision;
  /** 置位自动台词抑制（点击惊吓路径显式弹台词前调用，ADR-0011 D4/D5）. */
  suppressAuto(): void;
  /** 取随机惊吓台词（点击惊吓路径显式弹台词用，ADR-0011 D5）. */
  pickSurpriseLine(): string;
}

/** 台词决策器选项. */
export interface CreateOverlaySpeechOptions {
  /** 随机数注入（默认 Math.random；测试可注入确定性序列）. */
  random?: () => number;
}

/**
 * 创建台词决策器。
 *
 * @param opts - 选项（random 注入测试）。
 * @returns 台词决策器实例。
 */
export function createOverlaySpeech(
  opts?: CreateOverlaySpeechOptions,
): OverlaySpeech {
  const random = opts?.random ?? Math.random;

  let suppressed = false;

  function pickSurpriseLine(): string {
    return SURPRISE_LINES[Math.floor(random() * SURPRISE_LINES.length)]!;
  }

  function suppressAuto(): void {
    suppressed = true;
  }

  function decide(
    prevState: SpeechDisplayState,
    nextState: SpeechDisplayState,
  ): SpeechDecision {
    if (prevState === nextState) {
      return { text: undefined, suppressAuto: suppressed };
    }
    let text: string | undefined;
    if (!suppressed) {
      text =
        nextState === "surprised"
          ? pickSurpriseLine()
          : STATE_SPEECH[nextState];
    }
    // 离开 surprised 解除抑制（入场/退场各抑制一次，避免双弹）。
    if (nextState !== "surprised") {
      suppressed = false;
    }
    return { text, suppressAuto: suppressed };
  }

  return { decide, suppressAuto, pickSurpriseLine };
}
