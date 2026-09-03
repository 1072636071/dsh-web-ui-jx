/**
 * overlay-speech 纯逻辑测试（架构审查候选者 1 的深化模块）。
 *
 * seam：输入状态变化序列，断言台词决策与抑制标志。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）；随机数经 random 注入。
 *
 * 覆盖：
 *   - 状态台词：有台词状态返回对应台词；idle 无台词
 *   - 惊吓自动路径：切入 surprised 弹随机惊吓台词（摸鱼彩蛋）
 *   - 抑制（ADR-0011 D4）：suppressAuto 后入场/退场不弹自动台词，
 *     离开 surprised 解除抑制
 *   - pickSurpriseLine 从台词池取（注入确定性随机）
 *   - 同状态不弹
 */

import { describe, expect, it } from "vitest";
import { createOverlaySpeech } from "../../src/client/state-machine/overlay-speech.ts";

/** 确定性随机序列（索引台词池）. */
function makeRandom(seq: number[]): () => number {
  let i = 0;
  return () => seq[i++ % seq.length]!;
}

describe("overlay-speech: 状态台词", () => {
  it("有台词状态返回对应台词（ADR-0016 四态 + 表演态）", () => {
    const s = createOverlaySpeech();
    expect(s.decide("idle", "working").text).toBe("遵命，这就去办。(・∀・)");
    expect(s.decide("working", "permission").text).toBe(
      "此事需大人首肯。(`・ω・´)ゞ",
    );
    expect(s.decide("permission", "nod-smile").text).toBe(
      "大人英明，姜晓这便去办。(￣ー￣)b",
    );
  });

  it("idle 无台词（切回 idle 不弹）", () => {
    const s = createOverlaySpeech();
    expect(s.decide("working", "idle").text).toBeUndefined();
  });

  it("同状态不弹", () => {
    const s = createOverlaySpeech();
    expect(s.decide("working", "working").text).toBeUndefined();
  });
});

describe("overlay-speech: 惊吓自动路径（摸鱼彩蛋）", () => {
  it("切入 surprised 弹随机惊吓台词", () => {
    const s = createOverlaySpeech({ random: makeRandom([0]) });
    expect(s.decide("working", "surprised").text).toBe("吓！(ﾟДﾟ)");
  });

  it("未抑制时自动路径不置抑制", () => {
    const s = createOverlaySpeech({ random: makeRandom([0]) });
    const d = s.decide("working", "surprised");
    expect(d.suppressAuto).toBe(false);
  });
});

describe("overlay-speech: 点击惊吓抑制（ADR-0011 D4）", () => {
  it("suppressAuto 后：入场不弹自动台词", () => {
    const s = createOverlaySpeech({ random: makeRandom([0]) });
    s.suppressAuto();
    const d = s.decide("idle", "surprised");
    expect(d.text).toBeUndefined();
    expect(d.suppressAuto).toBe(true); // 仍在 surprised，抑制保持
  });

  it("suppressAuto 后：退场（离开 surprised）不弹且解除抑制", () => {
    const s = createOverlaySpeech({ random: makeRandom([0]) });
    s.suppressAuto();
    s.decide("idle", "surprised"); // 入场（抑制中，不弹）
    const d = s.decide("surprised", "idle"); // 退场
    expect(d.text).toBeUndefined();
    expect(d.suppressAuto).toBe(false); // 离开 surprised 解除
  });

  it("抑制解除后恢复正常台词", () => {
    const s = createOverlaySpeech({ random: makeRandom([0]) });
    s.suppressAuto();
    s.decide("idle", "surprised");
    s.decide("surprised", "idle");
    expect(s.decide("idle", "working").text).toBe("遵命，这就去办。(・∀・)");
  });
});

describe("overlay-speech: pickSurpriseLine", () => {
  it("从台词池取（注入确定性随机）", () => {
    const s = createOverlaySpeech({ random: makeRandom([0, 0.25, 0.5, 0.75]) });
    expect(s.pickSurpriseLine()).toBe("吓！(ﾟДﾟ)");
    expect(s.pickSurpriseLine()).toBe("何人！(ﾟωﾟ)");
    expect(s.pickSurpriseLine()).toBe("休要动手动脚！(ﾟДﾟ)ﾉ");
    expect(s.pickSurpriseLine()).toBe("咦？可是吓到大人了？(´･ω･`)");
  });
});
