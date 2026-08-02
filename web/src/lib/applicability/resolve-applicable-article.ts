import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";
import type { ApplicabilityContextValue } from "./applicability-context";
import {
  selectRevisionForDate,
  type RevisionInterval,
} from "./revision-selection";

export interface ApplicabilitySourceArticle {
  id: string;
  lawId: string;
  lawName: string;
  stableNodeKey: string;
}

export interface ApplicabilityRepository {
  findSourceArticle(
    articleId: string,
  ): Promise<ApplicabilitySourceArticle | null>;
  findRevisionIntervals(lawId: string): Promise<RevisionInterval[]>;
  findArticleInRevision(
    lawRevisionId: string,
    stableNodeKey: string,
  ): Promise<{ id: string } | null>;
}

export type ApplicableArticleResult =
  | {
      kind: "resolved";
      articleId: string;
      sourceArticleId: string;
      lawId: string;
      lawName: string;
      lawRevisionId: string;
      effectiveFrom: string;
      effectiveTo: string | null;
    }
  | {
      kind: "coverage_out_of_range";
      lawId: string;
      lawName: string;
      coverageStart: string | null;
      coverageEnd: string | null;
    }
  | {
      kind: "ambiguous";
      lawId: string;
      lawName: string;
      revisionIds: string[];
    }
  | {
      kind: "article_not_effective";
      lawId: string;
      lawName: string;
      lawRevisionId: string;
      effectiveFrom: string;
      effectiveTo: string | null;
    }
  | { kind: "not_found" };

export async function resolveApplicableArticleWithRepository(
  repository: ApplicabilityRepository,
  articleId: string,
  context: ApplicabilityContextValue,
): Promise<ApplicableArticleResult> {
  const sourceArticle = await repository.findSourceArticle(articleId);
  if (!sourceArticle) return { kind: "not_found" };

  const intervals = await repository.findRevisionIntervals(
    sourceArticle.lawId,
  );
  const selection = selectRevisionForDate(intervals, context.asOf);

  if (selection.kind === "coverage_out_of_range") {
    return {
      kind: "coverage_out_of_range",
      lawId: sourceArticle.lawId,
      lawName: sourceArticle.lawName,
      coverageStart: selection.coverageStart,
      coverageEnd: selection.coverageEnd,
    };
  }

  if (selection.kind === "ambiguous") {
    return {
      kind: "ambiguous",
      lawId: sourceArticle.lawId,
      lawName: sourceArticle.lawName,
      revisionIds: selection.revisionIds,
    };
  }

  const applicableArticle = await repository.findArticleInRevision(
    selection.revisionId,
    sourceArticle.stableNodeKey,
  );
  if (!applicableArticle) {
    return {
      kind: "article_not_effective",
      lawId: sourceArticle.lawId,
      lawName: sourceArticle.lawName,
      lawRevisionId: selection.revisionId,
      effectiveFrom: selection.effectiveFrom,
      effectiveTo: selection.effectiveTo,
    };
  }

  return {
    kind: "resolved",
    articleId: applicableArticle.id,
    sourceArticleId: sourceArticle.id,
    lawId: sourceArticle.lawId,
    lawName: sourceArticle.lawName,
    lawRevisionId: selection.revisionId,
    effectiveFrom: selection.effectiveFrom,
    effectiveTo: selection.effectiveTo,
  };
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const prismaApplicabilityRepository: ApplicabilityRepository = {
  async findSourceArticle(articleId) {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        lawId: true,
        stableNodeKey: true,
        law: { select: { name: true } },
      },
    });
    if (!article) return null;
    return {
      id: article.id,
      lawId: article.lawId,
      lawName: article.law.name,
      stableNodeKey: article.stableNodeKey,
    };
  },

  async findRevisionIntervals(lawId) {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        effectiveFrom: Date;
        effectiveTo: Date | null;
      }>
    >`
      SELECT DISTINCT
        revision.id,
        revision."effectiveFrom",
        revision."effectiveTo"
      FROM "LawRevision" revision
      JOIN "LawBookEntry" entry
        ON entry."lawId" = revision."lawId"
       AND entry."lawRevisionId" = revision.id
      JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
      WHERE revision."lawId" = ${lawId}
        AND edition."editionKey" = ${CURRENT_LAW_BOOK_EDITION_KEY}
        AND EXISTS (
          SELECT 1
          FROM "Article" article
          WHERE article."lawRevisionId" = revision.id
            AND article."deletedAt" IS NULL
        )
      ORDER BY revision."effectiveFrom" ASC
    `;
    return rows.map((row) => ({
      id: row.id,
      effectiveFrom: toIsoDate(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? toIsoDate(row.effectiveTo) : null,
    }));
  },

  async findArticleInRevision(lawRevisionId, stableNodeKey) {
    const scopeSql = lawBookArticleScopeSql("article", "entry");
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
        SELECT article.id
        FROM "Article" article
        JOIN "LawBookEntry" entry
          ON entry."lawId" = article."lawId"
         AND entry."lawRevisionId" = article."lawRevisionId"
        JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
        WHERE article."lawRevisionId" = $1
          AND article."stableNodeKey" = $2
          AND article."deletedAt" IS NULL
          AND edition."editionKey" = $3
          AND ${scopeSql}
        LIMIT 1
      `,
      lawRevisionId,
      stableNodeKey,
      CURRENT_LAW_BOOK_EDITION_KEY,
    );
    return rows[0] ?? null;
  },
};

export function resolveApplicableArticle(
  articleId: string,
  context: ApplicabilityContextValue,
): Promise<ApplicableArticleResult> {
  return resolveApplicableArticleWithRepository(
    prismaApplicabilityRepository,
    articleId,
    context,
  );
}
