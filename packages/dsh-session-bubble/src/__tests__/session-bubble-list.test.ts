// @vitest-environment jsdom
/**
 * SessionBubbleList 记账生命周期组件级测试（工单 14-01 / 14-02 / 14-03，ADR-0028）。
 *
 * seam：mock sessions.list / workspaces.list 快照存储（手动 emit）→ 断言
 * localStorage 记账集合的存活与气泡列 DOM 投影。覆盖：
 *   - 裁剪相位门控：基线未就绪（pending）不清记账；就绪后惰性裁剪照常；
 *   - 完成见闻集：观察到完成态即持久记账；见闻记忆使气泡跨「刷新」（重挂载）
 *     持续可见；收起隐藏优先于见闻入选；新一轮完成上升沿解除旧收起；
 *   - 归档排除：根被归档整组消失（豁免成员暂留）；排除不受总开关影响。
 *
 * localStorage 键名（jx-bubble-keep-*）是持久化契约的一部分（ADR-0022/0028），
 * 测试直接以字面量断言。记账集合经公共 API 种子——store 单例的内存快照在
 * import 时初始化，直接改写 localStorage 不反映到内存态。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { Fragment, createElement, useState } from "react";
import { SessionBubbleList } from "../SessionBubbleList.tsx";
import {
  STORAGE_KEYS,
  addDismissed,
  addKept,
  addSeen,
  getKeepEnabled,
  setKeepEnabled,
} from "../index.ts";
import type {
  ISessions,
  IWorkspaces,
  SessionId,
  SessionListState,
  SessionSummary,
} from "@deepseek-ai/dsh-client-runtime/client";

// ---------------------------------------------------------------------------
// 常量（持久化契约键名）
// ---------------------------------------------------------------------------

/** 测试域 SessionId 品牌转换（对齐仓内既有 as SessionId 先例）。 */
const sid = (id: string): SessionId => id as SessionId;

// ---------------------------------------------------------------------------
// mock 快照存储
// ---------------------------------------------------------------------------

function summary(
  id: string,
  opts: {
    title?: string;
    running?: boolean;
    completed?: boolean;
    parentId?: string;
    origin?: string;
  } = {},
): SessionSummary {
  return {
    id: sid(id),
    title: opts.title,
    running: opts.running ?? false,
    ...(opts.completed !== undefined ? { completed: opts.completed } : {}),
    ...(opts.parentId !== undefined ? { parentId: sid(opts.parentId) } : {}),
    ...(opts.origin !== undefined
      ? { origin: opts.origin as "subagent" }
      : {}),
    displayTitle: opts.title ?? id,
    blank: false,
    updatedAt: 0,
  };
}

function makeSessions(initial: SessionListState) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const sessions = {
    list: {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot() {
        return snapshot;
      },
    },
    open() {},
  } as unknown as ISessions;
  return {
    sessions,
    emit(next: SessionListState) {
      snapshot = next;
      // 快照引用变化是订阅者的重渲染依据（SDK store 同款语义）。
      for (const listener of listeners) listener();
    },
  };
}

function listState(
  phase: SessionListState["phase"],
  summaries: SessionSummary[],
): SessionListState {
  const ids = summaries.map((s) => s.id);
  const byId: Record<string, SessionSummary> = {};
  for (const s of summaries) byId[s.id] = s;
  return {
    ids,
    byId,
    current: undefined,
    phase,
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  };
}

/** 构造带 archivedSessionIds 的 mock workspaces 数据源（快照引用必须稳定）。 */
function makeWorkspaces(archivedSessionIds: string[]): IWorkspaces {
  const snapshot = {
    archivedSessionIds: archivedSessionIds.map(sid),
    phase: "ready" as const,
  };
  return {
    list: {
      subscribe(_listener: () => void) {
        return () => {};
      },
      getSnapshot() {
        return snapshot;
      },
    },
  } as unknown as IWorkspaces;
}

// ---------------------------------------------------------------------------
// 挂载辅助
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root | undefined;

function mount(props: { sessions: ISessions; workspaces?: IWorkspaces }): void {
  root = createRoot(container);
  act(() => {
    root!.render(createElement(SessionBubbleList, props));
  });
}

function bubbleTitles(): string[] {
  return Array.from(container.querySelectorAll("[role='button']")).map(
    (el) => el.getAttribute("aria-label") ?? "",
  );
}

/** 读取持久化记账并解析为排序数组（写入序不属契约，只验成员与写穿）。 */
function storedIds(key: string): string[] {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as string[]).sort() : [];
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (root !== undefined) {
    act(() => root!.unmount());
    root = undefined;
  }
  container.remove();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 工单 14-01：裁剪相位门控（ADR-0028 决策 2）
// ---------------------------------------------------------------------------

