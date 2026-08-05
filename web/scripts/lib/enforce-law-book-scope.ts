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
 * 指定 Edition に収録されていない law を公開コーパスから外す。
 *
 * 不変要件（Task 10）:
 *   - 収録 120 法令の `Law.currentRevisionId` と current Article を Entry Revision の
 *     不一致を理由に変更しない。収録 law の現行 Revision は刷新プロセス（Tasks 4-8）の管理下。
 *   - 非公開化の対象は「当該 law が Edition に1件も Entry を持たない」場合だけ（収録外 law）。
 *   - Article 自体はハイライト等の参照維持のため削除せず、soft delete する。
 */
export async function enforceLawBookScope(
  prisma: PrismaClient,
  editionKey: string,
): Promise<ScopeEnforcementResult> {
  // 収録外 law = 当該 Edition に1件も Entry を持たない law。
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
           AND e."lawId" = l.id
       )
     GROUP BY l.id
     ORDER BY l."egovLawId"`,
    editionKey,
  );

  const result = await prisma.$transaction(async (tx) => {
    // 収録外 law の Article を soft delete する（Revision 一致にかかわらず収録 law は保持）。
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
         )`,
      editionKey,
    );

    // source側が収録外lawのLinkは派生データなので除去する。
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
         )`,
      editionKey,
    );

    // 収録lawから収録外lawへ向くLinkは、引用文字列を残して未解決化する。
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
         )`,
      editionKey,
    );

    // 収録外lawの現行 Revision を superseded にする。
    // 収録120法令の現行 Revision は Entry Revision と一致しなくても維持する。
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
         )`,
      editionKey,
    );

    // 収録外lawの currentRevisionId を解除する。
    // 収録120法令の currentRevisionId は Entry Revision 不一致でも解除しない。
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
