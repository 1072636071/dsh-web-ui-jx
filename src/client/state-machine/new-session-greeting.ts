/**
 * new-session-greeting — 姜晓新建会话台词（blank 检测 + 4 句时段请安台词）。
 *
 * 深化动机（工单 04）：用户切到一个空会话时，姜晓说一句与时段匹配的问候
 * （「大人，晨安。今日有何差遣？(￣▽￣)」等 4 句）；同一会话不重复说。
 * 触发判定（memorial 017 D13 / ADR-0035 同源）：订阅 `sessions.list` 快照，当
 * `current` **变化**且 `byId[current].blank === true`（空日志会话）时触发一次；
 * 同一 id 不重复（记 lastGreetedId）；插件挂载时若当前已是 blank 会话，补触发一次。
 *
 * 时段判定复用工单 01 产物 `greeting.ts` 的 `getGreetingBucket`（ADR-0035），
 * 不写第二份时段判定；台词文案逐字照抄 memorial 017 D16 定稿（台词归用户，
 * 不审查）。姜晓台词一律称「大人」，不带用户名（ADR-0034 D14）。
 *
 * 显示通道（不发明新通道）：触发后经既有台词显示通道
 * `CharacterOverlay` 的 `speech` prop（nonce 变化即弹台词气泡）弹出，由
 * `useNewSessionGreeting`（本模块同目录 hook）桥接。
 *
 * 「是否弹请安台词」收敛为单一内部判定点 `isNewSessionGreetingEnabled`
 * （本工单恒为开）；工单 03「个性化问候」开关在此一处接入即可整体关掉。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。`createNewSessionGreeter` 仅订阅
 * `sessions.list`、记录闭包态（prevCurrent / lastGreetedId），可注入时钟 `now`
 * 便于测试命中时段与挂载补触发。
 *
 * @module dsh-web-ui-jx/client
 */

import type { ISessions, SessionId } from "@deepseek-ai/dsh-client-runtime/client";
import { getGreetingBucket, type GreetingBucket } from "./greeting.ts";

export type { GreetingBucket } from "./greeting.ts";

/**
 * 新建会话台词（4 句，与 hero 时段同步；memorial 017 D14/D16 定稿，逐字照抄）。
 * 键与 `GreetingBucket` 对齐，由 `selectNewSessionLine` 按时段映射。
 */
export const NEW_SESSION_LINES: Readonly<Record<GreetingBucket, string>> = {
  morning: "大人，晨安。今日有何差遣？(￣▽￣)",
  afternoon: "大人，午后安好。有何吩咐？(・∀・)",
  evening: "大人，夜安。可要姜晓侍候？(￣ー￣)",
  rest: "夜深了，大人还不歇息？(¬_¬)",
};

/**
 * 选择新建会话台词（按时段映射，复用工单 01 的 `getGreetingBucket`，ADR-0035）。
 *
 * @param date - 判定用时间（浏览器本地时区；测试可注入固定 Date）。
 * @returns 应弹出的请安台词文本。
 */
export function selectNewSessionLine(date: Date): string {
  return NEW_SESSION_LINES[getGreetingBucket(date)];
}

/**
 * 纯逻辑触发判定（memorial 017 D13）。
 *
 * - `current` **变化**且新会话 `blank === true` → 触发一次；
 * - 同一 id 不重复（由调用方维护 `lastGreetedId` 记忆，已问候过的 id 不再触发）；
 * - 非 blank 不触发；
 * - 挂载时若当前已是 blank 会话（此时 `prevCurrent === undefined`），本判定返回
 *   true，由 `createNewSessionGreeter` 在挂载时补触发一次。
 *
 * @param prevCurrent - 上一次列表快照的 `current`（首次为 undefined）。
 * @param lastGreetedId - 已问候过的会话 id（调用方记忆；undefined 表示无）。
 * @param current - 本次列表快照的 `current`。
 * @param blank - `byId[current].blank`（当前会话是否为空日志）。
 * @returns 是否应触发请安台词。
 */
export function shouldGreetNewSession(
  prevCurrent: SessionId | undefined,
  lastGreetedId: SessionId | undefined,
  current: SessionId | undefined,
  blank: boolean,
): boolean {
  if (current === undefined) return false; // 无当前会话
  if (!blank) return false; // 非空日志会话不触发
  if (current === prevCurrent) return false; // 同一 id / 未变化
  if (current === lastGreetedId) return false; // 已问候过（同 id 不重复）
  return true;
}

/**
 * 内部单一判定点：是否弹请安台词（工单 03「个性化问候」开关接入点）。
 *
 * 本工单恒为开；工单 03 在此读取设置开关（关闭后 `createNewSessionGreeter`
 * 直接空转，新建会话台词随 hero 问候一并静默，ADR-0036 附带决策），无需改动
 * 任何其他调用点。
 */
export function isNewSessionGreetingEnabled(): boolean {
  return true;
}

/** new-session-greeter 选项. */
export interface NewSessionGreeterOptions {
  /** 会话数据源（ctx.sessions）。 */
  sessions: ISessions;
  /** 时钟注入（默认 new Date；测试可注入固定时间以命中时段）。 */
  now?: () => Date;
  /** 触发回调：被判定应问候时以台词文本调用。 */
  onGreet: (line: string) => void;
}

/** new-session-greeter 实例. */
export interface NewSessionGreeter {
  /** 释放列表订阅（fiber 卸载 / hook cleanup 调用）。 */
  dispose(): void;
}

/**
 * 创建新建会话台词 greeter：订阅 `sessions.list`，检测 blank 当前会话变化，
 * 触发时经 `onGreet` 弹台词。
 *
 * 内部单一判定点 `isNewSessionGreetingEnabled`（当前恒为开，工单 03 开关接入处）：
 * 关闭时本函数直接返回空转实例，不订阅、不触发。
 *
 * 挂载时立即评估一次：若当前已是 blank 会话，补触发一次（D13）。
 * 同一 id 不重复（lastGreetedId 记忆；跨 id 变化且仅当 blank 时触发）。
 *
 * @param opts - 选项（sessions / now 注入 / onGreet 回调）。
 * @returns greeter 实例（dispose 释放订阅）。
 */
export function createNewSessionGreeter(
  opts: NewSessionGreeterOptions,
): NewSessionGreeter {
  // 内部单一判定点（工单 03 开关接入点，当前恒为开）。
  if (!isNewSessionGreetingEnabled()) {
    return { dispose() {} };
  }

  const now = opts.now ?? (() => new Date());
  const list = opts.sessions.list;

  let prevCurrent: SessionId | undefined = undefined;
  let lastGreetedId: SessionId | undefined = undefined;

  const evaluate = (): void => {
    const snapshot = list.getSnapshot();
    const current = snapshot.current;
    const blank =
      current !== undefined && snapshot.byId[current]?.blank === true;
    if (
      shouldGreetNewSession(prevCurrent, lastGreetedId, current, blank)
    ) {
      lastGreetedId = current;
      opts.onGreet(selectNewSessionLine(now()));
    }
    prevCurrent = current;
  };

  // 挂载时补触发（D13）：当前已是 blank 会话则弹一次。
  evaluate();
  const unsub = list.subscribe(() => evaluate());

  return {
    dispose() {
      unsub();
    },
  };
}
