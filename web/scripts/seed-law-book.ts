#!/usr/bin/env npx tsx
/**
 * 2026年版のEdition・Entry・公式Revisionを再実行可能な形でDBへ登録する。
 *
 * Usage: npx tsx scripts/seed-law-book.ts
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  LAW_BOOK_2026,
  LAW_BOOK_EDITION_2026,
  lawCategoryFromEgovId,
  officialLawDataUrl,
} from "./law-book-2026";
import { LAWS } from "./laws-config";
import { enforceLawBookScope } from "./lib/enforce-law-book-scope";
import { seedVerifiedExcerptRanges } from "./lib/seed-verified-excerpt-ranges";
import { shouldInitializeCurrentRevision } from "../src/lib/law-book/catalog-maintenance";

const DATA_DIR = path.join(
  __dirname,
  "..",
  "spikes",
  "001-xml-parse",
  "data",
  "law-book-2026",
);
const EDITION_ID = "edition_ksk_2026";
const PACKAGE_ID = "pkg_lawbook_2026";

interface OfficialMetadata {
  lawInfo: {
    lawId: string;
    lawType: string;
    promulgationDate: string | null;
  };
  revisionInfo: {
    revisionId: string;
    title: string;
    enforcementDate: string | null;
    repealStatus: string;
  };
}

interface LawRow {
  id: string;
  currentRevisionId: string | null;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchOfficialMetadata(egovLawId: string): Promise<OfficialMetadata> {
  const url = `https://laws.e-gov.go.jp/api/2/law_data/${encodeURIComponent(egovLawId)}?asof=${LAW_BOOK_EDITION_2026.effectiveAsOf}&law_num=true`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${egovLawId}: e-Gov metadata HTTP ${response.status}`);

  const json = (await response.json()) as {
    law_info?: {
      law_id?: string;
      law_type?: string;
      promulgation_date?: string | null;
    };
    revision_info?: {
      law_revision_id?: string;
      law_title?: string;
      amendment_enforcement_date?: string | null;
      repeal_status?: string;
    };
  };
  if (!json.law_info?.law_id || !json.revision_info?.law_revision_id || !json.revision_info.law_title) {
    throw new Error(`${egovLawId}: e-Gov metadataの必須項目がありません`);
  }
  return {
    lawInfo: {
      lawId: json.law_info.law_id,
      lawType: json.law_info.law_type ?? "",
      promulgationDate: json.law_info.promulgation_date ?? null,
    },
    revisionInfo: {
      revisionId: json.revision_info.law_revision_id,
      title: json.revision_info.law_title,
      enforcementDate: json.revision_info.amendment_enforcement_date ?? null,
      repealStatus: json.revision_info.repeal_status ?? "Unknown",
    },
  };
}

async function fetchAllMetadata(): Promise<Map<string, OfficialMetadata>> {
  const result = new Map<string, OfficialMetadata>();
  for (let index = 0; index < LAW_BOOK_2026.length; index += 8) {
    const batch = LAW_BOOK_2026.slice(index, index + 8);
    const values = await Promise.all(batch.map((entry) => fetchOfficialMetadata(entry.egovLawId)));
    values.forEach((value, valueIndex) => result.set(batch[valueIndex].egovLawId, value));
    console.log(`  公式metadata: ${Math.min(index + 8, LAW_BOOK_2026.length)}/${LAW_BOOK_2026.length}`);
  }
  return result;
}

async function main(): Promise<void> {
  const missingFiles = LAW_BOOK_2026.filter(
    (entry) => !fs.existsSync(path.join(DATA_DIR, `${entry.egovLawId}.xml`)),
  );
  if (missingFiles.length > 0) {
    throw new Error(`公式XMLが${missingFiles.length}件不足しています。先に npx tsx scripts/fetch-laws.ts を実行してください`);
  }

  console.log("=== 2026年版 収録台帳seed ===");
  const metadataByLawId = await fetchAllMetadata();
  const configByLawId = new Map(LAWS.map((law) => [law.egovLawId, law]));
  const manifestChecksum = sha256(JSON.stringify(LAW_BOOK_2026));
  const catalogPath = path.join(__dirname, "..", "docs", "research", "law-book-2026-toc-ocr.md");
  const catalogChecksum = sha256(fs.readFileSync(catalogPath));
  const prisma = new PrismaClient();

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "LawPackage" (
        "id", "packageVersion", "manifestChecksum", "signature", "signerKeyId",
        "sourceSummary", "effectiveAt", "status"
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamp, 'draft')
      ON CONFLICT ("packageVersion") DO UPDATE SET
        "manifestChecksum" = EXCLUDED."manifestChecksum",
        "sourceSummary" = EXCLUDED."sourceSummary"`,
      PACKAGE_ID,
      "law-book-2026-v1",
      manifestChecksum,
      "unsigned-local",
      "local-operator",
      JSON.stringify({ source: "e-Gov law_file/xml", asOf: LAW_BOOK_EDITION_2026.effectiveAsOf, entries: 120 }),
      LAW_BOOK_EDITION_2026.effectiveAsOf,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO "LawBookEdition" (
        "id", "editionKey", "title", "editionYear", "isbn", "publisher",
        "bookPublishedAt", "effectiveAsOf", "manifestVersion", "manifestChecksum",
        "catalogEvidenceStorageKey", "catalogEvidenceChecksum", "status"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $8::timestamp, $9, $10, $11, $12, 'validating')
      ON CONFLICT ("editionKey") DO UPDATE SET
        "title" = EXCLUDED."title",
        "manifestVersion" = EXCLUDED."manifestVersion",
        "manifestChecksum" = EXCLUDED."manifestChecksum",
        "catalogEvidenceStorageKey" = EXCLUDED."catalogEvidenceStorageKey",
        "catalogEvidenceChecksum" = EXCLUDED."catalogEvidenceChecksum",
        "updatedAt" = CURRENT_TIMESTAMP`,
      EDITION_ID,
      LAW_BOOK_EDITION_2026.editionKey,
      LAW_BOOK_EDITION_2026.title,
      LAW_BOOK_EDITION_2026.editionYear,
      LAW_BOOK_EDITION_2026.isbn,
      LAW_BOOK_EDITION_2026.publisher,
      LAW_BOOK_EDITION_2026.bookPublishedAt,
      LAW_BOOK_EDITION_2026.effectiveAsOf,
      LAW_BOOK_EDITION_2026.manifestVersion,
      manifestChecksum,
      "docs/research/law-book-2026-toc-ocr.md",
      catalogChecksum,
    );

    for (const entry of LAW_BOOK_2026) {
      const metadata = metadataByLawId.get(entry.egovLawId)!;
      if (metadata.lawInfo.lawId !== entry.egovLawId) {
        throw new Error(`${entry.egovLawId}: 公式metadataの法令IDが一致しません`);
      }
      if (metadata.revisionInfo.title !== entry.officialTitle) {
        throw new Error(`${entry.egovLawId}: 正式名称不一致 (${metadata.revisionInfo.title})`);
      }
      if (metadata.revisionInfo.repealStatus !== "None") {
        throw new Error(`${entry.egovLawId}: 廃止状態 ${metadata.revisionInfo.repealStatus}`);
      }

      const lawRows = await prisma.$queryRawUnsafe<LawRow[]>(
        `INSERT INTO "Law" ("id", "egovLawId", "name", "shortName", "category", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::"RegulationCategory", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("egovLawId") DO UPDATE SET
           "name" = EXCLUDED."name",
           "shortName" = EXCLUDED."shortName",
           "category" = EXCLUDED."category",
           "updatedAt" = CURRENT_TIMESTAMP
         RETURNING "id", "currentRevisionId"`,
        `law_${entry.egovLawId.toLowerCase()}`,
        entry.egovLawId,
        entry.officialTitle,
        configByLawId.get(entry.egovLawId)?.shortName ?? entry.officialTitle,
        lawCategoryFromEgovId(entry.egovLawId),
      );
      const law = lawRows[0];
      const xmlPath = path.join(DATA_DIR, `${entry.egovLawId}.xml`);
      const xmlChecksum = sha256(fs.readFileSync(xmlPath));
      const sourceStorageKey = path.relative(path.join(__dirname, ".."), xmlPath);
      const sourceFetchedAt = fs.statSync(xmlPath).mtime.toISOString();
      // Entry baseline Revision は公式版で固定。Law.currentRevisionId（現行 Revision）とは独立。
      const revisionId = `rev_${metadata.revisionInfo.revisionId}`;
      const officialVersionKey = metadata.revisionInfo.revisionId;

      // baseline Revision 行を upsert する（seed は catalog 責務なので常に staged 扱い）。
      await prisma.$executeRawUnsafe(
        `INSERT INTO "LawRevision" (
           "id", "lawId", "packageId", "officialVersionKey", "promulgationDate",
           "effectiveFrom", "fetchedAt", "sourceUrl", "xmlStorageKey", "xmlChecksum", "status"
         ) VALUES ($1, $2, $3, $4, $5::timestamp, $6::timestamp, $7::timestamp, $8, $9, $10, $11::"LawRevisionStatus")
         ON CONFLICT ("lawId", "officialVersionKey") DO UPDATE SET
           "packageId" = EXCLUDED."packageId",
           "promulgationDate" = EXCLUDED."promulgationDate",
           "effectiveFrom" = EXCLUDED."effectiveFrom",
           "fetchedAt" = EXCLUDED."fetchedAt",
           "sourceUrl" = EXCLUDED."sourceUrl",
           "xmlStorageKey" = EXCLUDED."xmlStorageKey",
           "xmlChecksum" = EXCLUDED."xmlChecksum"`,
        revisionId,
        law.id,
        PACKAGE_ID,
        officialVersionKey,
        metadata.lawInfo.promulgationDate,
        metadata.revisionInfo.enforcementDate ?? LAW_BOOK_EDITION_2026.effectiveAsOf,
        sourceFetchedAt,
        officialLawDataUrl(entry.egovLawId),
        sourceStorageKey,
        xmlChecksum,
        "staged",
      );

      // baseline Revision の既存Article件数で冪等判定（Law全体ではなくEntry Revision 限定）。
      const articleCountRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        'SELECT COUNT(*)::bigint AS count FROM "Article" WHERE "lawId" = $1 AND "lawRevisionId" = $2 AND "deletedAt" IS NULL',
        law.id,
        revisionId,
      );
      const articleCount = Number(articleCountRows[0].count);

      // 旧 rev_legacy_* Revision は取得時点が未確定のため非公開化（歴史の整頓）。
      // この操作は baseline Revision の整備であって currentRevisionId の切り替えではない。
      if (law.currentRevisionId?.startsWith("rev_legacy_")) {
        await prisma.$executeRawUnsafe(
          `UPDATE "LawRevision" SET
             "officialVersionKey" = 'legacy-pre-law-book-2026',
             "xmlChecksum" = 'legacy-unverified',
             "status" = 'superseded'
           WHERE "id" = $1`,
          law.currentRevisionId,
        );
        await prisma.$executeRawUnsafe(
          'UPDATE "Article" SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "lawRevisionId" = $1 AND "deletedAt" IS NULL',
          law.currentRevisionId,
        );
      }

      // 現行 Revision（Law.currentRevisionId）は初回導入時（null）だけ baseline で初期化する。
      // 既に刷新プロセスが現行 Revision を設定している場合は絶対に巻き戻さない。
      if (shouldInitializeCurrentRevision(law.currentRevisionId)) {
        await prisma.$executeRawUnsafe(
          'UPDATE "Law" SET "currentRevisionId" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
          law.id,
          revisionId,
        );
      }

      // baseline Revision の状態は catalog の管理下。既に active な現行 Revision が別に
      // 存在しても baseline Revision の status を上書きしない（staged のままで整備）。
      if (articleCount > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE "LawRevision" SET "status" = 'active'::"LawRevisionStatus"
           WHERE "id" = $1 AND "xmlChecksum" = $2 AND "status" = 'staged'`,
          revisionId,
          xmlChecksum,
        );
      }

      const verificationStatus = articleCount > 0 ? "structure_validated" : "source_verified";
      await prisma.$executeRawUnsafe(
        `INSERT INTO "LawBookEntry" (
           "id", "editionId", "lawId", "lawRevisionId", "displayOrder", "inclusionMode",
           "printedTitle", "printedPage", "catalogSourceLocator", "verificationStatus",
           "verificationNote", "sourceUrl", "sourceStorageKey", "sourceChecksum",
           "sourceFetchedAt", "articleCount"
         ) VALUES ($1, $2, $3, $4, $5, $6::"LawBookInclusionMode", $7, $8, $9,
           $10::"LawBookVerificationStatus", $11, $12, $13, $14, $15::timestamp, $16)
         ON CONFLICT ("editionId", "lawId") DO UPDATE SET
           "lawRevisionId" = EXCLUDED."lawRevisionId",
           "displayOrder" = EXCLUDED."displayOrder",
           "inclusionMode" = EXCLUDED."inclusionMode",
           "printedTitle" = EXCLUDED."printedTitle",
           "printedPage" = EXCLUDED."printedPage",
           "verificationStatus" = EXCLUDED."verificationStatus",
           "verificationNote" = EXCLUDED."verificationNote",
           "sourceUrl" = EXCLUDED."sourceUrl",
           "sourceStorageKey" = EXCLUDED."sourceStorageKey",
           "sourceChecksum" = EXCLUDED."sourceChecksum",
           "sourceFetchedAt" = EXCLUDED."sourceFetchedAt",
           "articleCount" = EXCLUDED."articleCount",
           "updatedAt" = CURRENT_TIMESTAMP`,
        `entry_2026_${entry.egovLawId.toLowerCase()}`,
        EDITION_ID,
        law.id,
        revisionId,
        entry.displayOrder,
        entry.inclusionMode,
        entry.printedTitle,
        entry.printedPage,
        `総目次 p.${entry.printedPage}`,
        verificationStatus,
        entry.inclusionMode === "excerpt" ? "抄録の条番号範囲は要二次照合" : null,
        officialLawDataUrl(entry.egovLawId),
        sourceStorageKey,
        xmlChecksum,
        sourceFetchedAt,
        articleCount,
      );

      if (entry.inclusionMode === "full") {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "LawBookEntryRange" (
             "id", "lawBookEntryId", "rangeType", "sortOrder", "verificationStatus", "inclusionReason"
           ) VALUES ($1, $2, 'entire_document', 1, 'source_verified', '総目次に抄表記なし')
           ON CONFLICT ("lawBookEntryId", "sortOrder") DO UPDATE SET
             "rangeType" = EXCLUDED."rangeType",
             "verificationStatus" = EXCLUDED."verificationStatus",
             "inclusionReason" = EXCLUDED."inclusionReason",
             "updatedAt" = CURRENT_TIMESTAMP`,
          `range_2026_${entry.egovLawId.toLowerCase()}_all`,
          `entry_2026_${entry.egovLawId.toLowerCase()}`,
        );
      }
    }

    const verifiedRangeCount = await seedVerifiedExcerptRanges(prisma);
    console.log(`検証済み抄録Range: 民法 ${verifiedRangeCount}条`);

    const scopeResult = await enforceLawBookScope(prisma, LAW_BOOK_EDITION_2026.editionKey);
    if (scopeResult.archivedDocuments.length > 0) {
      console.log(`収録対象外を非公開化: ${scopeResult.archivedDocuments.length}文書 / ${scopeResult.softDeletedArticles.toLocaleString()}ノード`);
    }

    console.log(`Edition: ${LAW_BOOK_EDITION_2026.title}`);
    console.log(`Entry: ${LAW_BOOK_2026.length}件（Editionはvalidatingのまま）`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
