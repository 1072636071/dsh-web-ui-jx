/**
 * skin — 唐风皮肤开关（一键按回宿主原皮）。
 *
 * 皮肤整体作用在 body[data-dsh-jiangxiao] 上（全部分层样式唯一作用域锚点，
 * 见 jiangxiao.css body[data-dsh-jiangxiao] 选择器）。本模块提供：
 *   - getSkinEnabled()：读取当前是否启用（默认开）。
 *   - setSkinEnabled()：开/关并持久化到 localStorage('jx-skin')，即时生效。
 * 关闭 = 移除 body 属性，全部唐风覆盖失效 → 一键按回宿主原皮；开启可再按回。
 *
 * @module dsh-web-ui-jx/client
 */

/** localStorage 键名。 */
const SKIN_STORAGE_KEY = "jx-skin";

/** body 上启用唐风皮肤的作用域属性名。 */
export const SKIN_ATTR = "data-dsh-jiangxiao";

/**
 * 打开/关闭唐风皮肤。
 *
 * 写入 localStorage 持久化；即时增删 body[data-dsh-jiangxiao]。幂等。
 *
 * @param enabled - 开/关。
 */
export function setSkinEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // localStorage 不可用，静默忽略（仅本次会话生效）。
  }
  toggleSkinAttr(enabled);
}

/** 读取皮肤是否启用（默认开）。 */
export function getSkinEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SKIN_STORAGE_KEY);
    if (stored === "off") return false;
    if (stored === "on") return true;
  } catch {
    // 回退默认。
  }
  return true;
}

/**
 * 初始化皮肤作用域属性（apply 入口调用）：按持久化状态设置 body 属性。
 * 与 setSkinEnabled 幂等共存；返回当前生效状态，供 UI 初始化显示。
 */
export function initSkin(): boolean {
  const enabled = getSkinEnabled();
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