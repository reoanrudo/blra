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
});
