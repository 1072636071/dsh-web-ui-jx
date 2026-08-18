/**
 * AssetList — 已导入素材列表组件。
 *
 * 调 GET /api/dsh-jx/import/list 获取全部导入记录，展示包名（sourcePath）、
 * 来源（sourceType）、状态、素材数量（assetCount）、时间戳（createdAt）。
 * props.refreshTick 变化时重新拉取（ImportPanel 导入完成后触发）。
 *
 * 列表按 createdAt 倒序排列（新在前）。导入失败项内联显示错误原因。
 *
 * 路由契约（src/host/import-api.ts）：
 *   - GET /api/dsh-jx/import/list → 200 + { imports: ImportRecord[] }
 *
 * 只消费 --dsw-alias-* / --dsw-specific-* 语义别名（经 management.module.css），
 * 无颜色字面量、无主题选择器。深浅双主题由 L2 remap 自动处理。
 *
 * @module dsh-web-ui-jx/client
 */

import { useCallback, useEffect, useState } from "react";
import styles from "../styles/management.module.css";
import type { ImportSource, ImportStatus } from "../types.ts";
import { statusLabel, sourceLabel } from "./import-labels.ts";

/** 导入记录（host ImportRecord 的客户端投影）。 */
interface ImportRecord {
  id: string;
  sourceType: ImportSource;
  sourcePath: string;
  status: ImportStatus;
  error?: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 列表响应。 */
interface ListResponse {
  imports: ImportRecord[];
}

/** AssetList props. */
export interface AssetListProps {
  /**
   * 刷新信号计数器（变化即触发重新拉取）。
   * 命名 refreshTick 而非 refreshNonce：语义更清晰，表示"刷新节拍"而非裸数字。
   */
  refreshTick: number;
}

/** 拉取导入列表：GET /api/dsh-jx/import/list。 */
async function fetchImports(): Promise<ImportRecord[]> {
  const res = await fetch("/api/dsh-jx/import/list");
  if (res.status !== 200) {
    throw new Error(`拉取列表失败（HTTP ${res.status}）`);
  }
  const data = (await res.json()) as ListResponse;
  if (!Array.isArray(data.imports)) {
    throw new Error("列表响应格式错误：缺少 imports 数组");
  }
  return data.imports;
}

/** 格式化 ISO-8601 时间戳为简短 MM/DD HH:MM。 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${h}:${m}`;
}

/** 按状态返回 badge class。 */
function statusBadgeClass(status: ImportStatus): string {
  switch (status) {
    case "completed":
      return styles.badgeCompleted;
    case "in_progress":
      return styles.badgeInProgress;
    case "failed":
      return styles.badgeFailed;
    case "pending":
      return styles.badgePending;
  }
}

/**
 * Render the asset list.
 *
 * @param props.refreshTick - 刷新信号计数器（变化触发重新拉取）。
 * @returns 已导入素材列表，含刷新钮、空态、加载态、错误提示。
 */
export function AssetList({ refreshTick }: AssetListProps) {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 重新拉取列表。 */
  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchImports()
      .then((list) => {
        // 按 createdAt 倒序（新在前）；ISO-8601 字典序 = 时间序
        list.sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
        );
        setImports(list);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // 初始加载 + refreshTick 变化时刷新
  useEffect(() => {
    refresh();
  }, [refresh, refreshTick]);

  return (
    <section className={styles.section}>
      <div className={styles.listHeader}>
        <h3 className={styles.sectionTitle}>已导入列表</h3>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {error && (
        <div className={`${styles.errorBox} ${styles.standalone}`}>{error}</div>
      )}

      {!error && loading && imports.length === 0 && (
        <div className={styles.loading}>加载中…</div>
      )}

      {!error && !loading && imports.length === 0 && (
        <div className={styles.empty}>暂无已导入素材包</div>
      )}

      {imports.length > 0 && (
        <ul className={styles.list}>
          {imports.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemRow}>
                <span className={styles.itemName} title={item.sourcePath}>
                  {item.sourcePath || item.id}
                </span>
                <span
                  className={`${styles.badge} ${
                    item.sourceType === "zip"
                      ? styles.badgeZip
                      : styles.badgeDir
                  }`}
                >
                  {sourceLabel(item.sourceType)}
                </span>
                <span
                  className={`${styles.badge} ${statusBadgeClass(item.status)}`}
                >
                  {statusLabel(item.status, "short")}
                </span>
              </div>
              <div className={styles.itemMeta}>
                <span>{item.assetCount} 素材</span>
                <span>{formatTime(item.createdAt)}</span>
              </div>
              {item.status === "failed" && item.error && (
                <div className={styles.errorBox}>{item.error}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
