/**
 * session-bubbles — 会话气泡列纯逻辑模块（ADR-0007 → ADR-0018 归组模型）。
 *
 * 工单 05-session-bubbles：角色浮层会话气泡列的可测地基。
 * 架构审查候选者 4：ADR-0018 归组逻辑落位本模块（D8 指定的
 * `buildBubbleGroups` 接缝），组件只消费——谱系规则不埋进 React 壳。
 *
 * 提供：
 *   - buildBubbleGroups（ADR-0018）：唯一气泡投影入口——范围过滤（running ||
 *     completed，保留模式下扩展为 running || completed || kept 并减去
 *     dismissed/archived，ADR-0022 D1）+ 归组模型：subagent 后代沿 parentId
 *     折叠进根祖先（第一个非 subagent 来源的祖先），一条工作流恒占一个顶层
 *     归组气泡；每组携带 rootId / 根条目 / 成员序列 / 徽标 badge{total,
 *     running} / containsCurrent / pending 聚合标志；上限只管顶层，pending
 *     组豁免折叠、永驻可见（ADR-0020 pending-interaction-bubble-effect 组级聚合）；无谱系字段输入退化为旧行为
 *     （每会话一泡，向后兼容护栏）。
 *     （历史注：工单 02 收缩步已移除被分组渲染取代的平铺导出
 *     selectBubbleEntries——其行为语义由 buildBubbleGroups 平铺退化路径承载，
 *     回归护栏以测试域行为基准比对的形式保留在 session-bubbles.test.ts。）
 *   - resolveDragAction / isBubbleDraggable / DRAG_THRESHOLD_PX（工单 02，
 *     ADR-0022 D2/D3/D4/D5）【已废弃：ADR-0026 改型为左侧手柄点击直接收起，
 *     无拖拽手势、无投放区判定。保留导出供历史兼容，新代码不应依赖】。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React、不依赖 SDK 类型。DOM 薄壳在
 * SessionBubbleList 组件。对齐 state-machine / overlay-position 单例模式。
 *
 * @module dsh-web-ui-jx/client
 */

// ---------------------------------------------------------------------------
// 输入/输出类型（与 SDK 解耦：只取气泡列关心的字段）
// ---------------------------------------------------------------------------

/** 会话 id（与 SDK SessionId 同语义，此处用 string 别名解耦）. */
export type SessionId = string;

/**
 * 等待用户交互的种类（与 SDK `PendingInteractionStatus` 同语义，此处用
 * 字面量联合解耦，形状固化在纯逻辑层）。
 *
 * - approval：工具/权限审批等待确认；
 * - plan-review：计划评审等待确认；
 * - question：助手提问（ask_user_question）等待回答。
 */
export type PendingInteractionKind = "approval" | "plan-review" | "question";

/**
 * 输入条目：从 SDK SessionSummary 投影出的气泡列关心字段。
 *
 * 由 SessionBubbleList 从 `sessions.list` 快照的 `ids` + `byId` 派生，
 * 纯逻辑模块不依赖 SDK 类型形状。
 */
export interface SessionListEntry {
  /** 会话 id. */
  readonly sessionId: SessionId;
  /** 会话标题（无 title 时为 undefined，气泡回落 sessionId 截断）. */
  readonly title: string | undefined;
  /** 是否运行中（running === true）. */
  readonly running: boolean;
  /** 是否已结束未查看（completed === true）. */
  readonly completed: boolean;
  /**
   * 会话当前是否被用户交互阻塞（SDK `SessionSummary.pendingInteraction`，
   * 侧边栏琥珀点同源信号）；undefined = 无阻塞。
   */
  readonly pendingInteraction?: PendingInteractionKind;
  /**
   * 直接父会话 id（SDK `SessionSummary.parentId`，string 解耦）；undefined =
   * 无父行。归组模型（ADR-0018 D2/D7）沿此字段向上溯根祖先；上溯中断
   * （父行不在列表镜像中）以停留节点为根。
   */
  readonly parentId?: string;
  /**
   * 来源标记（SDK `SessionSummary.origin`，string 解耦）；undefined = 普通
   * 会话（含 fork，fork 截断谱系传播）。仅 `'subagent'` 来源参与归组折叠
   * （ADR-0018 D2）。
   */
  readonly origin?: string;
}

