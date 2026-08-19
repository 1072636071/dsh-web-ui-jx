/**
 * overlay-position — 角色浮层位置纯逻辑模块。
 *
 * 工单 01：浮层可拖动的可测地基。ADR-0006 决策 2/3/4/7 的纯逻辑实现。
 *
 * 提供：
 *   - clampToViewport：视口内钳制纯函数（ADR-0006 决策 4，边界 0..vw-w）。
 *   - defaultOverlayPosition：默认右下角计算纯函数（留 16px 边距）。
 *   - loadPosition / savePosition / clearPosition：localStorage('jx-overlay-pos')
 *     持久化（容错对齐 skin.ts / fx/index.ts：写失败静默忽略、malformed 回落默认）。
 *   - dragStart / dragMove / dragEnd：drag reducer 纯函数（ADR-0006 决策 7）。
 *   - clampOnResize：resize 重钳制纯函数（ADR-0006 决策 4）。
 *   - createOverlayPositionStore / overlayPositionStore 单例：位置 store
 *     （getSnapshot / set / subscribe / reset / setViewport），镜像
 *     overlay-state-machine.ts 单例 + 稳定引用模式。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。DOM 薄壳在 CharacterOverlay（工单 02）。
 *
 * @module dsh-web-ui-jx/client
 */

// ---------------------------------------------------------------------------
// 几何类型
// ---------------------------------------------------------------------------

/** 浮层位置（左上角坐标 px，视口左上角为原点）. */
export interface OverlayPosition {
  readonly x: number;
  readonly y: number;
}

