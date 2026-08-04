import { buildFullLawToc } from "@/lib/article/full-law-document";
import type {
  FullLawDocument,
  FullLawNode,
} from "@/lib/article/full-law-document";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";
import type { OutgoingLinkRow } from "@/lib/link/link";

interface RevisionMetadataRow {
  lawId: string;
  egovLawId: string;
  lawName: string;
  lawShortName: string | null;
  revisionId: string;
  editionKey: string;
  sourceDate: string | null;
}

/**
 * 指定 Revision のメタデータを取得する。
 * Task 11: 指定 Revision が Law.currentRevisionId と一致しない場合は null を返す。
 * LawBookEntry は (editionId, lawId) のカタログ所属のみを表し、Revision 結合はしない。
 */
async function getRevisionMetadata(
  lawRevisionId: string,
): Promise<RevisionMetadataRow | null> {
  const rows = await prisma.$queryRawUnsafe<RevisionMetadataRow[]>(
    `SELECT
       law.id AS "lawId",
       law."egovLawId",
       law.name AS "lawName",
       law."shortName" AS "lawShortName",
       revision.id AS "revisionId",
       edition."editionKey",
       to_char(edition."effectiveAsOf" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "sourceDate"
     FROM "LawRevision" revision
     JOIN "Law" law ON law.id = revision."lawId"
     JOIN "LawBookEntry" entry
       ON entry."lawId" = law.id
      AND entry."editionId" = (
        SELECT edition_inner.id FROM "LawBookEdition" edition_inner
        WHERE edition_inner."editionKey" = $2
      )
     JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
     WHERE revision.id = $1
       AND law."currentRevisionId" = revision.id
       AND edition."editionKey" = $2
     LIMIT 1`,
    lawRevisionId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  return rows[0] ?? null;
}

async function getRevisionNodes(
  lawRevisionId: string,
): Promise<FullLawNode[]> {
  const articleScope = currentLawBookArticleScopeSql("tree", "entry", "law");
  return prisma.$queryRawUnsafe<FullLawNode[]>(
    `WITH RECURSIVE tree AS (
       SELECT
         article.id,
         article."parentId",
         article.level,
         article."articleNumber",
         article."articleNumberNormalized",
         article."paragraphNumber",
         article."itemNumber",
         article."subitemNumber",
         article."columnNumber",
         article."tableCoords",
         article.title,
         article.caption,
         article.text,
         article."articleCaptionNormalized",
         article."sortOrder",
         0 AS depth,
         article."lawId",
         article."regulationType",
         article."stableNodeKey",
         article."durableNodeKey",
         article."deletedAt",
         article."lawRevisionId",
         ARRAY[article."sortOrder"] AS path
       FROM "Article" article
       WHERE article."lawRevisionId" = $1
         AND article."parentId" IS NULL
         AND article."deletedAt" IS NULL

       UNION ALL

       SELECT
         article.id,
         article."parentId",
         article.level,
         article."articleNumber",
         article."articleNumberNormalized",
         article."paragraphNumber",
         article."itemNumber",
         article."subitemNumber",
         article."columnNumber",
         article."tableCoords",
         article.title,
         article.caption,
         article.text,
         article."articleCaptionNormalized",
         article."sortOrder",
         tree.depth + 1,
         article."lawId",
         article."regulationType",
         article."stableNodeKey",
         article."durableNodeKey",
         article."deletedAt",
         article."lawRevisionId",
         tree.path || article."sortOrder"
       FROM "Article" article
       INNER JOIN tree ON article."parentId" = tree.id
       WHERE article."lawRevisionId" = $1
         AND article."deletedAt" IS NULL
     )
     SELECT tree.*
     FROM tree
     JOIN "Law" law ON law.id = tree."lawId"
     JOIN "LawBookEntry" entry
       ON entry."lawId" = law.id
      AND entry."editionId" = (
        SELECT edition_inner.id FROM "LawBookEdition" edition_inner
        WHERE edition_inner."editionKey" = $2
      )
     JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
     WHERE edition."editionKey" = $2
       AND ${articleScope}
     ORDER BY tree.path`,
    lawRevisionId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}

async function getRevisionResolvedLinks(
  lawRevisionId: string,
): Promise<OutgoingLinkRow[]> {
  const sourceScope = currentLawBookArticleScopeSql("source", "source_entry", "source_law");
  const targetScope = currentLawBookArticleScopeSql("target", "target_entry", "target_law");
  return prisma.$queryRawUnsafe<OutgoingLinkRow[]>(
    `SELECT
       link.id,
       link."sourceId",
       link."targetId",
       link."linkType",
       link."sourceRange",
       link."isResolved",
       link."targetLawName",
       link."targetText",
       link."targetArticleNumberNormalized",
       target."articleNumber" AS "targetArticleNumber",
       target.caption AS "targetCaption",
       target_law."shortName" AS "targetLawShortName"
     FROM "Link" link
     JOIN "Article" source ON source.id = link."sourceId"
     JOIN "Law" source_law ON source_law.id = source."lawId"
     JOIN "LawBookEntry" source_entry
       ON source_entry."lawId" = source_law.id
      AND source_entry."editionId" = (
        SELECT edition_inner.id FROM "LawBookEdition" edition_inner
        WHERE edition_inner."editionKey" = $2
      )
     JOIN "LawBookEdition" source_edition
       ON source_edition.id = source_entry."editionId"
     JOIN "Article" target ON target.id = link."targetId"
     JOIN "Law" target_law ON target_law.id = target."lawId"
     JOIN "LawBookEntry" target_entry
       ON target_entry."lawId" = target_law.id
      AND target_entry."editionId" = (
        SELECT edition_inner.id FROM "LawBookEdition" edition_inner
        WHERE edition_inner."editionKey" = $2
      )
     JOIN "LawBookEdition" target_edition
       ON target_edition.id = target_entry."editionId"
     WHERE source."lawRevisionId" = $1
       AND source."deletedAt" IS NULL
       AND target."deletedAt" IS NULL
       AND link."isResolved" = true
       AND source_edition."editionKey" = $2
       AND target_edition."editionKey" = $2
       AND ${sourceScope}
       AND ${targetScope}
     ORDER BY link."sourceId", link.id`,
    lawRevisionId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}

export async function getFullLawDocument(
  lawRevisionId: string,
): Promise<FullLawDocument | null> {
  const [metadata, nodes, links] = await Promise.all([
    getRevisionMetadata(lawRevisionId),
    getRevisionNodes(lawRevisionId),
    getRevisionResolvedLinks(lawRevisionId),
  ]);

  // metadata が null = 指定 Revision が Law.currentRevisionId ではない、
  // またはカタログ未収録。いずれにせよ公開対象ではない。
  if (!metadata || nodes.length === 0) return null;

  const linksBySource = links.reduce<Record<string, OutgoingLinkRow[]>>(
    (grouped, link) => {
      (grouped[link.sourceId] ??= []).push(link);
      return grouped;
    },
    {},
  );

  return {
    law: {
      id: metadata.lawId,
      egovLawId: metadata.egovLawId,
      name: metadata.lawName,
      shortName: metadata.lawShortName,
    },
    revision: {
      id: metadata.revisionId,
      editionKey: metadata.editionKey,
      sourceDate: metadata.sourceDate,
    },
    toc: buildFullLawToc(nodes),
    nodes,
    linksBySource,
  };
}
