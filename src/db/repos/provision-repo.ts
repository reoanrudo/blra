/**
 * provision / provision_version テーブルのリポジトリ。
 *
 * 設計書 §6.1 Citation Anchor、§6.3 Anchor の版間移行、§13.1 物理設計。
 *
 * provision は UNIQUE(source_id, canonical_path) で UPSERT。
 * 同一 canonical_path は provision_id を安定させる（§6.3 版間移行）。
 * provision_version はバッチINSERT（hourei-rag 踏襷、バッチサイズ500）。
 */

import { randomUUID } from "node:crypto";
import type {
  Kysely,
  OnConflictDatabase,
  OnConflictTables,
  OnConflictUpdateBuilder,
  Selectable,
} from "kysely";
import { sql } from "kysely";
import type { Database, ProvisionType } from "../types.js";
import type { ProvisionSegment } from "../../parser/types.js";

// SELECT 結果の型
type Provision = Selectable<Database["provision"]>;
type ProvisionVersion = Selectable<Database["provision_version"]>;

const BATCH_SIZE = 500;

/**
 * provision_type の文字列 → enum 値へのマッピング。
 * Parser の ProvisionType（string union）と DB の provision_type_enum を橋渡し。
 */
function toDbType(type: ProvisionSegment["provisionType"]): ProvisionType {
  return type;
}

/**
 * 単一 provision を UPSERT し、provision_id を返す。
 * 既存（同一 source_id + canonical_path）なら provision_id を再利用（§6.3）。
 */
export async function upsertProvision(
  db: Kysely<Database>,
  sourceId: string,
  segment: ProvisionSegment,
): Promise<string> {
  const result = await db
    .insertInto("provision")
    .values({
      provision_id: randomUUID(),
      source_id: sourceId,
      canonical_path: segment.canonicalPath,
      provision_type: toDbType(segment.provisionType),
      stable_label: segment.stableLabel,
    })
    .onConflict(
      // Kysely 0.27 + TS の #private 名義型問題を回避するため、コールバックの
      // 戻り値型を明示する（doUpdateSet の戻り値を期待される OnConflictUpdateBuilder へ収束）。
      (oc): OnConflictUpdateBuilder<
        OnConflictDatabase<Database, "provision">,
        OnConflictTables<"provision">
      > =>
        oc.columns(["source_id", "canonical_path"]).doUpdateSet({
          stable_label: segment.stableLabel,
          provision_type: toDbType(segment.provisionType),
        }) as OnConflictUpdateBuilder<
          OnConflictDatabase<Database, "provision">,
          OnConflictTables<"provision">
        >,
    )
    .returning("provision_id")
    .executeTakeFirstOrThrow();

  return result.provision_id;
}

export interface ProvisionVersionRowInput {
  provisionId: string;
  sourceVersionId: string;
  segment: ProvisionSegment;
  validFrom: Date | null;
  validFromStatus: "FIXED" | "UNDETERMINED";
}

/**
 * provision_version をバッチINSERTする。
 * バッチサイズ500で分割（hourei-rag 踏襷）。
 */
export async function insertProvisionVersions(
  db: Kysely<Database>,
  rows: ProvisionVersionRowInput[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("provision_version")
      .values(
        batch.map((r) => ({
          provision_version_id: randomUUID(),
          provision_id: r.provisionId,
          source_version_id: r.sourceVersionId,
          citation_anchor: r.segment.citationAnchor,
          heading: r.segment.heading || null,
          body: r.segment.body,
          body_normalized: r.segment.bodyNormalized,
          content_fingerprint: r.segment.contentFingerprint,
          text_quote_prefix: r.segment.textQuotePrefix || null,
          text_quote_suffix: r.segment.textQuoteSuffix || null,
          sequence: r.segment.sequence,
          valid_from: r.validFrom,
          valid_from_status: r.validFromStatus,
        })),
      )
      .execute();
  }
}

// === 参照系クエリ（M4 で追加。Corpus API のデータ元）===

export interface ProvisionWithVersion {
  provision: Provision;
  currentVersion: ProvisionVersion;
}

/**
 * provision 1件を現行版（valid_to IS NULL）とともに取得する。
 * 存在しない場合は undefined。
 *
 * 設計書 §4.2: 現行版は valid_to が NULL の provision_version。
 */
export async function getProvisionCurrentVersion(
  db: Kysely<Database>,
  provisionId: string,
): Promise<ProvisionWithVersion | undefined> {
  const provision = await db
    .selectFrom("provision")
    .selectAll()
    .where("provision_id", "=", provisionId)
    .executeTakeFirst();

  if (!provision) {
    return undefined;
  }

  const currentVersion = await db
    .selectFrom("provision_version")
    .selectAll()
    .where("provision_id", "=", provisionId)
    .where("valid_to", "is", null)
    .orderBy("valid_from", "desc")
    .executeTakeFirst();

  if (!currentVersion) {
    return undefined;
  }

  return { provision, currentVersion };
}

// === SCR-03 法令リーダー向け取得系 ===

export interface ListProvisionsOptions {
  /** sequence の開始位置（0始まり）。省略時は先頭から */
  from?: number;
  /** 取得件数上限。省略時は100 */
  limit?: number;
}

/**
 * 指定 source の provision 一覧を、現行版（valid_to IS NULL）とともに取得する。
 * 法令リーダーが章・条単位で本文を表示するために使う（§19.10.2 条ブロック）。
 *
 * sequence 昇順で返す（Parser が付与した source 内の出現順）。
 * 現行版を持たない provision は除外する（公開済みのみ §5.3）。
 *
 * 設計書 §19.22.2-(4): 本文以外のメタデータを別ペイロードにするため、
 * 本関数は本文テキストのみを含む provision_version を返す（ハイライト・参照等は別途取得）。
 */
export async function listProvisionsWithCurrentVersion(
  db: Kysely<Database>,
  sourceId: string,
  opts: ListProvisionsOptions = {},
): Promise<ProvisionWithVersion[]> {
  const from = Math.max(0, opts.from ?? 0);
  // 上限を常識的な範囲に収める（法令1本全体の取得も許容するが、巨大法令での無制限取得を防ぐ）
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 100));

  // LATERAL JOIN で各 provision の現行版を1件ずつ取得。
  // to_jsonb で列名衝突を回避しつつ provision / currentVersion を分離して返す。
  const rows = await sql<{ provision: Provision; current_version: ProvisionVersion }>`
    SELECT
      to_jsonb(p) AS provision,
      to_jsonb(pv) AS current_version
    FROM provision p
    INNER JOIN LATERAL (
      SELECT *
      FROM provision_version
      WHERE provision_id = p.provision_id
        AND valid_to IS NULL
      ORDER BY valid_from DESC
      LIMIT 1
    ) pv ON TRUE
    WHERE p.source_id = ${sourceId}
    ORDER BY pv.sequence ASC
    OFFSET ${from} LIMIT ${limit}
  `.execute(db);

  return rows.rows.map((r) => ({
    provision: r.provision,
    currentVersion: r.current_version,
  }));
}
