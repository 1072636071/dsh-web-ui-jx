/**
 * ManagementUI — 管理界面 section 内容（ADR-0004 起无浮层壳）。
 *
 * 编排 ImportPanel（选 zip/选目录/导入进度）与 AssetList（已导入列表），
 * 管理导入流程状态：ImportPanel 导入完成后触发 AssetList 刷新（refreshTick++），
 * 实现「导入 → 进度可见 → 列表出现 → 素材可服务」全流程。
 *
 * ADR-0004 前：右上角 position:fixed 浮层，自带 .panel/.header/.collapseBtn 壳
 * 与 visible/collapsed 状态。ADR-0004 起内嵌 SettingsCard 第三个 section，
 * 由 SettingsCard 的 .managementBody 提供容器与滚动，本组件只渲染
 * ImportPanel + AssetList 内容。
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
  /** extra class for layout placement. */
  className?: string | undefined;
}

/**
 * Render the management UI section content.
 *
 * @param props.className - extra class for layout placement.
 * @returns ImportPanel + AssetList 内容（由外层 section body 容器包裹）.
 */
export function ManagementUI({ className }: ManagementUIProps) {
  // refreshTick：刷新信号计数器，ImportPanel 导入完成后 ++ 触发 AssetList 重新拉取。
  // 命名 refreshTick 而非 refreshNonce：语义更清晰，表示"刷新节拍"而非裸数字。
  const [refreshTick, setRefreshTick] = useState(0);

  /** 导入完成回调：递增 refreshTick 触发 AssetList 刷新。 */
  const handleImportComplete = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

  return (
    <div className={`${styles.body}${className ? " " + className : ""}`}>
      <ImportPanel onImportComplete={handleImportComplete} />
      <AssetList refreshTick={refreshTick} />
    </div>
  );
}
