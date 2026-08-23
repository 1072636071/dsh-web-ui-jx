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
 *   - 上限只管顶层：展开组不占名额；溢出折叠边界；ADR-0020 组级 pending 豁免（聚合成员）
 *   - 排序：顶层按根首次出现位次；组内按原序；空列表 → 空
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
  type BubbleEntry,
  type BubbleGroup,
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
// 归组 7/8：上限只管顶层（D3）+ ADR-0020 组级豁免
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

  it("ADR-0020 组级豁免：根等待交互的溢出组永驻可见、不计 moreCount", () => {
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

  it("ADR-0020 组级豁免聚合成员：成员等待交互的溢出组同样豁免（队长裁定 #5）", () => {
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

  it("ADR-0020 组级豁免：截断线内的 pending 组原位不动、不重复追加", () => {
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
