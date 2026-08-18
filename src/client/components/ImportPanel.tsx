/**
 * ImportPanel — 导入面板组件。
 *
 * 提供两种导入来源：
 *   - zip：文件选择器（<input type="file" accept=".zip">），选中后 POST raw body
 *     到 /api/dsh-jx/import?source=zip&filename=<name>。
 *   - directory：本地目录路径输入框，POST JSON { source: 'directory', path } 到
 *     /api/dsh-jx/import。
 *
 * 导入进度反馈：POST 后拿到 importId，setInterval 轮询
 * GET /api/dsh-jx/import/progress/:id，直到状态 completed/failed，然后调
 * onImportComplete 触发 AssetList 刷新。
 *
 * 导入失败：显示明确错误提示（从进度响应的 error 字段或启动失败异常），
 * 让用户可感知失败原因。
 *
 * 路由契约（src/host/import-api.ts）：
 *   - POST /api/dsh-jx/import
 *       · application/json + { source: 'directory', path } → 目录导入
 *       · application/octet-stream + ?source=zip[&filename=<name>] → zip 导入
 *       · 返回 202 + { importId, status: 'in_progress' }
 *   - GET /api/dsh-jx/import/progress/:id → 200 + ImportRecord 或 404
 *
 * 只消费 --dsw-alias-* / --dsw-specific-* 语义别名（经 management.module.css），
 * 无颜色字面量、无主题选择器。深浅双主题由 L2 remap 自动处理。
 *
 * @module dsh-web-ui-jx/client
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import styles from "../styles/management.module.css";
import type { ImportSource, ImportStatus } from "../types.ts";
import { statusLabel } from "./import-labels.ts";

/** 进度查询响应（host ImportRecord 的客户端投影）。 */
interface ProgressResponse {
  id: string;
  sourceType: ImportSource;
  sourcePath: string;
  status: ImportStatus;
  error?: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

/** ImportPanel props. */
export interface ImportPanelProps {
  /** 导入完成（成功或失败）回调，触发 AssetList 刷新。 */
  onImportComplete: () => void;
}

/** 进度轮询间隔 ms。 */
const PROGRESS_POLL_INTERVAL_MS = 500;
/** 进度轮询超时 ms（30s），超时后停止轮询并提示用户。 */
const PROGRESS_POLL_TIMEOUT_MS = 30_000;

/** 启动 zip 导入：POST raw body 到 /api/dsh-jx/import?source=zip&filename=<name>。 */
async function startZipImport(file: File): Promise<string> {
  const url = new URL("/api/dsh-jx/import", window.location.origin);
  url.searchParams.set("source", "zip");
  url.searchParams.set("filename", file.name);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: file,
  });
  if (res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `启动 zip 导入失败（HTTP ${res.status}）${text ? "：" + text : ""}`,
    );
  }
  const data = (await res.json()) as { importId?: string };
  if (typeof data.importId !== "string") {
    throw new Error("导入 API 返回缺少 importId");
  }
  return data.importId;
}

/** 启动目录导入：POST JSON { source: 'directory', path }。 */
async function startDirectoryImport(path: string): Promise<string> {
  const res = await fetch("/api/dsh-jx/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "directory", path }),
  });
  if (res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `启动目录导入失败（HTTP ${res.status}）${text ? "：" + text : ""}`,
    );
  }
  const data = (await res.json()) as { importId?: string };
  if (typeof data.importId !== "string") {
    throw new Error("导入 API 返回缺少 importId");
  }
  return data.importId;
}

