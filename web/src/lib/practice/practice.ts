import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";
import type {
  PracticeTopic,
  ArticlePracticeTopic,
  Pack,
  PackItem,
  UserActivity,
  CheckItem,
} from "@prisma/client";

// ─── PracticeTopic ───

export interface TopicWithArticleCount extends PracticeTopic {
  articleCount: number;
}

export async function listPracticeTopics(): Promise<TopicWithArticleCount[]> {
  const topics = await prisma.practiceTopic.findMany({
    orderBy: { name: "asc" },
    include: { articles: true },
  });
  return topics.map((t) => ({
    ...t,
    articleCount: t.articles.length,
  }));
}

export async function getPracticeTopic(
  topicId: string,
): Promise<PracticeTopic | null> {
  return prisma.practiceTopic.findUnique({ where: { id: topicId } });
}

export async function getArticlesForTopic(
  topicId: string,
): Promise<
  {
    id: string;
    articleId: string;
    articleNumber: string | null;
    articleNumberNormalized: string | null;
    caption: string | null;
    lawShortName: string | null;
    lawName: string;
  }[]
> {
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      articleId: string;
      articleNumber: string | null;
      articleNumberNormalized: string | null;
      caption: string | null;
      lawShortName: string | null;
      lawName: string;
    }[]
  >(
    `SELECT
      apt.id,
      apt."articleId",
      a."articleNumber",
      a."articleNumberNormalized",
      a."caption",
      l."shortName" AS "lawShortName",
      l."name" AS "lawName"
    FROM "ArticlePracticeTopic" apt
    JOIN "Article" a ON apt."articleId" = a.id AND a."deletedAt" IS NULL
    JOIN "Law" l ON a."lawId" = l.id
    WHERE apt."topicId" = $1
    ORDER BY a."sortOrder"`,
    topicId,
  );
  return rows;
}

// ─── Packs ───

export interface PackWithItems extends Pack {
  items: (PackItem & {
    articleNumber: string | null;
    articleNumberNormalized: string | null;
    caption: string | null;
    lawShortName: string | null;
  })[];
}

export async function listPacks(): Promise<Pack[]> {
  const userId = await getOrCreateDefaultUser();
  return prisma.pack.findMany({
    where: { OR: [{ type: "system" }, { ownerId: userId }] },
    orderBy: [{ type: "asc" }, { createdAt: "desc" }],
  });
}