/** 视口尺寸 px. */
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** 浮层尺寸 px. */
export interface OverlaySize {
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 默认边距 px（默认位置与视口右下角的留白，ADR-0006 决策 2）. */
export const DEFAULT_OVERLAY_MARGIN = 16;

/** localStorage 键名（对齐 jx-skin / jx-fx 命名，ADR-0006 决策 3）. */
const OVERLAY_POS_STORAGE_KEY = "jx-overlay-pos";

// ---------------------------------------------------------------------------
// 视口钳制（纯函数，ADR-0006 决策 4：0 ≤ x ≤ vw-width）
// ---------------------------------------------------------------------------

/**
 * 把位置钳制到视口内（浮层完整可见）。
 *
 * ADR-0006 决策 4：`0 ≤ x ≤ vw-width`，`0 ≤ y ≤ vh-height`（无 margin，允许贴边）。
 * 若视口窄于浮层（vw < w），x 钳到 0（贴左，右部分出屏——退化情况）。
 *
 * @param position - 待钳制位置（左上角坐标）。
 * @param viewport - 视口尺寸。
 * @param size - 浮层尺寸。
 * @returns 钳制后位置：x ∈ [0, max(0, vw-w)]，y ∈ [0, max(0, vh-h)]。
 */
export function clampToViewport(
  position: OverlayPosition,
  viewport: ViewportSize,
  size: OverlaySize,
): OverlayPosition {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  return {
    x: Math.min(Math.max(position.x, 0), maxX),
    y: Math.min(Math.max(position.y, 0), maxY),
  };
}

// ---------------------------------------------------------------------------
// 默认位置（纯函数，ADR-0006 决策 2：右下角留 16px 边距）
// ---------------------------------------------------------------------------

/**
 * 返回默认浮层位置：右下角（视口 - 尺寸 - margin 边距）。
 *
 * ADR-0006 决策 2：默认位置 = `(vw-w-16, vh-h-16)`。再经 clampToViewport
 * 保证视口过小时贴左上（不出现负坐标）。
 *
 * @param viewport - 视口尺寸。
 * @param size - 浮层尺寸。
 * @param margin - 与视口右下角的留白（默认 16px）。
 * @returns 右下角位置，钳制到视口内。
 */
export function defaultOverlayPosition(
  viewport: ViewportSize,
  size: OverlaySize,
  margin: number = DEFAULT_OVERLAY_MARGIN,
): OverlayPosition {
  return clampToViewport(
    {
      x: viewport.width - size.width - margin,
      y: viewport.height - size.height - margin,
    },
    viewport,
    size,
  );
}

// ---------------------------------------------------------------------------
// 持久化（localStorage 'jx-overlay-pos'，容错对齐 skin.ts / fx/index.ts）
// ---------------------------------------------------------------------------

/**
 * 从 localStorage 读取持久化位置。
 *
 * 容错：JSON 解析失败、字段缺失、类型错误、NaN/Infinity 均返回 null
 * （调用方回退默认）。对齐 skin.ts / fx/index.ts 的 try/catch 静默忽略模式。
 *
 * @returns 解析成功且 x/y 均为有限数时返回位置，否则 null。
 */
export function loadPosition(): OverlayPosition | null {
  try {
    const raw = localStorage.getItem(OVERLAY_POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OverlayPosition>;
    const x = parsed.x;
    const y = parsed.y;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

/**
 * 写入位置到 localStorage。
 *
 * 容错：localStorage 不可用（隐私模式等）时静默忽略。对齐 skin.ts。
 *
 * @param position - 要持久化的位置。
 */
export function savePosition(position: OverlayPosition): void {
  try {
    localStorage.setItem(
      OVERLAY_POS_STORAGE_KEY,
      JSON.stringify({ x: position.x, y: position.y }),
    );
  } catch {
    // localStorage 不可用，静默忽略（仅本次会话生效）。
  }
}

/**
 * 清除持久化位置（重置用，工单 03）。
 *
 * 容错：localStorage 不可用时静默忽略。
 */
export function clearPosition(): void {
  try {
    localStorage.removeItem(OVERLAY_POS_STORAGE_KEY);
  } catch {
    // localStorage 不可用，静默忽略。
  }
}

// ---------------------------------------------------------------------------
// drag reducer（纯函数，ADR-0006 决策 7）
// ---------------------------------------------------------------------------

/** drag 会话状态（拖动期间持有，纯数据）. */
export interface DragSession {
  /** pointerdown 时的指针坐标. */
  readonly startPointer: OverlayPosition;
  /** pointerdown 时的浮层起始位置. */
  readonly startOverlay: OverlayPosition;
}

/** dragStart 结果：要么启动会话，要么不启动（命中交互子元素）. */
export interface DragStartResult {
  /** 是否启动 drag 会话. */
  readonly active: boolean;
  /** 启动时的会话状态（active=false 时为 null）. */
  readonly session: DragSession | null;
}

/**
 * dragStart：pointerdown 事件 → 启动 drag 会话（或跳过）。
 *
 * ADR-0006 决策 7：`pointerdown` 命中交互子元素（未来 StateSwitcher 按钮等）时
 * 不触发拖动。由调用方判 `interactive`（如 `e.target` 是否在交互子元素内）传入。
 *
 * @param pointer - pointerdown 指针坐标。
 * @param overlay - pointerdown 时浮层当前位置。
 * @param interactive - 是否命中交互子元素（true=不启动拖动，留给子元素处理）。
 * @returns DragStartResult。
 */
export function dragStart(
  pointer: OverlayPosition,
  overlay: OverlayPosition,
  interactive: boolean = false,
): DragStartResult {
  if (interactive) {
    return { active: false, session: null };
  }
  const session: DragSession = {
    startPointer: pointer,
    startOverlay: overlay,
  };
  return { active: true, session };
}

/**
 * dragMove：pointermove 事件 → 跟手位置（钳制到视口）。
 *
 * 跟手 = startOverlay + (pointer - startPointer)，再经 clampToViewport 钳制。
 *
 * @param session - 当前 drag 会话。
 * @param pointer - pointermove 指针坐标。
 * @param viewport - 视口尺寸（用于钳制）。
 * @param size - 浮层尺寸。
 * @returns 跟手位置（已钳制）。
 */
export function dragMove(
  session: DragSession,
  pointer: OverlayPosition,
  viewport: ViewportSize,
  size: OverlaySize,
): OverlayPosition {
  const dx = pointer.x - session.startPointer.x;
  const dy = pointer.y - session.startPointer.y;
  return clampToViewport(
    {
      x: session.startOverlay.x + dx,
      y: session.startOverlay.y + dy,
    },
    viewport,
    size,
  );
}

/**
 * dragEnd：pointerup 事件 → 提交最终位置（已钳制）。
 *
 * 语义同 dragMove（提交时再钳制一次，保证最终位置在视口内）。
 *
 * @param session - 当前 drag 会话。
 * @param pointer - pointerup 指针坐标。
 * @param viewport - 视口尺寸。
 * @param size - 浮层尺寸。
 * @returns 提交位置（已钳制，将持久化）。
 */
export function dragEnd(
  session: DragSession,
  pointer: OverlayPosition,
  viewport: ViewportSize,
  size: OverlaySize,
): OverlayPosition {
  return dragMove(session, pointer, viewport, size);
}

// ---------------------------------------------------------------------------
// resize 重钳制（纯函数，ADR-0006 决策 4）
// ---------------------------------------------------------------------------

/**
 * 视口尺寸变化时重钳制位置（保证浮层不跑到屏幕外）。
 *
 * ADR-0006 决策 4：window resize 时重新钳制。语义同 clampToViewport，独立函数
 * 表达 resize 意图。
 *
 * @param position - 当前位置。
 * @param viewport - 新视口尺寸。
 * @param size - 浮层尺寸。
 * @returns 钳制后位置。
 */
export function clampOnResize(
  position: OverlayPosition,
  viewport: ViewportSize,
  size: OverlaySize,
): OverlayPosition {
  return clampToViewport(position, viewport, size);
}

// ---------------------------------------------------------------------------
// 位置 store（单例，镜像 overlay-state-machine.ts 模式）
// ---------------------------------------------------------------------------

/** 位置 store 实例. */
export interface OverlayPositionStore {
  /** 取当前快照（供 useSyncExternalStore；稳定引用，状态未变时返回同一对象）. */
  getSnapshot(): OverlayPosition;
  /** 设置位置（写 localStorage + 通知订阅者）。调用方负责钳制。.
   *  用于提交最终位置（如 pointerup），ADR-0006 决策 3「拖动结束钳制后写入」。 */
  set(position: OverlayPosition): void;
  /** 仅更新内存位置 + 通知订阅者，不写 localStorage（实时跟手用，避免高频 I/O）.
   *  用于拖动过程中 pointermove 跟手；提交时调 set 持久化。 */
  move(position: OverlayPosition): void;
  /** 订阅位置变化；返回取消订阅函数. */
  subscribe(listener: (position: OverlayPosition) => void): () => void;
  /** 重置到默认位置（清 localStorage + 回默认 + 通知，工单 03）. */
  reset(): void;
  /** 更新视口尺寸（resize 用）：重算默认位置 + 重钳制当前位置 + 通知. */
  setViewport(viewport: ViewportSize): void;
}

/** 位置 store 工厂参数. */
export interface CreateOverlayPositionStoreOptions {
  /** 初始视口尺寸（用于默认位置计算与初始钳制）. */
  readonly viewport: ViewportSize;
  /** 浮层尺寸. */
  readonly size: OverlaySize;
  /** 默认位置与视口右下角的留白（默认 16px）. */
  readonly margin?: number;
}

/**
 * 创建位置 store 实例。
 *
 * 初始化：读 localStorage('jx-overlay-pos')，无值或 malformed 则默认右下角；
 * 再经 clampToViewport 保证持久化位置在当前视口内（防止视口缩小后越界）。
 *
 * 镜像 overlay-state-machine.ts：cachedSnapshot 保证 getSnapshot 稳定引用
 * （useSyncExternalStore 要求，避免无限重渲染）。
 *
 * @param options - 配置（viewport / size / margin）。
 * @returns 位置 store 实例。
 */
export function createOverlayPositionStore(
  options: CreateOverlayPositionStoreOptions,
): OverlayPositionStore {
  let viewport = options.viewport;
  const size = options.size;
  const margin = options.margin ?? DEFAULT_OVERLAY_MARGIN;
  let defaultPos = defaultOverlayPosition(viewport, size, margin);
  let current = clampToViewport(loadPosition() ?? defaultPos, viewport, size);
  let cachedSnapshot: OverlayPosition = current;
  const listeners = new Set<(position: OverlayPosition) => void>();

  function getSnapshot(): OverlayPosition {
    return cachedSnapshot;
  }

  function emit(): void {
    cachedSnapshot = current;
    for (const listener of listeners) listener(cachedSnapshot);
  }

  function set(position: OverlayPosition): void {
    // set 是提交语义（pointerup）：总是持久化，保证拖动最终位置写入 localStorage
    // （ADR-0006 决策 3）。仅在位置变化时通知，避免无意义重渲染。
    savePosition(position);
    if (position.x === current.x && position.y === current.y) return;
    current = position;
    emit();
  }

  function move(position: OverlayPosition): void {
    if (position.x === current.x && position.y === current.y) return;
    current = position;
    emit();
  }

  function subscribe(
    listener: (position: OverlayPosition) => void,
  ): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function reset(): void {
    clearPosition();
    if (defaultPos.x === current.x && defaultPos.y === current.y) return;
    current = defaultPos;
    emit();
  }

  function setViewport(newViewport: ViewportSize): void {
    if (
      newViewport.width === viewport.width &&
      newViewport.height === viewport.height
    ) {
      return;
    }
    viewport = newViewport;
    defaultPos = defaultOverlayPosition(viewport, size, margin);
    const clamped = clampToViewport(current, viewport, size);
    if (clamped.x === current.x && clamped.y === current.y) return;
    current = clamped;
    emit();
  }

  return { getSnapshot, set, move, subscribe, reset, setViewport };
}

// ---------------------------------------------------------------------------
// 模块级单例（供 CharacterOverlay 与 SettingsCard 共享，镜像 overlay-state-machine.ts）
// ---------------------------------------------------------------------------

/** CharacterOverlay 默认尺寸（与 CharacterOverlay props 默认一致）. */
const DEFAULT_OVERLAY_SIZE: OverlaySize = { width: 180, height: 260 };

/** 取当前视口尺寸（SSR 守卫：非浏览器环境退化为 0x0）.
 *  供 store 单例初始化与 CharacterOverlay resize 监听共享，避免重复实现。 */
export function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** 角色浮层位置 store 单例（CharacterOverlay 与 SettingsCard 共享此实例）. */
export const overlayPositionStore: OverlayPositionStore =
  createOverlayPositionStore({
    viewport: getViewportSize(),
    size: DEFAULT_OVERLAY_SIZE,
  });

/** 稳定的 subscribe 引用（供 useSyncExternalStore，引用恒等避免重渲染）. */
export const subscribeOverlayPositionStore = (
  onChange: () => void,
): (() => void) => overlayPositionStore.subscribe(onChange);

/** 稳定的 getSnapshot 引用（供 useSyncExternalStore，引用恒等避免重渲染）. */
export const getOverlayPositionSnapshot = (): OverlayPosition =>
  overlayPositionStore.getSnapshot();
