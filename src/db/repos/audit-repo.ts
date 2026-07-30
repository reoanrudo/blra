/**
 * audit_record テーブルのリポジトリ。
 *
 * 設計書 §12.4 監査:
 *   追記専用（append-only）。監査対象は SourceVersion 登録・Publish、
 *   Source Metadata 変更等。
 *   機密本文を Audit Payload へ無制限に複製しない（ハッシュで代替）。
 *
 * M4 時点では認証未実装のため actor_id / organization_id は NULL で記録する。
 * M5（OIDC 認証基盤）で拡張する。
 */

import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../types.js";

// SELECT 結果の型
type AuditRecord = Selectable<Database["audit_record"]>;

export interface InsertAuditRecordParams {
  /** 監査アクション（例: "PUBLISH", "INGEST", "METADATA_CHANGE"）。 */
  action: string;
  /** 監査対象のリソース種別（例: "source_version", "source"）。 */
  resourceType: string;
  /** 監査対象のリソースID。 */
  resourceId?: string | null;
  /** 変更前ハッシュ（本文を複製せずハッシュで代替。§12.4）。 */
  beforeHash?: string | null;
  /** 変更後ハッシュ。 */
  afterHash?: string | null;
  /** Correlation ID（リクエスト横断追跡用。§14.5）。 */
  correlationId?: string | null;
  /** クライアントコンテキスト（任意の JSON）。 */
  clientContext?: unknown | null;
}

/**
 * 監査レコードを追記する。
 * actor_id / organization_id は M4 時点では常に NULL（M5 で認証導入時に拡張）。
 */
export async function insertAuditRecord(
  db: Kysely<Database>,
  params: InsertAuditRecordParams,
): Promise<string> {
  const result = await db
    .insertInto("audit_record")
    .values({
      audit_id: randomUUID(),
      occurred_at: new Date(),
      actor_id: null,
      organization_id: null,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId ?? null,
      before_hash: params.beforeHash ?? null,
      after_hash: params.afterHash ?? null,
      correlation_id: params.correlationId ?? null,
      client_context: params.clientContext ?? null,
    })
    .returning("audit_id")
    .executeTakeFirstOrThrow();

  return result.audit_id;
}

export interface AuditQueryFilters {
  /** 期間開始（指定時刻以降のレコードを取得）。 */
  from?: Date;
  /** 期間終了（指定時刻以前のレコードを取得）。 */
  to?: Date;
  /** アクションで絞り込み（例: "PUBLISH"）。 */
  action?: string;
  /** リソース種別で絞り込み（例: "source_version"）。 */
  resourceType?: string;
  /** リソースIDで絞り込み。 */
  resourceId?: string;
  /** 取得件数上限（デフォルト100）。 */
  limit?: number;
}

/**
 * 監査レコードを検索する。
 * GET /admin/audit のデータ元。
 * 機密本文は出さずハッシュ参照（§12.4・SCR-13）。
 */
export async function queryAuditRecords(
  db: Kysely<Database>,
  filters: AuditQueryFilters = {},
): Promise<AuditRecord[]> {
  const limit = Math.min(filters.limit ?? 100, 500);

  let query = db.selectFrom("audit_record").selectAll().limit(limit);

  if (filters.from) {
    query = query.where("occurred_at", ">=", filters.from);
  }
  if (filters.to) {
    query = query.where("occurred_at", "<=", filters.to);
  }
  if (filters.action) {
    query = query.where("action", "=", filters.action);
  }
  if (filters.resourceType) {
    query = query.where("resource_type", "=", filters.resourceType);
  }
  if (filters.resourceId) {
    query = query.where("resource_id", "=", filters.resourceId);
  }

  return query.orderBy("occurred_at", "desc").execute();
}
