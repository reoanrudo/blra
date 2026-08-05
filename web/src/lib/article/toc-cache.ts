import type { TocNode } from "@/lib/article/toc-tree";

/**
 * 目次キャッシュ（設計書 §4.2）
 *
 * - キャッシュキー: editionKey + lawRevisionId + lawId
 * - メモリキャッシュ（Map）と sessionStorage の二段階。
 * - 同じRevisionでは再利用し、Edition/Revision変更で別キーになる。
 * - 破損・Schema不一致のキャッシュは破棄してAPIから再取得する。
 */

interface TocCacheEntry {
  editionKey: string;
  lawRevisionId: string;
  lawId: string;
  nodes: TocNode[];
  cachedAt: number;
}

const MEMORY_PREFIX = "toc-mem:";
const SESSION_PREFIX = "toc-session:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24時間

// メモリキャッシュ（タブ内有効）
const memoryCache = new Map<string, TocCacheEntry>();

function buildKey(editionKey: string, lawRevisionId: string, lawId: string): string {
  // キャッシュスキーマのバージョン。構造変更時にインクリメントして
  // 古いキャッシュ（table_struct 含む等）を無効化する。
  const CACHE_VERSION = "v2";
  return `${CACHE_VERSION}:${editionKey}:${lawRevisionId}:${lawId}`;
}

/** TocNode の基本Schema検証。破損データを検出する。 */
function isValidTocNodes(value: unknown): value is TocNode[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false; // 空配列はキャッシュしない（取得中と区別）
  for (const node of value) {
    if (typeof node !== "object" || node === null) return false;
    const n = node as Record<string, unknown>;
    if (typeof n.id !== "string") return false;
    if (typeof n.level !== "string") return false;
    if (typeof n.sortOrder !== "number") return false;
    // table_struct/table を含む古いキャッシュは無効化
    if (n.level === "table_struct" || n.level === "table") return false;
  }
  return true;
}

function isValidEntry(value: unknown): value is TocCacheEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.editionKey === "string" &&
    typeof e.lawRevisionId === "string" &&
    typeof e.lawId === "string" &&
    Array.isArray(e.nodes) &&
    typeof e.cachedAt === "number"
  );
}

/** キャッシュから目次を取得。無ければ null。 */
export function getCachedToc(
  editionKey: string,
  lawRevisionId: string,
  lawId: string,
): TocNode[] | null {
  const key = buildKey(editionKey, lawRevisionId, lawId);

  // 1. メモリキャッシュ
  const memEntry = memoryCache.get(key);
  if (memEntry && Date.now() - memEntry.cachedAt < MAX_AGE_MS) {
    if (isValidTocNodes(memEntry.nodes)) return memEntry.nodes;
    memoryCache.delete(key);
  }

  // 2. sessionStorage（ブラウザ環境またはテストでモックされている場合）
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidEntry(parsed)) {
      sessionStorage.removeItem(SESSION_PREFIX + key);
      return null;
    }
    if (Date.now() - parsed.cachedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(SESSION_PREFIX + key);
      return null;
    }
    if (!isValidTocNodes(parsed.nodes)) {
      sessionStorage.removeItem(SESSION_PREFIX + key);
      return null;
    }
    // メモリキャッシュへ昇格
    memoryCache.set(key, parsed);
    return parsed.nodes;
  } catch {
    // JSONパース失敗も破損データとして削除
    try {
      sessionStorage.removeItem(SESSION_PREFIX + key);
    } catch {
      // ignore
    }
    return null;
  }
}

/** 目次をキャッシュへ保存（メモリ + sessionStorage）。 */
export function setCachedToc(
  editionKey: string,
  lawRevisionId: string,
  lawId: string,
  nodes: TocNode[],
): void {
  if (!isValidTocNodes(nodes)) return;
  const key = buildKey(editionKey, lawRevisionId, lawId);
  const entry: TocCacheEntry = {
    editionKey,
    lawRevisionId,
    lawId,
    nodes,
    cachedAt: Date.now(),
  };
  memoryCache.set(key, entry);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
  } catch {
    // sessionStorage quota / privacy mode — メモリキャッシュのみで継続
  }
}

/** 指定キーのキャッシュを破棄（Revision不一致時など）。 */
export function invalidateCachedToc(
  editionKey: string,
  lawRevisionId: string,
  lawId: string,
): void {
  const key = buildKey(editionKey, lawRevisionId, lawId);
  memoryCache.delete(key);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_PREFIX + key);
  } catch {
    // ignore
  }
}
