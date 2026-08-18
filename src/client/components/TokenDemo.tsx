/**
 * TokenDemo — 设计令牌基座演示组件。
 *
 * 证明 L1/L2 令牌基座可用：只消费 --dsw-alias-* / --dsw-specific-* 语义别名，
 * 无颜色字面量、无主题选择器。随 body[data-ds-dark-theme] 自动切换深浅主题
 * （令牌双值已由 L2 jiangxiao.css remap 处理，组件无需主题选择器）。
 *
 * 渲染：楷体标题、宋体正文、品牌行（含 FishLogo）、状态色块、主题切换钮。
 *
 * @module dsh-web-ui-jx/client
 */

import { useState } from "react";
import { FishLogo } from "./FishLogo.tsx";
import styles from "../styles/token-demo.module.css";

/** TokenDemo props. */
export interface TokenDemoProps {
  /** extra class for layout placement. */
  className?: string | undefined;
}

/**
 * 切换宿主官方明暗信号 data-ds-dark-theme。
 *
 * 主题切换由 L2 remap 的 --jx-* 双值自动处理，组件本身不含主题选择器；
 * 此处仅操作官方信号属性（document.documentElement 上），令牌会自动跟随。
 */
function toggleHostTheme(): void {
  const html = document.documentElement;
  if (html.dataset.dsDarkTheme !== undefined) {
    delete html.dataset.dsDarkTheme;
  } else {
    html.dataset.dsDarkTheme = "";
  }
}

/**
 * Render the token demo.
 *
 * @param props.className - extra class for layout placement.
 * @returns 演示组件，含标题/正文/品牌行/状态色块/主题切换钮。
 */
export function TokenDemo({ className }: TokenDemoProps) {
  // lazy initial state：读取宿主当前主题信号
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.dsDarkTheme !== undefined,
  );

  const handleToggle = (): void => {
    toggleHostTheme();
    setDark(document.documentElement.dataset.dsDarkTheme !== undefined);
  };

  return (
    <div className={`${styles.demo}${className ? " " + className : ""}`}>
      <h1 className={styles.title}>姜晓 · 墨染唐风</h1>
      <p className={styles.body}>
        本组件只消费 --dsw-alias-* / --dsw-specific-* 语义别名，无颜色字面量、
        无主题选择器。随宿主官方明暗信号即时切换墨金卷轴（深）/ 宣纸梅花（浅）。
      </p>
      <div className={styles.brandRow}>
        <FishLogo size={24} className={styles.logo} />
        <span className={styles.brandText}>DeepSeek · 姜晓</span>
      </div>
      <div className={styles.states}>
        <span className={`${styles.state} ${styles.stateSuccess}`}>
          success
        </span>
        <span className={`${styles.state} ${styles.stateWarn}`}>warn</span>
        <span className={`${styles.state} ${styles.stateError}`}>error</span>
      </div>
      <button type="button" className={styles.toggle} onClick={handleToggle}>
        {dark ? "切换到浅色（宣纸梅花）" : "切换到深色（墨金卷轴）"}
      </button>
    </div>
  );
}
