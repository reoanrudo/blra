import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EDITION_KEY = "ksk-2026";
const CIVIL_CODE_EGOV_ID = "129AC0000000089";

const CIVIL_CODE_PRINTED_ARTICLES = [
  "1",
  "206",
  "207",
  "209",
  "210",
  "211",
  "212",
  "213",
  "213の2",
  "213の3",
  "214",
  "215",
  "216",
  "217",
  "218",
  "219",
  "220",
  "221",
  "222",
  "223",
  "224",
  "225",
  "226",
  "227",
  "228",
  "229",
  "230",
  "231",
  "232",
  "233",
  "234",
  "235",
  "236",
  "237",
  "238",
  "264の2",
  "264の3",
  "264の8",
  "264の9",
  "264の10",
  "264の14",
  "415",
  "541",
  "542",
  "543",
  "559",
  "562",
  "563",
  "564",
  "565",
  "566",
  "567",
  "632",
  "633",
  "634",
  "635",
  "636",
  "637",
  "641",
  "642",
  "709",
] as const;

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$connect();
    const editions = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "LawBookEdition" WHERE "editionKey" = $1',
      EDITION_KEY,
    );
    dbAvailable = Number(editions[0].count) === 1;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("2026年版の有効データ境界 (integration)", () => {
  it("収録台帳外（law単位）のArticleが有効状態で残っていない", async () => {
    if (!dbAvailable) return;

    // 収録 law の current Article（Entry Revision と一致しない刷新版）は維持されるため、
    // Revision 単位ではなく law 単位で収録外を判定する（Task 10 の不変要件）。
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count
       FROM "Article" a
       WHERE a."deletedAt" IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = $1
             AND e."lawId" = a."lawId"
         )`,
      EDITION_KEY,
    );

    expect(Number(rows[0].count)).toBe(0);
  });

  it("収録台帳外（law単位）のArticleを参照する解決済みLinkがない", async () => {
    if (!dbAvailable) return;

    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count
       FROM "Link" link
       JOIN "Article" source ON source.id = link."sourceId"
       LEFT JOIN "Article" target ON target.id = link."targetId"
       WHERE NOT EXISTS (
           SELECT 1
           FROM "LawBookEntry" e
           JOIN "LawBookEdition" edition ON edition.id = e."editionId"
           WHERE edition."editionKey" = $1
             AND e."lawId" = source."lawId"
         )
         OR (
           link."isResolved" = true
           AND target.id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM "LawBookEntry" e
             JOIN "LawBookEdition" edition ON edition.id = e."editionId"
             WHERE edition."editionKey" = $1
               AND e."lawId" = target."lawId"
           )
         )`,
      EDITION_KEY,
    );

    expect(Number(rows[0].count)).toBe(0);
  });

  it("民法（抄）は紙面1242〜1249頁の掲載61条だけをArticle Rangeに持つ", async () => {
    if (!dbAvailable) return;

    const rows = await prisma.$queryRawUnsafe<Array<{ articleNumberNormalized: string }>>(
      `SELECT article."articleNumberNormalized"
       FROM "LawBookEntryRange" range
       JOIN "LawBookEntry" entry ON entry.id = range."lawBookEntryId"
       JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
       JOIN "Law" law ON law.id = entry."lawId"
       JOIN "Article" article
         ON article."lawId" = entry."lawId"
        AND article."lawRevisionId" = entry."lawRevisionId"
        AND article."stableNodeKey" = range."startStableNodeKey"
       WHERE edition."editionKey" = $1
         AND law."egovLawId" = $2
         AND range."rangeType" = 'article'
         AND range."startStableNodeKey" = range."endStableNodeKey"
         AND range."verificationStatus" = 'source_verified'
       ORDER BY range."sortOrder"`,
      EDITION_KEY,
      CIVIL_CODE_EGOV_ID,
    );

    expect(rows.map((row) => row.articleNumberNormalized)).toEqual(CIVIL_CODE_PRINTED_ARTICLES);
  });
});
