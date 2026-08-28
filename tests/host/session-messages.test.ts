/**
 * collectUserMessages 纯函数测试（工单 01 验收，PRD 测试决策）。
 *
 * seam：输入宿主会话事件数组（SessionEvent 的 structural 投影），输出该会话
 * 全部直接用户问话 `UserPrompt[]`（每条 {seq, text}）。只测外部可观察行为：
 *   - 过滤：仅 `type==='user/message'` 且 `data.source.kind==='user'` 入选
 *     （plugin/notice/recall 合成、assistant/tool 等其他事件全部排除）；
 *   - 提取：content 中 `type==='text'` 块拼接，image 等非文本块忽略；
 *   - 退化输入：空事件 / 无问话 / malformed data → 空列表；
 *   - seq 透传：每条问话携带源事件 seq（留待官方定位能力接线）；
 *   - 顺序：按事件时序（正序），最后一条 = 最新问话（「默认展开最后一个
 *     胶囊」恒成立的数据保证）。
 *
 * 对齐 tests/host/asset-routes.test.ts 同层先例：纯逻辑、node 环境、无 DOM。
 */

import { describe, expect, it } from "vitest";
import {
  collectUserMessages,
  MAX_PROMPT_TEXT_CHARS,
  MAX_USER_PROMPTS,
  type HostSessionEventLike,
} from "../../src/host/session-messages.ts";

// ---------------------------------------------------------------------------
// 事件构造辅助（最小 structural 形状，与宿主 SessionEvent 关心的字段对齐）
// ---------------------------------------------------------------------------

/** 直接用户问话事件。 */
function userMsg(
  seq: number,
  text: string | Array<Record<string, unknown>>,
): HostSessionEventLike {
  const content =
    typeof text === "string" ? [{ type: "text", text }] : text.map((b) => ({ ...b }));
  return {
    type: "user/message",
    seq,
    data: { source: { kind: "user" }, content },
  };
}

/** 任意非用户消息事件（assistant 等）。 */
function other(seq: number, type: string, data: unknown): HostSessionEventLike {
  return { type, seq, data };
}

describe("collectUserMessages — 直接用户问话提取", () => {
  it("只收集 user/message 且 source.kind==='user' 的事件，seq 透传、时序正序", () => {
    const events: HostSessionEventLike[] = [
      userMsg(3, "第一问"),
      other(4, "assistant/message", { message: { content: [] } }),
      userMsg(7, "第二问"),
    ];
    expect(collectUserMessages(events)).toEqual([
      { seq: 3, text: "第一问" },
      { seq: 7, text: "第二问" },
    ]);
  });

  it("排除合成来源（plugin/notice/recall 的 user/message 不入选）", () => {
    const pluginMsg = (seq: number, text: string): HostSessionEventLike => ({
      type: "user/message",
      seq,
      data: {
        source: { kind: "plugin", plugin: "dsh-notice" },
        content: [{ type: "text", text }],
      },
    });
    const events: HostSessionEventLike[] = [
      pluginMsg(1, "文件变更通知"),
      userMsg(2, "真人问话"),
      pluginMsg(3, "skill 内容注入"),
    ];
    expect(collectUserMessages(events)).toEqual([{ seq: 2, text: "真人问话" }]);
  });

  it("多 text block 拼接为一条问话；image 等非文本块忽略", () => {
    const events: HostSessionEventLike[] = [
      userMsg(5, [
        { type: "text", text: "看一下这张图 " },
        { type: "image", url: "data:image/png;base64,xxx" },
        { type: "text", text: "有什么问题" },
      ]),
    ];
    expect(collectUserMessages(events)).toEqual([
      { seq: 5, text: "看一下这张图 有什么问题" },
    ]);
  });

  it("纯图片问话（拼接后空文本）不产出条目", () => {
    const events: HostSessionEventLike[] = [
      userMsg(1, [{ type: "image", url: "data:..." }]),
      userMsg(2, "后续文字问话"),
    ];
    expect(collectUserMessages(events)).toEqual([
      { seq: 2, text: "后续文字问话" },
    ]);
  });

  it("退化输入：空事件返回空列表；malformed data 跳过不抛错", () => {
    expect(collectUserMessages([])).toEqual([]);
    const broken: HostSessionEventLike[] = [
      { type: "user/message", seq: 1 }, // data 缺省
      { type: "user/message", seq: 2, data: null },
      { type: "user/message", seq: 3, data: { source: { kind: "user" } } }, // content 缺省
      {
        type: "user/message",
        seq: 4,
        data: { source: { kind: "user" }, content: "not-an-array" },
      },
      userMsg(5, "正常问话"),
    ];
    expect(collectUserMessages(broken)).toEqual([{ seq: 5, text: "正常问话" }]);
  });
});

describe("collectUserMessages — 返回条数上限（极长会话护栏）", () => {
  it("问话数超过上限时只返回最新的 MAX_USER_PROMPTS 条，最后一条恒为最新问话", () => {
    const events: HostSessionEventLike[] = [];
    const total = 250;
    for (let i = 1; i <= total; i++) events.push(userMsg(i, `问话 ${i}`));
    const prompts = collectUserMessages(events);
    expect(prompts.length).toBeLessThanOrEqual(MAX_USER_PROMPTS);
    // 保尾丢头：截断保留最新，最后一条 = 全列表最后一条
    expect(prompts[prompts.length - 1]).toEqual({
      seq: total,
      text: `问话 ${total}`,
    });
    expect(prompts.length).toBe(MAX_USER_PROMPTS);
  });
});

describe("collectUserMessages — 单条问话文本上限（payload 护栏）", () => {
  it("超长问话截断到 MAX_PROMPT_TEXT_CHARS 并以省略号收尾；不超长原样保留", () => {
    const long = "字".repeat(MAX_PROMPT_TEXT_CHARS + 500);
    const short = "短问话";
    const prompts = collectUserMessages([
      userMsg(1, long),
      userMsg(2, short),
    ]);
    expect(prompts[1]).toEqual({ seq: 2, text: short });
    expect(prompts[0]!.text.length).toBe(MAX_PROMPT_TEXT_CHARS + 1); // 截断 + …
    expect(prompts[0]!.text.endsWith("…")).toBe(true);
    expect(prompts[0]!.text.slice(0, MAX_PROMPT_TEXT_CHARS)).toBe(
      "字".repeat(MAX_PROMPT_TEXT_CHARS),
    );
  });
});