/**
 * 输出条目：过滤 + isCurrent 标记后的气泡条目。
 *
 * visible 数组的元素；每条携带 isCurrent 供组件高亮当前会话气泡。
 */
export interface BubbleEntry extends SessionListEntry {
  /** 是否为当前会话（sessionId === current）. */
  readonly isCurrent: boolean;
}

/** 无 title 时 sessionId 截断长度（ADR-0007 决策 2 回落）. */
export const SID_FALLBACK_MAX_LEN = 12;

/**
 * 气泡显示标题：有 title 用 title，无 title 回落 sessionId 截断（ADR-0007 决策 2）。
 *
 * 纯函数，供组件与测试共享。
 *
 * @param entry - 气泡条目。
 * @returns 显示标题。
 */
export function displayTitle(entry: BubbleEntry): string {
  if (entry.title !== undefined && entry.title.length > 0) return entry.title;
  return entry.sessionId.length > SID_FALLBACK_MAX_LEN
    ? entry.sessionId.slice(0, SID_FALLBACK_MAX_LEN)
    : entry.sessionId;
}

// ---------------------------------------------------------------------------
// 归组模型（ADR-0018 D2/D3/D4/D6/D7/D8，工单 09）
// ---------------------------------------------------------------------------

/**
 * 归组徽标数据（ADR-0018 D4）。
 */
export interface BubbleGroupBadge {
  /** 通过范围过滤的后代总数（不含根本身；= members.length）. */
  readonly total: number;
  /** 运行中后代数量（徽标金色呼吸迷你点的判定依据）. */
  readonly running: number;
}

/**
 * 顶层归组气泡：根祖先 + 其全部通过范围过滤的 subagent 后代（ADR-0018）。
 *
 * 一条多代理工作流无论派生多少层子孙，恒占一个顶层归组气泡（D2 根祖先
 * 锚定）；徽标数据与当前会话标记随组携带，组件层据此渲染徽标 `▸N`、
 * 金呼吸迷你点与金描边。
 */
export interface BubbleGroup {
  /** 根祖先会话 id（= root.sessionId，供组件按 id 取展开态等键控）. */
  readonly rootId: string;
  /**
   * 根祖先条目：普通会话（origin ≠ 'subagent'）或孤儿回退的 subagent
   * 停留节点（D7）。isCurrent 仅反映自身命中（rootId === current）；
   * current 落在后代时的高亮由 containsCurrent 表达——组件按
   * `root.isCurrent || containsCurrent` 挂金描边（D6 传播的组合式表达）。
   */
  readonly root: BubbleEntry;
  /** 组内成员：通过范围过滤（保留模式下含 kept、减 dismissed/archived）的后代，按宿主列表原序. */
  readonly members: readonly BubbleEntry[];
  /** 徽标数据：后代总数与运行中数（D4）. */
  readonly badge: BubbleGroupBadge;
  /**
   * 当前会话是否落在本组**后代**中（D6）：current ∈ members。
   * 兼作强制展开标记（effectiveExpanded = manualExpanded || containsCurrent）
   * 与根祖先传播高亮依据；current 为根本身时为 false（不强制展开）。
   */
  readonly containsCurrent: boolean;
  /**
   * 组级等待交互聚合标志（ADR-0020 pending-interaction-bubble-effect 分组模型组合语义，队长裁定）：根本身
   * 或任一入选成员 pendingInteraction !== undefined 时为真。pending 组
   * 豁免顶层折叠——落在截断线之外时追加到可见组尾部、不计入 moreCount。
   */
  readonly pending: boolean;
}

// ---------------------------------------------------------------------------
// 保留模式上下文（ADR-0022 D1，工单 01 定形——02/03 只填内容不改签名）
// ---------------------------------------------------------------------------

