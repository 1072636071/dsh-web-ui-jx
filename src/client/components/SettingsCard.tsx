/**
 * SettingsCard — 设置卡组件（ADR-0004：三 section 各自可折叠）。
 *
 * 侧边栏入口展开后显示的内容卡，含三个独立可折叠 section：
 *   - 皮肤开关：单个「唐风皮肤」toggle，调 setSkinEnabled 即时生效 + 持久化。
 *   - 特效开关：五类 FX（shimmer/fall/grain/warp/micro）独立 toggle，
 *     调 setFxEnabled 即时生效 + 写 localStorage('jx-fx') 持久化。
 *   - 素材管理：内嵌 ManagementUI（ImportPanel + AssetList），展开时 section
 *     body 内滚动（D6）。
 *   - 角色（ADR-0007 起，默认折叠）：状态标签 / 动作轮换 / 会话气泡上限 /
 *     查看后保留气泡（ADR-0022 D6 总开关①，调 setKeepEnabled 即时生效 +
 *     写 localStorage('jx-bubble-keep-enabled') 持久化）。
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
import {
  DEFAULT_MAX_SESSION_BUBBLES,
  MAX_MAX_SESSION_BUBBLES,
  MIN_MAX_SESSION_BUBBLES,
  getMaxSessionBubbles,
  setMaxSessionBubbles,
} from "../../../packages/dsh-session-bubble/src/index.ts";
import {
  getShowStateLabel,
  setShowStateLabel,
  getVariantRotationEnabled,
  setVariantRotationEnabled,
} from "../state-machine/overlay-settings.ts";
import {
  getArchiveDragEnabled,
  getKeepEnabled,
  setArchiveDragEnabled,
  setKeepEnabled,
} from "../../../packages/dsh-session-bubble/src/index.ts";
import {
  getBackdropEnabled,
  getBubbleAlpha,
  getInputAlpha,
  getPanelOpacity,
  getSelectorAlpha,
  getSidebarAlpha,
  getTipAlpha,
  getVeilOpacity,
  getWallOpacity,
  setBackdropEnabled,
  setBubbleAlpha,
  setInputAlpha,
  setPanelOpacity,
  setSelectorAlpha,
  setSidebarAlpha,
  setTipAlpha,
  setVeilOpacity,
  setWallOpacity,
} from "../welcome-backdrop-config.ts";
import { syncWelcomeBackdrop } from "../welcome-backdrop.ts";
import { MAX_USER_NAME_LENGTH, userNameStore } from "../user-name-setting.ts";
import { ManagementUI } from "./ManagementUI.tsx";
import styles from "../styles/sidebar-settings.module.css";

/** 压暗/区域 alpha 滑杆 UI 配置（ADR-0024/0025）：label/描述/aria/读写器数据驱动. */
type RegionAlphaKey = "veil" | "sidebar" | "input" | "bubble" | "tip" | "selector";

const REGION_ALPHA_UI: Record<
  RegionAlphaKey,
  { label: string; desc: string; get: () => number; set: (v: number) => number }
> = {
  veil: {
    label: "压暗浓度",
    desc: "叠在壁纸上的暗纱（深色）/白纱（浅色）浓度，越高文字越清晰（0-100%）",
    get: getVeilOpacity,
    set: setVeilOpacity,
  },
  sidebar: {
    label: "侧栏不透明度",
    desc: "左侧导航列/文件树透出壁纸的程度（0-100%，越低越透）",
    get: getSidebarAlpha,
    set: setSidebarAlpha,
  },
  input: {
    label: "输入栏不透明度",
    desc: "底部输入框透出壁纸的程度（0-100%，越低越透）",
    get: getInputAlpha,
    set: setInputAlpha,
  },
  bubble: {
    label: "用户气泡不透明度",
    desc: "用户消息气泡透出壁纸的程度（0-100%，越低越透）",
    get: getBubbleAlpha,
    set: setBubbleAlpha,
  },
  tip: {
    label: "任务卡不透明度",
    desc: "目标/Todo/Queue 卡片透出壁纸的程度（0-100%，三卡联动）",
    get: getTipAlpha,
    set: setTipAlpha,
  },
  selector: {
    label: "附件钮不透明度",
    desc: "输入框附件「+」钮透出壁纸的程度（0-100%）",
    get: getSelectorAlpha,
    set: setSelectorAlpha,
  },
};

