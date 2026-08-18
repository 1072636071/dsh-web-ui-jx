/**
 * SettingsCard — 设置卡组件（含五类 FX 独立开关 + 进入管理界面入口）。
 *
 * 工单 10 产物：侧边栏入口展开后显示的内容卡。
 *   - 五类 FX（shimmer/fall/grain/breathe/micro）独立 toggle 开关，
 *     调 setFxEnabled 即时生效 + 写 localStorage('jx-fx') 持久化。
 *   - 「进入管理界面」按钮：点击触发 onOpenManagement 回调（由 SidebarEntry
 *     透传，控制 ManagementUI 显隐）。
 *
 * 初始状态从 getFxState() 读取（反映 html 上 fx-* 类的当前生效状态）；
 * 用户切换后调 setFxEnabled 并本地更新视图状态。
 *
 * 只消费 --dsw-alias-* / --dsw-specific-* 语义别名 + --jx-* 专属轨令牌
 * （经 sidebar-settings.module.css），无颜色字面量、无主题选择器。
 * 深浅双主题由 L2 remap 自动处理。:focus-visible 用 --jx-gold 描边。
 *
 * @module dsh-web-ui-jx/client
 */

import { useCallback, useMemo, useState } from "react";
import {
  FX_NAMES,
  type FxName,
  type FxState,
  getFxState,
  setFxEnabled,
} from "../fx/index.ts";
import { getSkinEnabled, setSkinEnabled } from "../skin.ts";
import styles from "../styles/sidebar-settings.module.css";

/** 五类 FX 的中文标签（用于开关 UI 显示）. */
const FX_LABELS: Record<FxName, string> = {
  shimmer: "鎏金流光",
  fall: "银杏飘落",
  grain: "墨韵暗纹",
  breathe: "墨光呼吸",
  micro: "微交互",
};

/** 五类 FX 的简短描述（用于开关 UI 辅助说明）. */
const FX_DESCRIPTIONS: Record<FxName, string> = {
  shimmer: "顶线流光 + 标题烫金流动",
  fall: "银杏（暗）/ 梅花（浅）飘落",
  grain: "静态 SVG turbulence 暗纹",
  breathe: "背景 opacity 呼吸",
  micro: "hover/active 微动效",
};

/** SettingsCard props. */
export interface SettingsCardProps {
  /** 点击「进入管理界面」按钮的回调（由 SidebarEntry 透传控制 ManagementUI 显隐）. */
  onOpenManagement?: (() => void) | undefined;
  /** extra class for layout placement. */
  className?: string | undefined;
}

/**
 * Render the settings card.
 *
 * @param props.onOpenManagement - 进入管理界面回调.
 * @param props.className - extra class for layout placement.
 * @returns 设置卡，含五类 FX 开关 + 管理界面入口按钮.
 */
export function SettingsCard({
  onOpenManagement,
  className,
}: SettingsCardProps) {
  // 初始状态从 getFxState() 读取（反映 html 上 fx-* 类当前生效状态）
  const [fxState, setFxState] = useState<FxState>(() => getFxState());
  // 皮肤开关初始状态（getSkinEnabled 读 localStorage('jx-skin')，默认开）
  const [skinEnabled, setSkinOn] = useState<boolean>(() => getSkinEnabled());

  /** 切换皮肤总开关：setSkinEnabled 即时生效 + 持久化，并更新本地视图状态. */
  const handleToggleSkin = useCallback(() => {
    const next = !skinEnabled;
    setSkinEnabled(next);
    setSkinOn(next);
  }, [skinEnabled]);

  /** 切换某类 FX 开关：调 setFxEnabled 即时生效 + 持久化，并更新本地视图状态. */
  const handleToggleFx = useCallback(
    (name: FxName) => {
      const next = setFxEnabled(name, !fxState[name]);
      setFxState(next);
    },
    [fxState],
  );

  /** 进入管理界面. */
  const handleOpenManagement = useCallback(() => {
    onOpenManagement?.();
  }, [onOpenManagement]);

  // 五类 FX 配置项（固定顺序，useMemo 避免重渲染时重建）
  const fxItems = useMemo(
    () =>
      FX_NAMES.map((name) => ({
        name,
        label: FX_LABELS[name],
        desc: FX_DESCRIPTIONS[name],
      })),
    [],
  );

  return (
    <div
      className={`${styles.settingsCard}${className ? " " + className : ""}`}
    >
      <header className={styles.settingsHeader}>
        <h2 className={styles.settingsTitle}>姜晓·墨染</h2>
        <p className={styles.settingsSubtitle}>唐风特效设置</p>
      </header>

      <section className={styles.fxSection}>
        <h3 className={styles.sectionTitle}>皮肤开关</h3>
        <ul className={styles.fxList}>
          <li className={styles.fxItem}>
            <div className={styles.fxLabelBox}>
              <span className={styles.fxLabel}>唐风皮肤</span>
              <span className={styles.fxDesc}>
                关闭即一键按回宿主原皮（本浮层与侧边栏保留）
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={skinEnabled}
              aria-label="切换唐风皮肤"
              className={`${styles.toggleSwitch}${skinEnabled ? " " + styles.toggleOn : ""}`}
              onClick={handleToggleSkin}
            >
              <span className={styles.toggleKnob} />
            </button>
          </li>
        </ul>
      </section>

      <section className={styles.fxSection}>
        <h3 className={styles.sectionTitle}>特效开关</h3>
        <ul className={styles.fxList}>
          {fxItems.map(({ name, label, desc }) => (
            <li key={name} className={styles.fxItem}>
              <div className={styles.fxLabelBox}>
                <span className={styles.fxLabel}>{label}</span>
                <span className={styles.fxDesc}>{desc}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={fxState[name]}
                aria-label={`切换${label}`}
                className={`${styles.toggleSwitch}${fxState[name] ? " " + styles.toggleOn : ""}`}
                onClick={() => handleToggleFx(name)}
              >
                <span className={styles.toggleKnob} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {onOpenManagement && (
        <section className={styles.managementSection}>
          <button
            type="button"
            className={styles.managementButton}
            onClick={handleOpenManagement}
          >
            进入管理界面
          </button>
        </section>
      )}
    </div>
  );
}
