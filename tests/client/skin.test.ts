/**
 * skin 测试（唐风皮肤开关：localStorage 持久化 + body[data-dsh-jiangxiao] 增删）。
 *
 * 环境：jsdom（操作 document.body 属性）。
 *
 * 覆盖：
 *   - initSkin 默认开：设置 body 属性并返回 true
 *   - setSkinEnabled(false)：持久化 'off' + 移除 body 属性 + getSkinEnabled false
 *   - setSkinEnabled(true)：持久化 'on' + 恢复 body 属性
 *   - initSkin 读取持久化 'off'：不设属性并返回 false
 */

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getSkinEnabled,
  initSkin,
  setSkinEnabled,
  SKIN_ATTR,
} from "../../src/client/skin.ts";

beforeEach(() => {
  window.localStorage.clear();
  document.body.removeAttribute(SKIN_ATTR);
});

describe("skin: 默认与初始化", () => {
  it("getSkinEnabled 默认开", () => {
    expect(getSkinEnabled()).toBe(true);
  });

  it("initSkin 默认开：设置 body 属性并返回 true", () => {
    expect(initSkin()).toBe(true);
    expect(document.body.hasAttribute(SKIN_ATTR)).toBe(true);
  });
});

describe("skin: 开关持久化与生效", () => {
  it("setSkinEnabled(false) 持久化 + 移除属性 + 反映", () => {
    setSkinEnabled(false);
    expect(window.localStorage.getItem("jx-skin")).toBe("off");
    expect(document.body.hasAttribute(SKIN_ATTR)).toBe(false);
    expect(getSkinEnabled()).toBe(false);
  });

  it("setSkinEnabled(true) 持久化 + 恢复属性", () => {
    setSkinEnabled(true);
    expect(window.localStorage.getItem("jx-skin")).toBe("on");
    expect(document.body.hasAttribute(SKIN_ATTR)).toBe(true);
    expect(getSkinEnabled()).toBe(true);
  });

  it("initSkin 读取持久化 off：不设属性并返回 false", () => {
    window.localStorage.setItem("jx-skin", "off");
    expect(initSkin()).toBe(false);
    expect(document.body.hasAttribute(SKIN_ATTR)).toBe(false);
  });
});
