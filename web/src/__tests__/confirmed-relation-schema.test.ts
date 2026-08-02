import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

function modelFields(modelName: string): string[] {
  const model = Prisma.dmmf.datamodel.models.find(
    (candidate) => candidate.name === modelName,
  );
  expect(model, `${modelName} must exist`).toBeDefined();
  return model?.fields.map((field) => field.name) ?? [];
}

describe("confirmed relation Prisma schema", () => {
  it("候補と確認済み関係を別モデルにする", () => {
    expect(modelFields("RelatedArticleCandidate")).toEqual(
      expect.arrayContaining([
        "sourceArticleId",
        "proposedTargetArticleId",
        "proposedTargetText",
        "relationType",
        "extractionMethod",
        "generatorVersion",
        "confidence",
        "candidateFingerprint",
        "status",
        "reviewedById",
        "reviewedAt",
        "reviewNote",
      ]),
    );
    expect(modelFields("ConfirmedArticleRelation")).toEqual(
      expect.arrayContaining([
        "sourceArticleId",
        "targetArticleId",
        "relationType",
        "rationale",
        "origin",
        "sourceCandidateId",
        "confirmedById",
        "confirmedAt",
        "revokedAt",
        "revokedById",
        "revocationReason",
      ]),
    );
  });

  it("設計書のenum値を固定する", () => {
    const enumValues = new Map(
      Prisma.dmmf.datamodel.enums.map((entry) => [
        entry.name,
        entry.values.map((value) => value.name),
      ]),
    );
    expect(enumValues.get("RelationEdgeType")).toEqual([
      "DELEGATES_TO",
      "APPLIES_MUTATIS_MUTANDIS",
      "DEFINES",
      "EXCEPTS",
      "CITES",
    ]);
    expect(enumValues.get("RelationCandidateStatus")).toEqual([
      "PENDING",
      "REJECTED",
      "PROMOTED",
    ]);
  });
});
