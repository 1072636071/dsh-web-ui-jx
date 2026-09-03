/**
 * detail-data — 会话气泡详情窗数据层（工单 16-01）。
 *
 * 纯逻辑模块：
 *   - 预览提取：从会话尾页事件序列中抽取最后一条用户消息与
 *     最后一条模型消息；空日志 / 纯工具尾 / in-flight partial 回退正确。
 *   - 缓存策略：TTL 15s + 会话 updatedAt 变化失效 + in-flight 去重。
 *   - transport 接口 + DSH 默认实现（经 SessionEventStream 打开会话尾页）。
 *
 * 本模块零依赖 DOM/React；所有 SDK 类型以 TypeScript 类型导入，运行时仅依赖
 * 标准 ECMAScript（SessionEventStream 为浏览器 __ModuleLoader__ 包裹的运行时
 * 模块，仅经 fetchPreview 内的延迟动态导入触达）。
 *
 * @module dsh-session-bubble/detail
 */

import type {
  SessionEventStream,
  SessionEventLikeEntry,
  SessionJournalChange,
} from "@deepseek-ai/dsh-api-session-controller/client";
import type { ContentBlock } from "@deepseek-ai/dsh-llm/types";
import type { SessionEvent, SessionId } from "@deepseek-ai/dsh-session/types";
import {
  isSurfaceEligibleType,
} from "@deepseek-ai/dsh-session/surface";

// ---------------------------------------------------------------------------
// 预览数据结构
// ---------------------------------------------------------------------------

/** 一条会话的详情预览（供详情窗组件消费）. */
export interface SessionPreview {
  /** 会话 id. */
  readonly sessionId: string;
  /** 会话标题. */
  readonly title: string;
  /** 最后一条用户消息的可见文本；不存在时为空字符串. */
  readonly lastUserText: string;
  /** 最后一条模型（助手）消息的可见文本；不存在时为空字符串. */
  readonly lastAssistantText: string;
  /** 当前是否处于模型生成中（尾页含 in-flight partial 且无已落盘助手消息）. */
  readonly inFlight: boolean;
  /** 是否成功读取到历史（用于失败静默降级：false 表示走空状态）. */
  readonly hasHistory: boolean;
}

// ---------------------------------------------------------------------------
// 内容提取纯函数
// ---------------------------------------------------------------------------

/** 从 ContentBlock[] 拼接可见文本；图片占位、工具结果忽略，工具调用显示名称. */
function extractVisibleText(content: readonly ContentBlock[] | undefined): string {
  if (!content || content.length === 0) return "";
  const parts: string[] = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        if (block.text) parts.push(block.text);
        break;
      case "reasoning":
        if (block.text) parts.push(block.text);
        break;
      case "tool-call":
        if (block.name) parts.push(`调用工具 ${block.name}`);
        break;
      case "image":
        parts.push("[图片]");
        break;
      case "tool-result":
        // 工具结果不直接作为模型回复展示
        break;
      default:
        // 未知类型：merge-extensible，安全忽略
        break;
    }
  }
  return parts.join(" ").trim();
}

/**
 * 从单个 surface 事件提取可见文本；空内容 / usage-only assistant 返回空字符串。
 *
 * 直接访问 event.data 字段（与 dsh-session-title 的 collectSessionTitleMessages
 * 同策略），不经过 deriveEventMessage——后者要求完整的 Message 结构，
 * session.history 返回的持久化事件可能不满足该假设。
 */
function textFromEvent(event: SessionEvent): string {
  switch (event.type) {
    case "user/message": {
      // 直接访问 event.data.content（官方实现方式）
      const data = event.data as unknown as Record<string, unknown>;
      const content = data.content;
      if (Array.isArray(content)) {
        return extractVisibleText(content as ContentBlock[]);
      }
      return "";
    }
    case "assistant/message": {
      // assistant/message 的 data 是 { turn, step, message: AssistantMessage, usage? }
      const data = event.data as unknown as Record<string, unknown>;
      const message = data.message as Record<string, unknown> | undefined;
      if (message && Array.isArray(message.content)) {
        return extractVisibleText(message.content as ContentBlock[]);
      }
      return "";
    }
    case "tool/result": {
      // tool/result 的 data 是 { turn, step, message: ToolResultMessage, error?, meta? }
      const data = event.data as Record<string, unknown>;
      const message = data.message as Record<string, unknown> | undefined;
      if (message && Array.isArray(message.content)) {
        return extractVisibleText(message.content as ContentBlock[]);
      }
      return "";
    }
    default:
      return "";
  }
}

