/**
 * greeting 纯逻辑测试（ADR-0035 时段四档）。
 *
 * seam：喂入构造的 Date（按本地小时数），断言档位与文案。
 * 纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（ADR-0035 决策 + 工单验收）：
 *   - 四个切换点：4/5、11/12、17/18、22/23 的边界归属
 *   - wrap-around：23:00–04:59 为该休息档；05:00 起为上午
 *   - 不带名文案四档逐字（D15 保留「么」）
 *   - 带名文案 {name} 替换；name 为空/未填退化为不带名（ADR-0034 D4）
 */

import { describe, expect, it } from "vitest";
import {
  getGreetingBucket,
  GREETING_WITHOUT_NAME,
  GREETING_WITH_NAME,
  selectGreetingText,
  type GreetingBucket,
} from "../../src/client/state-machine/greeting.ts";

/** 以本地小时（可带分钟）构造 Date，隔离时区/日期影响。 */
function at(hour: number, minute = 0): Date {
  return new Date(2026, 0, 1, hour, minute, 0, 0);
}

describe("getGreetingBucket: 四档切换边界", () => {
  it("上午档 05:00–11:59（边界含 05:00，不含 12:00）", () => {
    expect(getGreetingBucket(at(5))).toBe("morning");
    expect(getGreetingBucket(at(11, 59))).toBe("morning");
  });

  it("下午档 12:00–17:59（边界含 12:00，不含 18:00）", () => {
    expect(getGreetingBucket(at(12))).toBe("afternoon");
    expect(getGreetingBucket(at(17, 59))).toBe("afternoon");
  });

  it("晚上档 18:00–22:59（边界含 18:00，不含 23:00）", () => {
    expect(getGreetingBucket(at(18))).toBe("evening");
    expect(getGreetingBucket(at(22, 59))).toBe("evening");
  });

  it("该休息档 23:00–04:59（wrap-around，含 23:00 与 04:59，不含 05:00）", () => {
    expect(getGreetingBucket(at(23))).toBe("rest");
    expect(getGreetingBucket(at(0))).toBe("rest");
    expect(getGreetingBucket(at(4, 59))).toBe("rest");
  });
});

describe("getGreetingBucket: 关键边界值", () => {
  it("4→5 切换：04:59 该休息 / 05:00 上午", () => {
    expect(getGreetingBucket(at(4, 59))).toBe("rest");
    expect(getGreetingBucket(at(5))).toBe("morning");
  });

  it("11→12 切换：11:59 上午 / 12:00 下午", () => {
    expect(getGreetingBucket(at(11, 59))).toBe("morning");
    expect(getGreetingBucket(at(12))).toBe("afternoon");
  });

  it("17→18 切换：17:59 下午 / 18:00 晚上", () => {
    expect(getGreetingBucket(at(17, 59))).toBe("afternoon");
    expect(getGreetingBucket(at(18))).toBe("evening");
  });

  it("22→23 切换：22:59 晚上 / 23:00 该休息", () => {
    expect(getGreetingBucket(at(22, 59))).toBe("evening");
    expect(getGreetingBucket(at(23))).toBe("rest");
  });
});

describe("selectGreetingText: 不带名文案（本工单接入路径）", () => {
  const expected: Record<GreetingBucket, string> = {
    morning: "上午好，有什么需要我搞定的么？",
    afternoon: "下午好，有什么需要我搞定的么？",
    evening: "晚上好，有什么需要我搞定的么？",
    rest: "该休息了，让我来做吧，好好休息哦。",
  };

  it("四档逐字命中（D15 保留「么」）", () => {
    expect(selectGreetingText(at(8))).toBe(expected.morning);
    expect(selectGreetingText(at(14))).toBe(expected.afternoon);
    expect(selectGreetingText(at(20))).toBe(expected.evening);
    expect(selectGreetingText(at(23, 30))).toBe(expected.rest);
  });

  it("文案常量与选择器输出一致", () => {
    (Object.keys(expected) as GreetingBucket[]).forEach((bucket) => {
      expect(GREETING_WITHOUT_NAME[bucket]).toBe(expected[bucket]);
    });
  });
});

describe("selectGreetingText: 带名 / 退化（ADR-0034 D4）", () => {
  it("带名替换 {name} 占位（工单 02 接入，本工单不渲染）", () => {
    expect(selectGreetingText(at(9), "张三")).toBe(
      "上午好，张三，有什么需要我搞定的么？",
    );
    expect(selectGreetingText(at(23, 30), "张三")).toBe(
      "该休息了，张三，让我来做吧，好好休息哦。",
    );
  });

  it("name 省略走不带名", () => {
    expect(selectGreetingText(at(9))).toBe(
      "上午好，有什么需要我搞定的么？",
    );
  });

  it("name 为空串 / 纯空白退化为不带名", () => {
    expect(selectGreetingText(at(9), "")).toBe(
      "上午好，有什么需要我搞定的么？",
    );
    expect(selectGreetingText(at(9), "   ")).toBe(
      "上午好，有什么需要我搞定的么？",
    );
  });

  it("带名 4 句结构就绪（两套完整文案，不跨 key 拼接）", () => {
    expect(GREETING_WITH_NAME.morning).toBe(
      "上午好，{name}，有什么需要我搞定的么？",
    );
    expect(GREETING_WITH_NAME.rest).toBe(
      "该休息了，{name}，让我来做吧，好好休息哦。",
    );
  });
});
