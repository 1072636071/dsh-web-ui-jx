/**
 * useNewSessionGreeting — 姜晓新建会话台词的 React 桥接 hook。
 *
 * 把纯逻辑 `createNewSessionGreeter`（state-machine/new-session-greeting.ts）
 * 桥接到既有的台词显示通道：触发时产出 `SpeechTrigger`，经 `CharacterOverlay`
 * 的 `speech` prop（nonce 变化即弹台词气泡）显示——不发明新通道。
 *
 * 生命周期随组件：sessions 缺失时返回 undefined（不弹）；挂载/卸载由 React
 * effect 经 greeter.dispose 释放订阅（ADR-0017 可重入约束）。
 *
 * @module dsh-web-ui-jx/client
 */

import { useEffect, useRef, useState } from "react";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SpeechTrigger } from "./components/CharacterOverlay.tsx";
import { createNewSessionGreeter } from "./state-machine/new-session-greeting.ts";

/** 默认时钟（模块级稳定引用，避免每次渲染重建导致 effect 重订阅）。 */
function defaultNow(): Date {
  return new Date();
}

/** useNewSessionGreeting 选项. */
export interface UseNewSessionGreetingOptions {
  /** 时钟注入（默认 new Date；测试可注入固定时间）。 */
  now?: () => Date;
}

/**
 * 订阅会话列表，检测切到空会话时返回应弹出的请安台词触发器。
 *
 * @param sessions - 会话数据源（未注入时返回 undefined）。
 * @param opts - 选项（now 注入测试）。
 * @returns 当前应显示的 `SpeechTrigger`（nonce 变化即驱动 CharacterOverlay
 *          重新弹气泡）；无触发时为 undefined。
 */
export function useNewSessionGreeting(
  sessions: ISessions | undefined,
  opts?: UseNewSessionGreetingOptions,
): SpeechTrigger | undefined {
  const [speech, setSpeech] = useState<SpeechTrigger | undefined>(undefined);
  const nonceRef = useRef(0);
  const now = opts?.now ?? defaultNow;

  useEffect(() => {
    if (sessions === undefined) return;
    const greeter = createNewSessionGreeter({
      sessions,
      now,
      onGreet: (text) => {
        nonceRef.current += 1;
        setSpeech({ text, nonce: nonceRef.current });
      },
    });
    return () => {
      greeter.dispose();
    };
  }, [sessions, now]);

  return speech;
}
