import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";
import {
  sortConfirmedRelationRows,
  type ConfirmedRelation,
  type ConfirmedRelationsDocument,
  type RelationEdgeTypeValue,
} from "@/lib/relations/confirmed-relation";

interface ConfirmedRelationRow {
  id: string;
  sourceArticleId: string;
  relationType: RelationEdgeTypeValue;
  rationale: string;
  confirmedAt: Date;
  targetArticleId: string;
  targetLawName: string;
  targetLawShortName: string | null;
  targetArticleNumber: string | null;
  targetCaption: string | null;
  targetLawDisplayOrder: number;
  targetArticleSortOrder: number;
}

async function getCurrentEditionRevision(
  lawRevisionId: string,
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT revision.id
       FROM "LawRevision" revision
       JOIN "LawBookEntry" entry
         ON entry."lawId" = revision."lawId"
        AND entry."lawRevisionId" = revision.id
       JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
      WHERE revision.id = $1
        AND edition."editionKey" = $2
      LIMIT 1`,
    lawRevisionId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  return rows.length === 1;
}

async function getActiveConfirmedRelationRows(
  lawRevisionId: string,
): Promise<ConfirmedRelationRow[]> {
  const sourceScope = lawBookArticleScopeSql("source", "source_entry");
  const targetScope = lawBookArticleScopeSql("target", "target_entry");
  return prisma.$queryRawUnsafe<ConfirmedRelationRow[]>(
    `SELECT
       relation.id,
       relation."sourceArticleId",
       relation."relationType",
       relation.rationale,
       relation."confirmedAt",
       target.id AS "targetArticleId",
       target_law.name AS "targetLawName",
       target_law."shortName" AS "targetLawShortName",
       target."articleNumber" AS "targetArticleNumber",
       target.caption AS "targetCaption",
       target_entry."displayOrder" AS "targetLawDisplayOrder",
       target."sortOrder" AS "targetArticleSortOrder"
     FROM "ConfirmedArticleRelation" relation
     JOIN "Article" source ON source.id = relation."sourceArticleId"
     JOIN "Article" target ON target.id = relation."targetArticleId"
     JOIN "Law" target_law ON target_law.id = target."lawId"
     JOIN "LawBookEntry" source_entry
       ON source_entry."lawId" = source."lawId"
      AND source_entry."lawRevisionId" = source."lawRevisionId"
     JOIN "LawBookEdition" source_edition
       ON source_edition.id = source_entry."editionId"
     JOIN "LawBookEntry" target_entry
       ON target_entry."lawId" = target."lawId"
      AND target_entry."lawRevisionId" = target."lawRevisionId"
     JOIN "LawBookEdition" target_edition
       ON target_edition.id = target_entry."editionId"
     WHERE source."lawRevisionId" = $1
       AND relation."revokedAt" IS NULL
       AND source.level = 'article'
       AND target.level = 'article'
       AND source."deletedAt" IS NULL
       AND target."deletedAt" IS NULL
       AND source_edition."editionKey" = $2
       AND target_edition."editionKey" = $2
       AND ${sourceScope}
       AND ${targetScope}`,
    lawRevisionId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}

export async function getConfirmedRelationsDocument(
  lawRevisionId: string,
): Promise<ConfirmedRelationsDocument | null> {
  const revision = await getCurrentEditionRevision(lawRevisionId);
  if (!revision) return null;

  const rows = await getActiveConfirmedRelationRows(lawRevisionId);
  const relationsBySource: Record<string, ConfirmedRelation[]> = {};
  const sortedRows = sortConfirmedRelationRows(
    rows.map((row) => ({
      ...row,
      confirmedAt: row.confirmedAt.toISOString(),
    })),
  );

  for (const row of sortedRows) {
    (relationsBySource[row.sourceArticleId] ??= []).push({
      id: row.id,
      relationType: row.relationType,
      rationale: row.rationale,
      confirmedAt: row.confirmedAt,
      target: {
        articleId: row.targetArticleId,
        lawName: row.targetLawName,
        lawShortName: row.targetLawShortName,
        articleNumber: row.targetArticleNumber,
        caption: row.targetCaption,
      },
    });
  }

  return { revisionId: lawRevisionId, relationsBySource };
}
