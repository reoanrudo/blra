import { PrismaClient } from "@prisma/client";
import { seedSectionRules } from "./seed-section-rules";
import { seedArticleRules } from "./seed-article-rules";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Condition Highlight Seed Start ===");
  await seedSectionRules();
  await seedArticleRules();
  console.log("=== Condition Highlight Seed Done ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
