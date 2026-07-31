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
  Selectable,
} from "kysely";
import type { Database } from "../types.js";
import type { LawInfo } from "../../ingest/types.js";

// SELECT 結果の型。Generated<XXX> を解決した実体の型。
type Source = Selectable<Database["source"]>;
type SourceVersion = Selectable<Database["source_version"]>;

/**
 * canonical_uri で source を UPSERT し、source_id を返す。
 * 既存の場合は title 等を更新（改正でタイトルが変わる可能性）。
 *
 * title には通称名（例: 「建築基準法」）を使う。
 * 通称名は e-Gov API の law_revisions レスポンスの revision.law_title に格納されている。
 * lawInfo.law_num（例: 「昭和二十五年法律第二百一号」）は法令番号であり、
 * 人間が法令を識別する名称としては不適切なため title には使わない。
 * law_num は title_kana（よみがな欄）が空の場合のフォールバック識別子として
 * 別途保持できるが、本カラム構成では title に通称名を入れる。
 */
export async function upsertSource(
  db: Kysely<Database>,
  lawInfo: LawInfo,
  lawTitle: string,
): Promise<string> {
  // canonical_uri は設計書 §13.1: "{jurisdiction}/{sourceIdentity}" 形式
  const canonicalUri = `jp/law/${lawInfo.law_id}`;

  const result = await db
    .insertInto("source")
    .values({
      source_id: randomUUID(),
      canonical_uri: canonicalUri,
      title: lawTitle, // 通称名（例: 「建築基準法」）
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
          title: lawTitle,
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

// === 参照系クエリ（M4 で追加。Source Registry API のデータ元）===

/**
 * 取込済み法令（source）一覧を取得する。
 * §5.3 制約: 公開済み版を持つ source のみ返す。
 */
export async function listPublishedSources(
  db: Kysely<Database>,
): Promise<Source[]> {
  return db
    .selectFrom("source")
    .selectAll()
    .where("source_id", "in", (qb) =>
      qb
        .selectFrom("source_version")
        .select("source_id")
        .where("published_at", "is not", null),
    )
    .orderBy("title", "asc")
    .execute();
}

/**
 * source 1件を取得する。
 * 存在しない場合は undefined。
 */
export async function getSourceById(
  db: Kysely<Database>,
  sourceId: string,
): Promise<Source | undefined> {
  return db
    .selectFrom("source")
    .selectAll()
    .where("source_id", "=", sourceId)
    .executeTakeFirst();
}

/**
 * 指定 source の版履歴を取得する。
 * §5.3 制約: 公開済み版（published_at IS NOT NULL）のみ返す。
 */
export async function listPublishedSourceVersions(
  db: Kysely<Database>,
  sourceId: string,
): Promise<SourceVersion[]> {
  return db
    .selectFrom("source_version")
    .selectAll()
    .where("source_id", "=", sourceId)
    .where("published_at", "is not", null)
    .orderBy("recorded_at", "desc")
    .execute();
}

/**
 * source_version 1件を取得する。
 * Publish API・監査で使う。
 */
export async function getSourceVersionById(
  db: Kysely<Database>,
  sourceVersionId: string,
): Promise<SourceVersion | undefined> {
  return db
    .selectFrom("source_version")
    .selectAll()
    .where("source_version_id", "=", sourceVersionId)
    .executeTakeFirst();
}

/**
 * source_version を Publish する（published_at をセット）。
 * 既に Publish 済みの場合は影響なし（冪等）。
 * @returns 更新行数（0 = 対象なし、1 = 更新成功）
 */
export async function publishSourceVersion(
  db: Kysely<Database>,
  sourceVersionId: string,
): Promise<number> {
  const result = await db
    .updateTable("source_version")
    .set({
      published_at: new Date(),
      processing_status: "PUBLISHED",
    })
    .where("source_version_id", "=", sourceVersionId)
    .where("published_at", "is", null)
    .executeTakeFirst();

  return Number(result.numUpdatedRows);
}
