/**
 * collectConversation 纯函数测试（工单 01 验收，ADR-0032 问答案配对）。
 *
 * seam：输入宿主会话事件数组（SessionEvent 的 structural 投影），输出逐轮问答
 * `ConversationTurn[]`（每条 {seq, text, reply}）。只测外部可观察行为：
 *   - 问话过滤：仅 `user/message` 且 `source.kind==='user'` 入选（合成排除）；
 *   - 回复配对：一条问话的 reply = 其后、下一条真人问话前，最后一条非空文本
 *     `assistant/message`（文本在 data.message.content，与问话 data.content 不对称）；
 *   - 跳过：首问之前的 assistant、tool-call 前言/空 content、注入型 user/message；
 *   - 退化输入：空事件 / 无问话 / malformed data → 空列表；
 *   - 护栏：条数上限、问话与回复文本长度上限、seq 透传、时序正序。
 *
 * 对齐 tests/host/asset-routes.test.ts 同层先例：纯逻辑、node 环境、无 DOM。
 */

import { describe, expect, it } from "vitest";
import {
  collectConversation,
  MAX_PROMPT_TEXT_CHARS,
  MAX_REPLY_TEXT_CHARS,
  MAX_TURNS,
  type HostSessionEventLike,
} from "../../src/host/session-messages.ts";

// ---------------------------------------------------------------------------
// 事件构造辅助（最小 structural 形状，与宿主 SessionEvent 关心的字段对齐）
// ---------------------------------------------------------------------------

/** 直接用户问话事件（文本或 content 块数组）。 */
function userMsg(
  seq: number,
  text: string | Array<Record<string, unknown>>,
): HostSessionEventLike {
  const content =
    typeof text === "string"
      ? [{ type: "text", text }]
      : text.map((b) => ({ ...b }));
  return {
    type: "user/message",
    seq,
    data: { source: { kind: "user" }, content },
  };
}

/** 真人问话但纯图片（无文本块）。 */
function imageOnlyUser(seq: number): HostSessionEventLike {
  return {
    type: "user/message",
    seq,
    data: { source: { kind: "user" }, content: [{ type: "image", url: "x" }] },
  };
}

/** 注入/合成来源的 user/message（source.kind !== 'user'）。 */
function injectedUser(seq: number, kind: string, text: string): HostSessionEventLike {
  return {
    type: "user/message",
    seq,
    data: { source: { kind }, content: [{ type: "text", text }] },
  };
}

/** assistant 回复事件（文本或 data.message.content 块数组）。 */
function assistantMsg(
  seq: number,
  content: string | Array<Record<string, unknown>>,
): HostSessionEventLike {
  const blocks =
    typeof content === "string"
      ? [{ type: "text", text: content }]
      : content.map((b) => ({ ...b }));
  return {
    type: "assistant/message",
    seq,
    data: { message: { source: { kind: "model" }, content: blocks } },
  };
}

/** 任意其他事件。 */
function other(seq: number, type: string, data: unknown): HostSessionEventLike {
  return { type, seq, data };
}

describe("collectConversation — 问话提取与 seq/顺序", () => {
  it("只收集真人问话，每条带 reply（此处无回复→null），seq 透传、时序正序", () => {
    const events: HostSessionEventLike[] = [
      userMsg(3, "第一问"),
      other(4, "tool/result", {}),
      userMsg(7, "第二问"),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 3, text: "第一问", reply: null },
      { seq: 7, text: "第二问", reply: null },
    ]);
  });

  it("排除合成来源（plugin/notice/recall 的 user/message 不入选、不作边界）", () => {
    const events: HostSessionEventLike[] = [
      injectedUser(1, "plugin", "文件变更通知"),
      userMsg(2, "真人问话"),
      injectedUser(3, "recall", "skill 内容注入"),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 2, text: "真人问话", reply: null },
    ]);
  });

  it("多 text block 拼接为一条问话；image 等非文本块忽略", () => {
    const events: HostSessionEventLike[] = [
      userMsg(5, [
        { type: "text", text: "看一下这张图 " },
        { type: "image", url: "data:image/png;base64,xxx" },
        { type: "text", text: "有什么问题" },
      ]),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 5, text: "看一下这张图 有什么问题", reply: null },
    ]);
  });

  it("退化输入：空事件返回空列表；malformed data 跳过不抛错", () => {
    expect(collectConversation([])).toEqual([]);
    const broken: HostSessionEventLike[] = [
      { type: "user/message", seq: 1 },
      { type: "user/message", seq: 2, data: null },
      { type: "user/message", seq: 3, data: { source: { kind: "user" } } },
      {
        type: "user/message",
        seq: 4,
        data: { source: { kind: "user" }, content: "not-an-array" },
      },
      { type: "assistant/message", seq: 5, data: null },
      { type: "assistant/message", seq: 6, data: { message: null } },
      userMsg(7, "正常问话"),
    ];
    expect(collectConversation(broken)).toEqual([
      { seq: 7, text: "正常问话", reply: null },
    ]);
  });
});

