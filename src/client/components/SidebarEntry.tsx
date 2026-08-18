/**
 * SidebarEntry — 侧边栏入口组件。
 *
 * 工单 10 产物：左侧边缘常驻入口，collapsed rail 模式下显示小 FishLogo 标记，
 * 点击展开为侧边栏面板（含 SettingsCard）。ADR-0004 起 SettingsCard 内嵌
 * 管理界面 section，不再需要 onOpenManagement 回调。
 *
 * 状态：
 *   - collapsed（默认）：左侧边缘窄条，显示小 FishLogo 常驻标记 + 展开按钮。
 *   - expanded：侧边栏面板，显示稍大 FishLogo + 「姜晓·墨染」品牌字 + SettingsCard。
 *
 * 交互：
 *   - 点击 collapsed 入口 → expanded。
 *   - 点击 expanded 关闭按钮 → collapsed。
 *   - 点击 expanded 外部遮罩 → collapsed。
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

import { useCallback, useEffect, useRef, useState } from "react";
import { FishLogo } from "./FishLogo.tsx";
import { SettingsCard } from "./SettingsCard.tsx";
import styles from "../styles/sidebar-settings.module.css";

/** SidebarEntry props. */
export interface SidebarEntryProps {
  /** extra class for layout placement. */
  className?: string | undefined;
}

/**
 * Render the sidebar entry.
 *
 * @param props.className - extra class for layout placement.
 * @returns 侧边栏入口（collapsed rail 常驻标记 / expanded 设置卡面板）.
 */
export function SidebarEntry({ className }: SidebarEntryProps) {
  // expanded：侧边栏是否展开（默认 collapsed rail 模式）
  const [expanded, setExpanded] = useState(false);

  // rail 拖动：railTop 为元素视觉中心点 y 坐标（px），null 表示默认垂直居中
  const [railTop, setRailTop] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const railRef = useRef<HTMLButtonElement | null>(null);
  const dragState = useRef<{
    startMouseY: number;
    startCenterY: number;
    halfH: number;
    moved: boolean;
  } | null>(null);

  /** 展开侧边栏. */
  const handleExpand = useCallback(() => {
    setExpanded(true);
  }, []);

  /** 折叠侧边栏. */
  const handleCollapse = useCallback(() => {
    setExpanded(false);
  }, []);

  /** 切换展开/折叠；若刚结束拖动则抑制本次 click. */
  const handleToggle = useCallback(() => {
    if (dragState.current?.moved) return;
    setExpanded((e) => !e);
  }, []);

  /** 鼠标按下：开始上下拖动追踪（x 锁定左边缘）. */
  const handleRailMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      dragState.current = {
        startMouseY: e.clientY,
        // transform-origin: left center，scale 不改变垂直中心，故视觉中心稳定
        startCenterY: rect.top + rect.height / 2,
        halfH: rail.offsetHeight / 2,
        moved: false,
      };
      setDragging(true);
    },
    [],
  );

  // 全局 mousemove/mouseup：拖动期间仅更新垂直位置，x 始终贴左边缘
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const dy = e.clientY - ds.startMouseY;
      if (!ds.moved && Math.abs(dy) > 4) ds.moved = true;
      if (!ds.moved) return;
      let next = ds.startCenterY + dy;
      const minY = ds.halfH;
      const maxY = window.innerHeight - ds.halfH;
      next = Math.max(minY, Math.min(maxY, next));
      setRailTop(next);
    };
    const handleUp = () => {
      setDragging(false);
      // 晚于 click 清空，以允许 handleToggle 读取 moved
      setTimeout(() => {
        dragState.current = null;
      }, 0);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  /** SettingsCard 渲染（ADR-0004 起管理界面内嵌 SettingsCard section，无需回调）. */
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
            <SettingsCard />
          </div>
        </aside>
      </>
    );
  }

  // collapsed rail 模式：左侧边缘常驻窄条入口（仅 FishLogo，可上下拖动）
  return (
    <button
      type="button"
      ref={railRef}
      className={`${styles.sidebarRail}${dragging ? " " + styles.dragging : ""}${className ? " " + className : ""}`}
      style={railTop != null ? { top: `${railTop}px` } : undefined}
      onClick={handleToggle}
      onMouseDown={handleRailMouseDown}
      aria-label="展开姜晓插件设置"
      aria-expanded={expanded}
    >
      <FishLogo size={20} className={styles.railLogo} />
    </button>
  );
}
