import type { PrismaClient } from "@prisma/client";

export interface ArchivedLawDocument {
  egovLawId: string;
  name: string;
  activeArticleCount: number;
}

export interface ScopeEnforcementResult {
  archivedDocuments: ArchivedLawDocument[];
  softDeletedArticles: number;
  deletedSourceLinks: number;
  unresolvedTargetLinks: number;
  supersededRevisions: number;
  clearedCurrentRevisions: number;
}

interface ArchivedLawRow {
  egovLawId: string;
  name: string;
  activeArticleCount: bigint;
}

/**
 * 指定Editionに収録されていないRevisionを公開コーパスから外す。
 * Article自体はハイライト等の参照維持のため削除せず、soft deleteする。
 */
export async function enforceLawBookScope(
  prisma: PrismaClient,
  editionKey: string,
): Promise<ScopeEnforcementResult> {
  const archivedRows = await prisma.$queryRawUnsafe<ArchivedLawRow[]>(
    `SELECT
       l."egovLawId",
       l.name,
       COUNT(a.id) FILTER (WHERE a."deletedAt" IS NULL)::bigint AS "activeArticleCount"
     FROM "Law" l
     JOIN "Article" a ON a."lawId" = l.id
     WHERE a."deletedAt" IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM "LawBookEntry" e
         JOIN "LawBookEdition" edition ON edition.id = e."editionId"
         WHERE edition."editionKey" = $1
           AND e."lawId" = a."lawId"
           AND e."lawRevisionId" = a."lawRevisionId"
       )
     GROUP BY l.id
     ORDER BY l."egovLawId"`,
    editionKey,
  );

  const result = await prisma.$transaction(async (tx) => {
    // source側が収録外のLinkは派生データなので除去する。
    const deletedSourceLinks = await tx.$executeRawUnsafe(
      `DELETE FROM "Link" link
       USING "Article" source
       WHERE source.id = link."sourceId"
         AND NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = $1
             AND e."lawId" = source."lawId"
             AND e."lawRevisionId" = source."lawRevisionId"
         )`,
      editionKey,
    );

    // 収録文書から収録外文書へ向くLinkは、引用文字列を残して未解決化する。
    const unresolvedTargetLinks = await tx.$executeRawUnsafe(
      `UPDATE "Link" link
       SET "targetId" = NULL, "isResolved" = false
       FROM "Article" target
       WHERE target.id = link."targetId"
         AND NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = $1
             AND e."lawId" = target."lawId"
             AND e."lawRevisionId" = target."lawRevisionId"
         )`,
      editionKey,
    );

    const softDeletedArticles = await tx.$executeRawUnsafe(
      `UPDATE "Article" a
       SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE a."deletedAt" IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = $1
             AND e."lawId" = a."lawId"
             AND e."lawRevisionId" = a."lawRevisionId"
         )`,
      editionKey,
    );

    const supersededRevisions = await tx.$executeRawUnsafe(
      `UPDATE "LawRevision" revision
       SET status = 'superseded'::"LawRevisionStatus"
       FROM "Law" law
       WHERE law."currentRevisionId" = revision.id
         AND NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = $1
             AND e."lawId" = law.id
             AND e."lawRevisionId" = revision.id
         )`,
      editionKey,
    );

    const clearedCurrentRevisions = await tx.$executeRawUnsafe(
      `UPDATE "Law" law
       SET "currentRevisionId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
       WHERE law."currentRevisionId" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = $1
             AND e."lawId" = law.id
             AND e."lawRevisionId" = law."currentRevisionId"
         )`,
      editionKey,
    );

    return {
      softDeletedArticles,
      deletedSourceLinks,
      unresolvedTargetLinks,
      supersededRevisions,
      clearedCurrentRevisions,
    };
  });

  return {
    archivedDocuments: archivedRows.map((row) => ({
      egovLawId: row.egovLawId,
      name: row.name,
      activeArticleCount: Number(row.activeArticleCount),
    })),
    ...result,
  };
}
