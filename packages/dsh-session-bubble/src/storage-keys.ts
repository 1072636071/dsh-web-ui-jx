/**
 * storage-keys — 会话气泡库 localStorage 键名单点（ADR-0029 决策 5 / D8）。
 *
 * 保留 `jx-*` 前缀：本插件（dsh-web-ui-jx）与薄壳插件同宿主时共享同一份
 * 记账数据（同一用户同一会话列表，语义合理）。键名是持久化契约的一部分
 * （ADR-0022/0028），改动需评估既有用户数据兼容。
 */

export const STORAGE_KEYS = {
  /** 会话气泡数量上限（ADR-0007 决策 5）. */
  maxSessionBubbles: "jx-max-session-bubbles",
  /** 总开关①「查看后保留气泡」（ADR-0022 D6）. */
  keepEnabled: "jx-bubble-keep-enabled",
  /** 开关②「拖拽归档会话」（ADR-0022 D6）. */
  archiveDragEnabled: "jx-bubble-keep-archive-enabled",
  /** 单击保留记账集合（JSON string[]）. */
  kept: "jx-bubble-keep-kept",
  /** 收起区记账集合（JSON string[]）. */
  dismissed: "jx-bubble-keep-dismissed",
  /** 完成见闻集（ADR-0028 决策 1，JSON string[]）. */
  seen: "jx-bubble-keep-seen",
  /** 个性化问候用户名（ADR-0034/0036：client 侧 localStorage，不走 host settings）. */
  userName: "jx-user-name",
  /** 个性化问候总开关（ADR-0036 附带决策 D8：默认开；关 → hero 回落宿主原文案 + 姜晓新建会话台词静默）. */
  greetingEnabled: "jx-greeting-enabled",
} as const;
