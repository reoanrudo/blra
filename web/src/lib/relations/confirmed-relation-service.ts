import { createHash } from "node:crypto";
import {
  Prisma,
  type RelationCandidateMethod,
  type RelationEdgeType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";
import { normalizeRelationRationale } from "@/lib/relations/confirmed-relation";

export interface SaveCandidateInput {
  sourceArticleId: string;
  proposedTargetArticleId: string | null;
  proposedTargetText: string | null;
  relationType: RelationEdgeType;
  extractionMethod: RelationCandidateMethod;
  generatorVersion: string;
  confidence: number;
  rationale: string | null;
}

export interface ApproveCandidateInput {
  candidateId: string;
  targetArticleId: string;
  relationType: RelationEdgeType;
  rationale: string;
  reviewerId: string;
  reviewNote: string | null;
}

export interface RejectCandidateInput {
  candidateId: string;
  reviewerId: string;
  reason: string;
}

export interface ManualConfirmedRelationInput {
  sourceArticleId: string;
  targetArticleId: string;
  relationType: RelationEdgeType;
  rationale: string;
  reviewerId: string;
}

export interface RevokeConfirmedRelationInput {
  relationId: string;
  reviewerId: string;
  reason: string;
}

const relationScopeSql = lawBookArticleScopeSql("article", "entry");

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

const MAX_TRANSACTION_ATTEMPTS = 3;

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function withSerializableRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastConflict: unknown;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, SERIALIZABLE);
    } catch (error) {
      if (!isRetryableTransactionConflict(error)) throw error;
      lastConflict = error;
    }
  }
  throw lastConflict;
}

