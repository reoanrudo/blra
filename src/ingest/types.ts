/**
 * 取込パイプラインの型定義。
 * Fetcher / RawStore / Validation / Pipeline が共有する。
 * 設計書 §8.1（パイプライン）、§4.2（法令時間モデル）に対応。
 */

// === e-Gov API レスポンスの型 ===
// spike/src/lib/egov.ts の RevisionInfo / LawInfo と同じ構造。
// M3 の Fetcher は JSON モード（law_revisions）と XML モード（law_data）を使う。

export interface LawInfo {
  law_type: string;
  law_id: string;
  law_num: string;
  promulgation_date: string;
}

export interface RevisionInfo {
  law_revision_id: string;
  law_title: string;
  /** 施行日。この版が効力を持ち始める日（設計書 §4.2 valid_from） */
  amendment_enforcement_date?: string;
  /** 施行予定日。施行日が未確定の場合のみ入る（§4.2 valid_from_status = UNDETERMINED） */
  amendment_scheduled_enforcement_date?: string;
  amendment_promulgate_date?: string;
  amendment_law_id?: string;
  amendment_law_num?: string;
  amendment_type?: string;
  current_revision_status?: string;
  repeal_status?: string;
  repeal_date?: string | null;
}

/** law_revisions API のレスポンス */
export interface LawRevisionsResponse {
  law_info: LawInfo;
  revisions: RevisionInfo[];
}

// === Fetcher の入出力 ===

export interface FetchResult {
  lawInfo: LawInfo;
  revisionInfo: RevisionInfo;
  /** 法令標準XML 全文（response_format=xml の生文字列） */
  xml: string;
}

// === パイプラインの入出力 ===

export interface IngestOptions {
  /** Fetcher 関数。テスト時にモックへ差し替えるため依存注入。 */
  fetcher?: (lawId: string) => Promise<FetchResult>;
}

export type IngestStatus = "INGESTED" | "SKIPPED" | "PENDING_REVIEW";

export interface PipelineResult {
  status: IngestStatus;
  sourceId: string;
  sourceVersionId: string;
  contentHash: string;
  segmentCount: number;
  extractionRate: number;
  validationErrors: { level: "error" | "warning"; message: string }[];
  rawObjectKey: string;
}

// === valid_from 導出の結果 ===
// 設計書 §4.2: amendment_enforcement_date → FIXED、
// amendment_scheduled_enforcement_date → UNDETERMINED、どちらも無し → UNDETERMINED

export interface ValidFromResult {
  validFrom: Date | null;
  validFromStatus: "FIXED" | "UNDETERMINED";
}
