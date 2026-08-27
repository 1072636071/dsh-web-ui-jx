/**
 * dynamic-title — AI 动态标题（工单 16-03 / 16-04）。
 *
 * 纯逻辑模块：
 *   - `DynamicTitleTransport` 接口：库侧稳定抽象；DSH 默认实现经 host 半区路由
 *     （`/api/dsh-jx/ai-title`）按 OpenAI 兼容协议生成标题，浏览器端零 key 暴露。
 *   - 提示词组装 `buildDynamicTitlePrompt`：长度有界（字符护栏），可单测。
 *   - 响应解析 `parseDynamicTitleResponse`：OpenAI 兼容 `choices[0].message.content`。
 *   - 刷新判定 `decideTitleRefresh`（16-04）：脏/TTL 触发、节流抑制、未配置短路。
 *   - `createDynamicTitleStore`（16-04）：带缓存/节流的 transport 包装器，
 *     悬停时按需生成、平时不轮询。
 *
 * 本模块零依赖 DOM/React；DSH 默认实现仅用全局 fetch（浏览器 / Node18+）。
 *
 * @module dsh-session-bubble/detail
 */

// ---------------------------------------------------------------------------
// Transport 接口与 DSH 默认实现
// ---------------------------------------------------------------------------

/** 生成动态标题的输入上下文（客户端只传消息上下文，不触 key）. */
export interface DynamicTitleInput {
  /** 会话 id. */
  readonly sessionId: string;
  /** 会话标题（书眉）——prompt 上下文之一. */
  readonly title: string;
  /** 会话 updatedAt（缓存失效判据）. */
  readonly updatedAt: number;
  /** 最后一条用户消息可见文本（可能为空字符串）. */
  readonly lastUserText: string;
}

/** 动态标题 transport 返回结果：配置态区分「未配置」与「生成成功」。 */
export type DynamicTitleResult =
  | {
      readonly kind: "configured";
      /** 生成的一句话动态标题. */
      readonly title: string;
      /** 宿主配置的重刷频率 ms（客户端据此调整复用 TTL）. */
      readonly refreshIntervalMs: number;
    }
  | {
      readonly kind: "unconfigured";
      readonly refreshIntervalMs: number;
    };

/**
 * 动态标题 transport 接口。
 *
 * 库不绑定具体网络层；消费者可注入 mock 或自定义实现。返回 `undefined` 表示
 * 传输失败（超时/网络抖动）——UI 静默降级（保留旧缓存或隐藏行）。
 */
export interface DynamicTitleTransport {
  /**
   * 生成一个会话的动态标题。
   *
   * @param input - 会话 id / 标题 / updatedAt / 最后用户消息。
   * @param signal - 取消信号。
   * @returns `configured` 携带标题；`unconfigured` 表示未配置 API（UI 隐藏行）；
   *   `undefined` 表示传输失败（静默降级）。
   */
  generateTitle(
    input: DynamicTitleInput,
    signal?: AbortSignal,
  ): Promise<DynamicTitleResult | undefined>;
}

/** DSH 默认 transport 选项. */
export interface DshDynamicTitleTransportOptions {
  /** host 半区 ai-title 路由（默认 `/api/dsh-jx/ai-title`）. */
  readonly endpoint?: string;
  /** fetch 注入（测试/自托管用；默认全局 fetch）. */
  readonly fetchImpl?: typeof fetch;
  /** 请求超时 ms（默认 10000）. */
  readonly timeoutMs?: number;
}

/** 默认重刷频率（host 未返回时 5 分钟）. */
const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60_000;

/** 从 host 路由响应里读重刷频率（非法/缺失回落默认值）. */
function parseRefreshIntervalMs(data: Record<string, unknown>): number {
  const value = data.refreshIntervalMs;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_REFRESH_INTERVAL_MS;
}