/**
 * 保留模式投影上下文：buildBubbleGroups 的可选第 4 参（ADR-0022 D1）。
 *
 * - keepEnabled：总开关「查看后保留气泡」。context 缺省或 keepEnabled ===
 *   false ⇒ 输出与现状逐条目全等（忽略全部集合）——总开关退化路径即回归
 *   护栏。
 * - kept：本地记账的已查看会话集合（SDK 在会话打开时清除 completed 位，
 *   客户端记账使其持续可见，直至显式移除）。
 * - dismissed：收起区记账集合（暂时隐藏提醒，可逆；手势由工单 02 填充）。
 * - archived：SDK 归档会话 id 集合（archivedSessionIds 快照；归档权威在
 *   SDK，派生层只读排除防复活，工单 03 接线）。
 *
 * 三集合全部可选（缺省视同空集）；其中不存在于 items 的 id 一律惰性忽略
 * （配置层写入时裁剪，此处过滤双保险）。集合过滤发生在本模块内部的范围
 * 过滤处——其硬编码 running||completed 会把 kept 条目丢弃，外部前置过滤
 * 无法实现该语义，这正是参数必须进入 seam 的原因。
 */
export interface BubbleKeepContext {
  /** 总开关「查看后保留气泡」（false = 完全回到现状语义）. */
  readonly keepEnabled: boolean;
  /** 本地 kept 记账集合（单击保留）；缺省视同空集. */
  readonly kept?: ReadonlySet<SessionId>;
  /** 收起区 dismissed 记账集合（暂时隐藏）；缺省视同空集. */
  readonly dismissed?: ReadonlySet<SessionId>;
  /** SDK 归档会话 id 集合（排除防复活）；缺省视同空集. */
  readonly archived?: ReadonlySet<SessionId>;
}

/** buildBubbleGroups 返回值. */
export interface BuildBubbleGroupsResult {
  /** 可见顶层组（前 maxVisible 个 + 折叠豁免组，按根首次出现位序）. */
  readonly groups: readonly BubbleGroup[];
  /** 顶层溢出折叠数（moreCount = max(0, 顶层组数 − maxVisible)，豁免组不计）. */
  readonly moreCount: number;
}

