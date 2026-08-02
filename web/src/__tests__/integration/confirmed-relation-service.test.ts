import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  approveRelatedArticleCandidate,
  createManualConfirmedRelation,
  rejectRelatedArticleCandidate,
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
  while (fixtures.length > 0) {
    await cleanupRelationFixture(prisma, fixtures.pop()!);
  }
});
afterAll(async () => prisma.$disconnect());

describe("confirmed relation service (integration)", () => {
  it("候補の提案先には現行法令集内の条ノードだけを保存できる", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    const nonArticle = await prisma.article.findFirst({
      where: {
        lawRevisionId: fixture.revisionId,
        level: { not: "article" },
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(nonArticle).not.toBeNull();
    if (!nonArticle) return;

    await expect(
      saveRelatedArticleCandidate({
        sourceArticleId: fixture.sourceArticleId,
        proposedTargetArticleId: nonArticle.id,
        proposedTargetText: null,
        relationType: "CITES",
        extractionMethod: "RULE_BASED",
        generatorVersion: fixture.generatorVersion,
        confidence: 0.5,
        rationale: null,
      }),
    ).rejects.toThrow("現行法令集内の条ノード");
  });

  it("同一候補を並行保存しても既存候補を返す", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    const input = {
      sourceArticleId: fixture.sourceArticleId,
      proposedTargetArticleId: fixture.targetArticleId,
      proposedTargetText: null,
      relationType: "CITES",
      extractionMethod: "RULE_BASED",
      generatorVersion: fixture.generatorVersion,
      confidence: 0.72,
      rationale: "並行候補",
    } as const;

    const [left, right] = await Promise.all([
      saveRelatedArticleCandidate(input),
      saveRelatedArticleCandidate(input),
    ]);

    expect(left.id).toBe(right.id);
  });

  it("候補を修正承認して元候補と確定内容を分離保存する", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);

    const candidateInput = {
      sourceArticleId: fixture.sourceArticleId,
      proposedTargetArticleId: fixture.targetArticleId,
      proposedTargetText: null,
      relationType: "CITES",
      extractionMethod: "RULE_BASED",
      generatorVersion: fixture.generatorVersion,
      confidence: 0.72,
      rationale: "機械候補",
    } as const;
    const candidate = await saveRelatedArticleCandidate(candidateInput);
    expect((await saveRelatedArticleCandidate(candidateInput)).id).toBe(
      candidate.id,
    );
    const confirmed = await approveRelatedArticleCandidate({
      candidateId: candidate.id,
      targetArticleId: fixture.targetArticleId,
      relationType: "DEFINES",
      rationale: "両条の用語定義をあわせて確認するため",
      reviewerId: fixture.reviewerId,
      reviewNote: "参照から定義へ修正",
    });

    expect(confirmed.origin).toBe("CANDIDATE");
    expect(confirmed.relationType).toBe("DEFINES");
    expect(confirmed.sourceCandidateId).toBe(candidate.id);
    const savedCandidate = await prisma.relatedArticleCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
    });
    expect(savedCandidate.status).toBe("PROMOTED");
    expect(savedCandidate.relationType).toBe("CITES");
  });

  it("棄却候補から確認済み関係を作れない", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    const candidate = await saveRelatedArticleCandidate({
      sourceArticleId: fixture.sourceArticleId,
      proposedTargetArticleId: fixture.targetArticleId,
      proposedTargetText: null,
      relationType: "CITES",
      extractionMethod: "RULE_BASED",
      generatorVersion: fixture.generatorVersion,
      confidence: 0.4,
      rationale: null,
    });
    await rejectRelatedArticleCandidate({
      candidateId: candidate.id,
      reviewerId: fixture.reviewerId,
      reason: "実務上の関連を確認できない",
    });
    await expect(
      approveRelatedArticleCandidate({
        candidateId: candidate.id,
        targetArticleId: fixture.targetArticleId,
        relationType: "CITES",
        rationale: "承認してはならない",
        reviewerId: fixture.reviewerId,
        reviewNote: null,
      }),
    ).rejects.toThrow("PENDING");
  });

  it("手動確認、重複拒否、取消を同じサービスで行う", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    const relation = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "EXCEPTS",
      rationale: "例外規定として人が確認したため",
      reviewerId: fixture.reviewerId,
    });
    await expect(
      createManualConfirmedRelation({
        sourceArticleId: fixture.sourceArticleId,
        targetArticleId: fixture.targetArticleId,
        relationType: "EXCEPTS",
        rationale: "重複",
        reviewerId: fixture.reviewerId,
      }),
    ).rejects.toThrow("同じ有効関係");
    await revokeConfirmedRelation({
      relationId: relation.id,
      reviewerId: fixture.reviewerId,
      reason: "確認内容を見直すため",
    });
    expect(
      await prisma.confirmedArticleRelation.findUniqueOrThrow({
        where: { id: relation.id },
      }),
    ).toMatchObject({ revokedById: fixture.reviewerId });
    const reconfirmed = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "EXCEPTS",
      rationale: "取消後に改めて確認したため",
      reviewerId: fixture.reviewerId,
    });
    expect(reconfirmed.id).not.toBe(relation.id);
  });

  it("競合する承認・棄却と重複手動確認をドメインエラーへ収束する", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    const candidate = await saveRelatedArticleCandidate({
      sourceArticleId: fixture.sourceArticleId,
      proposedTargetArticleId: fixture.targetArticleId,
      proposedTargetText: null,
      relationType: "CITES",
      extractionMethod: "RULE_BASED",
      generatorVersion: fixture.generatorVersion,
      confidence: 0.6,
      rationale: null,
    });
    const reviewResults = await Promise.allSettled([
      approveRelatedArticleCandidate({
        candidateId: candidate.id,
        targetArticleId: fixture.targetArticleId,
        relationType: "CITES",
        rationale: "承認根拠",
        reviewerId: fixture.reviewerId,
        reviewNote: null,
      }),
      rejectRelatedArticleCandidate({
        candidateId: candidate.id,
        reviewerId: fixture.reviewerId,
        reason: "棄却根拠",
      }),
    ]);
    expect(reviewResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const reviewFailure = reviewResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(reviewFailure?.reason).toHaveProperty("message");
    expect((reviewFailure?.reason as Error).message).toContain("PENDING");

    const relationInput = {
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "EXCEPTS",
      rationale: "並行確認の根拠",
      reviewerId: fixture.reviewerId,
    } as const;
    const relationResults = await Promise.allSettled([
      createManualConfirmedRelation(relationInput),
      createManualConfirmedRelation(relationInput),
    ]);
    expect(relationResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const relationFailure = relationResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(relationFailure?.reason).toHaveProperty("message");
    expect((relationFailure?.reason as Error).message).toContain("同じ有効関係");
  });
});
