/**
 * 設計書 §12.2「全応答の必須メタデータ」のヘルパー。
 *
 * 全 API 応答は { data, meta } 形式をとる:
 * {
 *   "data": {},
 *   "meta": {
 *     "reference_date": "2026-07-29",
 *     "applicability_anchor": "CONFIRMATION_APPLICATION",
 *     "jurisdiction": "jp/13000",
 *     "corpus_version": "2026-07-29T03:00:00Z",
 *     "request_id": "..."
 *   }
 * }
 *
 * M4 時点での簡易値:
 * - reference_date: リクエスト受領日（YYYY-MM-DD）
 * - applicability_anchor: 固定値 "CONFIRMATION_APPLICATION"（M6以降で本格対応）
 * - jurisdiction: 固定値 "jp"（M6以降で都道府県単位へ拡張）
 * - corpus_version: 最終取込時刻（source_version の最新 recorded_at）
 */

export interface ResponseMeta {
  reference_date: string;
  applicability_anchor: string;
  jurisdiction: string;
  corpus_version: string;
  request_id: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ResponseMeta;
}

/**
 * リクエスト ID を生成する。
 * Fastify のデフォルト id があればそれを使い、なければ UUID を生成する。
 */
export function generateRequestId(existingId?: string): string {
  return existingId ?? crypto.randomUUID();
}

/**
 * 今日の日付を YYYY-MM-DD 形式で返す（JST）。
 */
function todayJst(): string {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/**
 * API 応答を { data, meta } 形式でラップする。
 */
export function wrapResponse<T>(
  data: T,
  requestId: string,
  corpusVersion: string,
): ApiResponse<T> {
  return {
    data,
    meta: {
      reference_date: todayJst(),
      applicability_anchor: "CONFIRMATION_APPLICATION",
      jurisdiction: "jp",
      corpus_version: corpusVersion,
      request_id: requestId,
    },
  };
}
