import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";

const MAX_SEARCH_RECORDS = 100;
const MAX_VIEW_RECORDS = 200;

export async function recordSearch(query: string, resultCount: number): Promise<void> {
  const userId = await getOrCreateDefaultUser();
  await prisma.userActivity.create({
    data: {
      userId,
      type: "search",
      query,
      payload: { resultCount },
    },
  });

  // Enforce cap: delete oldest search records beyond 100
  const searchRecords = await prisma.userActivity.findMany({
    where: { userId, type: "search" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: MAX_SEARCH_RECORDS,
  });
  if (searchRecords.length > 0) {
    await prisma.userActivity.deleteMany({
      where: { id: { in: searchRecords.map((r) => r.id) } },
    });
  }
}

export async function recordView(
  articleId: string,
  articleNumber: string | null,
  caption: string | null,
): Promise<void> {
  const userId = await getOrCreateDefaultUser();
  await prisma.userActivity.create({
    data: {
      userId,
      type: "view",
      articleId,
      payload: {
        articleNumberNormalized: articleNumber,
        caption,
      },
    },
  });

  // Enforce cap: delete oldest view records beyond 200
  const viewRecords = await prisma.userActivity.findMany({
    where: { userId, type: "view" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: MAX_VIEW_RECORDS,
  });
  if (viewRecords.length > 0) {
    await prisma.userActivity.deleteMany({
      where: { id: { in: viewRecords.map((r) => r.id) } },
    });
  }
}

export async function getRecentSearches(limit = 5): Promise<string[]> {
  const userId = await getOrCreateDefaultUser();
  const rows = await prisma.userActivity.findMany({
    where: { userId, type: "search", query: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { query: true },
  });
  return rows.map((r) => r.query!);
}
