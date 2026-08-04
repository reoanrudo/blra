import {
  buildFullLawToc,
  type FullLawRevisionMetadata,
  type LawRefreshDisplayStatus,
} from "@/lib/article/full-law-document";
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
  effectiveFrom: string;
  sourceUpdatedAt: string | null;
  fetchedAt: string;
  lastSuccessfulCheckAt: string | null;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  repealStatus: string | null;
  repealDate: string | null;
}

/**
 * 表示用更新状態を判定する。
 *
 * - lastSuccessfulCheckAt が無ければ never_checked（一度も確認成功していない）
 * - lastErrorCode があり、かつ最終試行が最終成功より新しければ check_failed
 * - それ以外は verified
 */
function deriveRefreshStatus(row: RevisionMetadataRow): LawRefreshDisplayStatus {
  if (!row.lastSuccessfulCheckAt) {
    return "never_checked";
  }
  if (
    row.lastErrorCode &&
    row.lastAttemptAt &&
    row.lastAttemptAt > row.lastSuccessfulCheckAt
  ) {
    return "check_failed";
  }
  return "verified";
}

/**
 * 指定 Revision のメタデータを取得する。
 * Task 11: 指定 Revision が Law.currentRevisionId と一致しない場合は null を返す。
 * LawBookEntry は (editionId, lawId) のカタログ所属のみを表し、Revision 結合はしない。
 *
 * Task 14: LawRevision の effectiveFrom/sourceUpdatedAt/fetchedAt と、
 * LEFT JOIN した LawSyncState の確認状態（lastSuccessfulCheckAt/lastAttemptAt/
 * lastErrorCode/repealStatus/repealDate）を取得する。
 * LawSyncState が存在しない場合は全て null となり never_checked 扱い。
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
       to_char(revision."effectiveFrom" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "effectiveFrom",
       to_char(revision."sourceUpdatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "sourceUpdatedAt",
       to_char(revision."fetchedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "fetchedAt",
       to_char(sync."lastSuccessfulCheckAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastSuccessfulCheckAt",
       to_char(sync."lastAttemptAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastAttemptAt",
       sync."lastErrorCode",
       sync."repealStatus",
       to_char(sync."repealDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "repealDate"
     FROM "LawRevision" revision
     JOIN "Law" law ON law.id = revision."lawId"
     JOIN "LawBookEntry" entry
       ON entry."lawId" = law.id
      AND entry."editionId" = (
        SELECT edition_inner.id FROM "LawBookEdition" edition_inner
        WHERE edition_inner."editionKey" = $2
      )
     JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
     LEFT JOIN "LawSyncState" sync ON sync."lawId" = law.id
     WHERE revision.id = $1
       AND law."currentRevisionId" = revision.id
       AND edition."editionKey" = $2
     LIMIT 1`,
    lawRevisionId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  return rows[0] ?? null;
}

/**
 * Repository行からDTOのRevisionメタデータへ詰め替える。
 * effectiveFrom は施行日（YYYY-MM-DD）を得るため、タイムゾーン込みの時刻から日付部を切り出す。
 * 表示の正確性が最優先のため、値の欠落時は安全な既定値へ落とす。
 */
export function buildRevisionMetadata(
  row: RevisionMetadataRow,
): FullLawRevisionMetadata {
  const effectiveFromDay = row.effectiveFrom?.slice(0, 10) ?? "";
  return {
    id: row.revisionId,
    editionKey: row.editionKey,
    effectiveFrom: effectiveFromDay,
    sourceUpdatedAt: row.sourceUpdatedAt,
    fetchedAt: row.fetchedAt,
    lastSuccessfulCheckAt: row.lastSuccessfulCheckAt,
    lastAttemptAt: row.lastAttemptAt,
    refreshStatus: deriveRefreshStatus(row),
    refreshErrorCode: row.lastErrorCode,
    repealStatus: row.repealStatus,
    repealDate: row.repealDate,
  };
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
    revision: buildRevisionMetadata(metadata),
    toc: buildFullLawToc(nodes),
    nodes,
    linksBySource,
  };
}
