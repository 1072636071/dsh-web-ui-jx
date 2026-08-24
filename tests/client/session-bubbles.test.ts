/**
 * session-bubbles 纯逻辑测试（复用 Seam 模式）。
 *
 * seam：输入 items/current/maxVisible，断言输出 groups/moreCount 与组内
 * root/members/badge{total,running}/containsCurrent/pending。纯逻辑，不依赖
 * DOM、不依赖 React（vitest node 环境）。
 *
 * 归组引擎（ADR-0018，PRD 测试决策 8 组 + 平铺回归护栏）：
 *   - 平铺回归护栏：无谱系字段输入下与改造前平铺行为基准逐条目等价
 *   - 单层归组：多个 subagent 并入同一根；徽标总数与运行中数
 *   - 多层嵌套：孙代及更深层并入根祖先（根锚定而非直接父锚定）
 *   - fork 截断：fork 会话不成组、不计数
 *   - 孤儿回退：父行缺失 / 父链成环 → 停留节点为根，subagent 孤儿自成顶层
 *   - current 传播：后代 → containsCurrent（根高亮组合依据）；根本身 / 无 / 不相关 → 不误传
 *   - 上限只管顶层：展开组不占名额；溢出折叠边界；ADR-0020 pending-interaction-bubble-effect 组级 pending 豁免（聚合成员）
 *   - 排序：顶层按根首次出现位次；组内按原序；空列表 → 空
 *
 * 保留上下文（工单 01，ADR-0022）：buildBubbleGroups 向后兼容扩展第 4 参
 * BubbleKeepContext（开关态 + kept/dismissed/archived 参数位）。断言组：
 *   - 扩展回归护栏：不传参 / 显式 undefined / keepEnabled=false ⇒ 与平铺基准
 *     （legacyFlatSelect）逐条目全等——总开关退化路径即回归护栏；
 *   - kept 记账保留：completed 位被 SDK 清除后仍可见（idle 形态 + id∈kept）；
 *   - dismissed 隐藏 / archived 排除：集合过滤发生在 seam 内部范围过滤处，
 *     dismissed 优先于 kept、archived 优先于一切；
 *   - 活动/紧急豁免：running 或 pendingInteraction 条目不被记账隐藏
 *     （ADR-0020 pending-interaction-bubble-effect），kept 对其冗余无害，豁免不放宽入选资格；
 *   - 惰性忽略：记账集合中不存在于 items 的 id 被忽略（写入时裁剪的双保险）；
 *   - 上限折叠与 pending 豁免在保留输入下语义不变。
 *
 * 拖拽判定矩阵（工单 02，ADR-0022 D2/D3/D4/D5）：resolveDragAction 逐格
 * 断言——click/dismiss/archive/forbidden 四态；forbidden 全排列（running×
 * 任意 zone、pending 三类×任意 zone、当前泡×归档）；阈值边界 7/8px；未命中
 * 弹回。isBubbleDraggable 可拖范围断言。组件手势接线不测（仓内无 React/DOM
 * 测试先例，构建验收兜底）。
 *
 * 双开关组合与归档排除退化路径（工单 03，ADR-0022 D3/D6/D8）：开关①关 ×
 * 全脏集 = 现状全等；archived 缺省/空集 = 无排除；archived > dismissed >
 * kept 优先级网格 + running/pending 豁免压过归档集；防复活语义（已归档 +
 * kept 记账不复活，②不进投影）。
 *
 * 工单 02 收缩注记：原平铺导出 selectBubbleEntries 已从生产模块移除（被
 * 分组渲染取代），其直测块随之删除——过滤/顺序保持/折叠边界/isCurrent/
 * maxVisible 边界/title 透传/pending 豁免这些行为语义现由 buildBubbleGroups
 * 的平铺退化路径承载，并受下方「平铺回归护栏」逐条目比对保护；改造前行
 * 为以内联 oracle legacyFlatSelect 保留为比对基准（仅测试域，见其注释）。
 */

import { describe, expect, it } from "vitest";
import {
  buildBubbleGroups,
  DRAG_THRESHOLD_PX,
  isBubbleDraggable,
  isBubbleRowDraggable,
  resolveDragAction,
  type BubbleEntry,
  type BubbleGroup,
  type BubbleKeepContext,
  type DragEntryFlags,
  type DropZoneKind,
  type SessionListEntry,
} from "../../src/client/state-machine/session-bubbles.ts";

// ---------------------------------------------------------------------------
// 辅助构造
// ---------------------------------------------------------------------------

