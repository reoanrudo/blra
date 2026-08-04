import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

export interface RelationFixture {
  reviewerId: string;
  revisionId: string;
  sourceArticleId: string;
  targetArticleId: string;
  generatorVersion: string;
}

export async function createRelationFixture(
  prisma: PrismaClient,
): Promise<RelationFixture | null> {
  // DBスキーマが未マイグレーション等で LawBookEntry テーブルが存在しない場合は
  // テストをスキップ（null を返す）する。integration テストは dbAvailable guard で
  // スキップ可能であることが計画書の完了条件になっているため。
  let entry: { lawRevisionId: string | null } | null;
  try {
    entry = await prisma.lawBookEntry.findFirst({
      where: {
        edition: { editionKey: CURRENT_LAW_BOOK_EDITION_KEY },
        law: { egovLawId: "325AC0000000201" },
        lawRevisionId: { not: null },
      },
      select: { lawRevisionId: true },
    });
  } catch {
    return null;
  }
  if (!entry?.lawRevisionId) return null;

  const articles = await prisma.article.findMany({
    where: {
      lawRevisionId: entry.lawRevisionId,
      level: "article",
      deletedAt: null,
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
    take: 2,
  });
  if (articles.length < 2) return null;

  const reviewerId = `relation-test-${randomUUID()}`;
  await prisma.user.create({
    data: {
      id: reviewerId,
      name: "確認済み関連テスト",
      email: `${reviewerId}@example.invalid`,
    },
  });

  return {
    reviewerId,
    revisionId: entry.lawRevisionId,
    sourceArticleId: articles[0].id,
    targetArticleId: articles[1].id,
    generatorVersion: `test:${reviewerId}`,
  };
}

export async function cleanupRelationFixture(
  prisma: PrismaClient,
  fixture: RelationFixture,
): Promise<void> {
  await prisma.confirmedArticleRelation.deleteMany({
    where: {
      OR: [
        { confirmedById: fixture.reviewerId },
        { revokedById: fixture.reviewerId },
      ],
    },
  });
  await prisma.relatedArticleCandidate.deleteMany({
    where: { generatorVersion: fixture.generatorVersion },
  });
  await prisma.user.deleteMany({ where: { id: fixture.reviewerId } });
}
