/**
 * 会话问话数据提取与路由（气泡内容弹框数据地基，ADR-0028 / PRD 14 工单 01）。
 *
 * 唯一新 seam：`collectUserMessages(events)` 纯函数——输入宿主会话事件数组
 * （`sessionController.inspect(sessionId)` 返回的 `events` 的 structural 投影），
 * 输出该会话全部直接用户问话 `UserPrompt[]`（每条 `{seq, text}`）。
 *
 * 提取规则（ADR-0028 D1）：
 *   - 仅 `type==='user/message'` 且 `data.source.kind==='user'` 入选——直接
 *     人类问话；plugin/notice/recall 合成、assistant/tool 等其他事件全部排除
 *     （`source.kind==='user'` 过滤照抄官方 controller 构造器语义）；
 *   - `data.content` 中 `type==='text'` 块的 `text` 拼接为问话文本；image 等
 *     非文本块忽略；拼接后为空的问话（如纯图片消息）不产出条目；
 *   - 输出按事件时序正序——最后一条 = 最新问话，是「弹框默认展开最后一个
 *     胶囊」恒成立的数据保证；
 *   - 每条携带源事件 `seq`（官方定位能力开放后接线滚动锚点，ADR-0028 附注）。
 *
 * 路由接线 `registerSessionMessagesRoute`：GET `/api/dsh-jx/session/<id>/messages`
 * → `ctx.sessionController.inspect(id)`（无副作用，兼容冷会话）→ 纯函数提取 →
 * JSON `{title, prompts}`。模式对齐 asset-routes.ts / import-api.ts。
 *
 * @module dsh-web-ui-jx/host/session-messages
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import { writeJson } from "./json-response.ts";

// ---------------------------------------------------------------------------
// 纯函数 seam：collectUserMessages
// ---------------------------------------------------------------------------

/**
 * 宿主会话事件的 structural 投影（本模块关心的最小形状）。
 *
 * 宿主 `SessionEvent` 是判别联合（core/session types.ts），但插件 devDeps 不含
 * 该类型包；此处只声明提取所需的 `type`/`seq`/`data` 三字段，运行时对多余字段
 * 与非预期形状全部防御性忽略（malformed 事件跳过而非抛错）。
 */
export interface HostSessionEventLike {
  readonly type: string;
  readonly seq: number;
  readonly data?: unknown;
}

/** 一条直接用户问话：源事件 seq + 拼接后的完整文本. */
export interface UserPrompt {
  readonly seq: number;
  readonly text: string;
}

/**
 * 返回条数上限（极长会话护栏，PRD 补充说明「返回条数上限由实施定」）：
 * 超出时保尾丢头——最后一条恒为最新问话，「默认展开最后一个胶囊」不受截断
 * 影响；截断线之外的更旧问话本就不进弹框（client 侧另有 +N 折叠）。
 */
export const MAX_USER_PROMPTS = 100;

/**
 * 单条问话文本长度上限（payload 护栏）：超长截断加省略号。问话是「人打的字」，
 * 上限取宽松值——正常问话永不触顶，只防粘贴超长文本撑爆路由响应与弹框。
 */
export const MAX_PROMPT_TEXT_CHARS = 8000;

/**
 * 从会话事件序列提取全部直接用户问话（时序正序）。
 *
 * @param events - `sessionController.inspect(sessionId)` 返回的事件数组。
 * @returns `{seq, text}` 列表；无问话/退化输入返回空列表。
 */
export function collectUserMessages(
  events: readonly HostSessionEventLike[],
): UserPrompt[] {
  const prompts: UserPrompt[] = [];
  for (const event of events) {
    if (event.type !== "user/message") continue;
    if (!isDirectUserMessage(event.data)) continue;
    const text = joinTextBlocks(event.data);
    if (text.length === 0) continue;
    prompts.push({
      seq: event.seq,
      text:
        text.length > MAX_PROMPT_TEXT_CHARS
          ? `${text.slice(0, MAX_PROMPT_TEXT_CHARS)}…`
          : text,
    });
  }
  return prompts.length > MAX_USER_PROMPTS
    ? prompts.slice(prompts.length - MAX_USER_PROMPTS)
    : prompts;
}

/** `data.source.kind === 'user'` 的安全判定（形状异常一律 false）. */
function isDirectUserMessage(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const source = (data as { source?: unknown }).source;
  if (typeof source !== "object" || source === null) return false;
  return (source as { kind?: unknown }).kind === "user";
}

/** content 中 type==='text' 块的 text 拼接；非文本块忽略、缺省安全返回 ''. */
function joinTextBlocks(data: unknown): string {
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === "text" && typeof b.text === "string") text += b.text;
  }
  return text;
}

