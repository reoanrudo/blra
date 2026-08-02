#!/usr/bin/env npx tsx

import { PrismaClient } from "@prisma/client";
import { seedVerifiedExcerptRanges } from "./lib/seed-verified-excerpt-ranges";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const count = await seedVerifiedExcerptRanges(prisma);
    console.log(`民法（抄）Article Range: ${count}件`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
