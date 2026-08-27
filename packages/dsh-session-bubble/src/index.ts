/**
 * dsh-session-bubble — 会话气泡通用 React 组件库（公共 API 入口）。
 *
 * 导出面（ADR-0029 / D5 / D7）：
 *   - 纯逻辑：归组引擎 buildBubbleGroups + 标题推导 displayTitle + 拖拽判定
 *     resolveDragAction / isBubbleDraggable / isBubbleRowDraggable / 手柄判定
 *     isBubbleHandleHit + 相关类型
 *   - SDK 投影：deriveSessionListEntries（SDK 快照 → SessionListEntry[]）
 *   - 配置与记账：上限操作 / 保留模式开关 / kept·dismissed·seen 记账集合
 *   - 持久化工厂：createPersistentSetting（配置操作的基础设施）
 *   - storage-keys：localStorage 键名单点
 *
 * 样式随组件迁移工单（04）迁入后经 `styles/` 随包分发；当前仅占位。
 */
import "./styles/index.css";

export {
  buildBubbleGroups,
  displayTitle,
  isBubbleDraggable,
  isBubbleHandleHit,
  isBubbleRowDraggable,
  resolveDragAction,
  DRAG_HANDLE_SELECTOR,
  DRAG_THRESHOLD_PX,
  SID_FALLBACK_MAX_LEN,
  type BubbleEntry,
  type BubbleGroup,
  type BubbleGroupBadge,
  type BubbleKeepContext,
  type BuildBubbleGroupsResult,
  type DragEntryFlags,
  type DragVerdict,
  type DropZoneKind,
  type PendingInteractionKind,
  type SessionId,
  type SessionListEntry,
} from "./session-bubbles.ts";

export { deriveSessionListEntries } from "./session-list-adapter.ts";

export {
  DEFAULT_MAX_SESSION_BUBBLES,
  MAX_MAX_SESSION_BUBBLES,
  MIN_MAX_SESSION_BUBBLES,
  clampMaxSessionBubbles,
  getMaxSessionBubbles,
  getMaxSessionBubblesSnapshot,
  setMaxSessionBubbles,
  subscribeMaxSessionBubbles,
} from "./session-bubbles-config.ts";

export {
  addDismissed,
  addKept,
  addSeen,
  clearDismissed,
  getArchiveDragEnabled,
  getArchiveDragEnabledSnapshot,
  getDismissedSnapshot,
  getKeepEnabled,
  getKeepEnabledSnapshot,
  getKeptSnapshot,
  getSeenSnapshot,
  pruneDismissed,
  pruneKept,
  pruneSeen,
  setArchiveDragEnabled,
  setKeepEnabled,
  subscribeArchiveDragEnabled,
  subscribeDismissed,
  subscribeKeepEnabled,
  subscribeKept,
  subscribeSeen,
} from "./session-bubble-keep-config.ts";

export {
  createPersistentSetting,
  type PersistentSetting,
  type PersistentSettingOptions,
} from "./persistent-setting.ts";

export { STORAGE_KEYS } from "./storage-keys.ts";