// ---------------------------------------------------------------------------
// host 路由接线：GET /api/dsh-jx/session/<id>/messages
// ---------------------------------------------------------------------------

/**
 * 宿主 `sessionController` 服务中本插件用到的最小面（structural 投影）。
 *
 * 宿主实现（api/session-controller）的 `inspect(sessionId, signal?)` 非
 * @Remote、纯 host 进程内、无副作用：attached 会话直接读 `Session.events`，
 * 冷会话经 `inspectApiSession` 持久化读；不激活 Agent、不切换 current、
 * 不改持久化（ADR-0028 D1）。宿主类型包不在插件 devDeps，返回值只声明
 * 消费到的形状。
 */
export interface SessionControllerLike {
  inspect(
    sessionId: string,
  ): Promise<{ meta: unknown; events: readonly HostSessionEventLike[] }>;
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    sessionController: SessionControllerLike;
  }
}

/** 会话问话路由前缀（比素材路由 `/api/dsh-jx` 更长，longest-prefix-wins 优先匹配）。 */
export const SESSION_MESSAGES_PREFIX = "/api/dsh-jx/session";

/** 路由完整形状：`/api/dsh-jx/session/<id>/messages`（id 为单个路径段）。 */
const ROUTE_PATTERN = /^\/api\/dsh-jx\/session\/([^/]+)\/messages$/;

/** sessionId 长度上限（宿主 id 远小于此；超长视为滥用输入，不打入 inspect）。 */
const MAX_SESSION_ID_CHARS = 256;

/**
 * 折叠最新会话标题：扫描 `session/title` 事件取最后一条的 `data.title`
 * （log-backed title service 的 latest-wins 快照语义）。无 title 事件返回
 * null——client 侧回落气泡自身标题（sessions.list 派生，同源权威）。
 */
function foldLatestTitle(
  events: readonly HostSessionEventLike[],
): string | null {
  let title: string | null = null;
  for (const event of events) {
    if (event.type !== "session/title") continue;
    const data = event.data;
    if (typeof data !== "object" || data === null) continue;
    const candidate = (data as { title?: unknown }).title;
    if (typeof candidate === "string" && candidate.length > 0) {
      title = candidate;
    }
  }
  return title;
}

/**
 * 路由 handler：解析 pathname → 校验 id → `inspect`（无副作用读）→
 * `collectUserMessages` → JSON `{title, prompts}`。
 *
 * 错误策略：inspect 抛错（会话不存在/持久化不可读——无法从异常形状可靠
 * 区分）统一 404 JSON；id 非法（malformed %-escape / 空 / null 字节 / 超长）
 * 400 且不打入 inspect；非 GET 405；路径形状不命中 404。
 */
async function handleSessionMessagesRequest(
  req: IncomingMessage,
  res: ServerResponse,
  controller: SessionControllerLike,
): Promise<void> {
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET" });
    res.end();
    return;
  }
  let pathname: string;
  try {
    pathname = new URL(req.url ?? "/", "http://x").pathname;
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const match = ROUTE_PATTERN.exec(pathname);
  if (match === null) {
    res.writeHead(404);
    res.end();
    return;
  }
  let sessionId: string;
  try {
    sessionId = decodeURIComponent(match[1]!);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (
    sessionId.length === 0 ||
    sessionId.includes("\0") ||
    sessionId.length > MAX_SESSION_ID_CHARS
  ) {
    res.writeHead(400);
    res.end();
    return;
  }
  try {
    const { events } = await controller.inspect(sessionId);
    writeJson(res, 200, {
      title: foldLatestTitle(events),
      prompts: collectUserMessages(events),
    });
  } catch {
    writeJson(res, 404, { error: "session not found or unreadable" });
  }
}

/**
 * 在给定 context 上注册 `/api/dsh-jx/session/<id>/messages` 路由。
 * 模式对齐 `registerAssetRoutes`：`ctx.effect` 托管，fiber 卸载自动清理
 * （ADR-0017 可重入——热重载无残留）。
 *
 * @param ctx - 已注入 `webServer` 与 `sessionController` 的 cordis context。
 * @returns 同步 disposer；调用即卸载路由。
 */
export function registerSessionMessagesRoute(ctx: Context): () => void {
  const controller = ctx.sessionController;
  const dispose = ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: SESSION_MESSAGES_PREFIX,
        handler: (req, res) => {
          void handleSessionMessagesRequest(req, res, controller);
        },
      }),
    "dsh-jx: /api/dsh-jx/session/<id>/messages route",
  );
  return () => {
    void dispose();
  };
}
