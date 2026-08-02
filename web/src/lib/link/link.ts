import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";

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

/** Fetch all outgoing links (resolved+unresolved) for a set of article IDs in one query */
export async function getOutgoingLinksForTree(
  articleIds: string[],
): Promise<OutgoingLinkRow[]> {
  if (articleIds.length === 0) return [];
  const placeholders = articleIds.map((_, i) => `$${i + 1}`).join(", ");
  const editionKeyParam = articleIds.length + 1;
  const targetScope = lawBookArticleScopeSql("tgt", "target_entry");

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
    LEFT JOIN "Article" tgt ON lnk."targetId" = tgt.id
      AND tgt."deletedAt" IS NULL
      AND EXISTS (
        SELECT 1
        FROM "LawBookEntry" target_entry
        JOIN "LawBookEdition" target_edition ON target_edition.id = target_entry."editionId"
        WHERE target_entry."lawId" = tgt."lawId"
          AND target_entry."lawRevisionId" = tgt."lawRevisionId"
          AND target_edition."editionKey" = $${editionKeyParam}
          AND ${targetScope}
      )
    LEFT JOIN "Law" tgt_law ON tgt."lawId" = tgt_law.id
    WHERE lnk."sourceId" IN (${placeholders})`,
    ...articleIds,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}

/** Fetch incoming resolved links targeting any of the given article IDs */
export async function getIncomingLinksForTree(
  articleIds: string[],
): Promise<IncomingLinkRow[]> {
  if (articleIds.length === 0) return [];
  const placeholders = articleIds.map((_, i) => `$${i + 1}`).join(", ");
  const editionKeyParam = articleIds.length + 1;
  const sourceScope = lawBookArticleScopeSql("src", "source_entry");

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
      ON source_entry."lawId" = src."lawId" AND source_entry."lawRevisionId" = src."lawRevisionId"
    JOIN "LawBookEdition" source_edition ON source_edition.id = source_entry."editionId"
    WHERE lnk."targetId" IN (${placeholders})
      AND lnk."isResolved" = true
      AND source_edition."editionKey" = $${editionKeyParam}
      AND ${sourceScope}`,
    ...articleIds,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}
