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
 * 样式随组件迁移工单（04）迁入后经 `styles/` 随包分发（module + bubble-theme）。
 */


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

export {
  deriveSessionListEntries,
  visiblePendingKind,
  type PendingInteractionLike,
  type PendingInteractionsSnapshot,
  type PendingInteractionsSource,
} from "./session-list-adapter.ts";

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

export { SessionBubbleList, type SessionBubbleListProps } from "./SessionBubbleList.tsx";

// 气泡内容弹框（ADR-0031）：hover 内容预览组件 + 状态机（鼠标车道）。
export {
  useBubblePreview,
  SessionBubblePopup,
  type BubblePreviewState,
  type PreviewRequest,
  type PreviewTarget,
  type SessionBubblePopupProps,
} from "./SessionBubblePreview.tsx";

// 气泡内容弹框纯逻辑：路由 JSON 解析（含配对 reply）/ 摘要选中 / 视口钳制。
export {
  SUMMARY_MAX_CHARS,
  POPUP_GAP_PX,
  POPUP_HEIGHT_PX,
  POPUP_MARGIN_PX,
  POPUP_WIDTH_PX,
  computePopupPlacement,
  parsePreviewResponse,
  resolveSelectedIndex,
  truncateSummary,
  type AnchorRect,
  type PopupPlacement,
  type PromptLike,
  type SessionPreviewData,
  type Size,
} from "./session-bubble-preview.ts";

// 详情窗书页卡片（工单 16-02）：悬停详情窗组件 + 字符护栏纯函数。
export {
  SessionBubbleDetail,
  clampText,
  type SessionBubbleDetailEntry,
  type SessionBubbleDetailProps,
} from "./SessionBubbleDetail.tsx";

// 详情窗数据层（工单 16-01）：预览提取纯函数 + transport 抽象 + DSH 默认实现 + 缓存包装器。
export {
  createDshPreviewTransport,
  createPreviewCache,
  extractPreview,
  type DshPreviewTransportOptions,
  type PreviewCacheOptions,
  type PreviewTransport,
  type SessionPreview,
} from "./detail/detail-data.ts";

// AI 动态标题（工单 16-03/16-04）：transport 抽象 + DSH 默认实现 + 提示词/响应解析 +
// 刷新判定纯逻辑 + 缓存/节流包装器。
export {
  buildDynamicTitlePrompt,
  createDshDynamicTitleTransport,
  createDynamicTitleStore,
  decideTitleRefresh,
  parseDynamicTitleResponse,
  type DshDynamicTitleTransportOptions,
  type DynamicTitleInput,
  type DynamicTitlePromptInput,
  type DynamicTitlePromptOptions,
  type DynamicTitleParseOptions,
  type DynamicTitleResult,
  type DynamicTitleStoreOptions,
  type DynamicTitleTransport,
  type ParsedDynamicTitle,
  type TitleRefreshDecision,
  type TitleRefreshInput,
} from "./detail/dynamic-title.ts";