/** 查询导入进度：GET /api/dsh-jx/import/progress/:id。返回 null 表示 404。 */
async function queryProgress(id: string): Promise<ProgressResponse | null> {
  const res = await fetch(
    `/api/dsh-jx/import/progress/${encodeURIComponent(id)}`,
  );
  if (res.status === 404) return null;
  if (res.status !== 200) {
    throw new Error(`查询进度失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as ProgressResponse;
}

/**
 * Render the import panel.
 *
 * @param props.onImportComplete - 导入完成回调（成功或失败均触发）。
 * @returns 导入面板，含 zip/目录 tab、选择控件、进度反馈、错误提示。
 */
export function ImportPanel({ onImportComplete }: ImportPanelProps) {
  const [tab, setTab] = useState<ImportSource>("zip");
  const [dirPath, setDirPath] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  /** 清理轮询定时器（幂等）。 */
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /** 轮询进度直到 completed/failed/超时。 */
  const pollProgress = useCallback(
    (id: string) => {
      stopPolling();
      pollStartRef.current = Date.now();
      pollTimerRef.current = setInterval(() => {
        // 超时保护
        if (Date.now() - pollStartRef.current > PROGRESS_POLL_TIMEOUT_MS) {
          stopPolling();
          setImporting(false);
          setError("导入进度查询超时（30s），请稍后在列表中查看结果");
          return;
        }
        void queryProgress(id)
          .then((p) => {
            if (p === null) {
              // 404：记录已消失（不应发生），停止轮询
              stopPolling();
              setImporting(false);
              setError("导入记录已消失，请重试");
              return;
            }
            setProgress(p);
            if (p.status === "completed" || p.status === "failed") {
              stopPolling();
              setImporting(false);
              if (p.status === "failed") {
                setError(p.error ?? "导入失败（未提供原因）");
              } else {
                setError(null);
              }
              onImportComplete();
            }
          })
          .catch((err: unknown) => {
            // 网络错误暂不终止轮询，继续重试直到超时
            console.warn("dsh-jx: progress poll error:", err);
          });
      }, PROGRESS_POLL_INTERVAL_MS);
    },
    [stopPolling, onImportComplete],
  );

  /** 启动导入。 */
  const handleImport = useCallback(() => {
    setError(null);
    if (importing) return;

    let start: Promise<string>;
    if (tab === "zip") {
      if (!zipFile) {
        setError("请先选择 zip 文件");
        return;
      }
      start = startZipImport(zipFile);
    } else {
      const path = dirPath.trim();
      if (!path) {
        setError("请输入目录路径");
        return;
      }
      start = startDirectoryImport(path);
    }

    setImporting(true);
    setProgress(null);
    void start
      .then((importId) => {
        pollProgress(importId);
      })
      .catch((err: unknown) => {
        setImporting(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [tab, zipFile, dirPath, importing, pollProgress]);

  /** zip 文件选择变化。 */
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setZipFile(file);
    setError(null);
  }, []);

  /** 触发隐藏的 file input。 */
  const handlePickZip = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /** 组件卸载时清理轮询定时器。 */
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const canSubmit =
    !importing && (tab === "zip" ? zipFile !== null : dirPath.trim() !== "");

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>导入素材包</h3>

      {/* 来源 tab */}
      <div className={styles.tabRow} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "zip"}
          className={`${styles.tab}${tab === "zip" ? " " + styles.active : ""}`}
          onClick={() => setTab("zip")}
        >
          zip 文件
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "directory"}
          className={`${styles.tab}${tab === "directory" ? " " + styles.active : ""}`}
          onClick={() => setTab("directory")}
        >
          本地目录
        </button>
      </div>

      {/* zip 选择 */}
      {tab === "zip" && (
        <div className={styles.zipRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className={styles.fileInput}
            onChange={handleFileChange}
          />
          <button
            type="button"
            className={styles.button}
            onClick={handlePickZip}
            disabled={importing}
          >
            选择 zip
          </button>
          <span className={styles.fileLabel}>
            {zipFile ? zipFile.name : "未选择文件"}
          </span>
        </div>
      )}

      {/* 目录路径输入 */}
      {tab === "directory" && (
        <div className={styles.dirRow}>
          <input
            type="text"
            className={styles.pathInput}
            placeholder="输入本地目录绝对路径…"
            value={dirPath}
            onChange={(e) => setDirPath(e.target.value)}
            disabled={importing}
          />
        </div>
      )}

      {/* 提交钮 */}
      <button
        type="button"
        className={styles.button}
        onClick={handleImport}
        disabled={!canSubmit}
      >
        {importing ? "导入中…" : "开始导入"}
      </button>

      {/* 进度反馈 */}
      {progress && (
        <div className={styles.progress}>
          <div className={styles.progressRow}>
            {progress.status === "in_progress" && (
              <span className={styles.spinner} aria-hidden="true" />
            )}
            <span className={styles.progressText}>
              <strong>{statusLabel(progress.status)}</strong>
              {" · "}
              {progress.sourceType === "zip" ? "zip" : "目录"}
            </span>
          </div>
          <div className={styles.progressDetail}>
            {progress.sourcePath}
            {progress.status === "completed" &&
              ` · ${progress.assetCount} 个素材`}
          </div>
          {error && progress.status === "failed" && (
            <div className={styles.errorBox}>{error}</div>
          )}
        </div>
      )}

      {/* 启动失败错误提示（进度框外） */}
      {error && (!progress || progress.status !== "failed") && (
        <div className={`${styles.errorBox} ${styles.standalone}`}>{error}</div>
      )}
    </section>
  );
}
