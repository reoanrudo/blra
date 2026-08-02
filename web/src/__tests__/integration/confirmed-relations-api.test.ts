import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GET as getConfirmedRelations } from "@/app/api/law-revisions/[id]/confirmed-relations/route";
import * as confirmedRelationsRepository from "@/lib/relations/confirmed-relations-repository";
import {
  createManualConfirmedRelation,
  revokeConfirmedRelation,
  saveRelatedArticleCandidate,
} from "@/lib/relations/confirmed-relation-service";
import {
  cleanupRelationFixture,
  createRelationFixture,
  type RelationFixture,
} from "@/__tests__/integration/confirmed-relation-fixture";

const prisma = new PrismaClient();
const fixtures: RelationFixture[] = [];

beforeAll(async () => prisma.$connect());
afterEach(async () => {
  vi.restoreAllMocks();
  while (fixtures.length > 0) {
    await cleanupRelationFixture(prisma, fixtures.pop()!);
  }
});
afterAll(async () => prisma.$disconnect());

describe("confirmed relations API (integration)", () => {
  it("有効な確認済み関係だけを公開する", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    await saveRelatedArticleCandidate({
      sourceArticleId: fixture.sourceArticleId,
      proposedTargetArticleId: fixture.targetArticleId,
      proposedTargetText: null,
      relationType: "CITES",
      extractionMethod: "RULE_BASED",
      generatorVersion: fixture.generatorVersion,
      confidence: 0.63,
      rationale: "公開してはならない候補",
    });
    const active = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "DELEGATES_TO",
      rationale: "委任先をあわせて確認するため",
      reviewerId: fixture.reviewerId,
    });
    const revoked = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "CITES",
      rationale: "取消対象",
      reviewerId: fixture.reviewerId,
    });
    await revokeConfirmedRelation({
      relationId: revoked.id,
      reviewerId: fixture.reviewerId,
      reason: "公開対象から除外するテスト",
    });
    const excludedTargets = await prisma.article.findMany({
      where: {
        level: "article",
        OR: [
          { deletedAt: { not: null } },
          {
            law: { egovLawId: "129AC0000000089" },
            articleNumberNormalized: "208",
          },
        ],
      },
      select: { id: true },
      take: 2,
    });
    const excludedRelations = await Promise.all(
      excludedTargets.map((target) =>
        prisma.confirmedArticleRelation.create({
          data: {
            sourceArticleId: fixture.sourceArticleId,
            targetArticleId: target.id,
            relationType: "EXCEPTS",
            rationale: "公開範囲外を除外するテスト",
            origin: "MANUAL",
            confirmedById: fixture.reviewerId,
            confirmedAt: new Date(),
          },
        }),
      ),
    );

    const document = await confirmedRelationsRepository.getConfirmedRelationsDocument(
      fixture.revisionId,
    );
    const rows = document?.relationsBySource[fixture.sourceArticleId] ?? [];
    expect(rows.some((row) => row.id === active.id)).toBe(true);
    expect(rows.some((row) => row.id === revoked.id)).toBe(false);
    for (const excluded of excludedRelations) {
      expect(rows.some((row) => row.id === excluded.id)).toBe(false);
    }
    expect(JSON.stringify(document)).not.toContain("confidence");
    expect(JSON.stringify(document)).not.toContain("generatorVersion");
    expect(JSON.stringify(document)).not.toContain(fixture.reviewerId);

    const url = `http://localhost/api/law-revisions/${fixture.revisionId}/confirmed-relations`;
    const response = await getConfirmedRelations(new NextRequest(url), {
      params: { id: fixture.revisionId },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    const etag = response.headers.get("etag");
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    const responseDocument = await response.clone().json();
    vi.spyOn(
      confirmedRelationsRepository,
      "getConfirmedRelationsDocument",
    ).mockResolvedValueOnce(responseDocument);
    const notModified = await getConfirmedRelations(
      new NextRequest(url, { headers: { "If-None-Match": etag! } }),
      { params: { id: fixture.revisionId } },
    );
    expect(notModified.status).toBe(304);
  });

  it("現在の法令集にないrevisionは404にする", async () => {
    const response = await getConfirmedRelations(
      new NextRequest(
        "http://localhost/api/law-revisions/missing/confirmed-relations",
      ),
      { params: { id: "missing" } },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("repository例外時は公開エラーをno-storeで返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(
      confirmedRelationsRepository,
      "getConfirmedRelationsDocument",
    ).mockRejectedValueOnce(new Error("database connection failed"));

    const response = await getConfirmedRelations(
      new NextRequest(
        "http://localhost/api/law-revisions/current/confirmed-relations",
      ),
      { params: { id: "current" } },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "failed to load confirmed relations",
    });
  });
});
