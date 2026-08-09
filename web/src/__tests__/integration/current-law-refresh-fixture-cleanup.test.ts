import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaClientConstructor } from "@prisma/client";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { createCurrentLawRefreshFixture } from "./current-law-refresh-fixture";

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

describe("現行法令リフレッシュfixture cleanup (integration)", () => {
  it("activate済みfixtureとLinkを残さず削除する", async () => {
    if (!dbAvailable) {
      console.warn("SKIP: Database または ksk-2026 Edition が利用できません");
      return;
    }

    const fixture = await createCurrentLawRefreshFixture(prisma, {
      activateCandidate: true,
    });
    const activated = fixture.activated!;
    const oldRevision = await prisma.lawRevision.findUniqueOrThrow({
      where: { id: fixture.oldRevisionId },
      select: { packageId: true },
    });
    const linkId = `law-refresh-test-link-cleanup-${fixture.runId}`;

    await prisma.link.create({
      data: {
        id: linkId,
        sourceId: fixture.oldArticleId,
        targetId: activated.candidateArticleId,
        linkType: "internal",
        isResolved: true,
      },
    });

    await fixture.cleanup();

    await expect(
      Promise.all([
        prisma.law.count({ where: { id: fixture.lawId } }),
        prisma.lawRevision.count({ where: { lawId: fixture.lawId } }),
        prisma.article.count({ where: { lawId: fixture.lawId } }),
        prisma.link.count({ where: { id: linkId } }),
        prisma.lawPackage.count({ where: { id: oldRevision.packageId } }),
        prisma.lawRefreshRun.count({ where: { id: fixture.runId } }),
        prisma.lawRefreshLawResult.count({ where: { runId: fixture.runId } }),
        prisma.lawSyncState.count({ where: { lawId: fixture.lawId } }),
        prisma.articleRevisionMapping.count({ where: { lawId: fixture.lawId } }),
        prisma.lawBookEntry.count({ where: { lawId: fixture.lawId } }),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
