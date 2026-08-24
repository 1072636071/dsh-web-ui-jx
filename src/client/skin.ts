/**
 * skin — 唐风皮肤开关（一键按回宿主原皮）。
 *
 * 皮肤整体作用在 body[data-dsh-jiangxiao] 上（全部分层样式唯一作用域锚点，
 * 见 jiangxiao.css body[data-dsh-jiangxiao] 选择器）。本模块提供：
 *   - getSkinEnabled()：读取当前是否启用（默认开）。
 *   - setSkinEnabled()：开/关并持久化到 localStorage('jx-skin')，即时生效。
 * 关闭 = 移除 body 属性，全部唐风覆盖失效 → 一键按回宿主原皮；开启可再按回。
 *
 * 架构审查候选者 3 起：持久化由 `persistent-setting.ts` 工厂承载（"on"/"off"
 * 字符串经 parse/serialize 保持既有存储格式），并顺带获得跨标签页同步。
 *
 * @module dsh-web-ui-jx/client
 */

import { createPersistentSetting } from "./state-machine/persistent-setting.ts";

/** body 上启用唐风皮肤的作用域属性名。 */
export const SKIN_ATTR = "data-dsh-jiangxiao";

/** 皮肤开关设置实例（"on"/"off" 持久化格式，默认开）. */
const skinEnabled = createPersistentSetting<boolean>("jx-skin", {
  serialize: (enabled) => (enabled ? "on" : "off"),
  parse: (raw) => {
    if (raw === "on") return true;
    if (raw === "off") return false;
    return undefined;
  },
  default: true,
});

// 跨标签页同步：其他标签页切换皮肤时本标签页即时增删 body 属性。
skinEnabled.subscribe(toggleSkinAttr);

/**
 * 打开/关闭唐风皮肤。
 *
 * 写入 localStorage 持久化；即时增删 body[data-dsh-jiangxiao]。幂等。
 *
 * @param enabled - 开/关。
 */
export function setSkinEnabled(enabled: boolean): void {
  skinEnabled.set(enabled);
  toggleSkinAttr(enabled);
}

/** 读取皮肤是否启用（默认开）。 */
export function getSkinEnabled(): boolean {
  return skinEnabled.get();
}

/**
 * 初始化皮肤作用域属性（apply 入口调用）：按持久化状态设置 body 属性。
 * 与 setSkinEnabled 幂等共存；返回当前生效状态，供 UI 初始化显示。
 */
export function initSkin(): boolean {
  const enabled = skinEnabled.reload();
  toggleSkinAttr(enabled);
  return enabled;
}

/** 增删 body[data-dsh-jiangxiao]。 */
function toggleSkinAttr(enabled: boolean): void {
  if (enabled) {
    document.body.dataset.dshJiangxiao = "";
  } else {
    delete document.body.dataset.dshJiangxiao;
  }
}