export async function getPack(packId: string): Promise<PackWithItems | null> {
  const pack = await prisma.pack.findUnique({
    where: { id: packId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!pack) return null;

  // Batch-fetch article info for all pack items (single query, no N+1)
  const articleIds = pack.items.map((i) => i.articleId);
  const articles =
    articleIds.length > 0
      ? await prisma.$queryRawUnsafe<
          {
            id: string;
            articleNumber: string | null;
            articleNumberNormalized: string | null;
            caption: string | null;
            lawShortName: string | null;
          }[]
        >(
          `SELECT
            a.id,
            a."articleNumber",
            a."articleNumberNormalized",
            a."caption",
            l."shortName" AS "lawShortName"
          FROM "Article" a
          JOIN "Law" l ON a."lawId" = l.id
          WHERE a.id IN (${articleIds.map((_, i) => `$${i + 1}`).join(", ")})
            AND a."deletedAt" IS NULL`,
          ...articleIds,
        )
      : [];

  const articleMap = new Map(articles.map((a) => [a.id, a]));

  return {
    ...pack,
    items: pack.items.map((item) => {
      const a = articleMap.get(item.articleId);
      return {
        ...item,
        articleNumber: a?.articleNumber ?? null,
        articleNumberNormalized: a?.articleNumberNormalized ?? null,
        caption: a?.caption ?? null,
        lawShortName: a?.lawShortName ?? null,
      };
    }),
  };
}

export async function createUserPack(name: string): Promise<Pack> {
  const userId = await getOrCreateDefaultUser();
  return prisma.pack.create({
    data: { name, type: "user", ownerId: userId },
  });
}

export async function addPackItem(
  packId: string,
  articleId: string,
  sortOrder?: number,
): Promise<PackItem | null> {
  const userId = await getOrCreateDefaultUser();
  const pack = await prisma.pack.findFirst({
    where: { id: packId, OR: [{ type: "system" }, { ownerId: userId }] },
  });
  if (!pack) return null;

  // Auto-assign sortOrder if not provided
  const order = sortOrder ?? (await getNextPackItemOrder(packId));

  return prisma.packItem.create({
    data: { packId, articleId, sortOrder: order },
  });
}

export async function updatePackItem(
  packItemId: string,
  data: { checked?: boolean; note?: string },
): Promise<PackItem | null> {
  const userId = await getOrCreateDefaultUser();
  const item = await prisma.packItem.findFirst({
    where: { id: packItemId },
    include: { pack: { select: { ownerId: true, type: true } } },
  });
  if (!item) return null;
  // Allow updates only for own user packs or system packs
  if (item.pack.type !== "system" && item.pack.ownerId !== userId) return null;
  return prisma.packItem.update({ where: { id: packItemId }, data });
}

export async function removePackItem(packItemId: string): Promise<void> {
  const userId = await getOrCreateDefaultUser();
  const item = await prisma.packItem.findFirst({
    where: { id: packItemId },
    include: { pack: { select: { ownerId: true, type: true } } },
  });
  if (!item) return;
  if (item.pack.type !== "system" && item.pack.ownerId !== userId) return;
  await prisma.packItem.delete({ where: { id: packItemId } });
}

async function getNextPackItemOrder(packId: string): Promise<number> {
  const last = await prisma.packItem.findFirst({
    where: { packId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

// ─── UserActivity (view history) ───

export interface ViewHistoryEntry {
  id: string;
  articleId: string;
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  caption: string | null;
  lawShortName: string | null;
  viewedAt: Date;
}

export async function getViewHistory(
  limit = 20,
): Promise<ViewHistoryEntry[]> {
  const userId = await getOrCreateDefaultUser();
  const activities = await prisma.userActivity.findMany({
    where: { userId, type: "view", articleId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, articleId: true, createdAt: true },
  });

  if (activities.length === 0) return [];

  const articleIds = activities.map((a) => a.articleId!);
  const articles = await prisma.$queryRawUnsafe<
    {
      id: string;
      articleNumber: string | null;
      articleNumberNormalized: string | null;
      caption: string | null;
      lawShortName: string | null;
    }[]
  >(
    `SELECT
      a.id,
      a."articleNumber",
      a."articleNumberNormalized",
      a."caption",
      l."shortName" AS "lawShortName"
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l.id
    WHERE a.id IN (${articleIds.map((_, i) => `$${i + 1}`).join(", ")})
      AND a."deletedAt" IS NULL`,
    ...articleIds,
  );

  const articleMap = new Map(articles.map((a) => [a.id, a]));

  return activities.map((act) => {
    const a = articleMap.get(act.articleId!);
    return {
      id: act.id,
      articleId: act.articleId!,
      articleNumber: a?.articleNumber ?? null,
      articleNumberNormalized: a?.articleNumberNormalized ?? null,
      caption: a?.caption ?? null,
      lawShortName: a?.lawShortName ?? null,
      viewedAt: act.createdAt,
    };
  });
}

// ─── CheckItem (for left panel) ───

export interface CheckItemWithArticle extends CheckItem {
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  caption: string | null;
  lawShortName: string | null;
  projectName: string;
}

export async function getRecentCheckItems(
  limit = 20,
): Promise<CheckItemWithArticle[]> {
  const userId = await getOrCreateDefaultUser();
  const items = await prisma.checkItem.findMany({
    where: { project: { userId } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { project: { select: { name: true } } },
  });

  if (items.length === 0) return [];

  const articleIds = items.map((i) => i.articleId);
  const articles = await prisma.$queryRawUnsafe<
    {
      id: string;
      articleNumber: string | null;
      articleNumberNormalized: string | null;
      caption: string | null;
      lawShortName: string | null;
    }[]
  >(
    `SELECT
      a.id,
      a."articleNumber",
      a."articleNumberNormalized",
      a."caption",
      l."shortName" AS "lawShortName"
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l.id
    WHERE a.id IN (${articleIds.map((_, i) => `$${i + 1}`).join(", ")})
      AND a."deletedAt" IS NULL`,
    ...articleIds,
  );

  const articleMap = new Map(articles.map((a) => [a.id, a]));

  return items.map((item) => {
    const a = articleMap.get(item.articleId);
    return {
      ...item,
      articleNumber: a?.articleNumber ?? null,
      articleNumberNormalized: a?.articleNumberNormalized ?? null,
      caption: a?.caption ?? null,
      lawShortName: a?.lawShortName ?? null,
      projectName: item.project.name,
    };
  });
}
