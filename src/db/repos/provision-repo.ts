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
} from "kysely";
import type { Database, ProvisionType } from "../types.js";
import type { ProvisionSegment } from "../../parser/types.js";

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
