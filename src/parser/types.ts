/**
 * e-Gov 法令標準XML Parser の型定義。
 *
 * 設計書 §6.1（Citation Anchor）、§8.1-4（取込パイプライン）、§13.1（物理設計）に対応。
 *
 * M2 の Parser は純関数（XML文字列 → ProvisionSegment[]）。
 * DBアクセス・HTTP取得は行わない（M3 の Fetcher・パイプライン統合で繋ぐ）。
 */

// === ParserVersion ===
// 設計書 §8.2-3: 同じ入力と同じ ParserVersion から同じ出力を得る。
// アルゴリズムを変更した場合はこの値を bump する。
export const PARSER_VERSION = "egov-xml-1.0.0";

// === ProvisionSegment ===
// 設計書 §13.1 の provision + provision_version テーブルへ対応する中間表現。
// Parser は DB の source_id / source_version_id を知らないため、
// citation_anchor の jurisdiction / sourceIdentity 部分は呼び出し側が渡す。

export type ProvisionType =
  | "ARTICLE"
  | "PARAGRAPH"
  | "ITEM"
  | "TABLE"
  | "SUPPLEMENTARY";

export interface ProvisionSegment {
  /** §6.1 形式のパス。art52-2/para1/item3 / suppl:{amendLawId}/art1/para1 / appdx-table-1 */
  canonicalPath: string;
  /** 人間可読な安定ラベル。第52条の2第1項第3号 / 別表第一 */
  stableLabel: string;
  /** ARTICLE / PARAGRAPH / ITEM / TABLE / SUPPLEMENTARY */
  provisionType: ProvisionType;
  /** 条に付く見出し（「（定義）」等）。ない場合は空文字 */
  heading: string;
  /** 原文本文。ルビ（Rt/Rp）は除外済み */
  body: string;
  /** §9.3 正規化済み本文。NFKC + 空白正規化。検索索引と fingerprint の原料 */
  bodyNormalized: string;
  /** §6.1 bodyNormalized の SHA-256 ハッシュ（hex 先頭16文字） */
  contentFingerprint: string;
  /** §6.1 形式: {jurisdiction}/{sourceIdentity}/{canonicalPath} */
  citationAnchor: string;
  /** §6.1 text_quote_selector の前後文脈（正規化本文の先頭32文字） */
  textQuotePrefix: string;
  /** §6.1 text_quote_selector の後文脈（正規化本文の末尾32文字） */
  textQuoteSuffix: string;
  /** Source 内の出現順（0始まり） */
  sequence: number;
  /** 附則の場合、その附則を置いた改正法令番号。本文中の附則でない場合は undefined */
  amendLawNum?: string;
}

// === parse() の入出力 ===

export interface ParseInput {
  /** 法令標準XML 文字列（e-Gov API /law_data の law_full_text 相当） */
  xml: string;
  /** citation_anchor の jurisdiction 部分。例: "jp" */
  jurisdiction: string;
  /** citation_anchor の sourceIdentity 部分。例: "law/325AC0000000201" */
  sourceIdentity: string;
}

export interface ParseStats {
  /** 本文になりうる全テキストの文字数（見出し・番号・目次を除く） */
  totalChars: number;
  /** 全 ProvisionSegment の本文文字数の合計 */
  capturedChars: number;
  /** capturedChars / totalChars */
  extractionRate: number;
}

export interface ParseOutput {
  parserVersion: string;
  segments: ProvisionSegment[];
  stats: ParseStats;
}

// === Validation エラー ===
// 設計書 §8.3 の検証項目のうち、Parser が出力時に検査できるもの。

export interface ValidationError {
  level: "error" | "warning";
  message: string;
}

export interface ParseResult {
  output: ParseOutput;
  errors: ValidationError[];
}