async function assertCurrentArticle(
  tx: Prisma.TransactionClient,
  articleId: string,
): Promise<void> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT article.id
       FROM "Article" article
       JOIN "LawBookEntry" entry
         ON entry."lawId" = article."lawId"
        AND entry."lawRevisionId" = article."lawRevisionId"
       JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
      WHERE article.id = $1
        AND article.level = 'article'
        AND article."deletedAt" IS NULL
        AND edition."editionKey" = $2
        AND ${relationScopeSql}
      LIMIT 1`,
    articleId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  if (rows.length === 0) {
    throw new Error("確認済み関係には現行法令集内の条ノードが必要です");
  }
}

function candidateFingerprint(input: SaveCandidateInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceArticleId: input.sourceArticleId,
        proposedTargetArticleId: input.proposedTargetArticleId,
        proposedTargetText: input.proposedTargetText?.trim() || null,
        relationType: input.relationType,
        extractionMethod: input.extractionMethod,
        generatorVersion: input.generatorVersion.trim(),
      }),
    )
    .digest("hex");
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > 500) throw new Error("入力は500文字以内です");
  return normalized;
}

async function assertReviewer(
  tx: Prisma.TransactionClient,
  reviewerId: string,
): Promise<void> {
  const reviewer = await tx.user.findUnique({
    where: { id: reviewerId },
    select: { id: true },
  });
  if (!reviewer) throw new Error("確認者が存在しません");
}

async function assertNoActiveDuplicate(
  tx: Prisma.TransactionClient,
  sourceArticleId: string,
  targetArticleId: string,
  relationType: RelationEdgeType,
): Promise<void> {
  const duplicate = await tx.confirmedArticleRelation.findFirst({
    where: {
      sourceArticleId,
      targetArticleId,
      relationType,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("同じ有効関係が既に存在します");
}

function assertDistinctArticles(
  sourceArticleId: string,
  targetArticleId: string,
): void {
  if (sourceArticleId === targetArticleId) {
    throw new Error("参照元と参照先には別の条文を指定してください");
  }
}

export async function saveRelatedArticleCandidate(input: SaveCandidateInput) {
  if (input.confidence < 0 || input.confidence > 1) {
    throw new Error("confidenceは0以上1以下で指定してください");
  }
  const generatorVersion = input.generatorVersion.trim();
  if (!generatorVersion) throw new Error("generatorVersionは必須です");
  const proposedTargetText = normalizeOptionalText(input.proposedTargetText);
  if (!input.proposedTargetArticleId && !proposedTargetText) {
    throw new Error("候補の参照先IDまたは参照先文字列が必要です");
  }
  if (input.proposedTargetArticleId) {
    assertDistinctArticles(input.sourceArticleId, input.proposedTargetArticleId);
  }
  const fingerprint = candidateFingerprint(input);
  return withSerializableRetry(async (tx) => {
    await assertCurrentArticle(tx, input.sourceArticleId);
    if (input.proposedTargetArticleId) {
      await assertCurrentArticle(tx, input.proposedTargetArticleId);
    }
    const existing = await tx.relatedArticleCandidate.findUnique({
      where: { candidateFingerprint: fingerprint },
    });
    if (existing) return existing;
    return tx.relatedArticleCandidate.create({
      data: {
        sourceArticleId: input.sourceArticleId,
        proposedTargetArticleId: input.proposedTargetArticleId,
        proposedTargetText,
        relationType: input.relationType,
        extractionMethod: input.extractionMethod,
        generatorVersion,
        confidence: input.confidence,
        rationale: normalizeOptionalText(input.rationale),
        candidateFingerprint: fingerprint,
      },
    });
  });
}

export async function approveRelatedArticleCandidate(input: ApproveCandidateInput) {
  const rationale = normalizeRelationRationale(input.rationale);
  return withSerializableRetry(async (tx) => {
    const candidate = await tx.relatedArticleCandidate.findUnique({
      where: { id: input.candidateId },
    });
    if (!candidate || candidate.status !== "PENDING") {
      throw new Error("PENDINGの候補だけを承認できます");
    }
    assertDistinctArticles(candidate.sourceArticleId, input.targetArticleId);
    await Promise.all([
      assertReviewer(tx, input.reviewerId),
      assertCurrentArticle(tx, candidate.sourceArticleId),
      assertCurrentArticle(tx, input.targetArticleId),
    ]);
    await assertNoActiveDuplicate(
      tx,
      candidate.sourceArticleId,
      input.targetArticleId,
      input.relationType,
    );
    const reviewedAt = new Date();
    const claimed = await tx.relatedArticleCandidate.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: {
        status: "PROMOTED",
        reviewedById: input.reviewerId,
        reviewedAt,
        reviewNote: normalizeOptionalText(input.reviewNote),
      },
    });
    if (claimed.count !== 1) {
      throw new Error("PENDINGの候補だけを承認できます");
    }
    return tx.confirmedArticleRelation.create({
      data: {
        sourceArticleId: candidate.sourceArticleId,
        targetArticleId: input.targetArticleId,
        relationType: input.relationType,
        rationale,
        origin: "CANDIDATE",
        sourceCandidateId: candidate.id,
        confirmedById: input.reviewerId,
        confirmedAt: reviewedAt,
      },
    });
  });
}

export async function rejectRelatedArticleCandidate(input: RejectCandidateInput) {
  const reason = normalizeRelationRationale(input.reason);
  return withSerializableRetry(async (tx) => {
    await assertReviewer(tx, input.reviewerId);
    const result = await tx.relatedArticleCandidate.updateMany({
      where: { id: input.candidateId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedById: input.reviewerId,
        reviewedAt: new Date(),
        reviewNote: reason,
      },
    });
    if (result.count !== 1) {
      throw new Error("PENDINGの候補だけを棄却できます");
    }
    return tx.relatedArticleCandidate.findUniqueOrThrow({
      where: { id: input.candidateId },
    });
  });
}

export async function createManualConfirmedRelation(
  input: ManualConfirmedRelationInput,
) {
  const rationale = normalizeRelationRationale(input.rationale);
  assertDistinctArticles(input.sourceArticleId, input.targetArticleId);
  return withSerializableRetry(async (tx) => {
    await Promise.all([
      assertReviewer(tx, input.reviewerId),
      assertCurrentArticle(tx, input.sourceArticleId),
      assertCurrentArticle(tx, input.targetArticleId),
    ]);
    await assertNoActiveDuplicate(
      tx,
      input.sourceArticleId,
      input.targetArticleId,
      input.relationType,
    );
    return tx.confirmedArticleRelation.create({
      data: {
        sourceArticleId: input.sourceArticleId,
        targetArticleId: input.targetArticleId,
        relationType: input.relationType,
        rationale,
        origin: "MANUAL",
        confirmedById: input.reviewerId,
        confirmedAt: new Date(),
      },
    });
  });
}

export async function revokeConfirmedRelation(input: RevokeConfirmedRelationInput) {
  const reason = normalizeRelationRationale(input.reason);
  return withSerializableRetry(async (tx) => {
    await assertReviewer(tx, input.reviewerId);
    const result = await tx.confirmedArticleRelation.updateMany({
      where: { id: input.relationId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedById: input.reviewerId,
        revocationReason: reason,
      },
    });
    if (result.count !== 1) {
      throw new Error("有効な確認済み関係がありません");
    }
    return tx.confirmedArticleRelation.findUniqueOrThrow({
      where: { id: input.relationId },
    });
  });
}
