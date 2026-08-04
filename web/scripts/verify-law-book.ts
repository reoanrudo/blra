#!/usr/bin/env npx tsx
/** 2026年版のDB完全性を検証し、不一致が1件でもあれば非0終了する。 */

import { PrismaClient } from "@prisma/client";
import { LAW_BOOK_2026 } from "./law-book-2026";
import { CIVIL_CODE_ARTICLE_EVIDENCE } from "./lib/seed-verified-excerpt-ranges";
import { lawBookArticleScopeSql } from "../src/lib/law-book/sql-scope";

const CIVIL_CODE_EGOV_ID = "129AC0000000089";
const ARCHITECTS_ACT_EGOV_ID = "325AC1000000202";
const EXPECTED_SUPPLEMENTARY_PROVISION_COUNT = 4_973;

interface EntryRow {
  displayOrder: number;
  egovLawId: string;
  category: string;
  inclusionMode: string;
  verificationStatus: string;
  sourceChecksum: string | null;
  lawRevisionId: string | null;
  currentRevisionId: string | null;
  articleCount: number | null;
  actualArticleCount: bigint;
  rangeCount: bigint;
}

interface SupplementSummaryRow {
  count: bigint;
  titledCount: bigint;
  taggedCount: bigint;
  architectsActCount: bigint;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const editions = await prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(
      `SELECT "status"::text, COUNT(*)::bigint AS count
       FROM "LawBookEdition" WHERE "editionKey" = 'ksk-2026' GROUP BY "status"`,
    );
    assert(editions.length === 1, "2026年版Editionが一意ではありません");
    assert(editions[0].status === "validating", `Edition状態が想定外です: ${editions[0].status}`);

    const entries = await prisma.$queryRawUnsafe<EntryRow[]>(
      `SELECT
         e."displayOrder",
         l."egovLawId",
         l."category"::text,
         e."inclusionMode"::text,
         e."verificationStatus"::text,
         e."sourceChecksum",
         e."lawRevisionId",
         l."currentRevisionId",
         e."articleCount",
         COUNT(DISTINCT a."id") FILTER (WHERE a."deletedAt" IS NULL)::bigint AS "actualArticleCount",
         COUNT(DISTINCT r."id")::bigint AS "rangeCount"
       FROM "LawBookEntry" e
       JOIN "LawBookEdition" edition ON edition."id" = e."editionId"
       JOIN "Law" l ON l."id" = e."lawId"
       LEFT JOIN "Article" a ON a."lawId" = l."id" AND a."lawRevisionId" = e."lawRevisionId"
       LEFT JOIN "LawBookEntryRange" r ON r."lawBookEntryId" = e."id"
       WHERE edition."editionKey" = 'ksk-2026'
       GROUP BY e."id", l."id"
       ORDER BY e."displayOrder"`,
    );

    assert(entries.length === 120, `Entry件数が120ではありません: ${entries.length}`);
    assert(new Set(entries.map((entry) => entry.egovLawId)).size === 120, "e-Gov法令IDが重複しています");
    assert(
      entries.every((entry, index) => entry.displayOrder === index + 1),
      "掲載順が1〜120で連続していません",
    );

    const manifestIds = LAW_BOOK_2026.map((entry) => entry.egovLawId);
    assert(
      entries.every((entry, index) => entry.egovLawId === manifestIds[index]),
      "DB台帳と実行マニフェストの法令ID/掲載順が一致しません",
    );
    assert(entries.every((entry) => entry.lawRevisionId === entry.currentRevisionId), "Entryが現行Revisionを参照していません");
    assert(entries.every((entry) => entry.sourceChecksum?.length === 64), "原本SHA-256がないEntryがあります");
    assert(entries.every((entry) => Number(entry.actualArticleCount) > 0), "Articleが0件の収録文書があります");
    assert(
      entries.every((entry) => entry.articleCount === Number(entry.actualArticleCount)),
      "EntryのarticleCountと実件数が一致しません",
    );
    assert(entries.every((entry) => entry.verificationStatus === "structure_validated"), "構造検証未完了Entryがあります");

