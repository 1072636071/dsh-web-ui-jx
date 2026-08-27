/**
 * ai-title 路由 — host 半区按 OpenAI 兼容协议直连用户 endpoint（工单 16-03）。
 *
 * 契约（prefix `/api/dsh-jx/ai-title`）：
 *   - `POST /api/dsh-jx/ai-title`
 *     · body: `{ sessionId, title, lastUserText }`
 *     · 200 `{ title, refreshIntervalMs }`           —— 生成成功
 *     · 200 `{ enabled: false, refreshIntervalMs }`  —— 未配置（开关关 / 缺 endpoint / 缺 key）
 *     · 200 `{ error }` / 4xx / 5xx                  —— 生成失败（LLM 错误/超时），客户端静默降级
 *
 * 配置读取：
 *   - settings 命名空间 `dsh-jx` 的 `aiTitle` 分节（开关 / baseURL / model / apiKeyEnv /
 *     重刷频率）——经 `ctx.settings.register` 注册，宿主 Web UI 设置页免费获得；
 *   - API key 经 `ctx.credentials.resolve` 按引用解析（引用/值分离、每操作解析、
 *     换 key 零重启），浏览器端零 key 暴露。
 *
 * @module dsh-web-ui-jx/host
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { SettingsScope } from "@deepseek-ai/dsh-settings";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import type { CredentialProvider } from "@deepseek-ai/dsh-credentials";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { buildDynamicTitlePrompt } from "../../packages/dsh-session-bubble/src/detail/dynamic-title.ts";

/** ai-title 路由前缀（比素材路由 `/api/dsh-jx` 更长，longest-prefix-wins 优先匹配）。 */
export const AI_TITLE_ROUTE_PREFIX = "/api/dsh-jx/ai-title";

/** settings 命名空间：本插件宿主设置分节（`dsh-jx.aiTitle`）。 */
export const AI_TITLE_NS = settingsNamespace("dsh-jx");

/** 生成请求超时 ms（防止用户 endpoint 挂起拖死宿主请求）。 */
const LLM_TIMEOUT_MS = 10_000;

/** POST body 大小上限（4 KB，仅三个文本字段）。 */
const MAX_BODY_BYTES = 4 * 1024;

/** 动态标题最大长度（LLM 输出护栏，对应库侧 parse 的默认护栏）。 */
const MAX_TITLE_LENGTH = 60;

/** aiTitle 设置分节 schema（宿主 Web UI 设置页据此渲染表单）。 */
export const AiTitleSettingsSchema = z.object({
  aiTitle: z
    .object({
      enabled: z
        .boolean()
        .default(true)
        .description("启用 AI 动态标题（未配置 API 时详情窗自动隐藏该行）"),
      baseURL: z
        .string()
        .default("https://api.deepseek.com/v1")
        .description("OpenAI 兼容 endpoint 基址（自动追加 /chat/completions）"),
      model: z.string().default("deepseek-chat").description("模型名"),
      apiKeyEnv: z
        .string()
        .default("DEEPSEEK_API_KEY")
        .description("API key 的凭据引用（环境变量名，值存宿主凭据体系）"),
      refreshIntervalMin: z
        .natural()
        .default(5)
        .description("动态标题重刷频率（分钟）"),
    })
    .description("AI 动态标题"),
});

/** 解析出的 aiTitle 设置类型（schemastery 输出侧类型）. */
export type AiTitleSettings = Schemastery.TypeT<typeof AiTitleSettingsSchema>;

/** 读取请求 body 为 JSON 对象（带大小限制）；非法/空返回 null。 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;
    req.on("data", (c: Buffer) => {
      if (rejected) return;
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        rejected = true;
        req.destroy();
        resolveBody(null);
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        if (parsed !== null && typeof parsed === "object") {
          resolveBody(parsed as Record<string, unknown>);
        } else {
          resolveBody(null);
        }
      } catch {
        resolveBody(null);
      }
    });
    req.on("error", () => {
      if (!rejected) resolveBody(null);
    });
  });
}

/** 写 JSON 响应（统一 content-type/length）。 */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
  });
  res.end(data);
}

