/**
 * Kysely の型定義。
 * データベースの全テーブルの Row 型を定義する。
 * マイグレーションでテーブルを追加・変更した場合は、ここも更新する。
 *
 * 設計書 §13.1（物理設計）に対応。
 */

import type { Generated } from "kysely";

// === enum のコード値 ===
// 設計書 §5.2, §4.2, §6.3, §7.2, §8.4 から集約

export type AuthorityClass =
  | "PRIMARY_LAW"
  | "CABINET_ORDER"
  | "MINISTERIAL_ORDINANCE"
  | "NOTIFICATION"
  | "LOCAL_ORDINANCE"
  | "LOCAL_RULE"
  | "OFFICIAL_GUIDANCE"
  | "ADMINISTRATIVE_REFERENCE"
  | "SECONDARY_COMMENTARY";

export type SourceType =
  | "EGOV_LAW"
  | "NOTIFICATION_HTML"
  | "NOTIFICATION_TEXT_PDF"
  | "NOTIFICATION_IMAGE_PDF"
  | "LOCAL_RULE";

export type ConsolidationState =
  | "OFFICIAL_CONSOLIDATED"
  | "OFFICIAL_AS_ENACTED"
  | "OFFICIAL_AMENDMENT"
  | "DERIVED_CONSOLIDATED"
  | "UNKNOWN";

export type VerificationStatus =
  | "UNVERIFIED"
  | "MECHANICAL"
  | "HUMAN_REVIEWED"
  | "GAZETTE_VERIFIED";

export type ValidFromStatus = "FIXED" | "UNDETERMINED" | "ESTIMATED";

export type ProvisionType =
  | "ARTICLE"
  | "PARAGRAPH"
  | "ITEM"
  | "TABLE"
  | "SUPPLEMENTARY";

export type EdgeType =
  | "CITES"
  | "DELEGATES_TO"
  | "APPLIES_MUTATIS_MUTANDIS"
  | "DEFINES"
  | "EXCEPTS";

// === Row 型 ===

export interface SourceRow {
  source_id: string;
  canonical_uri: string;
  title: string;
  title_kana: string | null;
  abbrev: string[] | null;
  publisher: string;
  authority_class: AuthorityClass;
  jurisdiction: string;
  source_type: SourceType;
  coverage_from: Date | null;
  status: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SourceVersionRow {
  source_version_id: string;
  source_id: string;
  content_hash: string;
  raw_object_key: string;
  normalized_object_key: string | null;
  parser_version: string;
  consolidation_state: ConsolidationState;
  verification_status: VerificationStatus;
  promulgated_at: Date | null;
  valid_from: Date | null;
  valid_from_status: ValidFromStatus;
  valid_to: Date | null;
  retrieved_at: Date;
  recorded_at: Generated<Date>;
  published_at: Date | null;
  processing_status: string;
}

export interface ProvisionRow {
  provision_id: string;
  source_id: string;
  canonical_path: string;
  provision_type: ProvisionType;
  stable_label: string;
  created_at: Generated<Date>;
}

export interface ProvisionVersionRow {
  provision_version_id: string;
  provision_id: string;
  source_version_id: string;
  citation_anchor: string;
  heading: string | null;
  body: string;
  body_normalized: string;
  content_fingerprint: string;
  text_quote_prefix: string | null;
  text_quote_suffix: string | null;
  sequence: number;
  valid_from: Date | null;
  valid_from_status: ValidFromStatus;
  valid_to: Date | null;
}

export interface AuditRecordRow {
  audit_id: string;
  occurred_at: Date;
  actor_id: string | null;
  organization_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_hash: string | null;
  after_hash: string | null;
  correlation_id: string | null;
  client_context: unknown | null;
}

export interface IngestionJobRow {
  job_id: string;
  source_id: string;
  job_type: string;
  status: string;
  idempotency_key: string;
  parser_version: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  error_detail: string | null;
  created_at: Date;
}

// === Database 型（Kysely が全テーブルの集合として扱う）===

export interface Database {
  source: SourceRow;
  source_version: SourceVersionRow;
  provision: ProvisionRow;
  provision_version: ProvisionVersionRow;
  audit_record: AuditRecordRow;
  ingestion_job: IngestionJobRow;
}