function entry(
  sessionId: string,
  opts: Partial<
    Pick<
      SessionListEntry,
      "title" | "running" | "completed" | "pendingInteraction"
    >
  > = {},
): SessionListEntry {
  return {
    sessionId,
    title: opts.title,
    running: opts.running ?? false,
    completed: opts.completed ?? false,
    ...(opts.pendingInteraction !== undefined
      ? { pendingInteraction: opts.pendingInteraction }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// 改造前平铺行为基准（工单 02 收缩步的测试域 oracle）
// ---------------------------------------------------------------------------

/**
 * 原 selectBubbleEntries 的内联副本（ADR-0007 平铺语义的行为基准）。
 *
 * 工单 02 收缩步已从生产模块删除被分组渲染取代的平铺导出；「无谱系字段
 * 场景输出与改造前逐项一致」的回归护栏仍需参照物，故将原实现原样内联于
 * 此——仅测试域使用，不参与生产构建。若有意变更 buildBubbleGroups 的平铺
 * 退化语义，须先修订本基准并说明理由（护栏对比对方向敏感）。
 */
function legacyFlatSelect(
  items: readonly SessionListEntry[],
  current: string | undefined,
  maxVisible: number,
): { visible: readonly BubbleEntry[]; moreCount: number } {
  const filtered: BubbleEntry[] = [];
  for (const item of items) {
    if (!item.running && !item.completed) continue;
    filtered.push({
      sessionId: item.sessionId,
      title: item.title,
      running: item.running,
      completed: item.completed,
      pendingInteraction: item.pendingInteraction,
      isCurrent: item.sessionId === current,
    });
  }
  const total = filtered.length;
  const visibleCount = Math.min(Math.max(0, Math.floor(maxVisible)), total);
  const primary = filtered.slice(0, visibleCount);
  // 折叠豁免：截断线之外等待交互的条目原序追加到尾部，不计入 moreCount。
  const overflow = filtered.slice(visibleCount);
  const promoted = overflow.filter((e) => e.pendingInteraction !== undefined);
  return {
    visible: [...primary, ...promoted],
    moreCount: Math.max(0, overflow.length - promoted.length),
  };
}

// ---------------------------------------------------------------------------
// 归组引擎（工单 09，ADR-0018）：辅助构造
// ---------------------------------------------------------------------------

/**
 * 带谱系字段的条目构造（归组用例专用；与上方平铺回归用例的 entry 助手
 * 各自独立，避免共用签名互相牵连）。
 * origin 缺省 = 普通会话（含 fork）；parentId 缺省 = 无父行。
 */
function gentry(
  sessionId: string,
  opts: Partial<
    Pick<
      SessionListEntry,
      | "title"
      | "running"
      | "completed"
      | "pendingInteraction"
      | "parentId"
      | "origin"
    >
  > = {},
): SessionListEntry {
  return {
    sessionId,
    title: opts.title,
    running: opts.running ?? false,
    completed: opts.completed ?? false,
    ...(opts.pendingInteraction !== undefined
      ? { pendingInteraction: opts.pendingInteraction }
      : {}),
    ...(opts.parentId !== undefined ? { parentId: opts.parentId } : {}),
    ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
  };
}

/** subagent 条目简写：origin='subagent' + 可选父行/状态. */
function sub(
  sessionId: string,
  parentId: string | undefined,
  state: "running" | "completed" | "idle" = "running",
): SessionListEntry {
  return gentry(sessionId, {
    parentId,
    origin: "subagent",
    ...(state === "running"
      ? { running: true }
      : state === "completed"
        ? { completed: true }
        : {}),
  });
}

/** 归组断言速记：顶层组序列 → [根 id, 成员 id 序列] 投影. */
function groupShape(groups: readonly BubbleGroup[]): [string, string[]][] {
  return groups.map((g) => [
    g.rootId,
    g.members.map((m) => m.sessionId),
  ]);
}

// ---------------------------------------------------------------------------
// 归组 1/8：平铺回归护栏（无谱系字段输入下与既有平铺行为基准逐条目等价）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 平铺回归护栏", () => {
  it("无谱系字段时输出与改造前平铺行为基准逐条目等价（混合状态 + current）", () => {
    const items = [
      entry("a", { running: true }),
      entry("b"), // idle 不入选
      entry("c", { completed: true }),
      entry("d", { running: true, completed: true }),
      entry("e", { running: true }),
    ];
    const current = "d";
    const flat = legacyFlatSelect(items, current, 3);
    const grouped = buildBubbleGroups(items, current, 3);
    expect(grouped.moreCount).toBe(flat.moreCount);
    expect(grouped.groups.map((g) => g.rootId)).toEqual(
      flat.visible.map((e) => e.sessionId),
    );
    // 逐条目字段级等价
    grouped.groups.forEach((g, i) => {
      const e = flat.visible[i]!;
      expect(g.members).toEqual([]);
      expect(g.badge.total).toBe(0);
      expect(g.badge.running).toBe(0);
      expect(g.containsCurrent).toBe(false);
      expect(g.pending).toBe(e.pendingInteraction !== undefined);
      expect(g.root.sessionId).toBe(e.sessionId);
      expect(g.root.title).toBe(e.title);
      expect(g.root.running).toBe(e.running);
      expect(g.root.completed).toBe(e.completed);
      expect(g.root.pendingInteraction).toBe(e.pendingInteraction);
      expect(g.root.isCurrent).toBe(e.isCurrent);
    });
  });

  it("平铺 + 等待交互豁免场景逐条目等价（pending 在截断线外）", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { running: true }),
      entry("c", { running: true }),
      entry("p", { running: true, pendingInteraction: "approval" }),
    ];
    const flat = legacyFlatSelect(items, undefined, 2);
    const grouped = buildBubbleGroups(items, undefined, 2);
    expect(grouped.moreCount).toBe(flat.moreCount); // 仅 c 折叠
    expect(grouped.groups.map((g) => g.rootId)).toEqual(
      flat.visible.map((e) => e.sessionId),
    );
    expect(grouped.groups.map((g) => g.rootId)).toEqual(["a", "b", "p"]);
    expect(grouped.groups.map((g) => g.pending)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("maxVisible 边界（0 / 负数 / 非整数 / 超额）下平铺等价", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { completed: true }),
      entry("c", { running: true }),
    ];
    for (const max of [0, -5, 2.7, 100]) {
      const flat = legacyFlatSelect(items, undefined, max);
      const grouped = buildBubbleGroups(items, undefined, max);
      expect(grouped.moreCount).toBe(flat.moreCount);
      expect(grouped.groups.map((g) => g.rootId)).toEqual(
        flat.visible.map((e) => e.sessionId),
      );
    }
  });

  it("空列表 → 空 groups、moreCount=0（对齐既有过滤函数）", () => {
    const r = buildBubbleGroups([], undefined, 5);
    expect(r.groups).toEqual([]);
    expect(r.moreCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 归组 2/8：单层归组（多个 subagent 并入同一根；徽标计数）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 单层归组", () => {
  it("多个 subagent 并入同一根；N 只计合格后代、idle 后代不计不显", () => {
    const items = [
      gentry("main", { running: true }),
      sub("s1", "main", "running"),
      sub("s2", "main", "completed"),
      sub("s3", "main", "idle"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([["main", ["s1", "s2"]]]);
    const g = r.groups[0]!;
    expect(g.badge.total).toBe(2); // s3 idle 不计
    expect(g.badge.running).toBe(1); // 仅 s1 运行中
    expect(g.containsCurrent).toBe(false);
  });

  it("根空闲而后代在跑 ⇒ 组仍入选、根气泡仍在（呼吸点数据就绪）", () => {
    const items = [
      gentry("main"), // 根 idle
      sub("s1", "main", "running"),
      sub("s2", "main", "running"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([["main", ["s1", "s2"]]]);
    const g = r.groups[0]!;
    expect(g.root.running).toBe(false);
    expect(g.badge.total).toBe(2);
    expect(g.badge.running).toBe(2); // 徽标金呼吸迷你点的判定依据
  });

  it("根与全部后代均 idle ⇒ 组不出现", () => {
    const items = [gentry("main"), sub("s1", "main", "idle")];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(r.groups).toEqual([]);
    expect(r.moreCount).toBe(0);
  });

  it("completed 后代计入徽标 N、不计入运行中数", () => {
    const items = [
      gentry("main", { running: true }),
      sub("s1", "main", "completed"),
      sub("s2", "main", "completed"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    const g = r.groups[0]!;
    expect(g.badge.total).toBe(2);
    expect(g.badge.running).toBe(0);
    expect(g.members.every((m) => m.completed)).toBe(true);
  });

  it("无后代的普通会话退化为单例组（旧行为兼容）", () => {
    const items = [
      gentry("a", { running: true }),
      gentry("b", { completed: true }),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([["a", []], ["b", []]]);
  });
});

// ---------------------------------------------------------------------------
// 归组 3/8：多层嵌套（孙代及更深层并入根祖先——根锚定而非直接父锚定）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 多层嵌套", () => {
  it("三层链全部折叠进根祖先，徽标 N 含全链", () => {
    // main ← a ← b ← c（a/b/c 均 subagent）
    const items = [
      gentry("main", { running: true }),
      sub("a", "main"),
      sub("b", "a"),
      sub("c", "b"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([["main", ["a", "b", "c"]]]);
    const g = r.groups[0]!;
    expect(g.badge.total).toBe(3);
    expect(g.badge.running).toBe(3);
  });

  it("深层派生只占一个顶层气泡（中间层不成组）", () => {
    const items = [
      gentry("root", { running: true }),
      sub("l1", "root"),
      sub("l2", "l1"),
      sub("l3", "l2"),
      sub("l4", "l3"),
    ];
    const r = buildBubbleGroups(items, undefined, 10);
    expect(r.groups).toHaveLength(1); // 中间层 l1/l2/l3 各自不成顶层组
    expect(groupShape(r.groups)).toEqual([["root", ["l1", "l2", "l3", "l4"]]]);
  });

  it("后代条目先于根出现在列表中 ⇒ 仍归入根的组", () => {
    const items = [
      sub("x1", "late-root"), // 后代在宿主列表中先出现
      sub("x2", "x1"),
      gentry("late-root", { running: true }),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([["late-root", ["x1", "x2"]]]);
  });

  it("两条独立链各自归组互不串扰", () => {
    const items = [
      gentry("r1", { running: true }),
      sub("a1", "r1"),
      gentry("r2", { running: true }),
      sub("b1", "r2"),
      sub("b2", "b1"),
    ];
    const r = buildBubbleGroups(items, undefined, 10);
    expect(groupShape(r.groups)).toEqual([
      ["r1", ["a1"]],
      ["r2", ["b1", "b2"]],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 归组 4/8：fork 截断（fork 会话不成组、不计数）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: fork 截断", () => {
  it("fork 会话（origin 缺省、parentId 指向源会话）自成顶层，不入源会话成员", () => {
    const items = [
      gentry("main", { running: true }),
      sub("s1", "main"),
      gentry("fork", { running: true, parentId: "main" }), // fork：origin 缺省
    ];
    const r = buildBubbleGroups(items, undefined, 10);
    expect(groupShape(r.groups)).toEqual([
      ["main", ["s1"]],
      ["fork", []],
    ]);
    const main = r.groups.find((g) => g.rootId === "main")!;
    expect(main.badge.total).toBe(1); // fork 不计入源会话徽标
    expect(main.members.map((m) => m.sessionId)).not.toContain("fork");
  });

  it("fork 的子代理归 fork 而非源会话（fork 截断谱系传播）", () => {
    const items = [
      gentry("main", { running: true }),
      gentry("fork", { running: true, parentId: "main" }),
      sub("fs1", "fork"),
      sub("fs2", "fs1"),
    ];
    const r = buildBubbleGroups(items, undefined, 10);
    expect(groupShape(r.groups)).toEqual([
      ["main", []],
      ["fork", ["fs1", "fs2"]],
    ]);
    const main = r.groups[0]!;
    expect(main.badge.total).toBe(0); // 源会话徽标不含 fork 一脉
  });

  it("多条 fork 链并存时各占一个顶层气泡", () => {
    const items = [
      gentry("main", { running: true }),
      gentry("f1", { running: true, parentId: "main" }),
      gentry("f2", { completed: true, parentId: "main" }),
    ];
    const r = buildBubbleGroups(items, undefined, 10);
    expect(groupShape(r.groups)).toEqual([
      ["main", []],
      ["f1", []],
      ["f2", []],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 归组 5/8：孤儿回退（父行缺失 / 父链成环 → 停留节点为根，自成顶层）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 孤儿回退", () => {
  it("父行缺失：subagent 孤儿自成顶层归组气泡", () => {
    const items = [
      sub("orphan", "ghost-parent"), // ghost-parent 不在列表镜像中
      sub("orphan-child", "orphan"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([["orphan", ["orphan-child"]]]);
    const g = r.groups[0]!;
    expect(g.badge.total).toBe(1); // 徽标照常统计可达后代
    expect(g.badge.running).toBe(1); // 运行中后代仅 orphan-child（根不计入）
    expect(g.root.running).toBe(true); // 孤儿根本身运行中
  });

  it("孤儿链中途断裂：断裂点之上停留节点为根", () => {
    // x ← y ← z，z 的父行缺失 ⇒ z 为根；x、y 解析到 z
    const items = [
      sub("x", "y"),
      sub("y", "z"),
      sub("z", "missing"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([["z", ["x", "y"]]]);
  });

  it("父链成环：以停留节点为根（自环场景）", () => {
    // p 自环（parent 指向自身）；x 挂在 p 下，上溯到 p 即止
    const items = [
      sub("x", "p"),
      sub("p", "p"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([["p", ["x"]]]);
  });

  it("父链成环：两节点环以各自上溯的停留节点为根，条目不丢失", () => {
    // u ⇄ v 两节点环：u 上溯停于 v，v 上溯停于 u（退化输入，确定性回退）
    const items = [
      sub("u", "v"),
      sub("v", "u"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    const shapes = groupShape(r.groups);
    // 两个停留节点各自成顶层组，成员恰为对方；总条目数守恒
    expect(shapes).toContainEqual(["u", ["v"]]);
    expect(shapes).toContainEqual(["v", ["u"]]);
    expect(shapes).toHaveLength(2);
  });

  it("孤儿根 idle 且无可达合格后代 ⇒ 不显示", () => {
    const items = [sub("lonely", "ghost", "idle")];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(r.groups).toEqual([]);
  });

  it("正常链不受同列表中孤儿的影响", () => {
    const items = [
      gentry("main", { running: true }),
      sub("s1", "main"),
      sub("orphan", "ghost"),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(groupShape(r.groups)).toEqual([
      ["main", ["s1"]],
      ["orphan", []],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 归组 6/8：current 传播（D6）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: current 传播", () => {
  const fixture = [
    gentry("main", { running: true }),
    sub("s1", "main"),
    sub("deep", "s1"),
    gentry("other", { running: true }),
  ];

  it("current 为深层后代 ⇒ root.isCurrent 保持自身语义、containsCurrent 为真", () => {
    const r = buildBubbleGroups(fixture, "deep", 5);
    const g = r.groups.find((grp) => grp.rootId === "main")!;
    expect(g.root.isCurrent).toBe(false); // 根自身未命中（isCurrent 纯语义）
    expect(g.containsCurrent).toBe(true); // 后代命中 ⇒ 传播标记
    // 组件组合式金描边：root.isCurrent || containsCurrent
    expect(g.root.isCurrent || g.containsCurrent).toBe(true);
    const deep = g.members.find((m) => m.sessionId === "deep")!;
    expect(deep.isCurrent).toBe(true); // 子气泡自身保留高亮
    const s1 = g.members.find((m) => m.sessionId === "s1")!;
    expect(s1.isCurrent).toBe(false);
  });

  it("current 为直接后代 ⇒ 同样置 containsCurrent", () => {
    const r = buildBubbleGroups(fixture, "s1", 5);
    const g = r.groups.find((grp) => grp.rootId === "main")!;
    expect(g.root.isCurrent).toBe(false);
    expect(g.containsCurrent).toBe(true);
    const s1 = g.members.find((m) => m.sessionId === "s1")!;
    expect(s1.isCurrent).toBe(true);
  });

  it("current 为根本身 ⇒ root.isCurrent 置真且 containsCurrent 为假（不强制展开）", () => {
    const r = buildBubbleGroups(fixture, "main", 5);
    const g = r.groups.find((grp) => grp.rootId === "main")!;
    expect(g.root.isCurrent).toBe(true); // 自身命中
    expect(g.containsCurrent).toBe(false); // 不属于后代 ⇒ 不强制展开
    expect(g.rootId).toBe("main");
  });

  it("无 current ⇒ 全部 isCurrent=false、containsCurrent=false、pending 不受影响", () => {
    const r = buildBubbleGroups(fixture, undefined, 5);
    expect(r.groups.every((g) => g.root.isCurrent === false)).toBe(true);
    expect(r.groups.every((g) => g.containsCurrent === false)).toBe(true);
    expect(
      r.groups.every((g) => g.members.every((m) => !m.isCurrent)),
    ).toBe(true);
  });

  it("current 为不相关会话 ⇒ containsCurrent 不误传", () => {
    const r = buildBubbleGroups(fixture, "zzz", 5);
    expect(r.groups.every((g) => g.containsCurrent === false)).toBe(true);
    expect(r.groups.every((g) => g.root.isCurrent === false)).toBe(true);
  });

  it("多组场景仅命中组携带 containsCurrent（传播不跨组）", () => {
    const r = buildBubbleGroups(fixture, "deep", 5);
    expect(r.groups.map((g) => g.containsCurrent)).toEqual([true, false]);
    // 组合高亮视角：仅 main 组点亮
    expect(
      r.groups.map((g) => g.root.isCurrent || g.containsCurrent),
    ).toEqual([true, false]);
  });
});

// ---------------------------------------------------------------------------
// 归组 7/8：上限只管顶层（D3）+ ADR-0020 pending-interaction-bubble-effect 组级豁免
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 上限只管顶层", () => {
  it("大组成员数量不影响 moreCount（展开语义不占名额）", () => {
    const items = [
      gentry("big", { running: true }),
      ...Array.from({ length: 6 }, (_, i) => sub(`big-s${i}`, "big")),
      gentry("g1", { running: true }),
      gentry("g2", { running: true }),
      gentry("g3", { running: true }),
    ]; // 9 个气泡实体但只有 4 个顶层组
    const r = buildBubbleGroups(items, undefined, 5);
    expect(r.groups).toHaveLength(4); // 全部顶层组可见
    expect(r.moreCount).toBe(0); // 实体数 9 > 5 但顶层 4 ≤ 5
    const big = r.groups.find((g) => g.rootId === "big")!;
    expect(big.members).toHaveLength(6);
  });

  it("顶层溢出折叠边界：≤max 全可见、max+1 折叠 1、大额折叠差值", () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        gentry(`g${i}`, { running: true }),
      );
    expect(buildBubbleGroups(mk(5), undefined, 5).moreCount).toBe(0);
    const six = buildBubbleGroups(mk(6), undefined, 5);
    expect(six.groups).toHaveLength(5);
    expect(six.moreCount).toBe(1);
    const many = buildBubbleGroups(mk(23), undefined, 5);
    expect(many.groups).toHaveLength(5);
    expect(many.moreCount).toBe(18);
  });

  it("溢出的单例组与大组一视同仁（只看顶层组个数）", () => {
    const items = [
      gentry("big", { running: true }),
      sub("bs1", "big"),
      sub("bs2", "big"),
      gentry("t1", { running: true }),
      gentry("t2", { running: true }),
      gentry("t3", { running: true }),
    ]; // 4 顶层组
    const r = buildBubbleGroups(items, undefined, 2);
    expect(r.groups.map((g) => g.rootId)).toEqual(["big", "t1"]);
    expect(r.moreCount).toBe(2);
  });

  it("maxVisible ≤ 0 时 visible 空、moreCount=全部顶层组数（对齐既有钳制）", () => {
    const items = [
      gentry("a", { running: true }),
      gentry("b", { running: true }),
    ];
    for (const max of [0, -3]) {
      const r = buildBubbleGroups(items, undefined, max);
      expect(r.groups).toEqual([]);
      expect(r.moreCount).toBe(2);
    }
  });

  it("非整数 maxVisible 向下取整", () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => gentry(`g${i}`, { running: true }));
    const r = buildBubbleGroups(mk(5), undefined, 2.9);
    expect(r.groups).toHaveLength(2);
    expect(r.moreCount).toBe(3);
  });

  it("ADR-0020 pending-interaction-bubble-effect 组级豁免：根等待交互的溢出组永驻可见、不计 moreCount", () => {
    const items = [
      gentry("a", { running: true }),
      gentry("b", { running: true }),
      gentry("c", { running: true }),
      gentry("p", {
        running: true,
        pendingInteraction: "approval",
      }),
    ];
    const r = buildBubbleGroups(items, undefined, 2);
    expect(r.groups.map((g) => g.rootId)).toEqual(["a", "b", "p"]);
    expect(r.moreCount).toBe(1); // 仅 c 折叠
    expect(r.groups[2]!.root.pendingInteraction).toBe("approval");
    expect(r.groups.map((g) => g.pending)).toEqual([false, false, true]);
  });

  it("ADR-0020 pending-interaction-bubble-effect 组级豁免聚合成员：成员等待交互的溢出组同样豁免（队长裁定 #5）", () => {
    const items = [
      gentry("a", { running: true }),
      gentry("big", { running: true }), // 溢出位置的大组，根非 pending
      gentry("sp", {
        parentId: "big",
        origin: "subagent",
        running: true,
        pendingInteraction: "question",
      }), // 入选成员等待交互 ⇒ 组级 pending 聚合为真
    ];
    const r = buildBubbleGroups(items, undefined, 1);
    // big 组因成员 pending 被豁免：追加到可见尾部、不计 moreCount
    expect(r.groups.map((g) => g.rootId)).toEqual(["a", "big"]);
    expect(r.groups[1]!.pending).toBe(true);
    expect(r.moreCount).toBe(0);
  });

  it("ADR-0020 pending-interaction-bubble-effect 组级豁免：截断线内的 pending 组原位不动、不重复追加", () => {
    const items = [
      gentry("p", { running: true, pendingInteraction: "plan-review" }),
      gentry("b", { running: true }),
    ];
    const r = buildBubbleGroups(items, undefined, 5);
    expect(r.groups.map((g) => g.rootId)).toEqual(["p", "b"]); // 原序原位
    expect(r.moreCount).toBe(0);
  });

  it("无任何 pending 时无豁免介入：溢出组照常折叠（与纯折叠语义一致）", () => {
    const items = [
      gentry("a", { running: true }),
      gentry("b", { running: true }),
      gentry("c", { running: true }),
      sub("cs1", "c"), // 大组成员也无 pending
    ];
    const r = buildBubbleGroups(items, undefined, 2);
    expect(r.groups.every((g) => g.pending === false)).toBe(true);
    // 无豁免 ⇒ 溢出组（含大组，按 1 个顶层组计）照常进 moreCount，不追加可见尾部
    expect(r.groups.map((g) => g.rootId)).toEqual(["a", "b"]);
    expect(r.moreCount).toBe(1); // 顶层组共 3（c 吸收 cs1），溢出 1
  });
});

// ---------------------------------------------------------------------------
// 归组 8/8：排序（顶层按根首次出现位次；组内按原序；不做时间戳重排）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 排序", () => {
  it("顶层按根在宿主列表中的首次出现位次排列", () => {
    const items = [
      gentry("c-root", { running: true }),
      gentry("a-root", { running: true }),
      gentry("b-root", { running: true }),
    ];
    const r = buildBubbleGroups(items, undefined, 10);
    expect(r.groups.map((g) => g.rootId)).toEqual([
      "c-root",
      "a-root",
      "b-root",
    ]); // 列表原序，不按字母/时间戳重排
  });

  it("后代先于根出现时组位次仍按根的位次", () => {
    const items = [
      sub("early-sub", "root-late"),
      gentry("first-root", { running: true }),
      gentry("root-late", { running: true }),
    ];
    const r = buildBubbleGroups(items, undefined, 10);
    expect(r.groups.map((g) => g.rootId)).toEqual([
      "first-root",
      "root-late",
    ]);
    expect(groupShape(r.groups)[1]).toEqual(["root-late", ["early-sub"]]);
  });

  it("组内成员按宿主列表原序（乱序插入构造）", () => {
    const items = [
      gentry("main", { running: true }),
      sub("m3", "main", "completed"),
      sub("m1", "main"),
      sub("m2", "main"),
    ];
    const r = buildBubbleGroups(items, undefined, 10);
    expect(r.groups[0]!.members.map((m) => m.sessionId)).toEqual([
      "m3",
      "m1",
      "m2",
    ]);
  });

  it("嵌套链成员序同样按宿主列表原序（非谱系深度序）", () => {
    const items = [
      gentry("main", { running: true }),
      sub("n2", "n1"),
      sub("n1", "main"),
    ]; // n2 先出现但谱系上挂在 n1 下
    const r = buildBubbleGroups(items, undefined, 10);
    expect(r.groups[0]!.members.map((m) => m.sessionId)).toEqual([
      "n2",
      "n1",
    ]);
  });

  it("空列表 → 空 groups、moreCount=0", () => {
    const r = buildBubbleGroups([], "whatever", 5);
    expect(r.groups).toEqual([]);
    expect(r.moreCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 保留上下文（工单 01，ADR-0022）：辅助构造
// ---------------------------------------------------------------------------

/** 记账集合速记. */
function idSet(...ids: string[]): ReadonlySet<string> {
  return new Set(ids);
}

// ---------------------------------------------------------------------------
// 保留 1/6：扩展回归护栏——不传参 / 总开关关 = 现状逐条目全等（ADR-0022 D1）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 保留上下文扩展回归护栏", () => {
  /** 混合状态共享 fixture：running/idle/completed/running+pending/current 命中。 */
  const mixed = [
    entry("a", { running: true }),
    entry("b"), // idle 不入选
    entry("c", { completed: true }),
    entry("d", {
      running: true,
      completed: true,
      pendingInteraction: "approval",
    }),
    entry("e", { running: true }),
  ];

  it("扩展后不传第 4 参：输出仍与改造前平铺基准逐条目等价", () => {
    const flat = legacyFlatSelect(mixed, "d", 3);
    const grouped = buildBubbleGroups(mixed, "d", 3);
    expect(grouped.moreCount).toBe(flat.moreCount);
    expect(grouped.groups.map((g) => g.rootId)).toEqual(
      flat.visible.map((e) => e.sessionId),
    );
    grouped.groups.forEach((g, i) => {
      const e = flat.visible[i]!;
      expect(g.members).toEqual([]);
      expect(g.badge.total).toBe(0);
      expect(g.badge.running).toBe(0);
      expect(g.containsCurrent).toBe(false);
      expect(g.pending).toBe(e.pendingInteraction !== undefined);
      expect(g.root.sessionId).toBe(e.sessionId);
      expect(g.root.title).toBe(e.title);
      expect(g.root.running).toBe(e.running);
      expect(g.root.completed).toBe(e.completed);
      expect(g.root.pendingInteraction).toBe(e.pendingInteraction);
      expect(g.root.isCurrent).toBe(e.isCurrent);
    });
  });

  it("显式传 undefined 第 4 参与不传参输出全等", () => {
    expect(buildBubbleGroups(mixed, "d", 3, undefined)).toEqual(
      buildBubbleGroups(mixed, "d", 3),
    );
  });

  it("context.keepEnabled=false：携带记账集合仍与不传参输出全等（总开关退化路径）", () => {
    const off: BubbleKeepContext = {
      keepEnabled: false,
      kept: idSet("b"),
      dismissed: idSet("c"),
      archived: idSet("a"),
    };
    expect(buildBubbleGroups(mixed, "d", 3, off)).toEqual(
      buildBubbleGroups(mixed, "d", 3),
    );
    // 平铺基准三方可比：退化输出同样逐条目等价于改造前行为。
    const flat = legacyFlatSelect(mixed, "d", 3);
    const degraded = buildBubbleGroups(mixed, "d", 3, off);
    expect(degraded.moreCount).toBe(flat.moreCount);
    expect(degraded.groups.map((g) => g.rootId)).toEqual(
      flat.visible.map((e) => e.sessionId),
    );
  });

  it("keepEnabled=true 且 kept/dismissed/archived 缺省：入选范围与现状一致", () => {
    const on: BubbleKeepContext = { keepEnabled: true };
    const flat = legacyFlatSelect(mixed, "d", 3);
    const r = buildBubbleGroups(mixed, "d", 3, on);
    expect(r.moreCount).toBe(flat.moreCount);
    expect(r.groups.map((g) => g.rootId)).toEqual(
      flat.visible.map((e) => e.sessionId),
    );
    expect(r.groups.every((g) => g.members.length === 0)).toBe(true);
  });

  it("归组输入（谱系字段）下总开关关：与不传参输出全等", () => {
    const items = [
      gentry("main", { running: true }),
      sub("s1", "main", "completed"),
      gentry("solo", { completed: true }),
    ];
    const off: BubbleKeepContext = {
      keepEnabled: false,
      kept: idSet("s1"),
      dismissed: idSet("solo"),
      archived: idSet("main"),
    };
    expect(buildBubbleGroups(items, undefined, 5, off)).toEqual(
      buildBubbleGroups(items, undefined, 5),
    );
  });
});

// ---------------------------------------------------------------------------
// 保留 2/6：kept 记账保留（ADR-0022 D1：可见性 = running || completed || kept）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: kept 记账保留", () => {
  it("completed 位被 SDK 清除后仍可见：idle 形态但 id∈kept ⇒ 条目照常投影", () => {
    const items = [entry("seen1")]; // 已查看后 completed 清除 → idle 形态
    // 对照：无 kept 时该条目不可见。
    expect(
      buildBubbleGroups(items, undefined, 5, { keepEnabled: true }).groups,
    ).toEqual([]);
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      kept: idSet("seen1"),
    });
    expect(r.groups.map((g) => g.rootId)).toEqual(["seen1"]);
    expect(r.moreCount).toBe(0);
    // 投影透明性：completed 位保持自身语义（false），可见性由记账承担。
    expect(r.groups[0]!.root.completed).toBe(false);
  });

  it("kept 后代计入成员与徽标：subagent idle 但 kept ⇒ 入选成员", () => {
    const items = [
      gentry("main", { running: true }),
      sub("s1", "main", "idle"),
    ];
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      kept: idSet("s1"),
    });
    expect(groupShape(r.groups)).toEqual([["main", ["s1"]]]);
    expect(r.groups[0]!.badge.total).toBe(1);
    expect(r.groups[0]!.badge.running).toBe(0);
  });

  it("kept 根使空闲组入选：根与后代均 idle、根∈kept ⇒ 组出现、徽标不含后代", () => {
    const items = [gentry("m2"), sub("s9", "m2", "idle")];
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      kept: idSet("m2"),
    });
    expect(groupShape(r.groups)).toEqual([["m2", []]]);
    expect(r.groups[0]!.badge.total).toBe(0);
  });

  it("kept 不改变条目字段投影：title/isCurrent/pendingInteraction 原样透传", () => {
    const items = [
      entry("k1", { title: "已看过" }),
      entry("k2", { pendingInteraction: "question" }),
    ];
    const r = buildBubbleGroups(items, "k1", 5, {
      keepEnabled: true,
      kept: idSet("k1", "k2"),
    });
    const k1 = r.groups.find((g) => g.rootId === "k1")!;
    expect(k1.root.title).toBe("已看过");
    expect(k1.root.isCurrent).toBe(true);
    const k2 = r.groups.find((g) => g.rootId === "k2")!;
    expect(k2.pending).toBe(true);
    expect(k2.root.isCurrent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 保留 3/6：dismissed 隐藏（收起区语义位；02 工单填充手势）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: dismissed 隐藏", () => {
  it("completed 条目被 dismissed ⇒ 从列中隐藏", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { completed: true }),
    ];
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      dismissed: idSet("b"),
    });
    expect(r.groups.map((g) => g.rootId)).toEqual(["a"]);
  });

  it("dismissed 优先于 kept：同 id 两处记账 ⇒ 隐藏", () => {
    const items = [entry("x")]; // idle 形态（已查看且被保留记账）
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      kept: idSet("x"),
      dismissed: idSet("x"),
    });
    expect(r.groups).toEqual([]);
  });

  it("dismissed 的 subagent 成员被移除：组因根本身通过而保留，徽标归零", () => {
    const items = [
      gentry("main", { running: true }),
      sub("s1", "main", "completed"),
    ];
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      dismissed: idSet("s1"),
    });
    expect(groupShape(r.groups)).toEqual([["main", []]]);
    expect(r.groups[0]!.badge.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 保留 4/6：archived 排除（本片只定形位——02/03 填充真归档，直接构造断言排除语义）
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: archived 排除", () => {
  it("archived 排除 completed 条目（即使 completed 位仍在）", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { completed: true }),
    ];
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      archived: idSet("b"),
    });
    expect(r.groups.map((g) => g.rootId)).toEqual(["a"]);
  });

  it("archived 优先于 kept：同 id ⇒ 排除（归档是真正的终点，PRD 用户故事 14）", () => {
    const items = [entry("y", { completed: true })];
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      kept: idSet("y"),
      archived: idSet("y"),
    });
    expect(r.groups).toEqual([]);
  });

  it("archived 排除 subagent 成员：组因根通过而保留、徽标归零", () => {
    const items = [
      gentry("main", { running: true }),
      sub("s1", "main", "completed"),
    ];
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      archived: idSet("s1"),
    });
    expect(groupShape(r.groups)).toEqual([["main", []]]);
    expect(r.groups[0]!.badge.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 保留 5/6：活动/紧急豁免（ADR-0020 pending-interaction-bubble-effect）——running/pending 条目不被记账隐藏
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 活动与紧急豁免", () => {
  it("running 条目不被 dismissed/archived 隐藏", () => {
    const items = [entry("r", { running: true })];
    const ctx: BubbleKeepContext = {
      keepEnabled: true,
      dismissed: idSet("r"),
      archived: idSet("r"),
    };
    expect(
      buildBubbleGroups(items, undefined, 5, ctx).groups.map((g) => g.rootId),
    ).toEqual(["r"]);
  });

  it("等待交互条目不被 dismissed/archived 隐藏（running=false 场景）", () => {
    const items = [
      entry("p", { completed: true, pendingInteraction: "approval" }),
    ];
    const ctx: BubbleKeepContext = {
      keepEnabled: true,
      dismissed: idSet("p"),
      archived: idSet("p"),
    };
    const r = buildBubbleGroups(items, undefined, 5, ctx);
    expect(r.groups.map((g) => g.rootId)).toEqual(["p"]);
    expect(r.groups[0]!.pending).toBe(true);
  });

  it("kept 对 running/pending 条目冗余无害：仍在列且组级 pending 聚合不变", () => {
    const items = [
      entry("r", { running: true }),
      entry("p", { running: true, pendingInteraction: "question" }),
    ];
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      kept: idSet("r", "p"),
    });
    expect(r.groups.map((g) => g.rootId)).toEqual(["r", "p"]);
    expect(r.groups.map((g) => g.pending)).toEqual([false, true]);
  });

  it("豁免只防隐藏、不放宽入选：pending 但非 running/completed/kept 的条目仍不入选", () => {
    const items = [entry("q", { pendingInteraction: "plan-review" })]; // idle + pending
    const r = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      dismissed: idSet("q"),
      archived: idSet("q"),
    });
    // 无记账时它本就不在范围过滤内（现状语义），记账亦不改变入选资格。
    expect(r.groups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 保留 6/6：惰性忽略 + 上限折叠/豁免在保留输入下语义不变
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 记账集合惰性忽略与折叠语义", () => {
  it("kept/dismissed/archived 中不存在于 items 的 id 被忽略：无输出、不崩溃", () => {
    const items = [entry("a", { running: true })];
    const ctx: BubbleKeepContext = {
      keepEnabled: true,
      kept: idSet("ghost1", "a"),
      dismissed: idSet("ghost2"),
      archived: idSet("ghost3"),
    };
    const r = buildBubbleGroups(items, undefined, 5, ctx);
    expect(r.groups.map((g) => g.rootId)).toEqual(["a"]);
    expect(r.moreCount).toBe(0);
  });

  it("全部记账 id 均不在宿主列表 ⇒ 输出与空集合等价", () => {
    const items = [entry("a")]; // idle 未记账
    const ghosted: BubbleKeepContext = {
      keepEnabled: true,
      kept: idSet("gone"),
      dismissed: idSet("gone2"),
      archived: idSet("gone3"),
    };
    expect(buildBubbleGroups(items, undefined, 5, ghosted)).toEqual(
      buildBubbleGroups(items, undefined, 5, { keepEnabled: true }),
    );
  });

  it("kept 单例计入顶层名额并受 maxVisible 折叠（列不无限增长）", () => {
    const items = Array.from({ length: 6 }, (_, i) => entry(`k${i}`)); // 全 idle
    const ctx: BubbleKeepContext = {
      keepEnabled: true,
      kept: idSet(...items.map((i) => i.sessionId)),
    };
    const r = buildBubbleGroups(items, undefined, 5, ctx);
    expect(r.groups).toHaveLength(5);
    expect(r.moreCount).toBe(1);
  });

  it("溢出的 kept 组若等待交互则豁免追加、不计 moreCount（dismissed 也压不住）", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { running: true }),
      entry("c", { running: true }),
      entry("kp", { pendingInteraction: "plan-review" }), // idle 形态 + kept + dismissed
    ];
    const ctx: BubbleKeepContext = {
      keepEnabled: true,
      kept: idSet("kp"),
      dismissed: idSet("kp"),
    };
    const r = buildBubbleGroups(items, undefined, 3, ctx);
    expect(r.groups.map((g) => g.rootId)).toEqual(["a", "b", "c", "kp"]);
    expect(r.groups[3]!.pending).toBe(true);
    expect(r.moreCount).toBe(0);
  });

  it("dismissed 使顶层组数下降 ⇒ moreCount 相应变化", () => {
    const all = Array.from({ length: 7 }, (_, i) =>
      entry(`g${i}`, { completed: true }),
    );
    const off = buildBubbleGroups(all, undefined, 5, { keepEnabled: true });
    expect(off.moreCount).toBe(2);
    const on = buildBubbleGroups(all, undefined, 5, {
      keepEnabled: true,
      dismissed: idSet("g5", "g6"),
    });
    expect(on.groups).toHaveLength(5);
    expect(on.moreCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 拖拽判定矩阵（工单 02，ADR-0022 D2/D3/D4/D5——一次写全，03 直接消费）
//
// 判定顺序（钉死）：movedPx < DRAG_THRESHOLD_PX ⇒ click；running ⇒ forbidden；
// pendingInteraction ⇒ forbidden；isCurrent×archive ⇒ forbidden；
// dismiss 区 ⇒ dismiss；archive 区 ⇒ archive；未命中 ⇒ forbidden（弹回）。
// ---------------------------------------------------------------------------

describe("resolveDragAction: 判定矩阵逐格断言", () => {
  const ALL_ZONES = [undefined, "dismiss", "archive"] as readonly (
    | DropZoneKind
    | undefined
  )[];

  /** 阈值以下采样：0（原地松手）/5（微动）/7（阈值前最后一格）。 */
  const SUB_THRESHOLD = [0, 5, 7] as const;

  /** 覆盖四类典型 flags 的点击场景矩阵。 */
  const CLICK_FLAG_CASES: readonly DragEntryFlags[] = [
    { running: false, isCurrent: false },
    { running: false, isCurrent: true },
    { running: true, isCurrent: false },
    { running: false, pendingInteraction: "approval", isCurrent: true },
  ];

  it("阈值以下恒为 click：movedPx∈{0,5,7} × 任意 zone × 任意 flags ⇒ 'click'", () => {
    let cells = 0;
    for (const moved of SUB_THRESHOLD) {
      for (const zone of ALL_ZONES) {
        for (const flags of CLICK_FLAG_CASES) {
          expect(
            resolveDragAction({ movedPx: moved, zone, flags }),
            `moved=${moved} zone=${zone} flags=${JSON.stringify(flags)}`,
          ).toBe("click");
          cells++;
        }
      }
    }
    expect(cells).toBe(36); // 3 × 3 × 4 全格
  });

  it(`阈值边界：${DRAG_THRESHOLD_PX - 1}px = click、${DRAG_THRESHOLD_PX}px 起按拖拽判定`, () => {
    const base: DragEntryFlags = { running: false, isCurrent: false };
    expect(
      resolveDragAction({ movedPx: DRAG_THRESHOLD_PX - 1, zone: "dismiss", flags: base }),
    ).toBe("click");
    expect(
      resolveDragAction({ movedPx: DRAG_THRESHOLD_PX, zone: "dismiss", flags: base }),
    ).toBe("dismiss");
    expect(
      resolveDragAction({ movedPx: DRAG_THRESHOLD_PX, zone: undefined, flags: base }),
    ).toBe("forbidden");
    expect(
      resolveDragAction({ movedPx: 99.5, zone: undefined, flags: base }),
    ).toBe("forbidden");
  });

  it("forbidden 全排列①：running × 任意 zone（含当前/非当前）⇒ 'forbidden'", () => {
    for (const zone of ALL_ZONES) {
      expect(
        resolveDragAction({ movedPx: 20, zone, flags: { running: true, isCurrent: false } }),
      ).toBe("forbidden");
      expect(
        resolveDragAction({ movedPx: 20, zone, flags: { running: true, isCurrent: true } }),
      ).toBe("forbidden");
    }
  });

  it("forbidden 全排列②：等待交互 × 任意 zone（三种 pending 全覆盖）⇒ 'forbidden'", () => {
    for (const kind of ["approval", "plan-review", "question"] as const) {
      for (const zone of ALL_ZONES) {
        expect(
          resolveDragAction({
            movedPx: 20,
            zone,
            flags: { running: false, pendingInteraction: kind, isCurrent: false },
          }),
          `pending=${kind} zone=${zone}`,
        ).toBe("forbidden");
      }
    }
  });

  it("forbidden 全排列③：当前会话 × 归档区 ⇒ 'forbidden'（为 03 预置）", () => {
    expect(
      resolveDragAction({
        movedPx: 20,
        zone: "archive",
        flags: { running: false, isCurrent: true },
      }),
    ).toBe("forbidden");
  });

  it("当前会话 × 收起区 = 允许 dismiss（纯本地操作无副作用，ADR-0022 D5）", () => {
    expect(
      resolveDragAction({
        movedPx: 20,
        zone: "dismiss",
        flags: { running: false, isCurrent: true },
      }),
    ).toBe("dismiss");
  });

  it("普通已完成类：dismiss ⇒ 'dismiss'、archive ⇒ 'archive'、未命中 ⇒ 'forbidden'（弹回无记账）", () => {
    const base: DragEntryFlags = { running: false, isCurrent: false };
    expect(resolveDragAction({ movedPx: 20, zone: "dismiss", flags: base })).toBe("dismiss");
    expect(resolveDragAction({ movedPx: 20, zone: "archive", flags: base })).toBe("archive");
    expect(resolveDragAction({ movedPx: 20, zone: undefined, flags: base })).toBe("forbidden");
  });

  it("DRAG_THRESHOLD_PX 常量钉死为 8（契约值，组件与纯函数共享）", () => {
    expect(DRAG_THRESHOLD_PX).toBe(8);
  });
});

describe("isBubbleDraggable: 可拖范围（仅 completed 类）", () => {
  it("running / 等待交互不可拖；普通已完成类可拖；current 不影响可拖性", () => {
    expect(isBubbleDraggable({ running: true, isCurrent: false })).toBe(false);
    expect(isBubbleDraggable({ running: true, isCurrent: true })).toBe(false);
    expect(
      isBubbleDraggable({ running: false, pendingInteraction: "approval", isCurrent: false }),
    ).toBe(false);
    expect(
      isBubbleDraggable({ running: false, pendingInteraction: "plan-review", isCurrent: true }),
    ).toBe(false);
    expect(isBubbleDraggable({ running: false, isCurrent: false })).toBe(true);
    // 当前会话泡可拖（收起区允许；归档区由矩阵在落点判定拒绝）
    expect(isBubbleDraggable({ running: false, isCurrent: true })).toBe(true);
  });

  it("running + pending 组合仍不可拖（任一禁止信号即禁）", () => {
    expect(
      isBubbleDraggable({ running: true, pendingInteraction: "question", isCurrent: false }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 双开关组合与归档排除退化路径（工单03，ADR-0022 D3/D6/D8）
//
// 开关②「拖拽归档会话」不进投影上下文（C1 契约：其职责是渲染层归档区显隐）；
// 归档排除只由 SDK archivedSessionIds 快照集合驱动——已归档会话无论②开或关
// 都不得复活（PRD 用户故事 14 防复活语义）。本组为文档级护栏：排除/豁免/
// 优先级语义在工单01 已按契约预建并逐格覆盖，此处以开关组合视角收拢成网格。
// ---------------------------------------------------------------------------

describe("buildBubbleGroups: 双开关组合与归档排除退化路径", () => {
  it("开关①关 × 全脏记账集（kept/dismissed/archived 含幽灵 id）⇒ 与现状逐条目全等", () => {
    const items = [
      entry("a", { running: true }),
      entry("b", { completed: true }),
      entry("c"), // idle 形态（已查看）
      gentry("main", { running: true }),
      sub("s1", "main", "completed"),
    ];
    const dirty: BubbleKeepContext = {
      keepEnabled: false,
      kept: idSet("c", "s1"),
      dismissed: idSet("b"),
      archived: idSet("a", "main", "ghost"),
    };
    expect(buildBubbleGroups(items, undefined, 5, dirty)).toEqual(
      buildBubbleGroups(items, undefined, 5),
    );
  });

  it("开关①开 × archived 缺省 ⇒ 与仅开关①全等（SDK 快照未就绪 = 无排除）", () => {
    const items = [
      entry("x", { running: true }),
      entry("y", { completed: true }),
    ];
    const bare = buildBubbleGroups(items, undefined, 5, { keepEnabled: true });
    const withEmptySets = buildBubbleGroups(items, undefined, 5, {
      keepEnabled: true,
      kept: idSet(),
      dismissed: idSet(),
      archived: idSet(),
    });
    expect(withEmptySets).toEqual(bare);
  });

  it("①开②关 = 仅收起区语义（issue03 验收6）：②不在 BubbleKeepContext 中——归档区显隐属渲染层，投影对②不可知且输出不受影响", () => {
    // 显式命名格：开关②「拖拽归档会话」的唯一职责是渲染层归档区挂载与否
    // （SessionBubbleList 的 keepEnabled && archiveDragEnabled 门控）；投影
    // 层不存在「②关」退化路径——BubbleKeepContext 结构上没有②字段（编译期
    // 隔离），本格断言同一上下文形状的投影输出完全由①+三集合决定，防未来
    // 误把②引入投影签名造成分叉。
    const items = [
      entry("done", { completed: true }),
      entry("keptIdle"), // idle + kept ⇒ 可见
    ];
    const ctx: BubbleKeepContext = {
      keepEnabled: true,
      kept: idSet("keptIdle"),
      dismissed: idSet(),
      archived: idSet(),
    };
    // 业务上②开或②关，传入投影的都是同一个 context 形状 ⇒ 输出恒等。
    expect(buildBubbleGroups(items, undefined, 5, ctx).groups.map((g) => g.rootId)).toEqual([
      "done",
      "keptIdle",
    ]);
  });

  it("优先级网格：archived > dismissed > kept > 基线；running/pending 豁免压过归档集", () => {
    const items = [
      entry("onlyKept"), // idle + kept ⇒ kept 救回可见
      entry("keptDismissed"), // kept + dismissed ⇒ dismissed 胜，隐藏
      entry("keptArchived", { completed: true }), // kept + archived ⇒ 归档胜，隐藏
      entry("dismissedArchived", { completed: true }), // 双隐藏集叠加 ⇒ 隐藏
      entry("clean", { completed: true }), // 未记账 completed ⇒ 基线可见
      entry("runningArchived", { running: true }), // running 豁免 ⇒ 不被归档集隐藏
      entry("pendingArchived", {
        completed: true,
        pendingInteraction: "approval",
      }), // 紧急豁免 ⇒ 不被归档集隐藏
    ];
    const ctx: BubbleKeepContext = {
      keepEnabled: true,
      kept: idSet("onlyKept", "keptDismissed", "keptArchived"),
      dismissed: idSet("keptDismissed", "dismissedArchived"),
      archived: idSet(
        "keptArchived",
        "dismissedArchived",
        "runningArchived",
        "pendingArchived",
      ),
    };
    const r = buildBubbleGroups(items, undefined, 10, ctx);
    expect(r.groups.map((g) => g.rootId)).toEqual([
      "onlyKept",
      "clean",
      "runningArchived",
      "pendingArchived",
    ]);
  });

  it("防复活（PRD 用户故事 14）：已归档会话即使仍被 kept 记账也不复活——②关闭亦同（②不进投影）", () => {
    // 场景：用户保留某会话后经归档区真归档；随后把开关②关闭。投影上下文
    // 不含②位——排除只由 SDK 归档快照驱动，输出与②无关。
    const items = [entry("z", { completed: true })];
    const ctx: BubbleKeepContext = {
      keepEnabled: true,
      kept: idSet("z"),
      archived: idSet("z"),
    };
    expect(buildBubbleGroups(items, undefined, 5, ctx).groups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 组内运行中即不可移除（队长追加需求 #2，用户规则：「如果有子代理还在运行，
// 就不是可以移除的气泡」）。行级判定 = 自身 flags（isBubbleDraggable 原语）
// && 归组内无运行中成员——归组模型已把嵌套后代折叠进同一组，badge.running
// 即组内运行中成员计数。isBubbleDraggable 本身保持原样：resolveDragAction
// 的逐条目判定原语不动，矩阵语义零变化。
// ---------------------------------------------------------------------------

describe("isBubbleRowDraggable: 组内运行中即不可移除", () => {
  const doneFlags: DragEntryFlags = {
    running: false,
    pendingInteraction: undefined,
    isCurrent: false,
  };

  it("completed 根泡 × badge.running=2 ⇒ false（组内有运行中子代理整组不可收纳）", () => {
    expect(isBubbleRowDraggable(doneFlags, 2)).toBe(false);
  });

  it("completed 根泡独组（running=0）⇒ true", () => {
    expect(isBubbleRowDraggable(doneFlags, 0)).toBe(true);
  });

  it("completed 子泡：同组兄弟运行中 ⇒ false；全组安静 ⇒ true（行判定与成员位次无关）", () => {
    // 子泡与根泡消费同一个 group.badge.running——行级语义对组内任意成员一致。
    expect(isBubbleRowDraggable(doneFlags, 1)).toBe(false);
    expect(isBubbleRowDraggable(doneFlags, 0)).toBe(true);
    // 当前会话子泡同理：自身可拖（收起区允许），但组内活跃时同样不可移除。
    expect(
      isBubbleRowDraggable(
        { running: false, pendingInteraction: undefined, isCurrent: true },
        3,
      ),
    ).toBe(false);
    expect(
      isBubbleRowDraggable(
        { running: false, pendingInteraction: undefined, isCurrent: true },
        0,
      ),
    ).toBe(true);
  });

  it("running 自身 / pending 自身无论组态恒 false（自身 flags 判定仍是前置原语）", () => {
    const runningFlags: DragEntryFlags = {
      running: true,
      pendingInteraction: undefined,
      isCurrent: false,
    };
    const pendingFlags: DragEntryFlags = {
      running: false,
      pendingInteraction: "approval",
      isCurrent: false,
    };
    expect(isBubbleRowDraggable(runningFlags, 0)).toBe(false);
    expect(isBubbleRowDraggable(runningFlags, 2)).toBe(false);
    expect(isBubbleRowDraggable(pendingFlags, 0)).toBe(false);
    expect(isBubbleRowDraggable(pendingFlags, 1)).toBe(false);
  });

  it("边界钉死：running 阈值为 <= 0（1 个运行中成员即整组锁死）", () => {
    expect(isBubbleRowDraggable(doneFlags, 1)).toBe(false);
    expect(isBubbleRowDraggable(doneFlags, 0)).toBe(true);
  });

  it("kept-only 条目同规则（记账不影响可移除判定）", () => {
    // kept 记账只影响可见性，不改变行级可移除性——函数签名不含记账输入。
    expect(isBubbleRowDraggable(doneFlags, 0)).toBe(true);
    expect(isBubbleRowDraggable(doneFlags, 1)).toBe(false);
  });
});
