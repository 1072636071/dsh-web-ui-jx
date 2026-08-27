/**
 * detail-data — 会话气泡详情窗数据层（工单 16-01）。
 *
 * 纯逻辑模块：
 *   - 预览提取：从 `session.history` 尾页事件序列中抽取最后一条用户消息与
 *     最后一条模型消息；空日志 / 纯工具尾 / in-flight partial 回退正确。
 *   - 缓存策略：TTL 15s + 会话 updatedAt 变化失效 + in-flight 去重。
 *   - transport 接口 + DSH 默认实现（经 connection.api.sessions.history 调用）。
 *
 * 本模块零依赖 DOM/React；所有 SDK 类型以 TypeScript 类型导入，运行时仅依赖
 * 标准 ECMAScript。
 *
 * @module dsh-session-bubble/detail
 */

import type { ContentBlock, HistoryEntry, IApiClient } from "@deepseek-ai/dsh-client-connection/client";
import type { SessionEvent, SessionId } from "@deepseek-ai/dsh-session/types";
import {
  deriveEventMessage,
  isSurfaceEvent,
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
 * 使用 deriveEventMessage（与 Session.deriveMessages 同规则）保证角色与内容
 * 解读和宿主一致。
 */
function textFromEvent(event: SessionEvent): string {
  const message = deriveEventMessage(event);
  if (!message) return "";
  return extractVisibleText(message.content);
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
 *   - 若遍历结束后 lastAssistantText 为空，且序列中出现过 assistant/chunk，
 *     则视为 in-flight，UI 可展示占位文案。
 *   - 空日志 / 非 surface 尾页 ⇒ 返回空文本、非 inFlight。
 *
 * @param title - 会话标题（由会话列表给出）。
 * @param entries - session.history 尾页返回的 HistoryEntry[]。
 * @returns 不含 sessionId 的预览内容（SessionBubbleDetail 再拼 sessionId）。
 */
export function extractPreview({
  title,
  entries,
}: {
  title: string;
  entries: readonly HistoryEntry[];
}): Omit<SessionPreview, "sessionId"> {
  let lastUserText = "";
  let lastAssistantText = "";
  let hasChunk = false;

  for (const entry of entries) {
    const event = entry.event;
    if (isAssistantChunkEvent(event)) {
      hasChunk = true;
      continue;
    }
    if (!isSurfaceEvent(event)) continue;

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

/** 创建 DSH 默认 preview transport：调用 connection.api.sessions.history 尾页。 */
export function createDshPreviewTransport(
  api: Pick<IApiClient, "sessions">,
  options: DshPreviewTransportOptions = {},
): PreviewTransport {
  const maxMessages = options.maxMessages ?? 6;

  return {
    async fetchPreview({ sessionId, title, updatedAt: _updatedAt }, signal) {
      try {
        const response = await api.sessions.history({ sessionId: sessionId as SessionId, maxMessages }, signal);
        // RpcResponse.result 即 RpcResult 槽位——内联解包避免运行时依赖
        // @deepseek-ai/dsh-client-connection/client（该包引用 window，node 测试环境不可导入）。
        const result = response.result;
        if (!result.ok) {
          // 业务错误静默降级，避免详情窗出现刺眼报错
          return {
            sessionId,
            title,
            lastUserText: "",
            lastAssistantText: "",
            inFlight: false,
            hasHistory: false,
          };
        }
        const extracted = extractPreview({
          title,
          entries: result.value.events,
        });
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
