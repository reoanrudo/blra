import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaClientConstructor } from "@prisma/client";
import {
  createCurrentLawRefreshFixture,
  type CurrentLawRefreshFixture,
} from "./current-law-refresh-fixture";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import {
  createPrismaArticleSuccessorRepository,
  resolveArticleRoute,
} from "@/lib/law-refresh/article-successor";
import { getHistoricalArticleWithTree } from "@/lib/article/article";

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

describe("旧URLの現行条文転送・履歴表示 (integration)", () => {
  let fixture: CurrentLawRefreshFixture;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = undefined as unknown as CurrentLawRefreshFixture;
    }
  });

  it("旧Articleを確定mappingで現行Articleへredirect解決する", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, {
      activateCandidate: true,
    });
    const activated = fixture.activated!;

    // 旧 Article → 候補 Article（第20条想定）の確定 mapping を作成。
    await prisma.articleRevisionMapping.create({
      data: {
        lawId: fixture.lawId,
        fromRevisionId: fixture.oldRevisionId,
        toRevisionId: activated.candidateRevisionId,
        fromArticleId: fixture.oldArticleId,
        toArticleId: activated.candidateArticleId,
        kind: "modified",
        status: "verified",
        method: "test",
      },
    });

    const repository = createPrismaArticleSuccessorRepository(prisma);
    const resolution = await resolveArticleRoute(
      fixture.oldArticleId,
      repository,
    );

    expect(resolution).toEqual({
      kind: "redirect",
      articleId: activated.candidateArticleId,
    });
  });

  it("削除確定mappingはremoved解決する", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, {
      activateCandidate: true,
    });
    const activated = fixture.activated!;

    // 旧 Article を removed 扱いの mapping で確定。
    await prisma.articleRevisionMapping.create({
      data: {
        lawId: fixture.lawId,
        fromRevisionId: fixture.oldRevisionId,
        toRevisionId: activated.candidateRevisionId,
        fromArticleId: fixture.oldArticleId,
        toArticleId: null,
        kind: "removed",
        status: "verified",
        method: "test",
      },
    });

    const repository = createPrismaArticleSuccessorRepository(prisma);
    const resolution = await resolveArticleRoute(
      fixture.oldArticleId,
      repository,
    );

    expect(resolution.kind).toBe("removed");
    if (resolution.kind === "removed") {
      expect(resolution.articleId).toBe(fixture.oldArticleId);
      expect(resolution.currentLawRevisionId).toBe(
        activated.candidateRevisionId,
      );
    }
  });

  it("mapping未作成の旧Articleはhistorical(unmapped)解決する", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, {
      activateCandidate: true,
    });

    const repository = createPrismaArticleSuccessorRepository(prisma);
    const resolution = await resolveArticleRoute(
      fixture.oldArticleId,
      repository,
    );

    expect(resolution).toEqual({
      kind: "historical",
      articleId: fixture.oldArticleId,
      reason: "unmapped",
    });
  });

  it("getHistoricalArticleWithTreeは現行scopeを迂回して旧本文を返す", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, {
      activateCandidate: true,
    });

    const historical = await getHistoricalArticleWithTree(fixture.oldArticleId);
    expect(historical).not.toBeNull();
    expect(historical!.tree.length).toBeGreaterThan(0);
    expect(historical!.tree[0]!.id).toBe(fixture.oldArticleId);
    expect(historical!.lawName).toContain("law-refresh-test");
  });

  it("保存済み利用者データは後継mapping作成後もarticleId/snapshotを維持する", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }
    fixture = await createCurrentLawRefreshFixture(prisma, {
      activateCandidate: true,
    });
    const activated = fixture.activated!;

    // テスト用 User を作成（cleanup 対象へ含めるため fixture 由由ではないが、
    // lawId cleanup で Article が消えるため User だけ別途残る点に注意。
    // ここでは User を作成しテスト終了時に削除する）。
    const userId = `law-refresh-test-user-${fixture.runId}`;
    await prisma.user.create({
      data: { id: userId, name: "test", email: `${userId}@example.invalid` },
    });

    try {
      // 旧 Article へ UserHighlight と ArticleAnnotation を作成。
      // snapshotLawRevisionId に旧 Revision を明示的に埋め込む。
      const highlightId = `${userId}-hl`;
      const annotationId = `${userId}-an`;
      await prisma.userHighlight.create({
        data: {
          id: highlightId,
          userId,
          articleId: fixture.oldArticleId,
          rangeStart: 0,
          rangeEnd: 10,
          color: "red",
          type: "highlight",
          snapshotLawRevisionId: fixture.oldRevisionId,
        },
      });
      await prisma.articleAnnotation.create({
        data: {
          id: annotationId,
          userId,
          articleId: fixture.oldArticleId,
          tag: "review",
          note: "旧条文への注釈",
          snapshotLawRevisionId: fixture.oldRevisionId,
        },
      });

      // 後継 mapping を作成（旧 Article → 候補 Article）。
      await prisma.articleRevisionMapping.create({
        data: {
          lawId: fixture.lawId,
          fromRevisionId: fixture.oldRevisionId,
          toRevisionId: activated.candidateRevisionId,
          fromArticleId: fixture.oldArticleId,
          toArticleId: activated.candidateArticleId,
          kind: "modified",
          status: "verified",
          method: "test",
        },
      });

      // mapping 作成後も両 record の articleId / snapshotLawRevisionId は変わらない。
      const highlight = await prisma.userHighlight.findUnique({
        where: { id: highlightId },
        select: { articleId: true, snapshotLawRevisionId: true },
      });
      const annotation = await prisma.articleAnnotation.findUnique({
        where: { id: annotationId },
        select: { articleId: true, snapshotLawRevisionId: true },
      });

      expect(highlight).toEqual({
        articleId: fixture.oldArticleId,
        snapshotLawRevisionId: fixture.oldRevisionId,
      });
      expect(annotation).toEqual({
        articleId: fixture.oldArticleId,
        snapshotLawRevisionId: fixture.oldRevisionId,
      });
    } finally {
      // User を最後に削除（cascade で highlight/annotation も消える）。
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });
});
