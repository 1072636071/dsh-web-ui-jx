/**
 * webp-duration — webp 动画时长解析（纯逻辑，零依赖）。
 *
 * 解析 RIFF/WEBP 容器：遍历 chunk 找 ANMF（动画帧），累加每帧 24-bit LE
 * 时长（ms）得动画总时长。循环态素材（loopCount=0）同样累加单圈总时长。
 *
 * 工单 20-01：优先读构建期生成的时长 manifest（assets/manifest.json，随 client
 * bundle 内联）——命中则零整文件下载直接返回时长；缺项回落 `parseWebpDurationMs`
 * 实时解析（默认抓取器 fetch 素材字节）。manifest 键 = 素材相对路径
 * `character/<file>.webp`（`/api/dsh-jx/<子路径>` URL 一一对应）。
 *
 * 用途：过渡段播放推进（CharacterOverlay 用 setTimeout 推进）需要素材真实
 * 时长——固定 800ms 只覆盖真实时长的 15–23%，动画被截断。播放期解析后
 * 以真实时长推进（失败回退 800ms 兜底）。
 *
 * ADR-0017 可重入：模块级 `durationCache` 是全局单例，另导出 `clearDurationCache`
 * 作为清理入口，client 半区 dispose 时调用（见 src/client/index.ts）。
 *
 * @module dsh-web-ui-jx/client
 */

import durationManifestData from "../../assets/manifest.json";

/** 构建期固化的素材时长 manifest（键 `character/<file>.webp` → 动画总时长 ms）. */
const DURATION_MANIFEST: Readonly<Record<string, number>> =
  durationManifestData as Record<string, number>;

/** 素材路由前缀（host 半区 /api/dsh-jx/*；manifest 键与其 `/<子路径>` 对应）. */
const ASSET_ROUTE_PREFIX = "/api/dsh-jx/";

/** 素材 URL → manifest 键；非素材路由 URL 返回 undefined（走回落逻辑）. */
function manifestKeyForUrl(url: string): string | undefined {
  return url.startsWith(ASSET_ROUTE_PREFIX)
    ? url.slice(ASSET_ROUTE_PREFIX.length)
    : undefined;
}

/** 24-bit LE 读取. */
function readUInt24(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
  );
}

/** 32-bit LE 读取. */
function readUInt32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  );
}

/** 检查 offset 起 4 字节是否等于 fourCC（latin1 常量比较）. */
function fourCC(bytes: Uint8Array, offset: number, tag: string): boolean {
  return (
    bytes[offset] === tag.charCodeAt(0) &&
    bytes[offset + 1] === tag.charCodeAt(1) &&
    bytes[offset + 2] === tag.charCodeAt(2) &&
    bytes[offset + 3] === tag.charCodeAt(3)
  );
}

/**
 * 解析 webp 动画总时长（所有帧时长累加，ms）。
 *
 * @param bytes - 完整 webp 文件字节。
 * @returns 动画总时长 ms；非 webp / 非动画 / 损坏（截断或越界）返回 null。
 */
export function parseWebpDurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 12) return null;
  if (!fourCC(bytes, 0, "RIFF") || !fourCC(bytes, 8, "WEBP")) return null;

  const end = Math.min(bytes.length, 8 + readUInt32(bytes, 4));
  let offset = 12;
  let totalMs = 0;
  let frames = 0;

  while (offset + 8 <= end) {
    const size = readUInt32(bytes, offset + 4);
    const payload = offset + 8;
    if (payload + size > end) return null; // 截断 chunk
    if (fourCC(bytes, offset, "ANMF")) {
      // ANMF payload：x(3) y(3) w(3) h(3) duration(3, 24-bit LE ms) flags(1) + data
      if (size < 16) return null;
      totalMs += readUInt24(bytes, payload + 12);
      frames += 1;
    }
    offset = payload + size + (size & 1);
  }

  return frames > 0 ? totalMs : null;
}

/** 素材 URL → 时长缓存（Map 值含 null：失败同样缓存，避免重复请求）. */
const durationCache = new Map<string, Promise<number | null>>();

/**
 * 清空时长缓存（ADR-0017 可重入清理入口）。client 半区 dispose 时调用；
 * manifest 命中的时长不经由此缓存，清空仅回收实时解析结果占用的缓存。
 */
export function clearDurationCache(): void {
  durationCache.clear();
}

/** 默认素材抓取器（浏览器 fetch，同源素材路由）. */
async function defaultFetcher(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * 加载并解析素材动画时长（带缓存）。
 *
 * - 同 URL 只请求一次，结果（含失败 null）缓存。
 * - 请求失败或解析失败返回 null，由调用方回退默认时长。
 *
 * @param url - 素材 URL（同源素材路由）。
 * @param fetcher - 字节抓取器（测试可注入；默认浏览器 fetch）。
 * @returns 动画总时长 ms；失败返回 null。
 */
export function loadWebpDurationMs(
  url: string,
  fetcher: (url: string) => Promise<Uint8Array> = defaultFetcher,
): Promise<number | null> {
  // 工单 20-01：manifest 优先（零整文件下载）；缺项回落实时解析。
  // manifest 是权威快照，命中直接返回、不经 durationCache（故 clearDurationCache
  // 只回收实时解析结果占用的缓存，与上方注释一致）。
  const manifestKey = manifestKeyForUrl(url);
  if (manifestKey !== undefined) {
    const manifestMs = DURATION_MANIFEST[manifestKey];
    if (manifestMs !== undefined) {
      return Promise.resolve(manifestMs);
    }
  }

  const cached = durationCache.get(url);
  if (cached !== undefined) return cached;
  const promise = fetcher(url)
    .then((bytes) => parseWebpDurationMs(bytes))
    .catch(() => null);
  durationCache.set(url, promise);
  return promise;
}
