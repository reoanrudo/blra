/**
 * バックエンドAPIの fetch wrapper。
 *
 * Vite dev proxy（vite.config.ts）で同一オリジン化済み。
 * credentials: "same-origin" により Cookie（SameSite=Lax httpOnly）が付く。
 *
 * 戻り値 ApiResult<T> で成功・失敗を明示:
 *   成功: { ok: true; data; meta }
 *   失敗: { ok: false; error: { status; code; message } }
 *
 * スローしない設計。呼び出し側（TanStack Query）がパターンマッチで処理する。
 */

import type { ApiResponse, ApiErrorResponse } from "./types";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta: ApiResponse<T>["meta"];
}

export interface ApiFailure {
  ok: false;
  error: {
    /** HTTP ステータスコード */
    status: number;
    /** バックエンドのエラーコード（NOT_FOUND / UNAUTHORIZED / 等） */
    code: string;
    /** ユーザ向けメッセージ */
    message: string;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/**
 * GET リクエストを送り、ApiResult を返す。
 * ネットワークエラーや JSON パース失敗も ApiFailure に変換する（スローしない）。
 */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });

    // 204 No Content 等の空ボディ対策
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      // バックエンドのエラーレスポンス形式を期待
      const errBody = json as ApiErrorResponse | null;
      return {
        ok: false,
        error: {
          status: res.status,
          code: errBody?.error?.code ?? "UNKNOWN",
          message:
            errBody?.error?.message ??
            `リクエストが失敗しました（${res.status}）`,
        },
      };
    }

    const body = json as ApiResponse<T>;
    return {
      ok: true,
      data: body.data,
      meta: body.meta,
    };
  } catch (err) {
    // ネットワークエラー・JSON パース失敗
    return {
      ok: false,
      error: {
        status: 0,
        code: "NETWORK_ERROR",
        message:
          err instanceof Error
            ? `通信エラー: ${err.message}`
            : "通信エラーが発生しました",
      },
    };
  }
}