/** 创建 DSH 默认动态标题 transport：POST host 半区 ai-title 路由。 */
export function createDshDynamicTitleTransport(
  options: DshDynamicTitleTransportOptions = {},
): DynamicTitleTransport {
  const endpoint = options.endpoint ?? "/api/dsh-jx/ai-title";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    async generateTitle(input, signal) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      const onAbort = (): void => ac.abort();
      signal?.addEventListener("abort", onAbort);
      try {
        let response: Response;
        try {
          response = await fetchImpl(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId: input.sessionId,
              title: input.title,
              updatedAt: input.updatedAt,
              lastUserText: input.lastUserText,
            }),
            signal: ac.signal,
          });
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        }
        if (!response.ok) return undefined;
        const data = (await response.json()) as unknown;
        return parseDynamicTitleResponse(data);
      } catch {
        // 超时 / 取消 / 网络抖动：静默降级
        return undefined;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 提示词组装（有界）与响应解析（纯函数）
// ---------------------------------------------------------------------------

/** 提示词组装选项. */
export interface DynamicTitlePromptOptions {
  /** 会话标题入 prompt 的最大字符数（默认 40）. */
  readonly maxTitleChars?: number;
  /** 最后用户消息入 prompt 的最大字符数（默认 120）. */
  readonly maxLastMessageChars?: number;
}

/**
 * 组装动态标题生成 prompt（有界）。
 *
 * 固定模板 + 标题/最后消息上下文；上下文各设字符护栏，产出长度恒有界。
 *
 * @param ctx - 标题 + 最后用户消息。
 * @param options - 字符护栏上限。
 * @returns 系统 prompt 文本（由固定模板与护栏保证长度上界）。
 */
export function buildDynamicTitlePrompt(
  ctx: DynamicTitlePromptInput,
  options: DynamicTitlePromptOptions = {},
): string {
  const maxTitleChars = options.maxTitleChars ?? 40;
  const maxLastMessageChars = options.maxLastMessageChars ?? 120;
  const title = ctx.title.slice(0, maxTitleChars);
  const lastUserText = ctx.lastUserText.slice(0, maxLastMessageChars);
  const lastUserLine = lastUserText.length > 0 ? `最后一条用户消息：${lastUserText}` : "（暂无用户消息）";
  return [
    "你是会话观察员。为会话生成一句话动态标题（不超过 30 字，简体中文），",
    "概括这个会话在做什么或进展如何；直接输出标题本身，不加引号、不加标点结尾。",
    "",
    `会话标题：${title}`,
    lastUserLine,
    "",
    "只输出一句话标题：",
  ].join("\n");
}

/** buildDynamicTitlePrompt 的输入子集（与 DynamicTitleInput 解耦）. */
export interface DynamicTitlePromptInput {
  readonly title: string;
  readonly lastUserText: string;
}

/** 响应解析结果. */
export type ParsedDynamicTitle =
  | {
      readonly kind: "configured";
      readonly title: string;
      readonly refreshIntervalMs: number;
    }
  | {
      readonly kind: "unconfigured";
      readonly refreshIntervalMs: number;
    };

/** 解析选项. */
export interface DynamicTitleParseOptions {
  /** 标题最大长度（默认 60）. */
  readonly maxTitleLength?: number;
}

/**
 * 解析 host 路由响应。
 *
 * - `{ title }` → `configured`（去空白、截断到护栏）。
 * - `{ enabled: false }` → `unconfigured`（未配置 API，UI 隐藏行）。
 * - 其余（`{ error }` / 缺字段 / 非法形状）→ `undefined`（静默降级）。
 *
 * @param data - 响应 JSON。
 * @param options - 标题长度护栏。
 * @returns 解析结果或 undefined（错误/降级）。
 */
export function parseDynamicTitleResponse(
  data: unknown,
  options: DynamicTitleParseOptions = {},
): ParsedDynamicTitle | undefined {
  if (data === null || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  const refreshIntervalMs = parseRefreshIntervalMs(obj);

  if (typeof obj.title === "string" && obj.title.trim().length > 0) {
    const maxLength = options.maxTitleLength ?? 60;
    const title = obj.title.trim().slice(0, maxLength);
    if (title.length === 0) return undefined;
    return { kind: "configured", title, refreshIntervalMs };
  }
  if (obj.enabled === false) {
    return { kind: "unconfigured", refreshIntervalMs };
  }
  // 成功响应但无标题 / 错误响应：视为降级
  return undefined;
}

// ---------------------------------------------------------------------------
// 刷新判定（纯函数，工单 16-04）
// ---------------------------------------------------------------------------

/** 刷新判定输入. */
export interface TitleRefreshInput {
  /**
   * 是否已确认配置可用：
   *   - `true`  = 最近一次 transport 返回 `configured`；
   *   - `false` = 最近一次 transport 返回 `unconfigured`（未配 API 短路）；
   *   - `undefined` = 尚未探测过。
   */
  readonly configured: boolean | undefined;
  /** 会话是否有更新（updatedAt 与上次生成时不一致）. */
  readonly dirty: boolean;
  /** 缓存标题（无则 undefined）. */
  readonly cachedTitle: string | undefined;
  /** 上次尝试生成的时间戳（无则 undefined）. */
  readonly lastAttemptAt: number | undefined;
  /** 生成后复用 TTL ms（窗口内不重生成）. */
  readonly ttlMs: number;
  /** 最小生成间隔 ms（节流：窗口内不重复打 transport）. */
  readonly minIntervalMs: number;
  /** 当前时间戳. */
  readonly now: number;
}

/** 刷新判定结论. */
export type TitleRefreshDecision = "generate" | "reuse" | "skip";

/**
 * 判定悬停时是否应生成动态标题（PRD D2 / 工单 16-04）。
 *
 * 规则：
 *   - 未配 API（configured === false）且会话未更新 → `skip`（整行隐藏，短路）；
 *     会话更新后允许重探测（用户可能刚配置）。
 *   - 已配置且会话未更新 → TTL 窗口内 `reuse` 缓存，过期 `generate`。
 *   - 未探测过 / 会话已更新 → `generate`；但若距上次尝试不足 minIntervalMs
 *     （节流），有缓存则 `reuse`（展示旧标题），无缓存则 `skip`（保守等待）。
 *
 * @param input - 判定输入（全部纯数据，可单测）。
 * @returns 生成 / 复用缓存 / 跳过。
 */
export function decideTitleRefresh(input: TitleRefreshInput): TitleRefreshDecision {
  const throttled =
    input.lastAttemptAt !== undefined &&
    input.now - input.lastAttemptAt < input.minIntervalMs;

  if (input.configured === false) {
    if (!input.dirty) return "skip";
    return throttled ? "skip" : "generate";
  }
  if (input.configured === true && !input.dirty) {
    return input.lastAttemptAt !== undefined &&
      input.now - input.lastAttemptAt < input.ttlMs
      ? "reuse"
      : "generate";
  }
  // 未探测 或 会话已更新：需生成，但受节流抑制。
  if (throttled) {
    return input.cachedTitle !== undefined ? "reuse" : "skip";
  }
  return "generate";
}

// ---------------------------------------------------------------------------
// 带缓存/节流的 transport 包装器（工单 16-04）
// ---------------------------------------------------------------------------

/** 动态标题 store 选项. */
export interface DynamicTitleStoreOptions {
  /** 生成后复用 TTL ms（默认 15 分钟；host 返回重刷频率后以其为准）. */
  readonly ttlMs?: number;
  /** 最小生成间隔 ms（节流，默认 30 秒）. */
  readonly minIntervalMs?: number;
  /** 时间注入（测试用；默认 Date.now）. */
  readonly now?: () => number;
}

interface TitleCacheEntry {
  readonly state: "configured" | "unconfigured";
  readonly title: string;
  readonly lastAttemptAt: number;
  readonly lastUpdatedAt: number;
  readonly refreshIntervalMs: number;
}

/**
 * 创建带缓存/节流的动态标题 transport 包装器（悬停时按需生成，平时不轮询）。
 *
 * 策略（PRD D2 + 工单 16-04）：
 *   - 每会话记账：上次尝试时间 / 对应 updatedAt / 标题 / 配置态。
 *   - 会话有更新 → 下次悬停重生成（受节流约束）；更新前不重打 transport。
 *   - 未配置（unconfigured）短路：整行隐藏，会话更新后重探测。
 *   - 传输失败不覆盖既有状态，仅推进节流游标，避免抖动时反复打 host。
 */
export function createDynamicTitleStore(
  transport: DynamicTitleTransport,
  options: DynamicTitleStoreOptions = {},
): DynamicTitleTransport {
  let ttlMs = options.ttlMs ?? 15 * 60_000;
  const minIntervalMs = options.minIntervalMs ?? 30_000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, TitleCacheEntry>();

  return {
    async generateTitle(input, signal) {
      const entry = cache.get(input.sessionId);
      const dirty = entry === undefined || entry.lastUpdatedAt !== input.updatedAt;
      const configured =
        entry === undefined
          ? undefined
          : entry.state === "configured"
            ? true
            : false;

      const decision = decideTitleRefresh({
        configured,
        dirty,
        cachedTitle: entry?.title,
        lastAttemptAt: entry?.lastAttemptAt,
        ttlMs,
        minIntervalMs,
        now: now(),
      });

      // 复用缓存 / 跳过：回放既有状态（configured 带标题 / unconfigured 表示未配置）。
      if (decision === "reuse" || decision === "skip") {
        if (entry === undefined) return undefined;
        return entry.state === "configured"
          ? {
              kind: "configured",
              title: entry.title,
              refreshIntervalMs: entry.refreshIntervalMs,
            }
          : {
              kind: "unconfigured",
              refreshIntervalMs: entry.refreshIntervalMs,
            };
      }

      // 生成：调用底层 transport。异常按失败处理（静默降级，不向上抛）。
      let result: DynamicTitleResult | undefined;
      try {
        result = await transport.generateTitle(input, signal);
      } catch {
        result = undefined;
      }
      const attemptAt = now();
      if (result === undefined) {
        // 传输失败：推进节流游标但不改配置态/标题；有旧缓存继续展示。
        if (entry !== undefined) {
          cache.set(input.sessionId, {
            ...entry,
            lastAttemptAt: attemptAt,
            lastUpdatedAt: input.updatedAt,
          });
          return entry.state === "configured"
            ? {
                kind: "configured",
                title: entry.title,
                refreshIntervalMs: entry.refreshIntervalMs,
              }
            : {
                kind: "unconfigured",
                refreshIntervalMs: entry.refreshIntervalMs,
              };
        }
        return undefined;
      }

      // 学习宿主配置的重刷频率（后续判定以其为 TTL）。
      if (result.refreshIntervalMs > 0) ttlMs = result.refreshIntervalMs;
      cache.set(input.sessionId, {
        state: result.kind,
        title: result.kind === "configured" ? result.title : "",
        lastAttemptAt: attemptAt,
        lastUpdatedAt: input.updatedAt,
        refreshIntervalMs: result.refreshIntervalMs,
      });
      return result;
    },
  };
}
