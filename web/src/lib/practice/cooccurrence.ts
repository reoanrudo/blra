import { prisma } from "@/lib/db";
import { type RecommendationItem } from "@/types/recommendations";

const COOCCUR_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const COLD_START_THRESHOLD = 50;
const DEFAULT_LIMIT = 5;

/**
 * Update co-occurrence when a user views an article.
 * Links to the immediately preceding view event within the 30-minute window.
 * Skips if the same articleId was viewed consecutively.
 */
export async function updateCooccurrence(
  userId: string,
  articleId: string,
  viewedAt: Date,
): Promise<void> {
  // Get the user's immediately preceding view event
  const prevView = await prisma.userActivity.findFirst({
    where: { userId, type: "view", articleId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { articleId: true, createdAt: true },
  });

  if (!prevView || !prevView.articleId) return;

  // Skip if same article was viewed consecutively
  if (prevView.articleId === articleId) return;

  // Check if within the 30-minute window
  const elapsed = viewedAt.getTime() - prevView.createdAt.getTime();
  if (elapsed > COOCCUR_WINDOW_MS || elapsed < 0) return;

  // Upsert co-occurrence pair (A -> B)
  await prisma.articleCooccurrence.upsert({
    where: { articleId_relatedId: { articleId: prevView.articleId, relatedId: articleId } },
    update: { cooccurCount: { increment: 1 } },
    create: { articleId: prevView.articleId, relatedId: articleId, cooccurCount: 1 },
  });
}

/**
 * Get recommendations for an article based on co-occurrence data.
 * Returns up to `limit` articles ordered by cooccurCount descending.
 */
export async function getRecommendations(
  articleId: string,
  options?: { regulationType?: string; limit?: number },
): Promise<RecommendationItem[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;

  let query: string;
  const params: unknown[] = [];

  if (options?.regulationType) {
    query = `
      SELECT
        a.id AS "articleId",
        a."articleNumber" AS "articleNumber",
        a."articleNumberNormalized" AS "articleNumberNormalized",
        a.caption AS "caption",
        l."shortName" AS "lawShortName",
        a."regulationType" AS "regulationType",
        ac."cooccurCount" AS "cooccurCount"
      FROM "ArticleCooccurrence" ac
      JOIN "Article" a ON a.id = ac."relatedId"
      JOIN "Law" l ON l.id = a."lawId"
      WHERE ac."articleId" = $1::text
        AND a."deletedAt" IS NULL
        AND a."regulationType" = $2::text
      ORDER BY ac."cooccurCount" DESC
      LIMIT $3::int
    `;
    params.push(articleId, options.regulationType, limit);
  } else {
    query = `
      SELECT
        a.id AS "articleId",
        a."articleNumber" AS "articleNumber",
        a."articleNumberNormalized" AS "articleNumberNormalized",
        a.caption AS "caption",
        l."shortName" AS "lawShortName",
        a."regulationType" AS "regulationType",
        ac."cooccurCount" AS "cooccurCount"
      FROM "ArticleCooccurrence" ac
      JOIN "Article" a ON a.id = ac."relatedId"
      JOIN "Law" l ON l.id = a."lawId"
      WHERE ac."articleId" = $1::text
        AND a."deletedAt" IS NULL
      ORDER BY ac."cooccurCount" DESC
      LIMIT $2::int
    `;
    params.push(articleId, limit);
  }

  const rows = await prisma.$queryRawUnsafe<RecommendationItem[]>(query, ...params);
  return rows;
}

/**
 * Check if the system is in cold start state (< 50 view events).
 */
export async function isColdStart(): Promise<boolean> {
  const count = await prisma.userActivity.count({
    where: { type: "view" },
  });
  return count < COLD_START_THRESHOLD;
}

/**
 * Get cold-start recommendations based on system packs.
 * Returns other articles in the same pack as the given article.
 */
export async function getColdStartRecommendations(
  articleId: string,
  regulationType?: string,
): Promise<RecommendationItem[]> {
  // Find packs containing this article
  const packItems = await prisma.packItem.findMany({
    where: { articleId },
    select: { packId: true },
  });

  if (packItems.length === 0) return [];

  const packIds = packItems.map((p) => p.packId);

  // Get sibling articles in the same packs
  const siblingItems = await prisma.packItem.findMany({
    where: {
      packId: { in: packIds },
      articleId: { not: articleId },
    },
    select: { articleId: true },
    distinct: ["articleId"],
    take: 20,
  });

  if (siblingItems.length === 0) return [];

  const siblingIds = Array.from(new Set(siblingItems.map((s) => s.articleId)));

  // Fetch article details with regulationType filter
  const whereClause: Record<string, unknown> = {
    id: { in: siblingIds },
    deletedAt: null,
  };
  if (regulationType) {
    whereClause.regulationType = regulationType;
  }

  const articles = await prisma.article.findMany({
    where: whereClause,
    select: {
      id: true,
      articleNumber: true,
      articleNumberNormalized: true,
      caption: true,
      regulationType: true,
      law: { select: { shortName: true } },
    },
    take: DEFAULT_LIMIT,
  });

  return articles.map((a) => ({
    articleId: a.id,
    articleNumber: a.articleNumber,
    articleNumberNormalized: a.articleNumberNormalized,
    caption: a.caption,
    lawShortName: a.law.shortName,
    regulationType: a.regulationType,
    cooccurCount: 0,
  }));
}
