/**
 * エラーレスポンドの正規化。
 *
 * 設計書 §12.2: 全応答は一貫した形式。
 * エラーも同様に { error: { code, message } } 形式で返す。
 */

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

/**
 * エラーレスポンスを組み立てる。
 * Fastify の reply.code(status).send(apiError(reply, code, message)) で使う。
 */
export function apiError(code: string, message: string): ApiErrorResponse {
  return { error: { code, message } };
}

// よく使うエラーコード（設計書には未規定だが、HTTP標準に沿う）

export const NOT_FOUND = (resource: string): ApiErrorResponse =>
  apiError("NOT_FOUND", `${resource}が見つかりません`);

export const VALIDATION_ERROR = (detail: string): ApiErrorResponse =>
  apiError("VALIDATION_ERROR", detail);

export const ALREADY_PUBLISHED = apiError(
  "ALREADY_PUBLISHED",
  "この SourceVersion は既に公開済みです",
);

export const CONFLICT = (detail: string): ApiErrorResponse =>
  apiError("CONFLICT", detail);

export const INTERNAL_ERROR = apiError(
  "INTERNAL_ERROR",
  "内部エラーが発生しました",
);

/**
 * 文字列が UUID 形式かどうかを判定する。
 * DB クエリ前に呼んで、無効な ID の 400/404 を返すために使う。
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}
