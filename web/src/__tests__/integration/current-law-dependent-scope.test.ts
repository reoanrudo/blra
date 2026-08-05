import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaClientConstructor } from "@prisma/client";
import { getIncomingLinksForTree, getOutgoingLinksForTree } from "@/lib/link/link";
import { getConfirmedRelationsDocument } from "@/lib/relations/confirmed-relations-repository";
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

describe("現行法令 dependent scope (integration)", () => {
  let fixture: CurrentLawRefreshFixture;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = undefined as unknown as CurrentLawRefreshFixture;
    }
  });

  it("current exportに旧Revision Articleを含めない", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, { activateCandidate: true });
    const activated = fixture.activated!;

    // current scope 相当のクエリ: export が Article 参照を解決する際と同じ境界
    const scope = currentLawBookArticleScopeSql("a", "e", "l");
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT a."id"
       FROM "Article" a
       JOIN "Law" l ON a."lawId" = l."id"
       JOIN "LawBookEntry" e
         ON e."lawId" = l."id" AND e."editionId" = (
           SELECT edition."id" FROM "LawBookEdition" edition
           WHERE edition."editionKey" = $1
         )
       WHERE a."lawId" = $2
         AND a."deletedAt" IS NULL
         AND ${scope}`,
      CURRENT_LAW_BOOK_EDITION_KEY,
      fixture.lawId,
    );
    const ids = rows.map((row) => row.id);

    // 候補(current) Article は含まれる
    expect(ids).toContain(activated.candidateArticleId);
    // 旧 Revision の Article は含まれない
    expect(ids).not.toContain(fixture.oldArticleId);
  });

  it("旧Revisionだけに解決済みLinkがあってもcurrent Articleへ見せない", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, { activateCandidate: true });
    const activated = fixture.activated!;

    // 旧 Revision の Article 同士で解決済み Link を作成（target は候補 Article へ）
    await prisma.link.create({
      data: {
        id: `law-refresh-test-link-${activated.candidateArticleId}`,
        sourceId: fixture.oldArticleId,
        targetId: activated.candidateArticleId,
        linkType: "internal",
        sourceRange: "0-10",
        isResolved: true,
        targetLawName: null,
        targetText: "テスト参照",
        targetArticleNumberNormalized: "20",
      },
    });

    // current Article の outgoing links: source が current なので取得できるが、
    // source が旧 Revision の Link は公開しない（incoming としても旧 source を弾く）
    const outgoing = await getOutgoingLinksForTree([activated.candidateArticleId]);
    // current Article は Link を1つも持たない（旧 Article からの Link は incoming 扱い）
    expect(outgoing.filter((link) => link.sourceId === activated.candidateArticleId)).toEqual([]);

    // incoming も取得しない: source が旧 Revision だから current 公開条件を満たさない
    const incoming = await getIncomingLinksForTree([activated.candidateArticleId]);
    expect(incoming).toEqual([]);
  });

  it("旧Revisionだけにある確認済み関係をcurrent文書へ返さない", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, { activateCandidate: true });
    const activated = fixture.activated!;

    // 確認者を作成
    const reviewerId = `law-refresh-test-reviewer-${activated.candidateRevisionId.slice(-12)}`;
    await prisma.user.create({
      data: {
        id: reviewerId,
        name: "dependent scope テスト",
        email: `${reviewerId}@example.invalid`,
      },
    });

    try {
      // 旧 Revision の Article 同士で確認済み関係を作成
      // target として候補 Article を使うが、source は旧 Revision のまま
      await prisma.confirmedArticleRelation.create({
        data: {
          sourceArticleId: fixture.oldArticleId,
          targetArticleId: activated.candidateArticleId,
          relationType: "CITES",
          rationale: "旧Revisionの確認関係",
          origin: "MANUAL",
          confirmedById: reviewerId,
          confirmedAt: new Date(),
        },
      });

      // current Revision の確認済み関係ドキュメントを取得
      const doc = await getConfirmedRelationsDocument(activated.candidateRevisionId);
      expect(doc).not.toBeNull();
      // 旧 Revision の source を持つ関係は current ドキュメントへ含まれない
      const allRelations = doc
        ? Object.values(doc.relationsBySource).flat()
        : [];
      expect(allRelations).toEqual([]);
    } finally {
      await prisma.confirmedArticleRelation
        .deleteMany({ where: { confirmedById: reviewerId } })
        .catch(() => {});
      await prisma.user.deleteMany({ where: { id: reviewerId } }).catch(() => {});
    }
  });
});
