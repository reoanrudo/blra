import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GET as getByNumber } from "@/app/api/articles/by-number/route";
import { GET as getPreview } from "@/app/api/articles/preview/route";
import { GET as getSearch } from "@/app/api/search/route";
import { GET as getSuggest } from "@/app/api/search/suggest/route";
import { GET as getToc } from "@/app/api/law-toc/route";
import { GET as getExport } from "@/app/api/export/route";
import { getArticleWithTree, getChapterArticlesWithTrees } from "@/lib/article/article";
import { batchResolveArticleRefs } from "@/lib/practice/export-validator";
import { resolveReferences } from "@/lib/link/link-detector";
import { getOrCreateDefaultUser } from "@/lib/system/user";

const prisma = new PrismaClient();
const CIVIL_CODE_EGOV_ID = "129AC0000000089";

interface CivilArticleFixture {
  lawId: string;
  article1Id: string;
  article2Id: string;
  article208Id: string;
  article209Id: string;
}

let fixture: CivilArticleFixture | null = null;

beforeAll(async () => {
  try {
    await prisma.$connect();
    const rows = await prisma.$queryRawUnsafe<
      Array<{ lawId: string; id: string; articleNumberNormalized: string }>
    >(
      `SELECT law.id AS "lawId", article.id, article."articleNumberNormalized"
       FROM "Law" law
       JOIN "Article" article ON article."lawId" = law.id
       WHERE law."egovLawId" = $1
         AND article."deletedAt" IS NULL
         AND article.level = 'article'
         AND article."articleNumberNormalized" IN ('1', '2', '208', '209')`,
      CIVIL_CODE_EGOV_ID,
    );
    const byNumber = new Map(rows.map((row) => [row.articleNumberNormalized, row.id]));
    if (rows.length === 4 && byNumber.get("1") && byNumber.get("2") && byNumber.get("208") && byNumber.get("209")) {
      fixture = {
        lawId: rows[0].lawId,
        article1Id: byNumber.get("1")!,
        article2Id: byNumber.get("2")!,
        article208Id: byNumber.get("208")!,
        article209Id: byNumber.get("209")!,
      };
    }
  } catch {
    fixture = null;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("民法（抄）の通常利用境界 (integration)", () => {
  it("条番号検索は掲載第209条を返し、非掲載第208条を返さない", async () => {
    if (!fixture) return;

    const includedResponse = await getByNumber(new NextRequest("http://localhost/api/articles/by-number?q=209"));
    const included = (await includedResponse.json()) as { articles: Array<{ id: string }> };
    expect(included.articles.some((article) => article.id === fixture!.article209Id)).toBe(true);

    const excludedResponse = await getByNumber(new NextRequest("http://localhost/api/articles/by-number?q=208"));
    const excluded = (await excludedResponse.json()) as { articles: Array<{ id: string }> };
    expect(excluded.articles.some((article) => article.id === fixture!.article208Id)).toBe(false);
  });

  it("本文検索は非掲載第721条の固有文を返さない", async () => {
    if (!fixture) return;

    const response = await getSearch(
      new NextRequest(
        `http://localhost/api/search?q=${encodeURIComponent("胎児は、損害賠償の請求権については")}`,
      ),
    );
    const body = (await response.json()) as { results: Array<{ lawName: string }> };
    expect(body.results.some((result) => result.lawName === "民法")).toBe(false);
  });

  it("非掲載第2条はプレビューと直接本文取得の対象外になる", async () => {
    if (!fixture) return;

    const preview = await getPreview(
      new NextRequest(`http://localhost/api/articles/preview?id=${encodeURIComponent(fixture.article2Id)}`),
    );
    expect(preview.status).toBe(404);
    expect(await getArticleWithTree(fixture.article2Id)).toHaveLength(0);
  });

  it("民法目次は掲載第209条を含み、非掲載第208条を含まない", async () => {
    if (!fixture) return;

    const response = await getToc(
      new NextRequest(`http://localhost/api/law-toc?lawId=${encodeURIComponent(fixture.lawId)}`),
    );
    const body = (await response.json()) as { nodes: Array<{ id: string }> };
    const rows = body.nodes;
    expect(rows.some((row) => row.id === fixture!.article209Id)).toBe(true);
    expect(rows.some((row) => row.id === fixture!.article208Id)).toBe(false);
  });

  it("検索候補は非掲載第2条の見出しを返さない", async () => {
    if (!fixture) return;

    const response = await getSuggest(
      new NextRequest(`http://localhost/api/search/suggest?q=${encodeURIComponent("（解釈の基準）")}`),
    );
    const body = (await response.json()) as { suggestions: Array<{ articleId?: string }> };
    expect(body.suggestions.some((suggestion) => suggestion.articleId === fixture!.article2Id)).toBe(false);
  });

  it("import参照解決は掲載第209条だけを解決し、非掲載第208条をunknownにする", async () => {
    if (!fixture) return;

    const result = await batchResolveArticleRefs([
      { lawId: CIVIL_CODE_EGOV_ID, articleNumberNormalized: "209" },
      { lawId: CIVIL_CODE_EGOV_ID, articleNumberNormalized: "208" },
    ]);
    expect(result.resolved.get(`${CIVIL_CODE_EGOV_ID}:209`)).toBe(fixture.article209Id);
    expect(result.resolved.has(`${CIVIL_CODE_EGOV_ID}:208`)).toBe(false);
    expect(result.unknown).toContain(`${CIVIL_CODE_EGOV_ID}:208`);
  });

  it("章スクロールは掲載第209条を含み、同じ章の非掲載第208条を含まない", async () => {
    if (!fixture) return;

    const result = await getChapterArticlesWithTrees(fixture.article209Id);
    const rootIds = result.articles.map((article) => article.root.id);
    expect(rootIds).toContain(fixture.article209Id);
    expect(rootIds).not.toContain(fixture.article208Id);
  });

  it("条文リンク解決は掲載第209条だけを解決し、非掲載第208条を未解決にする", async () => {
    if (!fixture) return;

    const resolved = await resolveReferences([
      {
        start: 0,
        end: 6,
        text: "第二百九条",
        articleNumberNormalized: "209",
        targetEgovLawId: CIVIL_CODE_EGOV_ID,
        targetLevel: "article",
      },
      {
        start: 7,
        end: 14,
        text: "第二百八条",
        articleNumberNormalized: "208",
        targetEgovLawId: CIVIL_CODE_EGOV_ID,
        targetLevel: "article",
      },
    ]);
    expect(resolved[0].targetArticleId).toBe(fixture.article209Id);
    expect(resolved[1].targetArticleId).toBeNull();
  });

  it("非掲載条文に残る既存ハイライトもバックアップから欠落させない", async () => {
    if (!fixture) return;

    const userId = await getOrCreateDefaultUser();
    const highlightId = `test_hidden_civil_highlight_${Date.now()}`;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "UserHighlight" (id, "userId", "articleId", "rangeStart", "rangeEnd", color, type)
         VALUES ($1, $2, $3, 0, 1, 'yellow', 'manual')`,
        highlightId,
        userId,
        fixture.article208Id,
      );

      const response = await getExport(new NextRequest("http://localhost/api/export?type=full"));
      const body = (await response.json()) as {
        highlights: Array<{ lawId: string; articleNumberNormalized: string }>;
      };
      expect(
        body.highlights.some(
          (highlight) =>
            highlight.lawId === CIVIL_CODE_EGOV_ID && highlight.articleNumberNormalized === "208",
        ),
      ).toBe(true);
    } finally {
      await prisma.$executeRawUnsafe('DELETE FROM "UserHighlight" WHERE id = $1', highlightId);
    }
  });
});