const REGION_ALPHA_KEYS = Object.keys(REGION_ALPHA_UI) as RegionAlphaKey[];

/** 五类 FX 的中文标签（用于开关 UI 显示）. */
const FX_LABELS: Record<FxName, string> = {
  shimmer: "鎏金流光",
  fall: "银杏飘落",
  grain: "墨韵暗纹",
  warp: "鼠标扭曲",
  micro: "微交互",
};

/** 五类 FX 的简短描述（用于开关 UI 辅助说明）. */
const FX_DESCRIPTIONS: Record<FxName, string> = {
  shimmer: "顶线流光 + 标题烫金流动",
  fall: "银杏（暗）/ 梅花（浅）飘落",
  grain: "静态 SVG turbulence 暗纹",
  warp: "鼠标移动时光线扭曲跟手",
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
  // ADR-0007：角色 section 默认折叠
  const [skinCollapsed, setSkinCollapsed] = useState(false);
  const [fxCollapsed, setFxCollapsed] = useState(false);
  const [mgmtCollapsed, setMgmtCollapsed] = useState(true);
  const [charCollapsed, setCharCollapsed] = useState(true);
  // 个性化问候 section（ADR-0034/0036，默认折叠）
  const [nameCollapsed, setNameCollapsed] = useState(true);

  // 会话气泡数量上限（ADR-0007 决策 5，初始值读 localStorage，默认 10）
  const [maxBubbles, setMaxBubbles] = useState<number>(() =>
    getMaxSessionBubbles(),
  );

  // 状态文案标签可见性（ADR-0010，默认 true）
  const [stateLabelVisible, setStateLabelVisible] = useState<boolean>(() =>
    getShowStateLabel(),
  );

  // 动作轮换开关（ADR-0013 D7，默认 true）
  const [variantRotationOn, setVariantRotationOn] = useState<boolean>(() =>
    getVariantRotationEnabled(),
  );

  // 保留模式总开关①「查看后保留气泡」（ADR-0022 D6，默认开）
  const [keepEnabled, setKeepEnabledOn] = useState<boolean>(() =>
    getKeepEnabled(),
  );

  // 欢迎背景（ADR-0024 D3）：总开关 + 壁纸/面板不透明度
  const [backdropOn, setBackdropOnState] = useState<boolean>(() =>
    getBackdropEnabled(),
  );
  const [wallOpacity, setWallOpacityState] = useState<number>(() =>
    getWallOpacity(),
  );
  const [panelOpacity, setPanelOpacityState] = useState<number>(() =>
    getPanelOpacity(),
  );
  // 压暗 + 五区域 alpha（ADR-0024/0025）：单 state 对象，键与 REGION_ALPHA_UI 对齐
  const [regionAlpha, setRegionAlpha] = useState<Record<RegionAlphaKey, number>>(
    () => ({
      veil: getVeilOpacity(),
      sidebar: getSidebarAlpha(),
      input: getInputAlpha(),
      bubble: getBubbleAlpha(),
      tip: getTipAlpha(),
      selector: getSelectorAlpha(),
    }),
  );

  // 拖拽归档开关②「拖拽归档会话」（ADR-0022 D6，默认开；主从于①）
  const [archiveDragOn, setArchiveDragOn] = useState<boolean>(() =>
    getArchiveDragEnabled(),
  );

  // 个性化问候用户名（ADR-0034/0036）：受控草稿 + 行内错误
  const [nameDraft, setNameDraft] = useState<string>(() => userNameStore.getSnapshot());
  const [nameError, setNameError] = useState<string | null>(null);

  /** 切换皮肤总开关：setSkinEnabled 即时生效 + 持久化，并更新本地视图状态. */
  const handleToggleSkin = useCallback(() => {
    const next = !skinEnabled;
    setSkinEnabled(next);
    // 欢迎背景随皮肤联动（ADR-0024）：皮肤关 → 壁纸层即时卸载
    syncWelcomeBackdrop();
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
  const handleToggleCharSection = useCallback(() => {
    setCharCollapsed((c) => !c);
  }, []);

  /** 切换个性化问候 section 折叠态（ADR-0034/0036）. */
  const handleToggleNameSection = useCallback(() => {
    setNameCollapsed((c) => !c);
  }, []);

  /** 用户名输入受控变更：同步草稿并清除既有行内错误（ADR-0034 D4）. */
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNameDraft(e.target.value);
      if (nameError !== null) setNameError(null);
    },
    [nameError],
  );

  /**
   * 提交用户名（失焦或回车，ADR-0034 D4）：经 userNameStore.commit 校验落地。
   * - valid → 写入净化值，草稿同步为净化值，清除错误。
   * - empty → 清空（写空串），草稿清空，清除错误。
   * - too-long → 不写入，行内提示，保留草稿供编辑。
   */
  const handleNameSubmit = useCallback(() => {
    const result = userNameStore.commit(nameDraft);
    if (result.status === "too-long") {
      setNameError(`最多 ${result.max} 个字符`);
      return;
    }
    setNameError(null);
    setNameDraft(result.status === "valid" ? result.value : "");
  }, [nameDraft]);

  /** 回车提交（不插入换行）；IME 组字中不拦截（避免打断中文输入）. */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    [],
  );

  /** 切换会话气泡数量上限：调 setMaxSessionBubbles 即时生效 + 持久化，并更新本地视图状态. */
  const handleMaxBubblesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = setMaxSessionBubbles(Number(e.target.value));
      setMaxBubbles(next);
    },
    [],
  );

  /** 切换状态文案标签可见性：调 setShowStateLabel 即时生效 + 持久化，并更新本地视图状态. */
  const handleToggleStateLabel = useCallback(() => {
    const next = !stateLabelVisible;
    setShowStateLabel(next);
    setStateLabelVisible(next);
  }, [stateLabelVisible]);

  /** 切换动作轮换：调 setVariantRotationEnabled 即时生效 + 持久化，并更新本地视图状态. */
  const handleToggleVariantRotation = useCallback(() => {
    const next = !variantRotationOn;
    setVariantRotationEnabled(next);
    setVariantRotationOn(next);
  }, [variantRotationOn]);

  /** 切换保留模式总开关①：调 setKeepEnabled 即时生效 + 持久化（ADR-0022 D6）. */
  const handleToggleKeep = useCallback(() => {
    const next = !keepEnabled;
    setKeepEnabled(next);
    setKeepEnabledOn(next);
  }, [keepEnabled]);

  /** 切换拖拽归档开关②：调 setArchiveDragEnabled 即时生效 + 持久化（ADR-0022 D6）. */
  const handleToggleArchiveDrag = useCallback(() => {
    const next = !archiveDragOn;
    setArchiveDragEnabled(next);
    setArchiveDragOn(next);
  }, [archiveDragOn]);

  /** 切换欢迎背景总开关（ADR-0024 D3）：即时生效 + 持久化 + 更新视图. */
  const handleToggleBackdrop = useCallback(() => {
    const next = !backdropOn;
    setBackdropEnabled(next);
    setBackdropOnState(next);
  }, [backdropOn]);

  /** 壁纸不透明度滑杆（ADR-0024 D3）：钳制写入 + 即时生效. */
  const handleWallOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = setWallOpacity(Number(e.target.value));
      setWallOpacityState(next);
    },
    [],
  );

  /** 面板不透明度滑杆（ADR-0024 D3）：钳制写入 + 即时生效. */
  const handlePanelOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = setPanelOpacity(Number(e.target.value));
      setPanelOpacityState(next);
    },
    [],
  );

  /** 压暗/区域滑杆统一写入：按 key 分派到对应 setter，钳制 + 持久化 + 即时生效. */
  const handleRegionAlphaChange = useCallback(
    (key: RegionAlphaKey, value: number) => {
      const write = REGION_ALPHA_UI[key].set;
      const next = write(value);
      setRegionAlpha((prev) => ({ ...prev, [key]: next }));
    },
    [],
  );

  /** 重置浮层位置：调位置 store 的 reset()，浮层立即回右下角 + 清持久化（工单 03）. */
  const handleResetPosition = useCallback(() => {
    overlayPositionStore.reset();
  }, []);

  /** 重启 DSH 宿主（memorial 017 D-4）：POST 到 host 重启路由，宿主派自愈
   *  看守进程后优雅退出并自动重起。加不加确认弹窗：不加（调试高频点击，重启
   *  不丢数据，误点代价 = 一次重启）。fetch 竞态/失败静默吞掉。 */
  const handleRestartDsh = useCallback(() => {
    fetch("/api/dsh-jx/restart", { method: "POST" }).catch(() => {
      /* 宿主即将退出重起，无需在 UI 层报错 */
    });
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
              {/* 欢迎背景组（ADR-0024 D3）：总开关 + 壁纸/面板双滑杆 */}
              <li className={styles.fxItem}>
                <div className={styles.fxLabelBox}>
                  <span className={styles.fxLabel}>欢迎背景</span>
                  <span className={styles.fxDesc}>
                    姜晓欢迎立绘铺满整页作壁纸，面板随之半透明（皮肤关闭时一并隐藏）
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={backdropOn}
                  aria-label="切换欢迎背景"
                  className={`${styles.toggleSwitch}${backdropOn ? " " + styles.toggleOn : ""}`}
                  onClick={handleToggleBackdrop}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </li>
              <li className={styles.fxItem}>
                <div className={styles.fxLabelBox}>
                  <span className={styles.fxLabel}>壁纸不透明度</span>
                  <span className={styles.fxDesc}>
                    {backdropOn ? "欢迎立绘在背景上的浓度（0-100%）" : "需先开启「欢迎背景」"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={wallOpacity}
                  onChange={handleWallOpacityChange}
                  disabled={!backdropOn}
                  aria-label="壁纸不透明度"
                  className={styles.rangeInput}
                />
              </li>
              <li className={styles.fxItem}>
                <div className={styles.fxLabelBox}>
                  <span className={styles.fxLabel}>其余面板不透明度</span>
                  <span className={styles.fxDesc}>
                    {backdropOn ? "会话区/顶栏/详情等其余面板透出壁纸的程度（0-100%，越低越透）" : "需先开启「欢迎背景」"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={panelOpacity}
                  onChange={handlePanelOpacityChange}
                  disabled={!backdropOn}
                  aria-label="其余面板不透明度"
                  className={styles.rangeInput}
                />
              </li>
              {REGION_ALPHA_KEYS.map((key) => {
                const item = REGION_ALPHA_UI[key];
                return (
                  <li key={key} className={styles.fxItem}>
                    <div className={styles.fxLabelBox}>
                      <span className={styles.fxLabel}>{item.label}</span>
                      <span className={styles.fxDesc}>
                        {backdropOn ? item.desc : "需先开启「欢迎背景」"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={regionAlpha[key]}
                      onChange={(e) => handleRegionAlphaChange(key, Number(e.target.value))}
                      disabled={!backdropOn}
                      aria-label={item.label}
                      className={styles.rangeInput}
                    />
                  </li>
                );
              })}
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

      {/* 角色 section（ADR-0007，默认折叠）：会话气泡数量上限配置 */}
      <section className={styles.fxSection}>
        <div
          className={styles.sectionHeader}
          onClick={handleToggleCharSection}
          onKeyDown={(e) => handleSectionKeyDown(e, handleToggleCharSection)}
          role="button"
          tabIndex={0}
          aria-expanded={!charCollapsed}
          aria-label="折叠角色设置"
        >
          <h3 className={styles.sectionTitle}>角色</h3>
          <span className={styles.sectionToggleBtn} aria-hidden="true">
            {charCollapsed ? "▸" : "▾"}
          </span>
        </div>
        {!charCollapsed && (
          <div className={styles.sectionBody}>
            <div className={styles.fxItem}>
              <div className={styles.fxLabelBox}>
                <span className={styles.fxLabel}>显示姜晓状态标签</span>
                <span className={styles.fxDesc}>
                  角色下方显示当前正在做什么的文案
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={stateLabelVisible}
                aria-label="切换姜晓状态标签"
                className={`${styles.toggleSwitch}${stateLabelVisible ? " " + styles.toggleOn : ""}`}
                onClick={handleToggleStateLabel}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.fxItem}>
              <div className={styles.fxLabelBox}>
                <span className={styles.fxLabel}>动作轮换</span>
                <span className={styles.fxDesc}>
                  待机/工作时长驻动作随机轮换，不再单一循环
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={variantRotationOn}
                aria-label="切换动作轮换"
                className={`${styles.toggleSwitch}${variantRotationOn ? " " + styles.toggleOn : ""}`}
                onClick={handleToggleVariantRotation}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.fxItem}>
              <div className={styles.fxLabelBox}>
                <span className={styles.fxLabel}>会话气泡数量上限</span>
                <span className={styles.fxDesc}>
                  角色浮层左侧显示的顶层归组气泡数上限，展开的子会话列表不占名额（1-10）
                </span>
              </div>
              <input
                type="number"
                min={MIN_MAX_SESSION_BUBBLES}
                max={MAX_MAX_SESSION_BUBBLES}
                step={1}
                value={maxBubbles}
                onChange={handleMaxBubblesChange}
                aria-label="会话气泡数量上限"
                className={styles.numberInput}
              />
            </div>
            {/* 保留模式总开关①（ADR-0022 D6）：开 = 单击气泡跳转后保留，
                关 = 完全回到现状（点击即跳转即消失）。主从控制开关②。 */}
            <div className={styles.fxItem}>
              <div className={styles.fxLabelBox}>
                <span className={styles.fxLabel}>查看后保留气泡</span>
                <span className={styles.fxDesc}>
                  单击气泡跳转后保留提醒，直到拖入收起区或归档区
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={keepEnabled}
                aria-label="切换查看后保留气泡"
                className={`${styles.toggleSwitch}${keepEnabled ? " " + styles.toggleOn : ""}`}
                onClick={handleToggleKeep}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            {/* 拖拽归档开关②（ADR-0022 D6，工单03）：主从灰显——①关时不可用；
                ②关 = 归档区不渲染、仅剩收起区（已归档会话仍被 SDK 排除集隐藏，
                不复活）。默认开：误触已被远近分置 + 朱砂警示 + 仅 completed 可拖
                三重约束兜住，且归档收益（永不复活）大于误归档成本（PRD 用户故事 8）。
                审查 S3：disabled 按钮在部分浏览器不弹 title——提示移到外层
                .fxItem 容器承载（悬停整行可见）。 */}
            <div
              className={styles.fxItem}
              title={keepEnabled ? undefined : "需先开启「查看后保留气泡」"}
            >
              <div className={styles.fxLabelBox}>
                <span className={styles.fxLabel}>拖拽归档会话</span>
                <span className={styles.fxDesc}>
                  {keepEnabled
                    ? "拖入归档区即真归档：从列表隐藏且不可恢复"
                    : "需先开启「查看后保留气泡」"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={archiveDragOn}
                aria-label="切换拖拽归档会话"
                aria-disabled={!keepEnabled}
                disabled={!keepEnabled}
                className={`${styles.toggleSwitch}${archiveDragOn ? " " + styles.toggleOn : ""}${!keepEnabled ? " " + styles.toggleDisabled : ""}`}
                onClick={handleToggleArchiveDrag}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 个性化问候 section（ADR-0034/0036）：用户名输入，失焦/回车提交 */}
      <section className={styles.fxSection}>
        <div
          className={styles.sectionHeader}
          onClick={handleToggleNameSection}
          onKeyDown={(e) => handleSectionKeyDown(e, handleToggleNameSection)}
          role="button"
          tabIndex={0}
          aria-expanded={!nameCollapsed}
          aria-label="折叠个性化问候"
        >
          <h3 className={styles.sectionTitle}>个性化问候</h3>
          <span className={styles.sectionToggleBtn} aria-hidden="true">
            {nameCollapsed ? "▸" : "▾"}
          </span>
        </div>
        {!nameCollapsed && (
          <div className={styles.sectionBody}>
            <div className={styles.fxItem}>
              <div className={styles.fxLabelBox}>
                <span className={styles.fxLabel}>你的称呼</span>
                <span className={styles.fxDesc}>
                  显示在空会话大标题（如「上午好，张三」）；留空则姜晓一律称「大人」
                </span>
              </div>
            </div>
            <input
              type="text"
              value={nameDraft}
              onChange={handleNameChange}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
              maxLength={MAX_USER_NAME_LENGTH + 8}
              placeholder="如：张三"
              aria-label="你的称呼"
              aria-invalid={nameError !== null}
              className={`${styles.textInput}${nameError !== null ? " " + styles.inputErrorBorder : ""}`}
            />
            {nameError !== null && (
              <p className={styles.inputError} role="alert">
                {nameError}
              </p>
            )}
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

      {/* 重启 DSH 按钮（memorial 017）：设置卡底部动作行，置于重置按钮之前。
          调 host 重启路由，宿主派看守进程后优雅退出并自动重起（改 host 半区代码
          后点一下让新构建生效）。复用 .resetBtn 次要按钮样式 + .resetDivider 分隔。 */}
      <div className={styles.resetRow}>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={handleRestartDsh}
        >
          重启 DSH
        </button>
        <span className={styles.resetDivider} aria-hidden="true" />
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
