/**
 * variant-rotation — 待机长驻状态的多动作变体配置与调度（ADR-0013）。
 *
 * ADR-0016 收敛后仅 idle 挂变体轮换（主素材 + idle-v2/v3/v4）：working 的
 * 显示层轮换（thinking/reading 整圈交替）是独立姿态循环、须经 idle 中转过渡
 * 衔接，与中性帧拼接机制不同构，改由 runtime 表演序列机制承担——本模块
 * 移除 working 池（PRD 实现决策 6）。
 *
 * 变体素材形状为「中性姿态 → 动作 → 中性姿态」，只播一遍（素材 loops=1），
 * 运行期随机不重复抽取串成无限轮换；段间在中性帧停顿，像素级残差（发丝
 * 相位/色调）借停顿读作自然微动。
 *
 * 命名：主素材为 v1（idle.webp），变体为 idle-v2/v3/v4.webp。
 * 主素材作为「基础」候选入池参与随机（经典动作仍有出场机会）。
 *
 * 纯逻辑模块：不操作 DOM、不依赖 React。runtime（overlay-session-runtime）
 * 负责轮换计时与快照替换。
 *
 * @module dsh-web-ui-jx/client
 */

import {
  CHARACTER_ASSET_PREFIX,
  loopAssetUrl,
} from "./overlay-state-machine.ts";

/** 支持变体轮换的状态（ADR-0016 收敛后仅 idle）. */
export type RotatableState = "idle";

/** 支持变体轮换的状态列表. */
export const ROTATABLE_STATES: readonly RotatableState[] = ["idle"];

/** 判断某状态是否支持变体轮换. */
export function isRotatableState(state: string): state is RotatableState {
  return state === "idle";
}

/**
 * 各状态轮换池：首个元素为基础主素材（v1），其余为变体（ADR-0013）。
 * 变体素材缺失时运行期 `<img>` 404 为空白帧——素材与代码同包发布
 * （ADR-0003 全部进 git），不存在缺文件部署。
 */
const ROTATION_POOLS: Record<RotatableState, readonly string[]> = {
  idle: [
    loopAssetUrl("idle"),
    `${CHARACTER_ASSET_PREFIX}/idle-v2.webp`,
    `${CHARACTER_ASSET_PREFIX}/idle-v3.webp`,
    `${CHARACTER_ASSET_PREFIX}/idle-v4.webp`,
  ],
};

/** 取某状态的轮换池（基础主素材 + 变体）. */
export function rotationPool(state: RotatableState): readonly string[] {
  return ROTATION_POOLS[state];
}

/**
 * 随机抽取下一段，不连续重复（ADR-0013 D5）。
 *
 * @param pool - 候选素材 URL 池。
 * @param lastUrl - 上一段 URL（undefined 表示首次抽取，无排除）。
 * @param random - 随机源（[0,1)，可注入测试）。
 * @returns 抽中的 URL；池为空返回 undefined。
 */
export function pickNextVariant(
  pool: readonly string[],
  lastUrl: string | undefined,
  random: () => number,
): string | undefined {
  if (pool.length === 0) return undefined;
  if (pool.length === 1) return pool[0];
  let next = pool[Math.floor(random() * pool.length)]!;
  while (next === lastUrl) {
    next = pool[Math.floor(random() * pool.length)]!;
  }
  return next;
}

/**
 * 基础主素材（v1）单圈时长 ms。
 *
 * memorial 008 补充：经典态已由 `tools/anim_loop_repair.py --pingpong-classic`
 * 全部烘焙成正反倒放，单圈 = 2n-2 帧 × 67ms——idle 148 帧 9916ms。轮换周期
 * 必须等于烘焙后的单圈时长：偏早会把回程段拦腰切到下一段首帧（可见跳变），
 * 偏晚则循环已回卷、切段落在动作中段（同样可见）。
 */
export const BASE_SEGMENT_MS: Record<RotatableState, number> = {
  idle: 9916,
};

/** 变体段名义时长 ms（76 帧 × 67ms，覆盖 5.06s 源视频转帧上界）。 */
export const VARIANT_SEGMENT_MS = 5092;

/** 段间中性帧停顿 ms（像素残差借停顿读作自然微动，ADR-0013 D9）。 */
export const ROTATION_HOLD_MS = 400;

/** 判断 URL 是否为基础主素材（idle 的 v1）。 */
export function isBaseLoopUrl(url: string): boolean {
  return url === loopAssetUrl("idle");
}

/**
 * 单段轮换周期 ms。
 *
 * - 变体段 = 名义播放时长 + 段间停顿：变体素材 loops=1 播完停在末帧
 *   （中性姿），计时略晚只会延长中性停顿（不可见）；略早时末几帧已回到
 *   中性姿，切下一段首帧（中性）仍无缝。
 * - 基础主素材（v1）= 整圈时长、**无停顿**：经典态 loops=0 不停帧，整圈之外
 *   的任何停留都会让切换点滑入下一圈动作中段（可见跳变）。正反倒放烘焙后
 *   （ADR-0015）首尾同为中性帧，整圈回卷点正是唯一无缝切点。
 *
 * @param url - 段素材 URL。
 * @returns 轮换周期 ms。
 */
export function rotationPeriodMs(url: string): number {
  if (url === loopAssetUrl("idle")) return BASE_SEGMENT_MS.idle;
  return VARIANT_SEGMENT_MS + ROTATION_HOLD_MS;
}