/**
 * 归组引擎：输入投影（含 parentId / origin）+ 当前会话 + 上限，输出顶层
 * 分组序列（ADR-0018 D8）。
 *
 * 判定细则：
 *
 * - **范围过滤**：与既有模型一致，`running || completed` 的会话才可能入选；
 *   idle 后代不显示、不计数（实现决策 1）。保留模式扩展（ADR-0022 D1）：
 *   context 开启时入选 = `(running || completed || kept.has(id))` 且不被
 *   dismissed/archived 隐藏——集合过滤发生在本函数内部的范围过滤处（外部
 *   前置过滤会被硬编码语义丢弃 kept 条目）。豁免规则（ADR-0020 pending-interaction-bubble-effect
 *   pending-interaction-bubble-effect）：
 *   running === true 或 pendingInteraction !== undefined 的条目不被记账
 *   隐藏（活动与紧急信号优先），kept 对其冗余无害；豁免只防隐藏、不放宽
 *   入选资格。context 缺省或 keepEnabled === false 时逐字面退化为现状语义。
 * - **根祖先锚定**（D2）：subagent 条目沿 parentId 向上溯，停在第一个
 *   origin ≠ 'subagent' 的祖先——该祖先即根，全部后代折叠进它。
 * - **fork 截断**：fork 出的会话 origin 非 'subagent'，按普通会话自成
 *   锚点，不是任何人的后代、不进任何人的成员与计数。
 * - **孤儿回退**（D7）：上溯中断（无父行或父行不在输入镜像中）或父链
 *   成环时，以停留节点为根；停留节点本身是 subagent 则自成一个顶层归组
 *   气泡，徽标照常统计其可达后代。成环解析与上溯起点相关（停留节点随
 *   起点变化），属退化输入，本函数保证逐节点确定且不丢失条目。
 * - **组入选条件**（实现决策 1）：根本身通过过滤，或任一后代通过过滤。
 *   根空闲而后代在跑 ⇒ 组仍在、根气泡照常渲染（呼吸点示意）。
 * - **徽标计数**（D4）：badge.total 只计通过范围过滤的后代（不含根本身）；
 *   badge.running 为其中 running === true 者。
 * - **current 传播**（D6，组合式表达）：root.isCurrent 仅反映自身命中
 *   （rootId === current）；current 为某后代 ⇒ containsCurrent 置真（成员
 *   各自保留自身 isCurrent 高亮）。组件按 root.isCurrent || containsCurrent
 *   挂金描边；current 为根本身 / 无 current / 不相关 ⇒ containsCurrent 恒假。
 * - **上限只管顶层**（D3）：maxVisible 只约束顶层组数；组内展开不受限。
 *   moreCount = max(0, 顶层组数 − maxVisible)。
 * - **折叠豁免**（ADR-0020 pending-interaction-bubble-effect 分组模型组合语义，队长裁定）：组级 pending =
 *   根或任一入选成员 pendingInteraction !== undefined；pending 组豁免顶层
 *   折叠——落在截断线之外时按原相对顺序追加到 groups 尾部、不计入
 *   moreCount——等待交互的工作流入口永驻可见。maxVisible ≤ 0 时 groups
 *   仅含豁免组。
 * - **排序稳定**（D8）：顶层按根在宿主列表中的首次出现位次（后代先于根
 *   出现不影响组位次）；组内按宿主列表原序过滤；不做时间戳重排。
 * - **平铺退化**：无谱系字段（parentId/origin 全缺省）时每个合格会话
 *   自成单例组，输出与改造前平铺行为逐条目等价（向后兼容护栏）。
 *
 * @param items - 会话列表条目（从 sessions.list 快照派生，含谱系字段）。
 * @param current - 当前会话 id（undefined 表示无当前会话）。
 * @param maxVisible - 可见顶层归组气泡上限。
 * @param context - 保留模式上下文（可选，ADR-0022 D1；缺省 = 现状语义）。
 * @returns { groups, moreCount }。
 */
