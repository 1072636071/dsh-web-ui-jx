/**
 * user-name 校验纯逻辑测试（ADR-0034 D4）。
 *
 * seam：直喂原始字符串到 validateUserName / sanitizeUserName，断言结果分支
 * 与净化值。纯逻辑，不依赖 DOM、不依赖 React（vitest node 环境）。
 *
 * 覆盖（工单验收 + ADR-0034）：
 *   - 空串 / 全空白 → empty（清空，不报错，回落不带名）
 *   - 17 字 → too-long（非法输入，不写入）
 *   - 含 \n 与控制字符 → 剥离后 valid（净化值已去控制字符并 trim）
 *   - 正常中英文与 emoji → valid
 *   - 边界：恰好 16 字 valid；前导/尾随空白被 trim
 */

import { describe, expect, it } from "vitest";
import {
  MAX_USER_NAME_LENGTH,
  sanitizeUserName,
  validateUserName,
} from "../../src/client/user-name-setting.ts";

describe("sanitizeUserName: 剥离控制字符与换行 + trim", () => {
  it("去除换行与控制字符（\\n \\r \\t \\x01）", () => {
    expect(sanitizeUserName("Jo\nh\rn\t\x01")).toBe("John");
  });

  it("前后空白被 trim", () => {
    expect(sanitizeUserName("  张三  ")).toBe("张三");
  });

  it("纯控制字符 → 空串", () => {
    expect(sanitizeUserName("\n\r\t\x01\x7F")).toBe("");
  });
});

describe("validateUserName: 分支与净化值", () => {
  it("空串 → empty", () => {
    expect(validateUserName("")).toEqual({ status: "empty" });
  });

  it("全空白 → empty", () => {
    expect(validateUserName("   ")).toEqual({ status: "empty" });
  });

  it("17 字 → too-long（不写入）", () => {
    const input = "一".repeat(17);
    expect(validateUserName(input)).toEqual({
      status: "too-long",
      max: MAX_USER_NAME_LENGTH,
    });
  });

  it("恰好 16 字 → valid", () => {
    const input = "一".repeat(16);
    expect(validateUserName(input)).toEqual({ status: "valid", value: input });
  });

  it("含 \\n 与控制字符 → 剥离后 valid", () => {
    expect(validateUserName("Jo\nh\x01n")).toEqual({
      status: "valid",
      value: "John",
    });
  });

  it("前导/尾随空白被 trim 后 valid", () => {
    expect(validateUserName("  张三  ")).toEqual({
      status: "valid",
      value: "张三",
    });
  });

  it("正常中文 + 英文 + emoji → valid", () => {
    expect(validateUserName("小明abc😀")).toEqual({
      status: "valid",
      value: "小明abc😀",
    });
  });
});
