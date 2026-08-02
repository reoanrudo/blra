import type { ChapterArticle } from "@/lib/article/article";

/**
 * 条文本文のクライアントキャッシュ（設計書§4.3）
 *
 * - キャッシュキー: lawRevisionId + chapterKey
 * - 本文と利用者データを分離（設計書§4.3: 利用者データは共有キャッシュへ保存しない）
 * - 同じ章の取得済みArticleは保持し、戻ったとき再取得しない
 * - Revision不一致時は破棄
 */

interface ChapterDataEntry {
  lawRevisionId: string;
  chapterKey: string;
  articles: ChapterArticle[];
  cachedAt: number;
}

const MAX_AGE_MS = 30 * 60 * 1000; // 30分
const memoryCache = new Map<string, ChapterDataEntry>();

function buildKey(lawRevisionId: string, chapterKey: string): string {
  return `${lawRevisionId}:${chapterKey}`;
}

/** 章データキャッシュからArticle群を取得 */
export function getCachedChapterData(
  lawRevisionId: string,
  chapterKey: string,
): ChapterArticle[] | null {
  const key = buildKey(lawRevisionId, chapterKey);
  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.cachedAt < MAX_AGE_MS) return entry.articles;
  if (entry) memoryCache.delete(key);
  return null;
}

/** 章データをキャッシュへ保存 */
export function setCachedChapterData(
  lawRevisionId: string,
  chapterKey: string,
  articles: ChapterArticle[],
): void {
  memoryCache.set(buildKey(lawRevisionId, chapterKey), {
    lawRevisionId,
    chapterKey,
    articles,
    cachedAt: Date.now(),
  });
}

/** 指定キーのキャッシュを破棄（Revision不一致時など） */
export function invalidateCachedChapterData(
  lawRevisionId: string,
  chapterKey: string,
): void {
  memoryCache.delete(buildKey(lawRevisionId, chapterKey));
}