describe("SessionBubbleList: 记账裁剪相位门控", () => {
  it("挂载于基线未就绪（pending 相位）⇒ 不清空 kept/dismissed 记账", () => {
    addKept("a");
    addDismissed("b");

    mount({ sessions: makeSessions(listState("pending", [])).sessions });

    expect(storedIds(STORAGE_KEYS.kept)).toEqual(["a"]);
    expect(storedIds(STORAGE_KEYS.dismissed)).toEqual(["b"]);
  });

  it("pending 相位即使携带条目也不裁剪（空基线误清的广义形态）", () => {
    addKept("ghost");
    addKept("a");

    mount({
      sessions: makeSessions(
        listState("pending", [summary("x", { running: true })]),
      ).sessions,
    });

    expect(storedIds(STORAGE_KEYS.kept)).toEqual(expect.arrayContaining(["ghost", "a"]));
  });

  it("基线就绪后惰性裁剪照常：不在列表中的记账 id 被清除，在册 id 保留", () => {
    addKept("a");
    addKept("gone-kept");
    addDismissed("b");
    addDismissed("gone-dimissed");

    mount({
      sessions: makeSessions(
        listState("ready", [
          summary("a", { running: true }),
          summary("b", { completed: true }),
        ]),
      ).sessions,
    });

    expect(storedIds(STORAGE_KEYS.kept)).toEqual(["a"]);
    expect(storedIds(STORAGE_KEYS.dismissed)).toEqual(["b"]);
  });
});

// ---------------------------------------------------------------------------
// 工单 14-02：完成见闻集（ADR-0028 决策 1 / D-seen1）
// ---------------------------------------------------------------------------

