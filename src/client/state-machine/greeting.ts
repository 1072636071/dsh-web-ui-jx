/**
 * greeting — 个性化问候时段判定（纯逻辑，ADR-0035）。
 *
 * 深化动机：时段四档判定此前无独立模块，本文件把它收敛为可复用纯函数，
 * 供本工单（hero 标题 MVP）与工单 04（姜晓新建会话台词）共用，测试可穿过
 * 接口命中边界。
 *
 * 时段四档（ADR-0035 D3）：
 *   上午 05:00–11:59 / 下午 12:00–17:59 / 晚上 18:00–22:59 / 该休息 23:00–04:59
 *   wrap-around 判定：hour >= 23 || hour < 5。时区取浏览器本地时间
 *   （new Date().getHours()），挂载时算一次，不挂 timer（ADR-0035 D5）。
 *
 * 文案结构（ADR-0034 D4）：带名 / 不带名是两套完整文案，绝不跨 key 拼接句子。
 * 本工单只接不带名路径（name 省略/为空走不带名）；带名 4 句备用，供工单 02 接入。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。无随机注入需求（时段判定是确定性的）。
 *
 * @module dsh-web-ui-jx/client
 */

/** 问候时段档位. */
export type GreetingBucket = "morning" | "afternoon" | "evening" | "rest";

/**
 * 按时段分档（ADR-0035）。
 *
 * 取浏览器本地小时数（date.getHours()），wrap-around 边界在 23/05：
 *   hour >= 23 || hour < 5  → rest（该休息）
 *   5–11                     → morning（上午）
 *   12–17                    → afternoon（下午）
 *   18–22                    → evening（晚上）
 *
 * @param date - 判定用时间（本工单传 new Date()，浏览器本地时区）。
 * @returns 时段档位。
 */
export function getGreetingBucket(date: Date): GreetingBucket {
  const hour = date.getHours();
  if (hour >= 23 || hour < 5) return "rest";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/**
 * 不带名问候文案（四档，ADR-0035 D15 保留「么」）。本工单接入路径。
 * 句式结构：问候 + 逗号 + 诉求；该休息档无逗号、语气转为劝休。
 */
export const GREETING_WITHOUT_NAME: Readonly<Record<GreetingBucket, string>> = {
  morning: "上午好，有什么需要我搞定的么？",
  afternoon: "下午好，有什么需要我搞定的么？",
  evening: "晚上好，有什么需要我搞定的么？",
  rest: "该休息了，让我来做吧，好好休息哦。",
};

/**
 * 带名问候文案（四档，{name} 占位；工单 02 接入，本工单不渲染）。
 * 与不包名是两套完整文案，绝不跨 key 拼接（ADR-0034 D4）。
 */
export const GREETING_WITH_NAME: Readonly<Record<GreetingBucket, string>> = {
  morning: "上午好，{name}，有什么需要我搞定的么？",
  afternoon: "下午好，{name}，有什么需要我搞定的么？",
  evening: "晚上好，{name}，有什么需要我搞定的么？",
  rest: "该休息了，{name}，让我来做吧，好好休息哦。",
};

/**
 * 选择问候文案（ADR-0034 D4 退化）。
 *
 * name 为空 / 未填（trim 后为空串）走不带名路径；name 非空则替换带名
 * 文案中的 {name} 占位。本工单 MVP 只渲染不带名（调用方不传 name），
 * 函数同时支持两套以便工单 02 零改动接入。
 *
 * @param date - 判定用时间（浏览器本地时区）。
 * @param name - 可选用户名（trim 后非空才走带名路径）。
 * @returns 渲染用问候文本。
 */
export function selectGreetingText(date: Date, name?: string | undefined): string {
  const bucket = getGreetingBucket(date);
  const trimmed = name?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    return GREETING_WITH_NAME[bucket].replace("{name}", trimmed);
  }
  return GREETING_WITHOUT_NAME[bucket];
}
