/**
 * display-arbiter 纯逻辑测试（架构审查候选者 2 的深化模块）。
 *
 * seam：输入各显示层在场状态，断言胜出层。纯逻辑，不依赖 DOM、不依赖 React。
 *
 * 覆盖（对齐 ADR-0016 四态收敛后的显示层管线）：
 *   优先级链 emergency > poke > performance > easter-egg > working-rotation
 *   > parallel-working > focus-* > idle —— 每条优先级边一个用例。
 * 各层播放计划的行为覆盖由 overlay-session-runtime 测试承担。
 */

import { describe, expect, it } from "vitest";
import {
  resolveDisplayLayer,
  type DisplayArbiterInput,
} from "../../src/client/state-machine/display-arbiter.ts";

/** 默认无显示层在场、焦点 idle 的输入（逐字段覆盖构造用例）. */
function input(
  overrides: Partial<DisplayArbiterInput> = {},
): DisplayArbiterInput {
  return {
    emergencyActive: false,
    pokeActive: false,
    performanceActive: false,
    easterEggActive: false,
    workingRotationActive: false,
    parallelHold: false,
    focusState: "idle",
    ...overrides,
  };
}

describe("display-arbiter: 优先级链（ADR-0016 显示层管线）", () => {
  it("emergency 最优先（其余层全部在场也胜出）", () => {
    const layer = resolveDisplayLayer(
      input({
        emergencyActive: true,
        pokeActive: true,
        performanceActive: true,
        easterEggActive: true,
        workingRotationActive: true,
        parallelHold: true,
        focusState: "working",
      }),
    );
    expect(layer).toBe("emergency");
  });

  it("poke 次于 emergency、高于表演/彩蛋/轮换/驻留", () => {
    const layer = resolveDisplayLayer(
      input({
        pokeActive: true,
        performanceActive: true,
        easterEggActive: true,
        workingRotationActive: true,
        parallelHold: true,
      }),
    );
    expect(layer).toBe("poke");
  });

  it("performance 高于彩蛋/轮换/驻留", () => {
    const layer = resolveDisplayLayer(
      input({
        performanceActive: true,
        easterEggActive: true,
        workingRotationActive: true,
        parallelHold: true,
      }),
    );
    expect(layer).toBe("performance");
  });

  it("easter-egg 高于工作轮换与并行驻留", () => {
    const layer = resolveDisplayLayer(
      input({
        easterEggActive: true,
        workingRotationActive: true,
        parallelHold: true,
      }),
    );
    expect(layer).toBe("easter-egg");
  });

  it("working-rotation 高于并行驻留（轮换在播即显示轮换计划）", () => {
    const layer = resolveDisplayLayer(
      input({ workingRotationActive: true, parallelHold: true }),
    );
    expect(layer).toBe("working-rotation");
  });

  it("并行驻留且无显示层在场 → parallel-working", () => {
    expect(resolveDisplayLayer(input({ parallelHold: true }))).toBe(
      "parallel-working",
    );
  });

  it("焦点 working → focus-working（工作轮换）", () => {
    expect(resolveDisplayLayer(input({ focusState: "working" }))).toBe(
      "focus-working",
    );
  });

  it("焦点 idle → focus-idle（变体轮换）", () => {
    expect(resolveDisplayLayer(input({ focusState: "idle" }))).toBe(
      "focus-idle",
    );
  });

  it("焦点其他循环态 → focus-follow（permission/error 理论已被紧急层接管，防御兜底）", () => {
    expect(resolveDisplayLayer(input({ focusState: "permission" }))).toBe(
      "focus-follow",
    );
  });

  it("无焦点或焦点条目缺失 → idle", () => {
    expect(resolveDisplayLayer(input({ focusState: undefined }))).toBe("idle");
  });
});
