/**
 * SidebarEntry — 侧边栏入口组件。
 *
 * 工单 10 产物：左侧边缘常驻入口，collapsed rail 模式下显示小 FishLogo 标记，
 * 点击展开为侧边栏面板（含 SettingsCard + 进入管理界面入口）。
 *
 * 状态：
 *   - collapsed（默认）：左侧边缘窄条，显示小 FishLogo 常驻标记 + 展开按钮。
 *   - expanded：侧边栏面板，显示稍大 FishLogo + 「姜晓·墨染」品牌字 + SettingsCard。
 *
 * 交互：
 *   - 点击 collapsed 入口 → expanded。
 *   - 点击 expanded 关闭按钮 → collapsed。
 *   - 点击 expanded 外部遮罩 → collapsed。
 *   - SettingsCard 的「进入管理界面」按钮 → 触发 onOpenManagement 回调（由
 *     index.ts 透传，控制 ManagementUI 显隐）。
 *
 * FishLogo 语义：
 *   - collapsed：小尺寸常驻标记（rail 上的品牌锚点）。
 *   - expanded：稍大尺寸 + 配文字品牌饰件。
 *   color rides currentColor，随 --dsw-alias-brand-text 着色。
 *
 * 不拦截主内容区交互：collapsed 时 pointer-events 精确限定在入口元素上；
 * expanded 时遮罩层 pointer-events:auto，面板内 pointer-events:auto。
 * z-index 合理（低于浮层 overlay 2147483646，高于普通内容）。
 *
 * 只消费 --dsw-alias-* / --dsw-specific-* 语义别名 + --jx-* 专属轨令牌
 * （经 sidebar-settings.module.css），无颜色字面量、无主题选择器。
 * 深浅双主题由 L2 remap 自动处理。:focus-visible 用 --jx-gold 描边。
 *
 * @module dsh-web-ui-jx/client
 */

import { useCallback, useEffect, useState } from "react";
import { FishLogo } from "./FishLogo.tsx";
import { SettingsCard } from "./SettingsCard.tsx";
import styles from "../styles/sidebar-settings.module.css";

/** SidebarEntry props. */
export interface SidebarEntryProps {
  /**
   * 点击「进入管理界面」按钮的回调（由 index.ts 透传，控制 ManagementUI 显隐）.
   * 若不传，SettingsCard 不显示「进入管理界面」按钮。
   */
  onOpenManagement?: (() => void) | undefined;
  /** extra class for layout placement. */
  className?: string | undefined;
}

/**
 * Render the sidebar entry.
 *
 * @param props.onOpenManagement - 进入管理界面回调.
 * @param props.className - extra class for layout placement.
 * @returns 侧边栏入口（collapsed rail 常驻标记 / expanded 设置卡面板）.
 */
export function SidebarEntry({
  onOpenManagement,
  className,
}: SidebarEntryProps) {
  // expanded：侧边栏是否展开（默认 collapsed rail 模式）
  const [expanded, setExpanded] = useState(false);

  /** 展开侧边栏. */
  const handleExpand = useCallback(() => {
    setExpanded(true);
  }, []);

  /** 折叠侧边栏. */
  const handleCollapse = useCallback(() => {
    setExpanded(false);
  }, []);

  /** 切换展开/折叠（供 collapsed 入口按钮使用）. */
  const handleToggle = useCallback(() => {
    setExpanded((e) => !e);
  }, []);

  /** SettingsCard「进入管理界面」回调：先折叠侧边栏，再触发外部回调. */
  const handleOpenManagement = useCallback(() => {
    setExpanded(false);
    onOpenManagement?.();
  }, [onOpenManagement]);

  // ESC 键关闭展开的侧边栏（可访问性）
  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  if (expanded) {
    return (
      <>
        {/* 外部遮罩：点击折叠侧边栏；不拦截主内容区交互的视觉遮挡（半透明） */}
        <div
          className={styles.overlay}
          onClick={handleCollapse}
          aria-hidden="true"
        />
        <aside
          className={`${styles.sidebarExpanded}${className ? " " + className : ""}`}
          role="dialog"
          aria-modal="false"
          aria-label="姜晓插件设置"
        >
          <header className={styles.sidebarHeader}>
            <div className={styles.brandBox}>
              <FishLogo size={28} className={styles.brandLogo} />
              <span className={styles.brandText}>姜晓·墨染</span>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={handleCollapse}
              aria-label="折叠侧边栏"
            >
              ✕
            </button>
          </header>
          <div className={styles.sidebarBody}>
            <SettingsCard
              onOpenManagement={
                onOpenManagement ? handleOpenManagement : undefined
              }
            />
          </div>
        </aside>
      </>
    );
  }

  // collapsed rail 模式：左侧边缘常驻窄条入口
  return (
    <button
      type="button"
      className={`${styles.sidebarRail}${className ? " " + className : ""}`}
      onClick={handleToggle}
      aria-label="展开姜晓插件设置"
      aria-expanded={expanded}
    >
      <FishLogo size={20} className={styles.railLogo} />
      <span className={styles.railLabel}>姜晓</span>
    </button>
  );
}
