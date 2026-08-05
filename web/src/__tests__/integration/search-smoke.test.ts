import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";

/**
 * Integration test: pg_bigm search performance with EXPLAIN ANALYZE.
 * SKIP if no DATABASE_URL or DB unreachable.
 */

const prisma = new PrismaClient();

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$connect();
    const count = await prisma.article.count({ where: { deletedAt: null } });
    dbAvailable = count > 0;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

const SEARCH_QUERIES = ["耐火", "採光", "防火", "内装", "容積", "建蔽", "避難", "居室"];

async function searchArticles(query: string): Promise<{ ms: number; rows: unknown[] }> {
  const start = performance.now();
  const currentScope = currentLawBookArticleScopeSql("a", "e", "l");
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT a.id, a."articleNumber", a."caption", a."text",
            l.name AS "lawName"
     FROM "Article" a
     JOIN "Law" l ON a."lawId" = l.id
     JOIN "LawBookEntry" e
       ON e."lawId" = l."id"
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     WHERE a."deletedAt" IS NULL
       AND edition."editionKey" = $2
       AND ${currentScope}
       AND a.level = 'article'
       AND (a.text LIKE $1 OR a.caption LIKE $1)
     ORDER BY
       CASE WHEN a.caption LIKE $1 THEN 0.5 ELSE 0 END DESC
     LIMIT 20`,
    `%${query}%`,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  const ms = performance.now() - start;
  return { ms, rows };
}

describe("pg_bigm Search Smoke (integration)", () => {
  it("DB is available", () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database not available or empty. Run `npx tsx scripts/ingest.ts` first.");
      return;
    }
    expect(dbAvailable).toBe(true);
  });

  for (const q of SEARCH_QUERIES) {
    it(`search "${q}" returns results`, async () => {
      if (!dbAvailable) return;
      const { rows } = await searchArticles(q);
      expect(rows).not.toHaveLength(0);
    });
  }

  it("search latency is under 200ms avg (5 warmup + 5 measured runs)", async () => {
    if (!dbAvailable) return;
    const latencies: number[] = [];

    // Warmup
    for (let i = 0; i < 5; i++) {
      await searchArticles("耐火");
    }

    for (let i = 0; i < 5; i++) {
      const { ms } = await searchArticles("耐火構造");
      latencies.push(ms);
    }

    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    console.log(`Search avg: ${avg.toFixed(1)}ms (${latencies.map((l) => l.toFixed(1)).join(", ")}ms)`);

    expect(avg).toBeLessThan(200);
  });

  it("EXPLAIN ANALYZE confirms index scan for search query", async () => {
    if (!dbAvailable) return;
    const rows = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN ANALYZE
       SELECT a.id, a."articleNumber"
       FROM "Article" a
       WHERE a."deletedAt" IS NULL
         AND a.level = 'article'
         AND a.text LIKE $1
       LIMIT 20`,
      `%耐火%`,
    );
    const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
    console.log("EXPLAIN ANALYZE:\n", plan);
    // Should show index scan, not seq scan
    expect(plan).toContain("Index");
  });
});
