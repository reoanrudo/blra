import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { getFullLawDocument } from "@/lib/article/full-law-repository";
import type { FullLawDocument } from "@/lib/article/full-law-document";
// HMRトリガー用コメント（キャッシュクリア）

/**
 * 法令全文ドキュメントのサーバーサイドメモリキャッシュ。
 *
 * revisionId は不変（法令リビジョンが変わらない限り同じ値）なので、一度生成した
 * JSON body / gzip 圧縮済みペイロード / ETag ダイジェストをモジュール単位で
 * キャッシュし、2回目以降のリクエストでは DB 取得・JSON.stringify・gzip 圧縮を
 * すべてスキップする。
 *
 * レスポンス構造・ヘッダー・ETag ロジックは一切変更しない（呼び出し側がそのまま使用）。
 */
export type CachedDocument = {
  /** JSON.stringify 済みの生 body 文字列 */
  body: string;
  /** gzip 圧縮済みペイロード（Uint8Array として扱い、Response に渡す） */
  gzipBody: Uint8Array;
  /** body の sha256 ダイジェスト */
  digest: string;
};

const documentCache = new Map<string, CachedDocument>();
const inFlight = new Map<string, Promise<CachedDocument | null>>();

/** キャッシュエントリの安全弁（法令リビジョンは高々数十件なので滅多に発火しない） */
const MAX_CACHE_ENTRIES = 64;

function trimCacheIfNeeded(): void {
  if (documentCache.size > MAX_CACHE_ENTRIES) {
    const oldest = documentCache.keys().next();
    if (!oldest.done) documentCache.delete(oldest.value);
  }
}

async function buildCachedDocument(
  revisionId: string,
): Promise<CachedDocument | null> {
  const document: FullLawDocument | null =
    await getFullLawDocument(revisionId);
  if (!document) return null;

  const body = JSON.stringify(document);
  const gzipBody = gzipSync(body);
  const digest = createHash("sha256").update(body).digest("hex");

  const entry: CachedDocument = { body, gzipBody, digest };
  documentCache.set(revisionId, entry);
  trimCacheIfNeeded();
  return entry;
}

/**
 * 同一 revisionId への並列リクエストが同時に DB 取得を走らせないよう、
 * Promise を共有して dedup する。
 */
export async function getOrBuildCachedDocument(
  revisionId: string,
): Promise<CachedDocument | null> {
  const cached = documentCache.get(revisionId);
  if (cached) return cached;

  let promise = inFlight.get(revisionId);
  if (!promise) {
    promise = buildCachedDocument(revisionId).finally(() => {
      inFlight.delete(revisionId);
    });
    inFlight.set(revisionId, promise);
  }
  return promise;
}

/**
 * キャッシュの無効化。
 * 法令データの再取り込み後に呼ぶことを想定。revisionId を省略すると全件クリア。
 */
export function invalidateDocumentCache(revisionId?: string): void {
  if (revisionId) {
    documentCache.delete(revisionId);
  } else {
    documentCache.clear();
  }
}
