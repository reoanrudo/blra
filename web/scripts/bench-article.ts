#!/usr/bin/env npx tsx
/**
 * Bench: Article tree fetch latency
 * 10 representative articles × 30 runs each. Reports avg.
 * Target: avg < 300ms.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RUNS = 30;

/** Fetch and measure a single article tree query */
async function fetchArticle(articleId: string): Promise<number> {
  const start = performance.now();
  await prisma.$queryRawUnsafe<unknown[]>(
    `
    WITH RECURSIVE article_tree AS (
      SELECT a.*, l.name AS "lawName", 0 AS depth
      FROM "Article" a
      JOIN "Law" l ON a."lawId" = l.id
      WHERE a.id = $1 AND a."deletedAt" IS NULL

      UNION ALL

      SELECT a.*, at."lawName", at.depth + 1
      FROM "Article" a
      INNER JOIN article_tree at ON a."parentId" = at.id
      WHERE a."deletedAt" IS NULL
    )
    SELECT * FROM article_tree ORDER BY depth, "sortOrder"
    `,
    articleId,
  );
  return performance.now() - start;
}

async function main() {
  console.log("=== Article Benchmark: N articles × 30 runs ===\n");

  // Pick 10 article-level rows from both laws
  const articles = await prisma.article.findMany({
    where: { level: "article", deletedAt: null },
    select: { id: true, articleNumber: true, law: { select: { shortName: true } } },
    take: 10,
    orderBy: { sortOrder: "asc" },
  });

  if (articles.length === 0) {
    console.log("SKIP: No article data found in DB");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${articles.length} article(s) for benchmark\n`);

  const allLatencies: { label: string; latencies: number[] }[] = [];

  for (const article of articles) {
    const label = `${article.law.shortName ?? "?"} 第${article.articleNumber}条`;
    const latencies: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      latencies.push(await fetchArticle(article.id));
    }
    allLatencies.push({ label, latencies });
  }

  console.log("| Article | Runs | Avg (ms) | Min (ms) | Max (ms) |");
  console.log("|---|---|---|---|---|");

  let grandTotal = 0;
  let grandCount = 0;

  for (const { label, latencies } of allLatencies) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    grandTotal += sorted.reduce((s, v) => s + v, 0);
    grandCount += sorted.length;
    console.log(`| ${label} | ${RUNS} | ${avg.toFixed(1)} | ${min.toFixed(1)} | ${max.toFixed(1)} |`);
  }

  const overallAvg = grandTotal / grandCount;
  console.log(`\n**Overall avg**: ${overallAvg.toFixed(1)}ms`);

  if (overallAvg < 300) {
    console.log("✅ PASS: avg < 300ms target met");
  } else {
    console.log(`❌ FAIL: avg ${overallAvg.toFixed(1)}ms exceeds 300ms target`);
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
