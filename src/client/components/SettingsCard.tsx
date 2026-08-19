/**
 * SettingsCard — 设置卡组件（ADR-0004：三 section 各自可折叠）。
 *
 * 侧边栏入口展开后显示的内容卡，含三个独立可折叠 section：
 *   - 皮肤开关：单个「唐风皮肤」toggle，调 setSkinEnabled 即时生效 + 持久化。
 *   - 特效开关：五类 FX（shimmer/fall/grain/breathe/micro）独立 toggle，
 *     调 setFxEnabled 即时生效 + 写 localStorage('jx-fx') 持久化。
 *   - 素材管理：内嵌 ManagementUI（ImportPanel + AssetList），展开时 section
 *     body 内滚动（D6）。
 * 设置卡底部含「重置浮层位置」次要按钮（工单 03，ADR-0006 决策 6）：调
 * overlayPositionStore.reset() → 浮层回右下角 + 清 localStorage('jx-overlay-pos')。
 *
 * 折叠状态（D4）：皮肤默认展开 / 特效默认展开 / 管理默认折叠。
 * 折叠形态（D5）：一行标题栏 + ▸ 把手。切换瞬时无过渡（D9）。
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
import { overlayPositionStore } from "../state-machine/overlay-position.ts";
import { ManagementUI } from "./ManagementUI.tsx";
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
  /** extra class for layout placement. */
  className?: string | undefined;
}

/** 键盘激活折叠把手（Enter/Space 触发，与 button 行为一致）. */
function handleSectionKeyDown(e: React.KeyboardEvent, toggle: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggle();
  }
}

/**
 * Render the settings card.
 *
 * @param props.className - extra class for layout placement.
 * @returns 设置卡，含三个可折叠 section（皮肤/特效/管理）.
 */
export function SettingsCard({ className }: SettingsCardProps) {
  // 初始状态从 getFxState() 读取（反映 html 上 fx-* 类当前生效状态）
  const [fxState, setFxState] = useState<FxState>(() => getFxState());
  // 皮肤开关初始状态（getSkinEnabled 读 localStorage('jx-skin')，默认开）
  const [skinEnabled, setSkinOn] = useState<boolean>(() => getSkinEnabled());

  // 三 section 折叠状态（D4）：皮肤默认展开 / 特效默认展开 / 管理默认折叠
  const [skinCollapsed, setSkinCollapsed] = useState(false);
  const [fxCollapsed, setFxCollapsed] = useState(false);
  const [mgmtCollapsed, setMgmtCollapsed] = useState(true);

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

  /** 切换三 section 折叠态. */
  const handleToggleSkinSection = useCallback(() => {
    setSkinCollapsed((c) => !c);
  }, []);
  const handleToggleFxSection = useCallback(() => {
    setFxCollapsed((c) => !c);
  }, []);
  const handleToggleMgmtSection = useCallback(() => {
    setMgmtCollapsed((c) => !c);
  }, []);

  /** 重置浮层位置：调位置 store 的 reset()，浮层立即回右下角 + 清持久化（工单 03）. */
  const handleResetPosition = useCallback(() => {
    overlayPositionStore.reset();
  }, []);

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

      {/* 皮肤开关 section（默认展开） */}
      <section className={styles.fxSection}>
        <div
          className={styles.sectionHeader}
          onClick={handleToggleSkinSection}
          onKeyDown={(e) => handleSectionKeyDown(e, handleToggleSkinSection)}
          role="button"
          tabIndex={0}
          aria-expanded={!skinCollapsed}
          aria-label="折叠皮肤开关"
        >
          <h3 className={styles.sectionTitle}>皮肤开关</h3>
          <span className={styles.sectionToggleBtn} aria-hidden="true">
            {skinCollapsed ? "▸" : "▾"}
          </span>
        </div>
        {!skinCollapsed && (
          <div className={styles.sectionBody}>
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
          </div>
        )}
      </section>

      {/* 特效开关 section（默认展开） */}
      <section className={styles.fxSection}>
        <div
          className={styles.sectionHeader}
          onClick={handleToggleFxSection}
          onKeyDown={(e) => handleSectionKeyDown(e, handleToggleFxSection)}
          role="button"
          tabIndex={0}
          aria-expanded={!fxCollapsed}
          aria-label="折叠特效开关"
        >
          <h3 className={styles.sectionTitle}>特效开关</h3>
          <span className={styles.sectionToggleBtn} aria-hidden="true">
            {fxCollapsed ? "▸" : "▾"}
          </span>
        </div>
        {!fxCollapsed && (
          <div className={styles.sectionBody}>
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
          </div>
        )}
      </section>

      {/* 素材管理 section（默认折叠，展开时内嵌 ManagementUI，section body 内滚动 D6） */}
      <section className={styles.fxSection}>
        <div
          className={styles.sectionHeader}
          onClick={handleToggleMgmtSection}
          onKeyDown={(e) => handleSectionKeyDown(e, handleToggleMgmtSection)}
          role="button"
          tabIndex={0}
          aria-expanded={!mgmtCollapsed}
          aria-label="折叠素材管理"
        >
          <h3 className={styles.sectionTitle}>素材管理</h3>
          <span className={styles.sectionToggleBtn} aria-hidden="true">
            {mgmtCollapsed ? "▸" : "▾"}
          </span>
        </div>
        {!mgmtCollapsed && (
          <div className={styles.managementBody}>
            <ManagementUI />
          </div>
        )}
      </section>

      {/* 重置浮层位置按钮（工单 03，ADR-0006 决策 6）：调 overlayPositionStore.reset()
          → 浮层回右下角 + 清 localStorage('jx-overlay-pos')。设置卡底部次要按钮。 */}
      <div className={styles.resetRow}>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={handleResetPosition}
        >
          重置浮层位置
        </button>
      </div>
    </div>
  );
}