export function buildBubbleGroups(
  items: readonly SessionListEntry[],
  current: SessionId | undefined,
  maxVisible: number,
  context?: BubbleKeepContext,
): BuildBubbleGroupsResult {
  // ---- 保留模式范围过滤（ADR-0022 D1，工单 01）---------------------------
  // keepActive = 总开关开启；关闭时谓词逐字面退化为现状硬编码语义
  //（running || completed），保证不传参输出与改造前逐条目全等（回归护栏）。
  const keepActive = context !== undefined && context.keepEnabled;
  const kept = context?.kept;
  const dismissed = context?.dismissed;
  const archived = context?.archived;

  /**
   * 范围过滤谓词：入选 = (running || completed || kept.has(id)) 且不被
   * dismissed/archived 隐藏。豁免规则：running === true 或
   * pendingInteraction !== undefined 的条目不被记账隐藏（ADR-0020 pending-interaction-bubble-effect
   * pending-interaction-bubble-effect，活动与紧急信号优先）；豁免只防隐藏、不放宽入选资格。集合中不存在于
   * items 的 id 天然惰性忽略（has 不命中）。
   */
  const passesRange = (e: SessionListEntry): boolean => {
    if (!keepActive) return e.running || e.completed;
    if (
      !e.running &&
      e.pendingInteraction === undefined &&
      ((dismissed !== undefined && dismissed.has(e.sessionId)) ||
        (archived !== undefined && archived.has(e.sessionId)))
    ) {
      return false; // 记账隐藏（running/pending 豁免优先于集合）
    }
    return (
      e.running || e.completed || (kept !== undefined && kept.has(e.sessionId))
    );
  };

  // 输入镜像：沿 parentId 上溯时的行存在性查询（D7「父行不在 byId 中」）。
  const byId = new Map<SessionId, SessionListEntry>();
  for (const item of items) byId.set(item.sessionId, item);

  const isSubagent = (e: SessionListEntry | undefined): boolean =>
    e !== undefined && e.origin === "subagent";

  // 根祖先解析（带 memo 的路径压缩）。仅缓存结论与起点无关的终止：
  // 锚定命中（普通祖先）与上溯中断（停留节点必中断）可安全缓存；
  // 成环终止与起点相关（不同起点的停留节点不同），不写 memo 保证确定性。
  const rootMemo = new Map<SessionId, SessionId>();
  const resolveRoot = (startId: SessionId): SessionId => {
    const start = byId.get(startId);
    if (start === undefined) return startId;
    if (!isSubagent(start)) return startId; // 普通会话（含 fork）自成锚点
    const memoed = rootMemo.get(startId);
    if (memoed !== undefined) return memoed;

    const visited = new Set<SessionId>([startId]);
    let cur: SessionListEntry = start;
    let cyclic = false;
    while (isSubagent(cur)) {
      const parent =
        cur.parentId === undefined ? undefined : byId.get(cur.parentId);
      if (parent === undefined) break; // 上溯中断：停留节点为根（D7）
      if (visited.has(parent.sessionId)) {
        cyclic = true; // 父链成环：停留节点为根（D7），不写 memo
        break;
      }
      visited.add(parent.sessionId);
      cur = parent;
    }
    // 循环出口：cur 为普通锚点（D2 命中）或 subagent 停留节点（D7 回退）。
    const rootId = cur.sessionId;
    if (!cyclic) {
      for (const id of visited) rootMemo.set(id, rootId);
    }
    return rootId;
  };

  // 全量解析根祖先。
  const rootOf = new Map<SessionId, SessionId>();
  for (const item of items) {
    rootOf.set(item.sessionId, resolveRoot(item.sessionId));
  }

  // 先登记全部顶层根骨架（普通会话 + 孤儿 subagent 停留节点），再挂成员：
  // 两轮遍历保证后代先于根出现时成员不丢；Map 插入序 = 根首次出现位次（D8）。
  const skeletons = new Map<
    SessionId,
    { root: SessionListEntry; members: SessionListEntry[] }
  >();
  for (const item of items) {
    const r = rootOf.get(item.sessionId) ?? item.sessionId;
    if (item.origin !== "subagent" || r === item.sessionId) {
      if (!skeletons.has(item.sessionId)) {
        skeletons.set(item.sessionId, { root: item, members: [] });
      }
    }
  }
  // 安全网（退化输入）：成员解析目标未登记为根时（如两节点互环——环上
  // 无任何节点自锚），把目标提升为孤儿顶层根，保证条目不丢失（D7 精神：
  // 孤儿子会话不消失）。真实宿主数据 parentId 构成森林，此分支不可达。
  for (const item of items) {
    if (item.origin !== "subagent") continue;
    const r = rootOf.get(item.sessionId) ?? item.sessionId;
    if (r === item.sessionId || skeletons.has(r)) continue;
    const target = byId.get(r);
    if (target !== undefined) {
      skeletons.set(r, { root: target, members: [] });
    }
  }
  for (const item of items) {
    if (item.origin !== "subagent") continue;
    const r = rootOf.get(item.sessionId) ?? item.sessionId;
    if (r === item.sessionId) continue; // 已登记为孤儿顶层根
    skeletons.get(r)?.members.push(item); // 组内按宿主列表原序累积（D8）
  }

  // 组装配：入选判定 → current 标记 → 徽标计数 → 组级 pending 聚合。
  const groups: BubbleGroup[] = [];
  for (const sk of skeletons.values()) {
    // 范围过滤走统一谓词（保留模式下含 kept、减 dismissed/archived）。
    const rootPasses = passesRange(sk.root);
    const members = sk.members.filter(passesRange).map((m) =>
      toGroupBubbleEntry(m, current),
    );
    // 组入选条件（实现决策 1）：根本身或任一后代通过范围过滤。
    if (!rootPasses && members.length === 0) continue;
    const containsCurrent =
      current !== undefined &&
      members.some((m) => m.sessionId === current);
    groups.push({
      rootId: sk.root.sessionId,
      // root.isCurrent 仅自身命中；后代命中由 containsCurrent 表达（D6）。
      root: toGroupBubbleEntry(sk.root, current),
      members,
      badge: {
        total: members.length,
        running: members.reduce((n, m) => (m.running ? n + 1 : n), 0),
      },
      containsCurrent,
      // ADR-0020 pending-interaction-bubble-effect 组级聚合（队长裁定）：根或任一入选成员等待交互。
      pending:
        sk.root.pendingInteraction !== undefined ||
        members.some((m) => m.pendingInteraction !== undefined),
    });
  }

  // 上限只管顶层（D3）+ ADR-0020 pending-interaction-bubble-effect 组级折叠豁免（与既有平铺折叠豁免语义同构）。
  const cap = Math.max(0, Math.floor(maxVisible));
  const primary = groups.slice(0, cap);
  const overflow = groups.slice(cap);
  const promoted = overflow.filter((g) => g.pending);
  return {
    groups: [...primary, ...promoted],
    moreCount: Math.max(0, overflow.length - promoted.length),
  };
}

