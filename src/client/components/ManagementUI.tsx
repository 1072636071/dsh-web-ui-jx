/**
 * ManagementUI — 管理界面主组件。
 *
 * 编排 ImportPanel（选 zip/选目录/导入进度）与 AssetList（已导入列表），
 * 管理导入流程状态：ImportPanel 导入完成后触发 AssetList 刷新（refreshTick++），
 * 实现「导入 → 进度可见 → 列表出现 → 素材可服务」全流程。
 *
 * 面板固定在右上角，可折叠（点击折叠钮切换），展开时显示 ImportPanel +
 * AssetList，折叠时只显示标题栏。工单 10 已接入侧边栏入口控制显隐：
 * 通过 visible prop 控制（默认 true 保持向后兼容，false 时不渲染）。
 *
 * 只消费 --dsw-alias-* / --dsw-specific-* 语义别名（经 management.module.css），
 * 无颜色字面量、无主题选择器。深浅双主题由 L2 remap 自动处理。
 *
 * @module dsh-web-ui-jx/client
 */

import { useCallback, useState } from "react";
import styles from "../styles/management.module.css";
import { ImportPanel } from "./ImportPanel.tsx";
import { AssetList } from "./AssetList.tsx";

/** ManagementUI props. */
export interface ManagementUIProps {
  /**
   * 是否可见（工单 10 侧边栏入口控制用）.
   * - true / undefined：显示（默认，保持向后兼容）
   * - false：不渲染（由侧边栏入口控制显隐）
   */
  visible?: boolean | undefined;
  /** extra class for layout placement. */
  className?: string | undefined;
}

/**
 * Render the management UI.
 *
 * @param props.visible - 是否可见（默认 true，保持向后兼容）.
 * @param props.className - extra class for layout placement.
 * @returns 管理界面面板，含 ImportPanel + AssetList，可折叠；visible=false 时返回 null.
 */
export function ManagementUI({ visible = true, className }: ManagementUIProps) {
  const [collapsed, setCollapsed] = useState(false);
  // refreshTick：刷新信号计数器，ImportPanel 导入完成后 ++ 触发 AssetList 重新拉取。
  // 命名 refreshTick 而非 refreshNonce：语义更清晰，表示"刷新节拍"而非裸数字。
  const [refreshTick, setRefreshTick] = useState(0);

  // visible=false 时不渲染（由侧边栏入口控制显隐）
  if (visible === false) return null;

  /** 导入完成回调：递增 refreshTick 触发 AssetList 刷新。 */
  const handleImportComplete = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

  /** 切换面板折叠/展开。 */
  const handleToggleCollapse = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  return (
    <div className={`${styles.panel}${className ? " " + className : ""}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>素材管理</h2>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={handleToggleCollapse}
          aria-label={collapsed ? "展开面板" : "折叠面板"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>
      {!collapsed && (
        <div className={styles.body}>
          <ImportPanel onImportComplete={handleImportComplete} />
          <AssetList refreshTick={refreshTick} />
        </div>
      )}
    </div>
  );
}
