// @vitest-environment jsdom
/**
 * SessionBubbleDetail 组件测试（工单 16-02 / 16-04）。
 *
 * seam：注入 mock preview / dynamic-title transport（即时 resolve），断言书页
 * 卡片渲染内容与交互。覆盖：标题渲染、预览行、in-flight 占位、失败静默、
 * AI 动态标题副题行（configured 显示 / unconfigured 隐藏）、点击打开会话、
 * clampText 字符护栏。
 *
 * 与既有 session-bubble-list.test.ts 同构（jsdom + react-dom/client + act）。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import {
  clampText,
  SessionBubbleDetail,
  type SessionBubbleDetailEntry,
} from "../SessionBubbleDetail.tsx";
import type { PreviewTransport, SessionPreview } from "../detail/detail-data.ts";
import type { DynamicTitleResult, DynamicTitleTransport } from "../detail/dynamic-title.ts";

/** 测试条目投影. */
const entry: SessionBubbleDetailEntry = {
  sessionId: "s1",
  title: "会话标题",
  updatedAt: 1,
  running: false,
  completed: true,
  isCurrent: false,
};

/** 等待 effects + promise 链 settle. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

/** 挂载元素（挂 body 后由各用例清理）. */
function render(el: React.ReactElement): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(el);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
});

/** 即时 resolve 的预览 transport. */
function previewTransport(data: Partial<SessionPreview> = {}): PreviewTransport {
  return {
    async fetchPreview(input) {
      return {
        sessionId: input.sessionId,
        title: input.title,
        lastUserText: "",
        lastAssistantText: "",
        inFlight: false,
        hasHistory: true,
        ...data,
      };
    },
  };
}

/** 即时 resolve 的动态标题 transport. */
function titleTransport(result: DynamicTitleResult): DynamicTitleTransport {
  return {
    async generateTitle() {
      return result;
    },
  };
}

describe("SessionBubbleDetail", () => {
  it("渲染书眉标题与预览行（最后用户/助手消息）", async () => {
    render(
      createElement(SessionBubbleDetail, {
        entry,
        onOpen: () => {},
        previewTransport: previewTransport({
          lastUserText: "帮我重构状态机",
          lastAssistantText: "好的，正在重构",
        }),
      }),
    );
    await flush();
    expect(container!.textContent).toContain("会话标题");
    expect(container!.textContent).toContain("帮我重构状态机");
    expect(container!.textContent).toContain("好的，正在重构");
  });

  it("in-flight 显示占位文案", async () => {
    render(
      createElement(SessionBubbleDetail, {
        entry,
        onOpen: () => {},
        previewTransport: previewTransport({ inFlight: true }),
      }),
    );
    await flush();
    expect(container!.textContent).toContain("正在思考");
  });

  it("预览失败静默（无占位、无报错文案）", async () => {
    const failing: PreviewTransport = {
      async fetchPreview() {
        throw new Error("network");
      },
    };
    render(
      createElement(SessionBubbleDetail, {
        entry,
        onOpen: () => {},
        previewTransport: failing,
      }),
    );
    await flush();
    expect(container!.textContent).toContain("会话标题");
    expect(container!.textContent).not.toContain("失败");
    expect(container!.textContent).not.toContain("错误");
  });

  it("无预览 transport 时详情窗仅显示标题（完整可用）", async () => {
    render(createElement(SessionBubbleDetail, { entry, onOpen: () => {} }));
    await flush();
    expect(container!.textContent).toContain("会话标题");
  });

  it("AI 动态标题 configured 显示副题、unconfigured 整体隐藏", async () => {
    render(
      createElement(SessionBubbleDetail, {
        entry,
        onOpen: () => {},
        dynamicTitleTransport: titleTransport({
          kind: "configured",
          title: "在重构状态机",
          refreshIntervalMs: 60_000,
        }),
      }),
    );
    await flush();
    expect(container!.textContent).toContain("在重构状态机");
    container?.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root!.render(
        createElement(SessionBubbleDetail, {
          entry,
          onOpen: () => {},
          dynamicTitleTransport: titleTransport({
            kind: "unconfigured",
            refreshIntervalMs: 60_000,
          }),
        }),
      );
    });
    await flush();
    expect(container!.textContent).not.toContain("在重构状态机");
  });

  it("点击卡片打开会话", async () => {
    const onOpen = vi.fn();
    render(createElement(SessionBubbleDetail, { entry, onOpen }));
    await flush();
    const card = container!.querySelector("[data-jx-interactive]");
    expect(card).not.toBeNull();
    act(() => {
      card!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("clampText 字符护栏", () => {
  it("短文本原样返回", () => {
    expect(clampText("短")).toBe("短");
  });

  it("超长文本截断并追加省略号", () => {
    expect(clampText("x".repeat(200), 10)).toBe(`${"x".repeat(10)}…`);
  });

  it("默认护栏 160", () => {
    expect(clampText("a".repeat(161)).length).toBe(161); // 160 + …
  });
});
