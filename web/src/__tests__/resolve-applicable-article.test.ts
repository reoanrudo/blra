import { describe, expect, it } from "vitest";
import {
  resolveApplicableArticleWithRepository,
  type ApplicabilityRepository,
} from "@/lib/applicability/resolve-applicable-article";

const context = {
  anchor: "CUSTOM" as const,
  asOf: "2026-04-01",
  projectId: null,
};

function repository(
  overrides: Partial<ApplicabilityRepository> = {},
): ApplicabilityRepository {
  return {
    findSourceArticle: async () => ({
      id: "source-article",
      lawId: "law-1",
      lawName: "建築基準法",
      stableNodeKey: "article:20",
    }),
    findRevisionIntervals: async () => [
      {
        id: "revision-2026",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    ],
    findArticleInRevision: async () => ({ id: "applicable-article" }),
    ...overrides,
  };
}

describe("resolveApplicableArticleWithRepository", () => {
  it("同じstableNodeKeyの適用版Articleを返す", async () => {
    await expect(
      resolveApplicableArticleWithRepository(
        repository(),
        "source-article",
        context,
      ),
    ).resolves.toEqual({
      kind: "resolved",
      articleId: "applicable-article",
      sourceArticleId: "source-article",
      lawId: "law-1",
      lawName: "建築基準法",
      lawRevisionId: "revision-2026",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    });
  });

  it("元Articleが存在しない場合はnot_foundを返す", async () => {
    await expect(
      resolveApplicableArticleWithRepository(
        repository({ findSourceArticle: async () => null }),
        "missing",
        context,
      ),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("範囲外で元Articleへフォールバックしない", async () => {
    await expect(
      resolveApplicableArticleWithRepository(
        repository({
          findRevisionIntervals: async () => [
            {
              id: "revision-2026",
              effectiveFrom: "2026-06-01",
              effectiveTo: null,
            },
          ],
        }),
        "source-article",
        context,
      ),
    ).resolves.toEqual({
      kind: "coverage_out_of_range",
      lawId: "law-1",
      lawName: "建築基準法",
      coverageStart: "2026-06-01",
      coverageEnd: null,
    });
  });

  it("選択版に同じ条文がなければarticle_not_effectiveを返す", async () => {
    await expect(
      resolveApplicableArticleWithRepository(
        repository({ findArticleInRevision: async () => null }),
        "source-article",
        context,
      ),
    ).resolves.toEqual({
      kind: "article_not_effective",
      lawId: "law-1",
      lawName: "建築基準法",
      lawRevisionId: "revision-2026",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    });
  });
});