/**
 * 判断事件是否属于模型正在生成的信号（assistant/chunk）。
 * 尾页会在最后一个未落盘的助手消息上附带 chunk 事件。
 */
function isAssistantChunkEvent(event: SessionEvent): boolean {
  return event.type === "assistant/chunk";
}

/**
 * 预览提取：尾页事件序列 → 预览结构。
 *
 * 规则：
 *   - 遍历事件；surface 事件中的 user/message 更新 lastUserText；
 *     assistant/message 更新 lastAssistantText；tool/result 忽略。
 *   - 若遍历结束后 lastAssistantText 为空，且序列中出现过 assistant/chunk
 *     或紧凑 chunk 行，则视为 in-flight，UI 可展示占位文案。
 *   - 空日志 / 非 surface 尾页 ⇒ 返回空文本、非 inFlight。
 *
 * @param title - 会话标题（由会话列表给出）。
 * @param entries - 会话尾页返回的 SessionEventLikeEntry[]。
 * @returns 不含 sessionId 的预览内容（SessionBubbleDetail 再拼 sessionId）。
 */
export function extractPreview({
  title,
  entries,
}: {
  title: string;
  entries: readonly SessionEventLikeEntry[];
}): Omit<SessionPreview, "sessionId"> {
  let lastUserText = "";
  let lastAssistantText = "";
  let hasChunk = false;

  for (const entry of entries) {
    // 紧凑 chunk 行：未落盘的模型增量，视为 in-flight 信号。
    if (entry.type === "chunks") {
      hasChunk = true;
      continue;
    }
    const event = entry.event;
    if (isAssistantChunkEvent(event)) {
      hasChunk = true;
      continue;
    }
    if (!isSurfaceEligibleType(event.type)) continue;

    const text = textFromEvent(event);
    if (event.type === "user/message") {
      if (text.length > 0) lastUserText = text;
    } else if (event.type === "assistant/message") {
      if (text.length > 0) lastAssistantText = text;
    }
    // tool/result 不覆盖 lastAssistantText
  }

  const inFlight = lastAssistantText.length === 0 && hasChunk;

  return {
    title,
    lastUserText,
    lastAssistantText: inFlight ? "" : lastAssistantText,
    inFlight,
    hasHistory: entries.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Transport 接口与 DSH 默认实现
// ---------------------------------------------------------------------------

/**
 * 详情窗数据 transport 接口。
 *
 * 库不绑定具体网络层；消费者可注入 mock 或自定义实现。
 */
export interface PreviewTransport {
  /**
   * 拉取一个会话的详情预览。
   *
   * @param input - sessionId / title / updatedAt（缓存用）。
   * @param signal - 取消信号。
   * @returns 预览数据。
   */
  fetchPreview(
    input: {
      sessionId: string;
      title: string;
      updatedAt: number;
    },
    signal?: AbortSignal,
  ): Promise<SessionPreview>;
}

/** DSH 默认 transport 选项. */
export interface DshPreviewTransportOptions {
  /** history 尾页读取的最大消息数（默认 6，足够覆盖最后两对用户/助手消息）. */
  maxMessages?: number;
}

/** SessionEventStream 构造所需的 Remote 命名空间面（即 SessionRemotes）. */
export type SessionStreamRemote = ConstructorParameters<typeof SessionEventStream>[0];

/** 创建 DSH 默认 preview transport：经 SessionEventStream 打开会话尾页快照。 */
export function createDshPreviewTransport(
  api: SessionStreamRemote,
  options: DshPreviewTransportOptions = {},
): PreviewTransport {
  const maxMessages = options.maxMessages ?? 6;

  return {
    async fetchPreview({ sessionId, title, updatedAt: _updatedAt }, signal) {
      let stream: SessionEventStream | undefined;
      try {
        // @deepseek-ai/dsh-api-session-controller/client 是浏览器 __ModuleLoader__
        // 包裹的运行时模块，node 测试环境不可顶层导入；改在 fetchPreview 内延迟
        // 动态导入，失败（node 测试 / 宿主模块表未提供）自然落入下方静默降级。
        const { SessionEventStream: SessionEventStreamCtor } = await import(
          "@deepseek-ai/dsh-api-session-controller/client"
        );
        let snapshotEntries: readonly SessionEventLikeEntry[] | undefined;
        stream = new SessionEventStreamCtor(
          api,
          { kind: "session", sessionId: sessionId as SessionId },
          {
            // open() 发布首个 replace/prepend 快照后即读取 entries，无需常驻订阅。
            publish: (change: SessionJournalChange) => {
              if (
                snapshotEntries === undefined &&
                (change.type === "replace" || change.type === "prepend")
              ) {
                snapshotEntries = change.entries;
              }
            },
            failed: () => {
              // open() 期间的终态失败会直接 reject；此处仅兜底避免未处理异常
            },
          },
        );
        if (signal !== undefined) {
          if (signal.aborted) throw new Error("preview aborted");
          signal.addEventListener("abort", () => { void stream?.dispose(); }, { once: true });
        }
        await stream.open({ maxMessages });
        if (snapshotEntries === undefined) {
          // 无 opening snapshot：按旧语义静默降级为空预览
          return {
            sessionId,
            title,
            lastUserText: "",
            lastAssistantText: "",
            inFlight: false,
            hasHistory: false,
          };
        }
        const extracted = extractPreview({ title, entries: snapshotEntries });
        return { sessionId, ...extracted };
      } catch {
        // 超时 / 取消 / 网络抖动 静默降级
        return {
          sessionId,
          title,
          lastUserText: "",
          lastAssistantText: "",
          inFlight: false,
          hasHistory: false,
        };
      } finally {
        void stream?.dispose();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 缓存层
// ---------------------------------------------------------------------------

/** 缓存选项. */
export interface PreviewCacheOptions {
  /** 缓存 TTL，毫秒（默认 15000ms，PRD 决策）. */
  ttlMs?: number;
  /** history 尾页 maxMessages，透传给 transport. */
  maxMessages?: number;
}

interface CacheEntry {
  /** 当前缓存的预览. */
  preview: SessionPreview;
  /** 缓存生成时间戳. */
  fetchedAt: number;
  /** 缓存对应的会话 updatedAt（变化即失效）. */
  updatedAt: number;
  /** 正在进行的请求（in-flight 去重用）. */
  inFlight?: Promise<SessionPreview>;
}

/**
 * 创建带缓存的 preview transport 包装器。
 *
 * 策略：
 *   - 同 sessionId 并发请求只发一次（in-flight promise 复用）。
 *   - 命中缓存且 updatedAt 未变、未过 TTL 直接复用。
 *   - updatedAt 变化或缓存缺失触发重新拉取。
 */
export function createPreviewCache(
  transport: PreviewTransport,
  options: PreviewCacheOptions = {},
): PreviewTransport {
  const ttlMs = options.ttlMs ?? 15_000;
  const cache = new Map<string, CacheEntry>();

  return {
    async fetchPreview({ sessionId, title, updatedAt }, signal) {
      const entry = cache.get(sessionId);

      // in-flight 去重
      if (entry?.inFlight) {
        try {
          return await entry.inFlight;
        } catch {
          // 继续重试
        }
      }

      // 缓存有效：updatedAt 一致且未过期
      if (
        entry &&
        entry.updatedAt === updatedAt &&
        Date.now() - entry.fetchedAt < ttlMs &&
        !entry.inFlight
      ) {
        return entry.preview;
      }

      const promise = transport
        .fetchPreview({ sessionId, title, updatedAt }, signal)
        .then((preview) => {
          cache.set(sessionId, {
            preview,
            fetchedAt: Date.now(),
            updatedAt,
          });
          return preview;
        })
        .catch((err: unknown) => {
          // 失败不缓存；下次悬停可重试
          const current = cache.get(sessionId);
          if (current?.inFlight === promise) {
            cache.delete(sessionId);
          }
          throw err;
        });

      cache.set(sessionId, {
        preview: entry?.preview ?? {
          sessionId,
          title,
          lastUserText: "",
          lastAssistantText: "",
          inFlight: false,
          hasHistory: false,
        },
        fetchedAt: entry?.fetchedAt ?? 0,
        updatedAt,
        inFlight: promise,
      });

      return promise;
    },
  };
}
