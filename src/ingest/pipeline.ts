/**
 * 取込パイプラインのメイン関数。
 *
 * 設計書 §8.1 パイプラインの完成形:
 *   Fetcher → Raw保存 → Hash比較 → Parser → Validation → DB書込 → Publish
 *
 * §8.2-2: Raw Artifact を最初に保存する（Parser が落ちても原本は残す）。
 * §8.2-6: DB書込はトランザクション内で行う。
 *
 * 依存注入: db と fetcher を引数で受け取る。テスト時にモック可能。
 * CLI と将来の HTTP API の両方から呼べる。
 */

import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { parse, PARSER_VERSION } from "../parser/index.js";
import type { ProvisionSegment } from "../parser/types.js";
import { fetchLawRevision } from "./fetcher.js";
import { saveRawArtifact } from "./raw-store.js";
import { computeContentHash } from "./hash.js";
import { deriveValidFrom } from "./valid-from.js";
import { validatePipeline, shouldPublish } from "./validation.js";
import {
  upsertSource,
  findSourceVersionByHash,
  createSourceVersion,
} from "../db/repos/source-repo.js";
import {
  upsertProvision,
  insertProvisionVersions,
} from "../db/repos/provision-repo.js";
import type {
  FetchResult,
  IngestOptions,
  PipelineResult,
} from "./types.js";

/**
 * 法令1版を取込む。
 *
 * @param db Kysely インスタンス
 * @param lawId e-Gov 法令ID（例: "325AC0000000201" = 建築基準法）
 * @param options.fetcher テスト時にモックへ差し替え可能
 * @returns 取込結果
 */
export async function ingestSourceVersion(
  db: Kysely<Database>,
  lawId: string,
  options?: IngestOptions,
): Promise<PipelineResult> {
  const fetcher = options?.fetcher ?? fetchLawRevision;

  // === ステージ1: Fetcher ===
  const fetched: FetchResult = await fetcher(lawId);

  // === ステージ2: source の UPSERT（トランザクション外で source_id を先に確保） ===
  const sourceId = await upsertSource(db, fetched.lawInfo);

  // === ステージ3: content_hash 計算 + Raw保存 ===
  const contentHash = computeContentHash(fetched.xml);
  const rawObjectKey = await saveRawArtifact({
    xml: fetched.xml,
    sourceId,
    contentHash,
  });

  // === ステージ4: Hash比較（冪等性） ===
  const existing = await findSourceVersionByHash(db, sourceId, contentHash);
  if (existing) {
    return {
      status: "SKIPPED",
      sourceId,
      sourceVersionId: existing.source_version_id,
      contentHash,
      segmentCount: 0,
      extractionRate: 0,
      validationErrors: [],
      rawObjectKey,
    };
  }

  // === ステージ5: Parser ===
  const { output, errors: parserErrors } = parse({
    xml: fetched.xml,
    jurisdiction: "jp",
    sourceIdentity: `law/${fetched.lawInfo.law_id}`,
  });

  // === ステージ6: valid_from 導出（§4.2） ===
  const { validFrom, validFromStatus } = deriveValidFrom(fetched.revisionInfo);

  // === ステージ7: Validation ===
  const bodies = output.segments.map((s: ProvisionSegment) => s.body);
  const validationErrors = validatePipeline(output.stats, parserErrors, bodies);
  const willPublish = shouldPublish(validationErrors);

  // === ステージ8: DB書込（トランザクション） ===
  const sourceVersionId = await db.transaction().execute(async (trx) => {
    // source_version 作成
    const promulgatedAt = fetched.lawInfo.promulgation_date
      ? new Date(fetched.lawInfo.promulgation_date)
      : null;

    const newSourceVersionId = await createSourceVersion(trx, {
      sourceId,
      contentHash,
      rawObjectKey,
      parserVersion: PARSER_VERSION,
      validFrom,
      validFromStatus,
      promulgatedAt,
      publishedAt: willPublish ? new Date() : null,
      processingStatus: willPublish ? "PUBLISHED" : "PENDING_REVIEW",
    });

    // provision + provision_version 書込
    const versionRows = output.segments.map((segment) => ({
      provisionId: "", // upsertProvision で埋める
      sourceVersionId: newSourceVersionId,
      segment,
      validFrom,
      validFromStatus,
    }));

    for (let i = 0; i < output.segments.length; i++) {
      versionRows[i]!.provisionId = await upsertProvision(
        trx,
        sourceId,
        output.segments[i]!,
      );
    }

    await insertProvisionVersions(trx, versionRows);

    return newSourceVersionId;
  });

  return {
    status: willPublish ? "INGESTED" : "PENDING_REVIEW",
    sourceId,
    sourceVersionId,
    contentHash,
    segmentCount: output.segments.length,
    extractionRate: output.stats.extractionRate,
    validationErrors,
    rawObjectKey,
  };
}