describe("collectConversation — 问答案配对", () => {
  it("一问一答：问话与其后的 assistant 文本配对", () => {
    const events: HostSessionEventLike[] = [
      userMsg(1, "问1"),
      assistantMsg(2, "答1"),
      userMsg(3, "问2"),
      assistantMsg(4, "答2"),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 1, text: "问1", reply: "答1" },
      { seq: 3, text: "问2", reply: "答2" },
    ]);
  });

  it("轮内多条非空 assistant 取最后一条为回复", () => {
    const events: HostSessionEventLike[] = [
      userMsg(1, "问题"),
      assistantMsg(2, "先思考一下"),
      assistantMsg(3, "最终答复"),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 1, text: "问题", reply: "最终答复" },
    ]);
  });

  it("跳过 tool-call 前言（无文本块）与空 content，取真正有文本的回复", () => {
    const events: HostSessionEventLike[] = [
      userMsg(1, "查一下"),
      assistantMsg(2, [{ type: "tool-call", id: "t1", name: "search", arguments: {} }]),
      assistantMsg(3, []), // 空 content（usage 占位）
      assistantMsg(4, [{ type: "text", text: "结果是 " }, { type: "text", text: "42" }]),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 1, text: "查一下", reply: "结果是 42" },
    ]);
  });

  it("末条问话无回复（仍在跑/被中断）→ reply null", () => {
    const events: HostSessionEventLike[] = [
      userMsg(1, "问1"),
      assistantMsg(2, "答1"),
      userMsg(3, "还没回的问"),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 1, text: "问1", reply: "答1" },
      { seq: 3, text: "还没回的问", reply: null },
    ]);
  });

  it("首条问话之前的 assistant 无归属，被忽略", () => {
    const events: HostSessionEventLike[] = [
      assistantMsg(1, "孤儿回复"),
      userMsg(2, "真正问"),
      assistantMsg(3, "真正答"),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 2, text: "真正问", reply: "真正答" },
    ]);
  });

  it("注入型 user/message 不作轮次边界（其前后 assistant 仍归同一轮）", () => {
    const events: HostSessionEventLike[] = [
      userMsg(1, "真人问"),
      assistantMsg(2, "半程"),
      injectedUser(3, "model", "工具结果注入"),
      assistantMsg(4, "最终回复"),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 1, text: "真人问", reply: "最终回复" },
    ]);
  });

  it("纯图片问话不成轮也不闭合上一轮（其后回复仍归上一真人问）", () => {
    const events: HostSessionEventLike[] = [
      userMsg(1, "问1"),
      assistantMsg(2, "答1前半"),
      imageOnlyUser(3),
      assistantMsg(4, "答1后半"),
    ];
    expect(collectConversation(events)).toEqual([
      { seq: 1, text: "问1", reply: "答1后半" },
    ]);
  });
});

describe("collectConversation — 护栏", () => {
  it("问话数超上限只返回最新 MAX_TURNS 条，末条恒为最新问答且带回复", () => {
    const events: HostSessionEventLike[] = [];
    const total = 250;
    for (let i = 1; i <= total; i++) {
      events.push(userMsg(i * 2, `问话 ${i}`));
      events.push(assistantMsg(i * 2 + 1, `回复 ${i}`));
    }
    const turns = collectConversation(events);
    expect(turns.length).toBe(MAX_TURNS);
    expect(turns[turns.length - 1]).toEqual({
      seq: total * 2,
      text: `问话 ${total}`,
      reply: `回复 ${total}`,
    });
  });

  it("超长问话截断到 MAX_PROMPT_TEXT_CHARS + 省略号", () => {
    const long = "字".repeat(MAX_PROMPT_TEXT_CHARS + 500);
    const turns = collectConversation([userMsg(1, long), assistantMsg(2, "短答")]);
    expect(turns[0]!.text.length).toBe(MAX_PROMPT_TEXT_CHARS + 1);
    expect(turns[0]!.text.endsWith("…")).toBe(true);
    expect(turns[0]!.reply).toBe("短答");
  });

  it("超长回复截断到 MAX_REPLY_TEXT_CHARS + 省略号", () => {
    const longReply = "答".repeat(MAX_REPLY_TEXT_CHARS + 300);
    const turns = collectConversation([userMsg(1, "问"), assistantMsg(2, longReply)]);
    expect(turns[0]!.reply!.length).toBe(MAX_REPLY_TEXT_CHARS + 1);
    expect(turns[0]!.reply!.endsWith("…")).toBe(true);
  });
});
