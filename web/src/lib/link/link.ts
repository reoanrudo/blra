import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";

export interface OutgoingLinkRow {
  id: string;
  sourceId: string;
  targetId: string | null;
  linkType: string;
  sourceRange: string | null;
  isResolved: boolean;
  targetLawName: string | null;
  targetText: string | null;
  targetArticleNumberNormalized: string | null;
  // JOIN fields from target Article
  targetArticleNumber: string | null;
  targetCaption: string | null;
  targetLawShortName: string | null;
}

export interface IncomingLinkRow {
  id: string;
  sourceId: string;
  targetId: string | null;
  linkType: string;
  sourceRange: string | null;
  isResolved: boolean;
  targetText: string | null;
  // JOIN fields from source Article
  sourceArticleNumberNormalized: string | null;
  sourceCaption: string | null;
  sourceLawShortName: string | null;
}

/**
 * 指定 Article IDs から出る Link（解決済み+未解決）を1クエリで取得する。
 *
 * source Article は `Law.currentRevisionId` に属する current 版だけを対象とする。
 * target Article も current Revision に属するときだけ解決済みとして公開し、
 * target が旧 Revision の場合は未解決扱い（targetId = null）へ落とす。
 */
export async function getOutgoingLinksForTree(
  articleIds: string[],
): Promise<OutgoingLinkRow[]> {
  if (articleIds.length === 0) return [];
  const placeholders = articleIds.map((_, i) => `$${i + 1}`).join(", ");
  const editionKeyParam = articleIds.length + 1;
  const sourceScope = currentLawBookArticleScopeSql("src", "source_entry", "src_law");
  const targetScope = currentLawBookArticleScopeSql("tgt", "target_entry", "tgt_law");

  return prisma.$queryRawUnsafe<OutgoingLinkRow[]>(
    `SELECT
      lnk.id,
      lnk."sourceId",
      CASE WHEN tgt.id IS NULL THEN NULL ELSE lnk."targetId" END AS "targetId",
      lnk."linkType",
      lnk."sourceRange",
      (lnk."isResolved" AND tgt.id IS NOT NULL) AS "isResolved",
      lnk."targetLawName",
      lnk."targetText",
      lnk."targetArticleNumberNormalized",
      tgt."articleNumber" AS "targetArticleNumber",
      tgt."caption" AS "targetCaption",
      tgt_law."shortName" AS "targetLawShortName"
    FROM "Link" lnk
    JOIN "Article" src ON lnk."sourceId" = src.id
      AND src."deletedAt" IS NULL
    JOIN "Law" src_law ON src."lawId" = src_law.id
    JOIN "LawBookEntry" source_entry
      ON source_entry."lawId" = src_law.id
    JOIN "LawBookEdition" source_edition ON source_edition.id = source_entry."editionId"
    LEFT JOIN "Article" tgt ON lnk."targetId" = tgt.id
      AND tgt."deletedAt" IS NULL
    LEFT JOIN "Law" tgt_law ON tgt."lawId" = tgt_law.id
    LEFT JOIN "LawBookEntry" target_entry
      ON target_entry."lawId" = tgt_law.id
    LEFT JOIN "LawBookEdition" target_edition ON target_edition.id = target_entry."editionId"
    WHERE lnk."sourceId" IN (${placeholders})
      AND source_edition."editionKey" = $${editionKeyParam}
      AND ${sourceScope}
      AND (
        tgt.id IS NULL
        OR (
          target_edition."editionKey" = $${editionKeyParam}
          AND ${targetScope}
        )
      )`,
    ...articleIds,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}

/**
 * 指定 Article IDs を target とする解決済み incoming Link を取得する。
 *
 * source・target ともに `Law.currentRevisionId` に属する current 版だけを公開する。
 * source が旧 Revision の Link は、たとえ isResolved=true でも返さない。
 */
export async function getIncomingLinksForTree(
  articleIds: string[],
): Promise<IncomingLinkRow[]> {
  if (articleIds.length === 0) return [];
  const placeholders = articleIds.map((_, i) => `$${i + 1}`).join(", ");
  const editionKeyParam = articleIds.length + 1;
  const sourceScope = currentLawBookArticleScopeSql("src", "source_entry", "src_law");
  const targetScope = currentLawBookArticleScopeSql("tgt", "target_entry", "tgt_law");

  return prisma.$queryRawUnsafe<IncomingLinkRow[]>(
    `SELECT
      lnk.id,
      lnk."sourceId",
      lnk."targetId",
      lnk."linkType",
      lnk."sourceRange",
      lnk."isResolved",
      lnk."targetText",
      src."articleNumberNormalized" AS "sourceArticleNumberNormalized",
      src."caption" AS "sourceCaption",
      src_law."shortName" AS "sourceLawShortName"
    FROM "Link" lnk
    JOIN "Article" src ON lnk."sourceId" = src.id AND src."deletedAt" IS NULL
    JOIN "Law" src_law ON src."lawId" = src_law.id
    JOIN "LawBookEntry" source_entry
      ON source_entry."lawId" = src_law.id
    JOIN "LawBookEdition" source_edition ON source_edition.id = source_entry."editionId"
    JOIN "Article" tgt ON lnk."targetId" = tgt.id AND tgt."deletedAt" IS NULL
    JOIN "Law" tgt_law ON tgt."lawId" = tgt_law.id
    JOIN "LawBookEntry" target_entry
      ON target_entry."lawId" = tgt_law.id
    WHERE lnk."targetId" IN (${placeholders})
      AND lnk."isResolved" = true
      AND source_edition."editionKey" = $${editionKeyParam}
      AND ${sourceScope}
      AND EXISTS (
        SELECT 1
        FROM "LawBookEdition" target_edition
        WHERE target_edition.id = target_entry."editionId"
          AND target_edition."editionKey" = $${editionKeyParam}
      )
      AND ${targetScope}`,
    ...articleIds,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}