    const supplementSummary = await prisma.$queryRawUnsafe<SupplementSummaryRow[]>(
      `SELECT
         COUNT(*)::bigint AS count,
         COUNT(a."title")::bigint AS "titledCount",
         COUNT(*) FILTER (
           WHERE a."systemTags" -> 'supplementaryProvision' ->> 'sourceLabel' IS NOT NULL
         )::bigint AS "taggedCount",
         COUNT(*) FILTER (WHERE l."egovLawId" = $1)::bigint AS "architectsActCount"
       FROM "Article" a
       JOIN "Law" l ON l.id = a."lawId"
       JOIN "LawBookEntry" e
         ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
       JOIN "LawBookEdition" edition ON edition.id = e."editionId"
       WHERE edition."editionKey" = 'ksk-2026'
         AND a."deletedAt" IS NULL
         AND a.level = 'suppl_provision'
         AND a."parentId" IS NULL`,
      ARCHITECTS_ACT_EGOV_ID,
    );
    const supplements = supplementSummary[0];
    assert(
      Number(supplements.count) === EXPECTED_SUPPLEMENTARY_PROVISION_COUNT,
      `附則ルート件数が${EXPECTED_SUPPLEMENTARY_PROVISION_COUNT}ではありません: ${supplements.count}`,
    );
    assert(supplements.titledCount === supplements.count, "識別タイトルのない附則があります");
    assert(supplements.taggedCount === supplements.count, "公式XMLメタデータのない附則があります");
    assert(Number(supplements.architectsActCount) === 44, `建築士法の附則が44件ではありません: ${supplements.architectsActCount}`);

    const categoryCounts = Object.fromEntries(
      ["law", "cabinet_order", "ministry_ordinance"].map((category) => [
        category,
        entries.filter((entry) => entry.category === category).length,
      ]),
    );
    assert(
      JSON.stringify(categoryCounts) === JSON.stringify({ law: 65, cabinet_order: 29, ministry_ordinance: 26 }),
      `法令種別内訳が一致しません: ${JSON.stringify(categoryCounts)}`,
    );

    const fullEntries = entries.filter((entry) => entry.inclusionMode === "full");
    const excerptEntries = entries.filter((entry) => entry.inclusionMode === "excerpt");
    const civilCodeEntry = excerptEntries.find((entry) => entry.egovLawId === CIVIL_CODE_EGOV_ID);
    const pendingExcerptEntries = excerptEntries.filter((entry) => entry.egovLawId !== CIVIL_CODE_EGOV_ID);
    assert(fullEntries.length === 14 && fullEntries.every((entry) => Number(entry.rangeCount) === 1), "全文EntryのRangeが不正です");
    assert(excerptEntries.length === 106, `抄録Entry件数が106ではありません: ${excerptEntries.length}`);
    assert(civilCodeEntry !== undefined, "民法（抄）のEntryがありません");
    assert(
      Number(civilCodeEntry.rangeCount) === CIVIL_CODE_ARTICLE_EVIDENCE.length,
      `民法（抄）のRangeが${CIVIL_CODE_ARTICLE_EVIDENCE.length}件ではありません: ${civilCodeEntry.rangeCount}`,
    );
    assert(
      pendingExcerptEntries.length === 105 && pendingExcerptEntries.every((entry) => Number(entry.rangeCount) === 0),
      "未照合の抄録Rangeが推測登録されています",
    );

    const civilCodeRanges = await prisma.$queryRawUnsafe<Array<{ articleNumberNormalized: string }>>(
      `SELECT article."articleNumberNormalized"
       FROM "LawBookEntryRange" range
       JOIN "LawBookEntry" entry ON entry.id = range."lawBookEntryId"
       JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
       JOIN "Law" law ON law.id = entry."lawId"
       JOIN "Article" article
         ON article."lawId" = entry."lawId"
        AND article."lawRevisionId" = entry."lawRevisionId"
        AND article."stableNodeKey" = range."startStableNodeKey"
       WHERE edition."editionKey" = 'ksk-2026'
         AND law."egovLawId" = $1
         AND range."rangeType" = 'article'
         AND range."startStableNodeKey" = range."endStableNodeKey"
         AND range."verificationStatus" = 'source_verified'
       ORDER BY range."sortOrder"`,
      CIVIL_CODE_EGOV_ID,
    );
    assert(
      JSON.stringify(civilCodeRanges.map((range) => range.articleNumberNormalized)) ===
        JSON.stringify(CIVIL_CODE_ARTICLE_EVIDENCE.map((range) => range.articleNumberNormalized)),
      "民法（抄）のRangeが収録順と一致しません",
    );

