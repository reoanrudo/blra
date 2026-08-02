import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding ArticleCooccurrence from system packs...");

  // Get all system packs with their items
  const packs = await prisma.pack.findMany({
    where: { type: "system" },
    include: { items: { select: { articleId: true } } },
  });

  if (packs.length === 0) {
    console.log("No system packs found. Skipping.");
    return;
  }

  let totalPairs = 0;

  for (const pack of packs) {
    const articleIds = pack.items.map((i) => i.articleId);

    // Generate all bidirectional pairs within the pack
    for (let i = 0; i < articleIds.length; i++) {
      for (let j = 0; j < articleIds.length; j++) {
        if (i === j) continue;

        await prisma.articleCooccurrence.upsert({
          where: {
            articleId_relatedId: { articleId: articleIds[i], relatedId: articleIds[j] },
          },
          update: {}, // Don't override existing count
          create: { articleId: articleIds[i], relatedId: articleIds[j], cooccurCount: 1 },
        });
        totalPairs++;
      }
    }
  }

  console.log(`Seeded ${totalPairs} co-occurrence pairs across ${packs.length} packs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
