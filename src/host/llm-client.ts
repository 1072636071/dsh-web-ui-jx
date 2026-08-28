/**
 * llm-client — OpenAI 兼容 LLM 客户端适配器（架构优化 17-06）。
 *
 * 从 ai-title-route.ts 抽出：URL 归一化 / 响应提取 / 超时中止 / 长度护栏集中
 * 于此，路由 handler 只做编排（body 解析、配置/凭据判定、响应）。提供可注入
 * 的 `LlmClient` 接缝（默认 `createOpenAiClient`；测试可注入假客户端验证路由
 * 降级路径，或注入 mock fetch 直测适配器）。
 *
 * 遵循 ADR-0030 D5：本地 OpenAI 兼容客户端（宿主直连用户 endpoint 的既有
 * 形态），不走宿主模型体系。
 *
 * @module dsh-web-ui-jx/host
 */

/** OpenAI 兼容 chat/completions 请求超时 ms（防止用户 endpoint 挂起拖死宿主请求）。 */
const DEFAULT_TIMEOUT_MS = 10_000;

/** 动态标题最大长度（LLM 输出护栏，对应库侧 parse 的默认护栏）。 */
const MAX_TITLE_LENGTH = 60;

/** LLM 客户端接口（接缝：路由依赖此抽象，默认实现见 createOpenAiClient）。 */
export interface LlmClient {
  /**
   * 一次 OpenAI 兼容 chat/completions 生成。
   *
   * @param prompt - 系统提示词（有界，由调用方组装）。
   * @param opts - endpoint 基址 / 模型 / API key。
   * @returns 提取的标题文本；失败（超时/网络/非 2xx/形状不符）返回 undefined。
   */
  chat(
    prompt: string,
    opts: { baseURL: string; model: string; apiKey: string },
  ): Promise<string | undefined>;
}

/** createOpenAiClient 选项. */
export interface OpenAiClientOptions {
  /** fetch 注入（测试/自托管用；默认全局 fetch）. */
  fetchImpl?: typeof fetch;
  /** 请求超时 ms（默认 10000）. */
  timeoutMs?: number;
}

/** 从 baseURL 解析出 OpenAI 兼容 chat/completions 端点；已带后缀则原样使用。 */
export function resolveChatCompletionsUrl(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

/** 从 OpenAI 兼容响应中提取 `choices[0].message.content`，去空白 + 长度护栏。 */
export function extractContent(data: unknown): string | undefined {
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

/**
 * 创建 OpenAI 兼容客户端（默认实现）。
 *
 * @param options - fetch 注入与超时配置（默认全局 fetch + 10s）。
 * @returns LlmClient 实现。
 */
export function createOpenAiClient(options: OpenAiClientOptions = {}): LlmClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async chat(prompt, opts) {
      // 调用时解析全局 fetch：尊重测试 stub（vi.stubGlobal）与宿主运行时注入。
      const fetchImpl = options.fetchImpl ?? globalThis.fetch;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const response = await fetchImpl(
          resolveChatCompletionsUrl(opts.baseURL),
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify({
              model: opts.model,
              messages: [{ role: "system", content: prompt }],
              max_tokens: 80,
              temperature: 0.7,
            }),
            signal: ac.signal,
          },
        );
        if (!response.ok) return undefined;
        const data = (await response.json()) as unknown;
        return extractContent(data);
      } catch {
        // 超时 / 网络抖动 / JSON 解析失败：按失败降级
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