// ---------------------------------------------------------------------------
// 拖拽判定矩阵（ADR-0022 D2/D3/D4/D5，工单 02 一次写全——03 直接消费不改签名）
// ---------------------------------------------------------------------------

/** 投放区种类：收起区（近放、本地 dismissed、可逆）/ 归档区（远放、真归档、不可逆）。 */
export type DropZoneKind = "dismiss" | "archive";

/** 拖拽判定结论：click = 未超阈值放行原生点击；dismiss/archive = 投放动作；forbidden = 无动作（组件弹回）. */
export type DragVerdict = "click" | "dismiss" | "archive" | "forbidden";

/**
 * 拖拽判定的条目标志（从 BubbleEntry 投影；纯逻辑层不依赖组件态）。
 *
 * pendingInteraction 缺省 = 无阻塞。isCurrent 为真时归档区拒绝
 * （ADR-0022 D5），收起区仍允许。
 */
export interface DragEntryFlags {
  readonly running: boolean;
  readonly pendingInteraction?: PendingInteractionKind;
  readonly isCurrent: boolean;
}

/** 点击与拖拽的位移阈值（px）：位移 < 阈值 = 点击（ADR-0022 D2「约 8px」钉死为 8）。 */
export const DRAG_THRESHOLD_PX = 8;

/**
 * 判定一次拖拽手势的结论（ADR-0022 D2/D4/D5 判定矩阵，纯函数）。
 *
 * 判定顺序（钉死，逐条短路）：
 *
 * 1. `movedPx < DRAG_THRESHOLD_PX` ⇒ `"click"`——未超阈值的按下-松手恒为
 *    点击语义，**先于一切禁止判定**（禁拖不禁点：running/pending 条目的
 *    常规点击照旧走既有跳转路径）；
 * 2. flags.running ⇒ `"forbidden"`（D4 可拖范围 = 仅 completed 类；
 *    running 拖走后有 completed 复活问题）；
 * 3. pendingInteraction 存在 ⇒ `"forbidden"`（审批误删风险，ADR-0020 pending-interaction-bubble-effect
 *    紧急信号精神）；
 * 4. isCurrent 且 zone === "archive" ⇒ `"forbidden"`（D5：规避归档当前
 *    会话清空选择踢到 New Session 的副作用；03 的归档调用方直接消费此格）；
 * 5. zone === "dismiss" ⇒ `"dismiss"`（当前会话亦允许——收起是纯本地操作）;
 * 6. zone === "archive" ⇒ `"archive"`；
 * 7. zone undefined（有位移未命中任何投放区）⇒ `"forbidden"`——语义 =
 *    无动作，组件据此弹回原位不记账。
 */
