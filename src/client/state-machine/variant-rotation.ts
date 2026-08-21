/**
 * variant-rotation — 长驻状态的多动作变体配置与调度（ADR-0013）。
 *
 * 待机（idle）与工作（working）两个长驻状态各挂多段变体动作，打破单一
 * 循环的单调感。变体素材形状为「中性姿态 → 动作 → 中性姿态」，只播一遍
 * （素材 loops=1），运行期随机不重复抽取串成无限轮换；段间在中性帧停顿，
 * 像素级残差（发丝相位/色调）借停顿读作自然微动。
 *
 * 命名：主素材为 v1（{state}.webp），变体为 {state}-v2/v3/v4.webp。
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

/** 支持变体轮换的状态（长驻状态，ADR-0013 D3）. */
export type RotatableState = "idle" | "working";

/** 支持变体轮换的状态列表. */
export const ROTATABLE_STATES: readonly RotatableState[] = [
  "idle",
  "working",
];

/** 判断某状态是否支持变体轮换. */
export function isRotatableState(state: string): state is RotatableState {
  return state === "idle" || state === "working";
}

/**
 * 各状态轮换池：首个元素为基础主素材（v1），其余为变体（ADR-0013）。
 * 变体素材缺失时（如旧素材包）运行期 `<img>` 404 为空白帧——素材与代码
 * 同包发布（ADR-0003 全部进 git），不存在缺文件部署。
 */
const ROTATION_POOLS: Record<RotatableState, readonly string[]> = {
  idle: [
    loopAssetUrl("idle"),
    `${CHARACTER_ASSET_PREFIX}/idle-v2.webp`,
    `${CHARACTER_ASSET_PREFIX}/idle-v3.webp`,
    `${CHARACTER_ASSET_PREFIX}/idle-v4.webp`,
  ],
  working: [
    loopAssetUrl("working"),
    `${CHARACTER_ASSET_PREFIX}/working-v2.webp`,
    `${CHARACTER_ASSET_PREFIX}/working-v3.webp`,
    `${CHARACTER_ASSET_PREFIX}/working-v4.webp`,
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

/** 基础主素材单圈时长 ms（75 帧 × 67ms）。 */
export const BASE_SEGMENT_MS = 5025;

/** 变体段名义时长 ms（76 帧 × 67ms，覆盖 5.06s 源视频转帧上界）。 */
export const VARIANT_SEGMENT_MS = 5092;

/** 段间中性帧停顿 ms（像素残差借停顿读作自然微动，ADR-0013 D9）。 */
export const ROTATION_HOLD_MS = 400;

/** 判断 URL 是否为基础主素材（idle/working 的 v1）。 */
export function isBaseLoopUrl(url: string): boolean {
  return url === loopAssetUrl("idle") || url === loopAssetUrl("working");
}

/**
 * 单段轮换周期 ms = 名义播放时长 + 段间停顿。
 *
 * 变体素材 loops=1 播完停在末帧（中性姿），计时略晚只会延长中性停顿
 * （不可见）；略早时末几帧已回到中性姿，切下一段首帧（中性）仍无缝。
 *
 * @param url - 段素材 URL。
 * @returns 轮换周期 ms。
 */
export function rotationPeriodMs(url: string): number {
  const segment = isBaseLoopUrl(url) ? BASE_SEGMENT_MS : VARIANT_SEGMENT_MS;
  return segment + ROTATION_HOLD_MS;
}
