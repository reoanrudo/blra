/**
 * 法令一覧のクライアントキャッシュ（計画書 Task 14 Step 5）。
 *
 * session cache（5分）と corpus-version invalidation を組み合わせる。
 * - メモリキャッシュ + sessionStorage に {corpusVersion, cachedAt, laws} を保存
 * - 5分を超えたら最新を取得し、corpusVersion が変わっていれば cache を置換する
 * - corpusVersion は120件の (lawId, currentRevisionId) を掲載順で SHA-256 化した値
 *   法令更新時に変わり、表示が最新版へ切り替わる
 *
 * 古い firstArticleId へ遷移しても Task 13 の後継解決が最終防御になる。
 */

import type { LawListItem } from "@/lib/law-book/law-list";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

/** /api/laws の応答型。 */
export interface LawListResponse {
  editionKey: string;
  corpusVersion: string;
  laws: LawListItem[];
}

/** sessionStorage / メモリに保存するエントリ。 */
interface CachedLawListEntry {
  editionKey: string;
  corpusVersion: string;
  laws: LawListItem[];
  cachedAt: number;
}

/** キャッシュの有効期間（ミリ秒）。5分。 */
const CACHE_TTL_MS = 5 * 60 * 1000;

const LAW_LIST_SESSION_KEY = "law-list-cache-v2";

// ─── メモリキャッシュ（同一ページロード内で共有） ───
let lawListMemoryCache: CachedLawListEntry | null = null;
const lawListRequestCache = new Map<string, Promise<LawListResponse>>();

/**
 * sessionStorage からキャッシュを読み込む。
 * editionKey 不一致・schema 違反・破損データは破棄して null を返す。
 */
function loadLawListFromSession(): CachedLawListEntry | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LAW_LIST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedLawListEntry>;
    if (
      parsed.editionKey === CURRENT_LAW_BOOK_EDITION_KEY &&
      typeof parsed.corpusVersion === "string" &&
      Array.isArray(parsed.laws) &&
      parsed.laws.length > 0 &&
      typeof parsed.cachedAt === "number"
    ) {
      return parsed as CachedLawListEntry;
    }
  } catch {
    // 破損データは利用できないため読み直す。
  }
  return null;
}

function saveLawListToSession(entry: CachedLawListEntry): void {
  if (entry.laws.length === 0) return;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(LAW_LIST_SESSION_KEY, JSON.stringify(entry));
  } catch {
    // private mode 等ではメモリキャッシュだけを使う。
  }
}

function isFresh(entry: CachedLawListEntry, now: number): boolean {
  return now - entry.cachedAt < CACHE_TTL_MS;
}

/** テスト用: メモリキャッシュとリクエストキャッシュを破棄する。 */
export function clearLawListClientCache(): void {
  lawListMemoryCache = null;
  lawListRequestCache.clear();
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(LAW_LIST_SESSION_KEY);
    } catch {
      // 削除失敗は閲覧を妨げない。
    }
  }
}

/** テスト用: 時刻を注入可能にするための既定の clock。 */
function defaultNow(): number {
  return Date.now();
}

interface FetchOptions {
  /** fetch 実装（テスト用注入）。 */
  fetcher?: typeof fetch;
  /** 現在時刻を返す関数（テスト用注入）。 */
  now?: () => number;
}

/**
 * 法令一覧を取得する。
 *
 * 1. メモリキャッシュ → sessionStorage の順で新鮮なキャッシュ（5分以内）を探す
 * 2. 新鮮なキャッシュがあれば即座に返す
 * 3. キャッシュがない、または期限切れの場合はAPIへfetchする
 * 4. 取得結果の corpusVersion が変わっていれば cache を置換する
 *
 * 同一リクエスト中の重複 fetch を防ぐため lawListRequestCache を使う。
 */
export function loadLawList(
  options: FetchOptions = {},
): Promise<LawListItem[]> {
  const now = (options.now ?? defaultNow)();
  const fetcher = options.fetcher ?? fetch;

  // 1. 新鮮なキャッシュがあれば即返す
  if (lawListMemoryCache && isFresh(lawListMemoryCache, now)) {
    return Promise.resolve(lawListMemoryCache.laws);
  }
  const session = loadLawListFromSession();
  if (session && isFresh(session, now)) {
    lawListMemoryCache = session;
    return Promise.resolve(session.laws);
  }

  // 2. 期限切れまたは未キャッシュなら fetch する
  return fetchLawList(fetcher, now).then((response) => response.laws);
}

async function fetchLawList(
  fetcher: typeof fetch,
  now: number,
): Promise<LawListResponse> {
  const key = CURRENT_LAW_BOOK_EDITION_KEY;
  const pending = lawListRequestCache.get(key);
  if (pending) return pending;

  const request = fetcher("/api/laws").then(async (response) => {
    if (!response.ok) {
      throw new Error("法令一覧を取得できませんでした");
    }
    const data = (await response.json()) as LawListResponse | LawListItem[];
    // 配列のみの古い応答形式も許容する（corpusVersion なし）。
    if (Array.isArray(data)) {
      const entry: CachedLawListEntry = {
        editionKey: CURRENT_LAW_BOOK_EDITION_KEY,
        corpusVersion: "",
        laws: data,
        cachedAt: now,
      };
      lawListMemoryCache = entry;
      saveLawListToSession(entry);
      return {
        editionKey: CURRENT_LAW_BOOK_EDITION_KEY,
        corpusVersion: "",
        laws: data,
      };
    }
    // corpusVersion が変わっていれば cache を置換する。
    // 同一 version でも cachedAt を更新して新鮮扱いにする。
    const entry: CachedLawListEntry = {
      editionKey: data.editionKey,
      corpusVersion: data.corpusVersion,
      laws: data.laws,
      cachedAt: now,
    };
    lawListMemoryCache = entry;
    saveLawListToSession(entry);
    return {
      editionKey: data.editionKey,
      corpusVersion: data.corpusVersion,
      laws: data.laws,
    };
  });

  lawListRequestCache.set(key, request);
  // 成功・失敗どちらでも完了後に requestCache から除去し、次回は必ず最新を
  // 取得できるようにする（5分TTLは memory/session cache 側で判定する）。
  // ただし失敗時の unhandled rejection を防ぐため catch も併用する。
  const cleanup = () => {
    if (lawListRequestCache.get(key) === request) {
      lawListRequestCache.delete(key);
    }
  };
  request.then(cleanup, cleanup);
  return request;
}

export type { LawListItem };
