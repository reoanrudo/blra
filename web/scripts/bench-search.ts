#!/usr/bin/env npx tsx
/**
 * Bench: pg_bigm full-text search latency
 * 10 queries × 30 runs each. Reports avg/p50/p99.
 * Target: avg < 200ms.
 */

import { PrismaClient } from "@prisma/client";
import { LAW_BOOK_EDITION_2026 } from "./law-book-2026";
import { lawBookArticleScopeSql } from "../src/lib/law-book/sql-scope";

const prisma = new PrismaClient();

const QUERIES = [
  "耐火",
  "採光",
  "防火",
  "内装",
  "容積",
  "建蔽",
  "避難",
  "居室",
  "構造",
  "安全",
];

const RUNS = 30;

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runQuery(query: string): Promise<number> {
  const start = performance.now();
  const lawBookScope = lawBookArticleScopeSql("a", "e");
  await prisma.$queryRawUnsafe<unknown[]>(
    `
    SELECT a.id, a."articleNumber", a."caption", a."text",
           l.name AS "lawName", l."shortName"
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l.id
    JOIN "LawBookEntry" e
      ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE a."deletedAt" IS NULL
      AND edition."editionKey" = $2
      AND ${lawBookScope}
      AND a.level = 'article'
      AND (a.text LIKE $1 OR a.caption LIKE $1)
    ORDER BY
      CASE WHEN a.caption LIKE $1 THEN 0.5 ELSE 0 END +
      (SELECT count(*) FROM unnest(string_to_array(a.text, '')) t WHERE t = $1) DESC
    LIMIT 20
    `,
    `%${query}%`,
    LAW_BOOK_EDITION_2026.editionKey,
  );
  return performance.now() - start;
}

async function main() {
  console.log("=== Search Benchmark: 10 queries × 30 runs ===\n");

  const allLatencies: Record<string, number[]> = {};
  let totalRuns = 0;
  let totalMs = 0;

  for (const query of QUERIES) {
    const latencies: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const ms = await runQuery(query);
      latencies.push(ms);
      totalMs += ms;
      totalRuns++;
    }
    allLatencies[query] = latencies;
  }

  console.log("| Query | Runs | Avg (ms) | P50 (ms) | P99 (ms) | Max (ms) |");
  console.log("|---|---|---|---|---|---|");

  let grandAvg = 0;
  let grandP50 = 0;
  let grandP99 = 0;
  let grandMax = 0;

  for (const query of QUERIES) {
    const lat = allLatencies[query].sort((a, b) => a - b);
    const avg = lat.reduce((s, v) => s + v, 0) / lat.length;
    const p50 = percentile(lat, 50);
    const p99 = percentile(lat, 99);
    const max = lat[lat.length - 1];
    grandAvg += avg;
    grandP50 = Math.max(grandP50, p50);
    grandP99 = Math.max(grandP99, p99);
    grandMax = Math.max(grandMax, max);
    console.log(`| ${query} | ${RUNS} | ${avg.toFixed(1)} | ${p50.toFixed(1)} | ${p99.toFixed(1)} | ${max.toFixed(1)} |`);
  }

  grandAvg /= QUERIES.length;
  const overallAvg = totalMs / totalRuns;

  console.log(`\n**Overall**: avg=${overallAvg.toFixed(1)}ms | per-query avg=${grandAvg.toFixed(1)}ms | max P99=${grandP99.toFixed(1)}ms`);

  if (overallAvg < 200) {
    console.log("✅ PASS: avg < 200ms target met");
  } else {
    console.log(`❌ FAIL: avg ${overallAvg.toFixed(1)}ms exceeds 200ms target`);
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
