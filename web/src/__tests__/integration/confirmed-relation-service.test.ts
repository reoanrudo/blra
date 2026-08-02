import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
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
import { prisma as servicePrisma } from "@/lib/db";

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

describe("confirmed relation service (integration)", () => {
  it("候補保存の競合再試行が枯渇してもfingerprintから既存候補を返す", async () => {
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
      confidence: 0.7,
      rationale: "競合候補",
    } as const;
    const existing = await saveRelatedArticleCandidate(input);
    const transactionSpy = vi.spyOn(servicePrisma, "$transaction").mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("forced P2002", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );

    await expect(saveRelatedArticleCandidate(input)).resolves.toMatchObject({
      id: existing.id,
      candidateFingerprint: existing.candidateFingerprint,
    });
    expect(transactionSpy).toHaveBeenCalledTimes(3);
  });

  it("状態が変わらないまま競合再試行が枯渇しても型付きドメインエラーを返す", async () => {
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
      confidence: 0.7,
      rationale: null,
    } as const;
    vi.spyOn(servicePrisma, "$transaction").mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("forced P2034", {
        code: "P2034",
        clientVersion: "5.22.0",
      }),
    );

    const error = await saveRelatedArticleCandidate(input).catch(
      (reason: unknown) => reason,
    );

    expect(error).toMatchObject({
      name: "ConfirmedRelationConflictError",
      code: "CONFIRMED_RELATION_CONFLICT",
      message: "確認済み関係の更新が競合しました。再度お試しください",
    });
    expect(error).not.toHaveProperty("cause");
    expect((error as { code?: string }).code).not.toBe("P2034");
  });

  it("競合枯渇後の最終状態を既存の状態遷移エラーへ収束する", async () => {
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
    await rejectRelatedArticleCandidate({
      candidateId: candidate.id,
      reviewerId: fixture.reviewerId,
      reason: "先に棄却済み",
    });
    const revokedRelation = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "EXCEPTS",
      rationale: "先に取消する関係",
      reviewerId: fixture.reviewerId,
    });
    await revokeConfirmedRelation({
      relationId: revokedRelation.id,
      reviewerId: fixture.reviewerId,
      reason: "先に取消済み",
    });
    await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "DEFINES",
      rationale: "既存の有効関係",
      reviewerId: fixture.reviewerId,
    });
    vi.spyOn(servicePrisma, "$transaction").mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("forced P2034", {
        code: "P2034",
        clientVersion: "5.22.0",
      }),
    );

    await expect(
      approveRelatedArticleCandidate({
        candidateId: candidate.id,
        targetArticleId: fixture.targetArticleId,
        relationType: "CITES",
        rationale: "承認根拠",
        reviewerId: fixture.reviewerId,
        reviewNote: null,
      }),
    ).rejects.toThrow("PENDINGの候補だけを承認できます");
    await expect(
      rejectRelatedArticleCandidate({
        candidateId: candidate.id,
        reviewerId: fixture.reviewerId,
        reason: "再棄却",
      }),
    ).rejects.toThrow("PENDINGの候補だけを棄却できます");
    await expect(
      revokeConfirmedRelation({
        relationId: revokedRelation.id,
        reviewerId: fixture.reviewerId,
        reason: "再取消",
      }),
    ).rejects.toThrow("有効な確認済み関係がありません");
    await expect(
      createManualConfirmedRelation({
        sourceArticleId: fixture.sourceArticleId,
        targetArticleId: fixture.targetArticleId,
        relationType: "DEFINES",
        rationale: "重複確認",
        reviewerId: fixture.reviewerId,
      }),
    ).rejects.toThrow("同じ有効関係が既に存在します");
  });

  it("各書込みで状態不変の競合枯渇を型付きドメインエラーへ変換する", async () => {
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
    const relation = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "EXCEPTS",
      rationale: "有効な確認済み関係",
      reviewerId: fixture.reviewerId,
    });
    vi.spyOn(servicePrisma, "$transaction").mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("forced P2034", {
        code: "P2034",
        clientVersion: "5.22.0",
      }),
    );
    const operations = [
      () =>
        approveRelatedArticleCandidate({
          candidateId: candidate.id,
          targetArticleId: fixture.targetArticleId,
          relationType: "CITES",
          rationale: "承認根拠",
          reviewerId: fixture.reviewerId,
          reviewNote: null,
        }),
      () =>
        rejectRelatedArticleCandidate({
          candidateId: candidate.id,
          reviewerId: fixture.reviewerId,
          reason: "棄却根拠",
        }),
      () =>
        revokeConfirmedRelation({
          relationId: relation.id,
          reviewerId: fixture.reviewerId,
          reason: "取消根拠",
        }),
      () =>
        createManualConfirmedRelation({
          sourceArticleId: fixture.sourceArticleId,
          targetArticleId: fixture.targetArticleId,
          relationType: "APPLIES_MUTATIS_MUTANDIS",
          rationale: "手動確認根拠",
          reviewerId: fixture.reviewerId,
        }),
    ];

    for (const operation of operations) {
      const error = await operation().catch((reason: unknown) => reason);
      expect(error).toMatchObject({
        name: "ConfirmedRelationConflictError",
        code: "CONFIRMED_RELATION_CONFLICT",
        message: "確認済み関係の更新が競合しました。再度お試しください",
      });
      expect((error as { code?: string }).code).not.toBe("P2034");
    }
  });

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
