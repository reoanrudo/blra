/**
 * バックエンドAPIレスポンスの型定義。
 *
 * src/http/meta.ts（wrapResponse）・src/http/errors.ts（apiError）・
 * src/db/types.ts（Database Row 型）と整合する。
 * バックエンドの型定義が正本だが、フロントは API JSON シェイプに合わせる。
 */

// === API ラッパー形式（src/http/meta.ts と整合） ===

export interface ResponseMeta {
  /** YYYY-MM-DD（JST） */
  reference_date: string;
  /** 固定 "CONFIRMATION_APPLICATION"（Phase 2 では常にこの値） */
  applicability_anchor: string;
  /** 固定 "jp" */
  jurisdiction: string;
  /** source_version の最新 recorded_at */
  corpus_version: string;
  /** リクエストID */
  request_id: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ResponseMeta;
}

// === エラーレスポンス（src/http/errors.ts と整合） ===

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

// === enum 型（src/db/types.ts と整合） ===

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

export type ResolutionStatus = "RESOLVED" | "UNCONFIRMED" | "UNRESOLVED";

export type RoleEnum =
  | "ORGANIZATION_ADMIN"
  | "RESEARCHER"
  | "REVIEWER"
  | "CORPUS_EDITOR"
  | "SYSTEM_ADMIN";

// === ドメインエンティティ（API JSON シェイプ） ===

/** GET /sources の配列要素 */
export interface SourceListItem {
  source_id: string;
  canonical_uri: string;
  title: string;
  abbrev: string[] | null;
  authority_class: AuthorityClass;
  jurisdiction: string;
  source_type: SourceType;
}

/** GET /sources/:id の戻り値（メタデータ拡張） */
export interface SourceDetail {
  source_id: string;
  canonical_uri: string;
  title: string;
  title_kana: string | null;
  abbrev: string[] | null;
  publisher: string;
  authority_class: AuthorityClass;
  jurisdiction: string;
  source_type: SourceType;
  status: string;
}

/** GET /sources/:id/versions の配列要素 */
export interface SourceVersion {
  source_version_id: string;
  content_hash: string;
  parser_version: string;
  consolidation_state: ConsolidationState;
  verification_status: VerificationStatus;
  promulgated_at: string | null;
  valid_from: string | null;
  valid_from_status: ValidFromStatus;
  valid_to: string | null;
  retrieved_at: string;
  published_at: string | null;
}

/** provision_version 部分（GET /sources/:id/provisions と GET /provisions/:id で共通） */
export interface ProvisionVersionData {
  provision_version_id: string;
  heading: string | null;
  body: string;
  citation_anchor: string;
  content_fingerprint: string;
  sequence: number;
  valid_from: string | null;
  valid_from_status: ValidFromStatus;
  valid_to: string | null;
}

/** GET /sources/:id/provisions の配列要素 */
export interface ProvisionWithVersion {
  provision_id: string;
  source_id: string;
  canonical_path: string;
  provision_type: ProvisionType;
  stable_label: string;
  version: ProvisionVersionData;
}

/** GET /provisions/:id/references の配列要素 */
export interface ReferenceEdge {
  edge_id: string;
  target_provision_id: string | null;
  target_label: string;
  edge_type: EdgeType;
  resolution_status: ResolutionStatus;
  source_text_span: { start: number; end: number } | null;
}

// === /me（認証状態確認） ===

export interface CurrentUser {
  user_id: string;
  display_name: string;
  organization_id: string;
  roles: RoleEnum[];
}