describe("SessionBubbleList: 完成见闻集记账与投影", () => {
  it("观察到完成态条目 ⇒ 记入完成见闻集（写穿持久化）", () => {
    mount({
      sessions: makeSessions(
        listState("ready", [
          summary("c1", { completed: true }),
          summary("r1", { running: true }),
        ]),
      ).sessions,
    });

    expect(storedIds(STORAGE_KEYS.seen)).toEqual(["c1"]);
  });

  it("基线就绪后见闻集同样惰性裁剪：不在列表的记账 id 被清除", () => {
    addSeen("a");
    addSeen("gone-seen");

    mount({
      sessions: makeSessions(
        listState("ready", [summary("a", { running: true })]),
      ).sessions,
    });

    expect(storedIds(STORAGE_KEYS.seen)).toEqual(["a"]);
  });

  it("见闻记忆使 completed 位已被 SDK 失忆的气泡在重挂载后仍可见（刷新留存）", () => {
    addSeen("s1");

    // 重挂载 = 刷新页面：SDK 只报 idle 形态，可见性由见闻记账承担。
    mount({
      sessions: makeSessions(listState("ready", [summary("s1")])).sessions,
    });

    expect(bubbleTitles().some((label) => label.includes("会话：s1"))).toBe(
      true,
    );
  });

  it("收起隐藏优先于见闻入选：已收起的会话不因见闻记账复活", () => {
    addSeen("x");
    addDismissed("x");

    mount({
      sessions: makeSessions(
        listState("ready", [summary("x", { completed: true })]),
      ).sessions,
    });

    expect(bubbleTitles().some((label) => label.includes("会话：x"))).toBe(
      false,
    );
  });

  it("新一轮完成上升沿解除旧收起：重新提醒不吞新信号（故事 4）", () => {
    addSeen("y");
    addDismissed("y");

    const { sessions, emit } = makeSessions(
      listState("ready", [summary("y")]), // 首帧基线：非完成态
    );
    mount({ sessions });

    act(() => {
      emit(listState("ready", [summary("y", { completed: true })]));
    });

    expect(bubbleTitles().some((label) => label.includes("会话：y"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// 工单 14-03：归档排除（ADR-0028 决策 3/4）——组件端到端
// ---------------------------------------------------------------------------

describe("SessionBubbleList: 归档排除端到端", () => {
  it("根被宿主归档 ⇒ 整组气泡消失（含未归档的 subagent 成员）", () => {
    mount({
      sessions: makeSessions(
        listState("ready", [
          summary("root"),
          summary("s1", {
            parentId: "root",
            origin: "subagent",
            completed: true,
          }),
        ]),
      ).sessions,
      workspaces: makeWorkspaces(["root"]),
    });

    expect(bubbleTitles().some((label) => label.includes("会话：root"))).toBe(
      false,
    );
  });

  it("保留模式总开关关闭时归档排除仍生效（宿主级事实不被开关否决）", () => {
    const restore = getKeepEnabled();
    setKeepEnabled(false);
    try {
      mount({
        sessions: makeSessions(
          listState("ready", [
            summary("z", { completed: true }),
            summary("live", { running: true }),
          ]),
        ).sessions,
        workspaces: makeWorkspaces(["z"]),
      });

      expect(bubbleTitles().some((label) => label.includes("会话：z"))).toBe(
        false,
      );
      // 运行中的活会话照常可见（与归档无关）。
      expect(bubbleTitles().some((label) => label.includes("会话：live"))).toBe(
        true,
      );
    } finally {
      setKeepEnabled(restore);
    }
  });

  it("根被归档但子代理仍在运行 ⇒ 组暂留（活动信号优先）", () => {
    mount({
      sessions: makeSessions(
        listState("ready", [
          summary("root"),
          summary("s1", {
            parentId: "root",
            origin: "subagent",
            running: true,
          }),
        ]),
      ).sessions,
      workspaces: makeWorkspaces(["root"]),
    });

    expect(bubbleTitles().some((label) => label.includes("会话：root"))).toBe(
      true,
    );
  });

  it("点击组气泡手柄收起 ⇒ 整组消失（已完成成员经 seen 记账不得复活组）", () => {
    vi.useFakeTimers();
    try {
      mount({
        sessions: makeSessions(
          listState("ready", [
            summary("root"),
            summary("s1", {
              parentId: "root",
              origin: "subagent",
              completed: true,
            }),
          ]),
        ).sessions,
      });

      // 手柄存在（根行可移除）。
      const handles = Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          "[aria-label='收起会话']",
        ),
      );
      expect(handles.length).toBeGreaterThan(0);

      act(() => {
        handles[0]!.click(); // 根行手柄（DOM 序首个 = 根）
      });
      // 越过整组退出动画（BUBBLE_EXIT_MS = 100ms）再断言，排除淡出幽灵。
      act(() => {
        vi.advanceTimersByTime(150);
      });

      // 整组消失：被收起的根不再充当锚点，已完成成员不复活组。
      expect(bubbleTitles().some((label) => label.includes("会话：root"))).toBe(
        false,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("键盘 Delete 收起聚焦气泡（唯一移除手势的键盘路径，ADR-0026 改型）", () => {
    vi.useFakeTimers();
    try {
      mount({
        sessions: makeSessions(
          listState("ready", [
            // 用独立 id：dismissed 集合为模块单例内存态，先例（手柄点击用例）
            // 会把 "root" 记入并泄漏到后续用例——避开以免被误判为已收起。
            summary("kroot"),
            summary("ks1", {
              parentId: "kroot",
              origin: "subagent",
              completed: true,
            }),
          ]),
        ).sessions,
      });
      const bubble = container
        .querySelector<HTMLElement>("[aria-label='收起会话']")
        ?.closest<HTMLElement>("[data-hover-key]");
      expect(bubble).not.toBeNull();

      act(() => {
        bubble!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(150); // 越过退出动画
      });

      expect(
        bubbleTitles().some((label) => label.includes("会话：kroot")),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// 工单 18-03：React.memo 隔离重渲染（稳定 props 下不重渲染）
// ---------------------------------------------------------------------------

describe("SessionBubbleList: React.memo 隔离重渲染（工单 18-03）", () => {
  it("父组件以稳定 props 重渲染时不重渲染气泡列（getSnapshot 不再被调用）", () => {
    // 计数 getSnapshot：它在气泡列渲染时被 useSyncExternalStore 调用——
    // memo 短路整棵子树后不再触发，是「未重渲染」的确定性观测点。
    const snapshot = listState("ready", [summary("a", { completed: true })]);
    let snapshotCalls = 0;
    const sessions = {
      list: {
        subscribe(_listener: () => void) {
          return () => {};
        },
        getSnapshot() {
          snapshotCalls += 1;
          return snapshot;
        },
      },
      open() {},
    } as unknown as ISessions;
    // workspaces 同属 SDK 稳定引用（真实调用签名：sessions + workspaces + 可选
    // transports）。快照引用必须稳定，否则 useSyncExternalStore 检测到变化会
    // 触发无限重渲染，干扰 memo 观测。
    const workspaceSnapshot = { archivedSessionIds: [], phase: "ready" as const };
    const workspaces = {
      list: {
        subscribe(_listener: () => void) {
          return () => {};
        },
        getSnapshot() {
          return workspaceSnapshot;
        },
      },
    } as unknown as IWorkspaces;
    // 稳定 props 引用：与父组件自身重渲染解耦（transports 省略 = undefined，
    // 与真实缺省场景一致）。
    const stableProps = { sessions, workspaces };

    // harness：本地 state 驱动父级重渲染，但 props 引用保持不变。
    const Harness = () => {
      const [tick, setTick] = useState(0);
      return createElement(
        Fragment,
        null,
        createElement("button", {
          id: "tick-btn",
          onClick: () => setTick((t) => t + 1),
        }),
        createElement(SessionBubbleList, stableProps),
      );
    };

    act(() => {
      root = createRoot(container);
      root!.render(createElement(Harness));
    });
    // 挂载期的 effect（见闻记账等）已随 act flush 落定，基线为稳定值。
    const baseline = snapshotCalls;
    expect(baseline).toBeGreaterThan(0);

    // 父组件重渲染 + 稳定 props：memo 短路气泡列渲染，getSnapshot 不再被调用。
    act(() => {
      (container.querySelector("#tick-btn") as HTMLButtonElement).click();
    });
    expect(snapshotCalls).toBe(baseline);
  });
});
