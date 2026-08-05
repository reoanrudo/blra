import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaClientConstructor } from "@prisma/client";
import { getFullLawDocument } from "@/lib/article/full-law-repository";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";
import {
  createCurrentLawRefreshFixture,
  type CurrentLawRefreshFixture,
} from "./current-law-refresh-fixture";

const prisma: PrismaClient = new PrismaClientConstructor();

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$connect();
    const edition = await prisma.lawBookEdition.findUnique({
      where: { editionKey: CURRENT_LAW_BOOK_EDITION_KEY },
      select: { id: true },
    });
    dbAvailable = Boolean(edition);
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // advisory lock が残らないよう解放
  await prisma.$queryRaw`SELECT pg_advisory_unlock_all()`.catch(() => {});
});

describe("現行法令 read scope (integration)", () => {
  let fixture: CurrentLawRefreshFixture;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = undefined as unknown as CurrentLawRefreshFixture;
    }
  });

  it("書籍Entryの固定RevisionではなくLaw.currentRevisionを公開する", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, { activateCandidate: true });
    const activated = fixture.activated!;
    // Entry は activate 後も旧 Revision を指している（read scope テストの前提）
    expect(activated.entryRevisionId).toBe(fixture.oldRevisionId);

    const current = await getFullLawDocument(activated.candidateRevisionId);
    const old = await getFullLawDocument(fixture.oldRevisionId);

    // current Revision の本文は公開される
    expect(current?.revision.id).toBe(activated.candidateRevisionId);
    expect(current?.nodes.map((node) => node.lawRevisionId)).toEqual(
      expect.arrayContaining([activated.candidateRevisionId]),
    );
    // 旧 Revision は Law.currentRevisionId ではないため null
    expect(old).toBeNull();
  });

  it("法令一覧のfirstArticleIdは候補Articleを指し検索結果に旧Articleは0件", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, { activateCandidate: true });
    const activated = fixture.activated!;

    // /api/laws 相当: current scope で最初の Article を取得
    const firstArticleScope = currentLawBookArticleScopeSql("a", "e", "l");
    const firstArticleRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT a."id"
       FROM "LawBookEntry" e
       JOIN "LawBookEdition" edition ON edition."id" = e."editionId"
       JOIN "Law" l ON l."id" = e."lawId"
       JOIN LATERAL (
         SELECT a."id"
         FROM "Article" a
         WHERE a."lawId" = l."id"
           AND a."deletedAt" IS NULL
           AND ${firstArticleScope}
         ORDER BY a."sortOrder", a."id"
         LIMIT 1
       ) a ON true
       WHERE edition."editionKey" = $1
         AND e."lawId" = $2
       ORDER BY e."displayOrder"`,
      CURRENT_LAW_BOOK_EDITION_KEY,
      fixture.lawId,
    );
    expect(firstArticleRows[0]?.id).toBe(activated.candidateArticleId);

    // 検索相当: 旧 Revision の Article は current scope により0件になる
    const searchScope = currentLawBookArticleScopeSql("a", "e", "l");
    const oldSearchRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT a."id"
       FROM "Article" a
       JOIN "Law" l ON a."lawId" = l."id"
       JOIN "LawBookEntry" e
         ON e."lawId" = l."id" AND e."editionId" = (
           SELECT edition."id" FROM "LawBookEdition" edition
           WHERE edition."editionKey" = $1
         )
       WHERE a."lawRevisionId" = $2
         AND a."deletedAt" IS NULL
         AND ${searchScope}`,
      CURRENT_LAW_BOOK_EDITION_KEY,
      fixture.oldRevisionId,
    );
    expect(oldSearchRows).toHaveLength(0);
  });
});