/** 从 baseURL 解析出 OpenAI 兼容 chat/completions 端点；已带后缀则原样使用。 */
function resolveChatCompletionsUrl(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

/** 从 OpenAI 兼容响应中提取 `choices[0].message.content`，去空白 + 长度护栏。 */
function extractContent(data: unknown): string | undefined {
  if (data === null || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== "string") return undefined;
  const trimmed = content.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 一次 OpenAI 兼容 chat/completions 调用；超时/异常返回 undefined。 */
async function callLlm(
  baseURL: string,
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string | undefined> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    const response = await fetch(resolveChatCompletionsUrl(baseURL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: prompt }],
        max_tokens: 80,
        temperature: 0.7,
      }),
      signal: ac.signal,
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as unknown;
    return extractContent(data);
  } catch {
    // 超时 / 网络抖动 / JSON 解析失败：按失败降级
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 处理一次 ai-title 请求。
 *
 * 失败路径全部显式写响应头（不抛错），webServer 的 per-request 容错不会触发
 * 400 兜底。未配置 → `enabled: false`（客户端隐藏整行）；LLM 失败 → `{ error }`
 * 静默降级。
 */
async function handleAiTitleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  scope: SettingsScope<AiTitleSettings>,
  credentials: CredentialProvider,
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }
  const body = await readJsonBody(req);
  if (body === null) {
    writeJson(res, 400, { error: "expected JSON body { sessionId, title, lastUserText }" });
    return;
  }
  const title = typeof body.title === "string" ? body.title : "";
  const lastUserText = typeof body.lastUserText === "string" ? body.lastUserText : "";

  const config = scope.get().aiTitle;
  const refreshIntervalMs = config.refreshIntervalMin * 60_000;

  // 未配置：开关关 / 缺 baseURL / 缺 model → 隐藏整行。
  if (!config.enabled || config.baseURL.trim().length === 0 || config.model.trim().length === 0) {
    writeJson(res, 200, { enabled: false, refreshIntervalMs });
    return;
  }

  // API key 按引用解析（每操作解析、换 key 零重启）。
  let apiKey: string | undefined;
  try {
    const resolved = await credentials.resolve(credentialRef(config.apiKeyEnv.trim()));
    apiKey = resolved?.value;
  } catch {
    apiKey = undefined;
  }
  if (apiKey === undefined || apiKey.length === 0) {
    writeJson(res, 200, { enabled: false, refreshIntervalMs });
    return;
  }

  // 组装有界提示词（库侧纯函数）并调用用户 endpoint。
  const prompt = buildDynamicTitlePrompt({ title, lastUserText });
  const generated = await callLlm(config.baseURL, config.model.trim(), apiKey, prompt);
  if (generated === undefined) {
    writeJson(res, 200, { error: "dynamic title generation failed" });
    return;
  }
  writeJson(res, 200, { title: generated, refreshIntervalMs });
}

/**
 * 在给定 context 上注册 `/api/dsh-jx/ai-title` 路由 + settings 分节。
 *
 * 注册 settings 命名空间 `dsh-jx.aiTitle`（宿主设置页可见）并注册路由，二者均随
 * 插件 fiber 自动清理。返回 disposer。
 *
 * @param ctx - 已注入 `webServer` / `settings` / `credentials` 服务的 cordis context。
 * @returns 同步 disposer。
 */
export function registerAiTitleRoute(ctx: Context): () => void {
  const scope = ctx.settings.register(AI_TITLE_NS, AiTitleSettingsSchema);
  const dispose = ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: AI_TITLE_ROUTE_PREFIX,
        handler: (req, res) => {
          void handleAiTitleRequest(req, res, scope, ctx.credentials);
        },
      }),
    "dsh-jx: /api/dsh-jx/ai-title route",
  );
  return () => {
    void dispose();
  };
}