    const totalArticles = entries.reduce((sum, entry) => sum + Number(entry.actualArticleCount), 0);
    const outsideArticles = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count
       FROM "Article" a
       WHERE a."deletedAt" IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = 'ksk-2026'
             AND e."lawId" = a."lawId"
             AND e."lawRevisionId" = a."lawRevisionId"
         )`,
    );
    assert(Number(outsideArticles[0].count) === 0, `収録台帳外の有効Articleがあります: ${outsideArticles[0].count}`);

    const outsideLinks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count
       FROM "Link" link
       JOIN "Article" source ON source.id = link."sourceId"
       LEFT JOIN "Article" target ON target.id = link."targetId"
       WHERE NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = 'ksk-2026'
             AND e."lawId" = source."lawId"
             AND e."lawRevisionId" = source."lawRevisionId"
         )
         OR (
           link."isResolved" = true
           AND target.id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM "LawBookEntry" e
             JOIN "LawBookEdition" edition ON edition.id = e."editionId"
             WHERE edition."editionKey" = 'ksk-2026'
               AND e."lawId" = target."lawId"
               AND e."lawRevisionId" = target."lawRevisionId"
           )
         )`,
    );
    assert(Number(outsideLinks[0].count) === 0, `収録台帳外を参照するLinkがあります: ${outsideLinks[0].count}`);

    const publicScope = lawBookArticleScopeSql("a", "e");
    const visibleArticles = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count
       FROM "Article" a
       JOIN "LawBookEntry" e
         ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
       JOIN "LawBookEdition" edition ON edition.id = e."editionId"
       WHERE edition."editionKey" = 'ksk-2026'
         AND a."deletedAt" IS NULL
         AND ${publicScope}`,
    );

    interface PageDataSummaryRow {
      printedPageColumnCount: bigint;
      catalogPageCount: bigint;
      rangePageCount: bigint;
      notePageCount: bigint;
    }

    const pageDataRows = await prisma.$queryRawUnsafe<PageDataSummaryRow[]>(
      `SELECT
         (SELECT COUNT(*)::bigint
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'LawBookEntry'
             AND column_name = 'printedPage') AS "printedPageColumnCount",
         (SELECT COUNT(*)::bigint
            FROM "LawBookEntry"
           WHERE "catalogSourceLocator" ~ 'p[.][0-9]|頁') AS "catalogPageCount",
         (SELECT COUNT(*)::bigint
            FROM "LawBookEntryRange"
           WHERE "inclusionReason" ~ 'p[.][0-9]|頁') AS "rangePageCount",
         (SELECT COUNT(*)::bigint
            FROM "LawBookEntry"
           WHERE "verificationNote" ~ 'p[.][0-9]|頁') AS "notePageCount"`,
    );
    const pageData = pageDataRows[0];
    assert(Number(pageData.printedPageColumnCount) === 0, "printedPage列が残っています");
    assert(Number(pageData.catalogPageCount) === 0, "総目次参照にページ番号が残っています");
    assert(Number(pageData.rangePageCount) === 0, "Range検証理由にページ番号が残っています");
    assert(Number(pageData.notePageCount) === 0, "Entry検証メモにページ番号が残っています");

    console.log("=== 2026年版 DB完全性検証: OK ===");
    console.log(`Entry: ${entries.length}/120`);
    console.log(`Article: ${totalArticles.toLocaleString()}ノード`);
    console.log(`通常利用スコープ: ${Number(visibleArticles[0].count).toLocaleString()}ノード`);
    console.log(`識別済み附則: ${Number(supplements.count).toLocaleString()}件（建築士法44件）`);
    console.log(`種別: 法律${categoryCounts.law}・政令${categoryCounts.cabinet_order}・省令${categoryCounts.ministry_ordinance}`);
    console.log(`全文Range: ${fullEntries.length} / 抄録Range照合済み: 1（民法61条） / 要二次照合: ${pendingExcerptEntries.length}`);
    console.log("収録台帳外の有効Article/Link: 0");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