export function resolveDragAction(input: {
  readonly movedPx: number;
  /** 落点解析出的投放区；undefined = 未落入任何投放区. */
  readonly zone: DropZoneKind | undefined;
  readonly flags: DragEntryFlags;
}): DragVerdict {
  if (input.movedPx < DRAG_THRESHOLD_PX) return "click";
  const { flags, zone } = input;
  if (flags.running) return "forbidden";
  if (flags.pendingInteraction !== undefined) return "forbidden";
  if (flags.isCurrent && zone === "archive") return "forbidden";
  if (zone === "dismiss") return "dismiss";
  if (zone === "archive") return "archive";
  return "forbidden"; // 有位移未命中 → 无动作（弹回）
}

/**
 * 条目是否可进入拖动态（ADR-0022 D4：可拖范围 = 仅 completed 类）。
 *
 * running 与等待交互条目一律 false——组件据此呈现视觉禁止态且不启动手势；
 * isCurrent 不影响可拖性（能否入归档区由 resolveDragAction 在落点判定，
 * 收起区对当前会话开放）。
 */
export function isBubbleDraggable(flags: DragEntryFlags): boolean {
  return !flags.running && flags.pendingInteraction === undefined;
}

/**
 * 气泡行是否可移除（队长追加需求 #2，用户规则：「如果有子代理还在运行，
 * 就不是可以移除的气泡」）。
 *
 * 行级判定 = 自身 flags（isBubbleDraggable 原语）&& 归组内无运行中成员——
 * 归组模型（ADR-0018）已把全部嵌套后代折叠进同一组，`group.badge.running`
 * 即组内运行中成员计数：组内仍有进行中的工作流时整组不可移除（根气泡与
 * 任意子气泡行同规则），防止用户收纳一条还活着的工作流。
 *
 * isBubbleDraggable 保持原样：resolveDragAction 的逐条目判定原语不动，
 * 判定矩阵语义零变化；本函数只在组件层作为「行是否可移除」的统一判定源
 * （绿线指示 / 手势臂态 / 键盘收起共用）。
 *
 * @param flags - 行自身三标志投影。
 * @param groupRunningMembers - 所属归组的 badge.running（组内运行中成员数；
 *   根气泡与子气泡传同一值，行级语义对组内位次无关）。
 */
export function isBubbleRowDraggable(
  flags: DragEntryFlags,
  groupRunningMembers: number,
): boolean {
  return isBubbleDraggable(flags) && groupRunningMembers <= 0;
}

/** 手柄命中选择器（ADR-0026 D1）：组件 JSX 与入口判定共用的唯一事实源。 */
export const DRAG_HANDLE_SELECTOR = "[data-jx-drag-handle]";

/**
 * pointerdown 是否命中气泡拖拽手柄（ADR-0026 D1：手柄唯一拖拽入口）。
 *
 * 「整泡即拖拽面」（ADR-0022 工单02）由组件层以本函数收敛为「手柄即拖拽面」：
 * 未命中 [data-jx-drag-handle] 的按下不进入臂态，气泡本体回归纯点击语义
 * （点击跳转 + kept 记账路径零变化）。判定走 closest——手柄自身或其内部
 * 装饰元素均算命中。判定矩阵 resolveDragAction / isBubbleRowDraggable 零改动。
 */
export function isBubbleHandleHit(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(DRAG_HANDLE_SELECTOR) !== null
  );
}

/**
 * 构造归组输出条目：透传展示、状态与谱系字段，isCurrent 仅反映自身命中
 * （sessionId === current）——组级传播语义由 containsCurrent 承载（D6）。
 */
function toGroupBubbleEntry(
  item: SessionListEntry,
  current: SessionId | undefined,
): BubbleEntry {
  return {
    sessionId: item.sessionId,
    title: item.title,
    running: item.running,
    completed: item.completed,
    ...(item.pendingInteraction !== undefined
      ? { pendingInteraction: item.pendingInteraction }
      : {}),
    ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
    ...(item.origin !== undefined ? { origin: item.origin } : {}),
    isCurrent: item.sessionId === current,
  };
}
