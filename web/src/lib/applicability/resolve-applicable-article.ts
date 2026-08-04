import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";
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
  findCurrentRevisionId(lawId: string): Promise<string | null>;
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

/**
 * 適用時点解決のエントリポイント。
 *
 * - `context.snapshotLawRevisionId` が指定された場合は、その Revision を明示的に使う
 *   （履歴表示用）。asOf による Revision 選択は行わない。
 * - 未指定の場合は `Law.currentRevisionId` を既定とし、current Article を返す。
 *   旧 Revision を current へコピーすることはない。
 *
 * 互換のため、context に snapshot も current も取れないフォールバック経路
 * （findCurrentRevisionId が null を返した場合）は従来通り asOf ベースで Revision を選択する。
 */
export async function resolveApplicableArticleWithRepository(
  repository: ApplicabilityRepository,
  articleId: string,
  context: ApplicabilityContextValue,
): Promise<ApplicableArticleResult> {
  const sourceArticle = await repository.findSourceArticle(articleId);
  if (!sourceArticle) return { kind: "not_found" };

  const snapshot = readSnapshotLawRevisionId(context);

  // snapshot 明示: 指定 Revision で直接解決する（履歴表示用）
  if (snapshot) {
    const applicableArticle = await repository.findArticleInRevision(
      snapshot,
      sourceArticle.stableNodeKey,
    );
    if (!applicableArticle) {
      return {
        kind: "article_not_effective",
        lawId: sourceArticle.lawId,
        lawName: sourceArticle.lawName,
        lawRevisionId: snapshot,
        effectiveFrom: context.asOf,
        effectiveTo: null,
      };
    }
    return {
      kind: "resolved",
      articleId: applicableArticle.id,
      sourceArticleId: sourceArticle.id,
      lawId: sourceArticle.lawId,
      lawName: sourceArticle.lawName,
      lawRevisionId: snapshot,
      effectiveFrom: context.asOf,
      effectiveTo: null,
    };
  }

  // current 既定: Law.currentRevisionId を使う
  const currentRevisionId = await repository.findCurrentRevisionId(
    sourceArticle.lawId,
  );
  if (currentRevisionId) {
    const applicableArticle = await repository.findArticleInRevision(
      currentRevisionId,
      sourceArticle.stableNodeKey,
    );
    if (!applicableArticle) {
      return {
        kind: "article_not_effective",
        lawId: sourceArticle.lawId,
        lawName: sourceArticle.lawName,
        lawRevisionId: currentRevisionId,
        effectiveFrom: context.asOf,
        effectiveTo: null,
      };
    }
    return {
      kind: "resolved",
      articleId: applicableArticle.id,
      sourceArticleId: sourceArticle.id,
      lawId: sourceArticle.lawId,
      lawName: sourceArticle.lawName,
      lawRevisionId: currentRevisionId,
      effectiveFrom: context.asOf,
      effectiveTo: null,
    };
  }

  // フォールバック: current Revision が取れない場合は asOf ベースで Revision を選択する。
  // （旧 Revision の Article が source のまま残っている履歴シナリオ等）
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

/**
 * context から snapshot Revision ID を安全に取り出す。
 * ApplicabilityContextValue 型には含まれない実行時プロパティ（route handler 経由で
 * 受け取る query string 等）を許容するため、unknown として読む。
 */
function readSnapshotLawRevisionId(
  context: ApplicabilityContextValue,
): string | null {
  const value = (context as unknown as Record<string, unknown>)
    .snapshotLawRevisionId;
  return typeof value === "string" && value.length > 0 ? value : null;
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

  async findCurrentRevisionId(lawId) {
    const law = await prisma.law.findUnique({
      where: { id: lawId },
      select: { currentRevisionId: true },
    });
    return law?.currentRevisionId ?? null;
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
    // current 既定: snapshot でない通常ケースでは Law.currentRevisionId を使うため、
    // ここでは指定 Revision が current であることを検査する current scope を適用する。
    // snapshot 明示時も、表示対象 Revision が現行法令集へ収録されていることだけを検査する。
    const scopeSql = currentLawBookArticleScopeSql("article", "entry", "law");
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
        SELECT article.id
        FROM "Article" article
        JOIN "Law" law ON law."id" = article."lawId"
        JOIN "LawBookEntry" entry
          ON entry."lawId" = law."id"
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
