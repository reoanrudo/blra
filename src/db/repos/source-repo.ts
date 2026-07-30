/**
 * source / source_version テーブルのリポジトリ。
 *
 * 設計書 §13.1 物理設計、§8.2 冪等性。
 * Kysely の onConflict で UPSERT を実現する。
 */

import { randomUUID } from "node:crypto";
import type {
  Kysely,
  OnConflictDatabase,
  OnConflictTables,
  OnConflictUpdateBuilder,
} from "kysely";
import type { Database } from "../types.js";
import type { LawInfo } from "../../ingest/types.js";

/**
 * canonical_uri で source を UPSERT し、source_id を返す。
 * 既存の場合は title 等を更新（改正でタイトルが変わる可能性）。
 */
export async function upsertSource(
  db: Kysely<Database>,
  lawInfo: LawInfo,
): Promise<string> {
  // canonical_uri は設計書 §13.1: "{jurisdiction}/{sourceIdentity}" 形式
  const canonicalUri = `jp/law/${lawInfo.law_id}`;

  const result = await db
    .insertInto("source")
    .values({
      source_id: randomUUID(),
      canonical_uri: canonicalUri,
      title: lawInfo.law_num, // 法令番号をタイトルの代わり（最も安定した識別子）
      publisher: "日本国",
      authority_class: "PRIMARY_LAW",
      jurisdiction: "jp",
      source_type: "EGOV_LAW",
      status: "ACTIVE",
    })
    .onConflict(
      // Kysely 0.27 + TS の #private 名義型問題を回避するため、コールバックの
      // 戻り値型を明示する（doUpdateSet の戻り値を期待される OnConflictUpdateBuilder へ収束）。
      (oc): OnConflictUpdateBuilder<
        OnConflictDatabase<Database, "source">,
        OnConflictTables<"source">
      > =>
        oc.column("canonical_uri").doUpdateSet({
          title: lawInfo.law_num,
        }) as OnConflictUpdateBuilder<
          OnConflictDatabase<Database, "source">,
          OnConflictTables<"source">
        >,
    )
    .returning("source_id")
    .executeTakeFirstOrThrow();

  return result.source_id;
}

/**
 * content_hash で既存の source_version を検索する。
 * §8.2-1 冪等: 同じ content_hash があれば以降をスキップ。
 */
export async function findSourceVersionByHash(
  db: Kysely<Database>,
  sourceId: string,
  contentHash: string,
): Promise<{ source_version_id: string } | undefined> {
  return db
    .selectFrom("source_version")
    .select("source_version_id")
    .where("source_id", "=", sourceId)
    .where("content_hash", "=", contentHash)
    .executeTakeFirst();
}

export interface CreateSourceVersionParams {
  sourceId: string;
  contentHash: string;
  rawObjectKey: string;
  parserVersion: string;
  validFrom: Date | null;
  validFromStatus: "FIXED" | "UNDETERMINED";
  promulgatedAt: Date | null;
  publishedAt: Date | null;
  processingStatus: string;
}

/**
 * source_version を新規作成する。
 * UNIQUE(source_id, content_hash) 制約で重複を防ぐ。
 */
export async function createSourceVersion(
  db: Kysely<Database>,
  params: CreateSourceVersionParams,
): Promise<string> {
  const result = await db
    .insertInto("source_version")
    .values({
      source_version_id: randomUUID(),
      source_id: params.sourceId,
      content_hash: params.contentHash,
      raw_object_key: params.rawObjectKey,
      parser_version: params.parserVersion,
      consolidation_state: "OFFICIAL_CONSOLIDATED",
      verification_status: "MECHANICAL",
      promulgated_at: params.promulgatedAt,
      valid_from: params.validFrom,
      valid_from_status: params.validFromStatus,
      retrieved_at: new Date(),
      processing_status: params.processingStatus,
      published_at: params.publishedAt,
    })
    .returning("source_version_id")
    .executeTakeFirstOrThrow();

  return result.source_version_id;
}
