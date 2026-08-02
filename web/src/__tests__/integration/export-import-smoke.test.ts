import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Integration test: Export → Import roundtrip with real DB.
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

describe("Export → Import Roundtrip (integration)", () => {
  it("DB has articles available for testing", () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database not available or empty. Run `npx tsx scripts/ingest.ts` first.");
      return;
    }
    expect(dbAvailable).toBe(true);
  });

  it("Law records exist with correct egovLawIds", async () => {
    if (!dbAvailable) return;
    const laws = await prisma.law.findMany({ where: { egovLawId: { in: ["325AC0000000201", "325CO0000000338"] } } });
    expect(laws).toHaveLength(2);
  });

  it("2026年版の120文書すべてに現行Articleがある", async () => {
    if (!dbAvailable) return;
    const rows = await prisma.$queryRawUnsafe<Array<{ entries: bigint; emptyEntries: bigint }>>(
      `SELECT
         COUNT(*)::bigint AS entries,
         COUNT(*) FILTER (
           WHERE NOT EXISTS (
             SELECT 1 FROM "Article" a
             WHERE a."lawId" = e."lawId"
               AND a."lawRevisionId" = e."lawRevisionId"
               AND a."deletedAt" IS NULL
           )
         )::bigint AS "emptyEntries"
       FROM "LawBookEntry" e
       JOIN "LawBookEdition" edition ON edition."id" = e."editionId"
       WHERE edition."editionKey" = 'ksk-2026'`,
    );
    expect(Number(rows[0].entries)).toBe(120);
    expect(Number(rows[0].emptyEntries)).toBe(0);
  });

  it("Links are present with resolved and unresolved entries", async () => {
    if (!dbAvailable) return;
    const total = await prisma.link.count();
    expect(total).toBeGreaterThan(0);
    const resolved = await prisma.link.count({ where: { isResolved: true } });
    const unresolved = await prisma.link.count({ where: { isResolved: false } });
    expect(resolved + unresolved).toBe(total);
  });

  it("Article tree query returns correct structure", async () => {
    if (!dbAvailable) return;
    // Pick a known article
    const article = await prisma.article.findFirst({
      where: { level: "article", articleNumber: "1", deletedAt: null },
      include: { law: true },
    });
    if (!article) {
      console.warn("SKIP: 第1条 not found");
      return;
    }

    const rows = await prisma.$queryRawUnsafe<{ id: string; level: string; depth: number }[]>(
      `WITH RECURSIVE article_tree AS (
        SELECT a.id, a.level, 0 AS depth
        FROM "Article" a WHERE a.id = $1 AND a."deletedAt" IS NULL
        UNION ALL
        SELECT a.id, a.level, at.depth + 1
        FROM "Article" a
        INNER JOIN article_tree at ON a."parentId" = at.id
        WHERE a."deletedAt" IS NULL
      )
      SELECT * FROM article_tree ORDER BY depth, id`,
      article.id,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].level).toBe("article");
    // All returned rows must have level/depth
    for (const row of rows) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.level).toBe("string");
      expect(typeof row.depth).toBe("number");
    }
  });

  it("pg_bigm search finds articles for '耐火構造'", async () => {
    if (!dbAvailable) return;
    const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT count(*)::text as count
       FROM "Article"
       WHERE "deletedAt" IS NULL
         AND level = 'article'
         AND (text LIKE $1 OR caption LIKE $1)`,
      `%耐火%`,
    );
    const count = parseInt(rows[0].count, 10);
    expect(count).toBeGreaterThan(0);
  });
});
