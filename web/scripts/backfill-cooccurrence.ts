import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COOCCUR_WINDOW_MS = 30 * 60 * 1000;
const BATCH_SIZE = 1000;

interface ViewRow {
  userId: string;
  articleId: string;
  createdAt: Date;
}

async function main() {
  console.log("Backfilling ArticleCooccurrence from UserActivity view events...");

  let offset = 0;
  let totalProcessed = 0;
  let totalPairs = 0;

  while (true) {
    // Fetch view events ordered by user and time
    const views = await prisma.$queryRawUnsafe<ViewRow[]>(
      `
      SELECT "userId", "articleId", "createdAt"
      FROM "UserActivity"
      WHERE type = 'view' AND "articleId" IS NOT NULL
      ORDER BY "userId", "createdAt" ASC
      LIMIT $1 OFFSET $2
      `,
      BATCH_SIZE,
      offset,
    );

    if (views.length === 0) break;

    // Group by user and process time-series pairs
    const userGroups = new Map<string, ViewRow[]>();
    for (const v of views) {
      const group = userGroups.get(v.userId);
      if (group) group.push(v);
      else userGroups.set(v.userId, [v]);
    }

    const userList = Array.from(userGroups.values());
    for (const userViews of userList) {
      for (let i = 1; i < userViews.length; i++) {
        const prev = userViews[i - 1];
        const curr = userViews[i];

        // Skip consecutive same-article views
        if (prev.articleId === curr.articleId) continue;

        // Check 30-minute window
        const elapsed = curr.createdAt.getTime() - prev.createdAt.getTime();
        if (elapsed > COOCCUR_WINDOW_MS || elapsed < 0) continue;

        // Upsert bidirectional pair
        await prisma.articleCooccurrence.upsert({
          where: {
            articleId_relatedId: { articleId: prev.articleId, relatedId: curr.articleId },
          },
          update: { cooccurCount: { increment: 1 } },
          create: { articleId: prev.articleId, relatedId: curr.articleId, cooccurCount: 1 },
        });

        totalPairs++;
      }
    }

    totalProcessed += views.length;
    console.log(`  Processed ${totalProcessed} views, ${totalPairs} pairs so far...`);
    offset += BATCH_SIZE;
  }

  console.log(`Backfill complete. Created/updated ${totalPairs} co-occurrence pairs from ${totalProcessed} view events.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
