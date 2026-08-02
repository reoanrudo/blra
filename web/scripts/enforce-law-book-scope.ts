#!/usr/bin/env npx tsx

import { PrismaClient } from "@prisma/client";
import { enforceLawBookScope } from "./lib/enforce-law-book-scope";

const EDITION_KEY = "ksk-2026";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await enforceLawBookScope(prisma, EDITION_KEY);
    console.log(`=== ${EDITION_KEY} 公開範囲の適用 ===`);
    for (const law of result.archivedDocuments) {
      console.log(`対象外: ${law.egovLawId} ${law.name} (${law.activeArticleCount.toLocaleString()}ノード)`);
    }
    console.log(`Article soft delete: ${result.softDeletedArticles.toLocaleString()}`);
    console.log(`対象外source Link削除: ${result.deletedSourceLinks.toLocaleString()}`);
    console.log(`対象外target Link未解決化: ${result.unresolvedTargetLinks.toLocaleString()}`);
    console.log(`Revision superseded: ${result.supersededRevisions}`);
    console.log(`Law currentRevision解除: ${result.clearedCurrentRevisions}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
