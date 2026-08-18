/**
 * StateSwitcher — 10 循环态切换钮。
 *
 * 渲染 10 个按钮，点击 dispatch switch 意图到 overlayStateMachine。
 * 仅按钮 pointer-events: auto；浮层其余部分 pointer-events: none
 * （在 overlay.module.css .overlay 上声明）。
 *
 * 按钮样式只消费语义别名（--dsw-alias-* / --dsw-specific-*）+ --jx-gold
 * （:focus-visible 描边，DESIGN.md §6 允许），无颜色字面量、无主题选择器。
 * 深浅双主题自动跟随（同一套令牌双值）。
 *
 * 当前态按钮高亮（.active）：通过 useSyncExternalStore 订阅状态机快照，
 * 当前态按钮加 .active 类。
 *
 * @module dsh-web-ui-jx/client
 */

import { useSyncExternalStore } from "react";
import {
  subscribeOverlayStateMachine,
  getOverlayStateMachineSnapshot,
  overlayStateMachine,
  OVERLAY_STATES,
  type OverlayState,
  type StateMachineSnapshot,
} from "../state-machine/overlay-state-machine.ts";
import styles from "../styles/state-switcher.module.css";

/** 10 循环态中文标签（按钮显示文案）. */
const STATE_LABELS: Record<OverlayState, string> = {
  idle: "待机",
  thinking: "思考",
  reading: "阅读",
  replying: "回复",
  working: "工作",
  error: "错误",
  welcome: "欢迎",
  done: "完成",
  permission: "权限",
  listening: "聆听",
};

/**
 * Render the 10-state switcher.
 *
 * @returns 10 个状态切换钮，点击 dispatch switch 意图；当前态按钮高亮.
 */
export function StateSwitcher() {
  const snapshot: StateMachineSnapshot = useSyncExternalStore(
    subscribeOverlayStateMachine,
    getOverlayStateMachineSnapshot,
  );

  return (
    <div className={styles.switcher} role="group" aria-label="角色状态切换">
      {OVERLAY_STATES.map((state) => {
        const isActive = state === snapshot.currentState;
        return (
          <button
            key={state}
            type="button"
            className={`${styles.button}${isActive ? " " + styles.active : ""}`}
            onClick={() =>
              overlayStateMachine.dispatch({ type: "switch", target: state })
            }
            aria-pressed={isActive}
            aria-label={`切换到${STATE_LABELS[state]}态`}
          >
            {STATE_LABELS[state]}
          </button>
        );
      })}
    </div>
  );
}
