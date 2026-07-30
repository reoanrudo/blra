/**
 * e-Gov 法令API v2 クライアント。
 *
 * spike (spikes/src/lib/egov.ts) で実測済みのエンドポイントを本実装へ昇華。
 * 認証不要。設計書 §8.1 Fetcher ステージ、§8.2-5 At-Least-Once。
 *
 * エンドポイント（全て GET、BASE = https://laws.e-gov.go.jp/api/2）:
 *   /law_revisions/{lawId}    → 版一覧（JSON）
 *   /law_data/{revisionId}?response_format=xml  → 法令標準XML全文
 */

import { config } from "../config.js";
import type {
  FetchResult,
  LawInfo,
  LawRevisionsResponse,
  RevisionInfo,
} from "./types.js";

/** e-Gov API 関連のエラー */
export class EgovApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "EgovApiError";
  }
}

const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * HTTP GET をリトライ付きで実行する。
 * 5xx・ネットワークエラーのみリトライ。4xx は即失敗。
 */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });

      // 4xx は即失敗（リトライしない）
      if (res.status >= 400 && res.status < 500) {
        const body = await res.text().catch(() => "");
        throw new EgovApiError(
          `e-Gov API が ${res.status} を返しました: ${body}`,
          res.status,
        );
      }

      // 5xx はリトライ
      if (res.status >= 500) {
        lastError = new EgovApiError(
          `e-Gov API が ${res.status} を返しました`,
          res.status,
        );
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      return res;
    } catch (err) {
      // AbortError（タイムアウト）やネットワークエラーもリトライ対象
      if (err instanceof EgovApiError && err.statusCode && err.statusCode < 500) {
        throw err; // 4xx はリトライしない
      }
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("到達不能");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 法令標準XML の構造をバリデーションする。
 * hourei-rag の fetch-laws.ts と同じチェック。
 */
export function validateXmlStructure(xml: string): void {
  if (!xml.includes("<Law") || !xml.includes("<MainProvision")) {
    throw new EgovApiError(
      "法令標準XMLの構造が不正です（<Law> または <MainProvision> が見つかりません）",
    );
  }
}

/**
 * lawId の現行版（最新 revision）を取得する。
 *
 * 1. /law_revisions/{lawId} → revisions 配列の最初（最新）を取得
 * 2. /law_data/{revisionId}?response_format=xml → XML本文
 * 3. XML構造バリデーション
 */
export async function fetchLawRevision(lawId: string): Promise<FetchResult> {
  const base = config.egovApiBase;

  // 1. 版一覧取得
  const revisionsUrl = `${base}/law_revisions/${lawId}`;
  const revisionsRes = await fetchWithRetry(revisionsUrl);
  const revisionsData = (await revisionsRes.json()) as LawRevisionsResponse;

  if (!revisionsData.revisions || revisionsData.revisions.length === 0) {
    throw new EgovApiError(`lawId ${lawId} の版が見つかりません`);
  }

  // 最新版（配列の最初）を取得
  const revisionInfo: RevisionInfo = revisionsData.revisions[0]!;
  const lawInfo: LawInfo = revisionsData.law_info;

  // 2. 法令本文取得
  const lawDataUrl = `${base}/law_data/${revisionInfo.law_revision_id}?response_format=xml`;
  const lawDataRes = await fetchWithRetry(lawDataUrl);
  const xml = await lawDataRes.text();

  // 3. XML構造バリデーション
  validateXmlStructure(xml);

  return { lawInfo, revisionInfo, xml };
}
