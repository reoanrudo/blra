import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("current-law refresh schema", () => {
  it("更新監査・対応表・範囲解決とdurable keyを持つ", async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT
        to_regclass('public."LawRefreshRun"') IS NOT NULL
        AND to_regclass('public."LawRefreshLawResult"') IS NOT NULL
        AND to_regclass('public."LawSyncState"') IS NOT NULL
        AND to_regclass('public."ArticleRevisionMapping"') IS NOT NULL
        AND to_regclass('public."LawBookEntryRangeResolution"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'Article' AND column_name = 'durableNodeKey'
        ) AS ok
    `;
    expect(rows[0].ok).toBe(true);
  });
});
