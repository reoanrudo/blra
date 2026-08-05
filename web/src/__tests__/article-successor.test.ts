import { describe, expect, it } from "vitest";
import {
  resolveArticleRoute,
  type ArticleSuccessorRepository,
} from "@/lib/law-refresh/article-successor";

/**
 * テスト用のインメモリ repository を構築する。
 *
 * 所属 Revision の判定:
 * - oldArticles に含まれる、または mapping の from に登場する Article は旧 Revision 所属。
 * - それ以外は current Revision 所属。
 * - missing に含まれる Article は存在しない（getArticleContext が null）。
 */
function fakeRepository(opts: {
  currentRevisionId: string;
  mappings: Array<{
    from: string;
    to: string | null;
    kind: string;
    status?: string;
  }>;
  /** 存在しない Article を指定するために使う除外セット。 */
  missing?: string[];
  /** 旧 Revision 所属を明示する Article セット（mapping が無くても旧扱い）。 */
  oldArticles?: string[];
}): ArticleSuccessorRepository {
  const fromArticles = new Set(opts.mappings.map((m) => m.from));
  const oldSet = new Set(opts.oldArticles ?? []);
  const mappingByFrom = new Map(opts.mappings.map((m) => [m.from, m]));
  const missing = new Set(opts.missing ?? []);

  return {
    async getArticleContext(articleId) {
      if (missing.has(articleId)) return null;
      const isOld = fromArticles.has(articleId) || oldSet.has(articleId);
      return {
        lawId: "law-fake",
        lawRevisionId: isOld
          ? `rev-old-${articleId}`
          : opts.currentRevisionId,
        currentLawRevisionId: opts.currentRevisionId,
      };
    },
    async getSuccessorMapping(fromArticleId) {
      const m = mappingByFrom.get(fromArticleId);
      if (!m) return null;
      return {
        toArticleId: m.to,
        kind: m.kind as never,
        status: (m.status ?? "automatic") as never,
      };
    },
  };
}

describe("resolveArticleRoute", () => {
  it("rev1からrev3の現行Articleまで対応表をたどる", async () => {
    const resolution = await resolveArticleRoute(
      "article-rev1",
      fakeRepository({
        currentRevisionId: "rev3",
        mappings: [
          { from: "article-rev1", to: "article-rev2", kind: "modified" },
          { from: "article-rev2", to: "article-rev3", kind: "unchanged" },
        ],
      }),
    );
    expect(resolution).toEqual({ kind: "redirect", articleId: "article-rev3" });
  });

  it("mapping循環を内部エラーとして拒否する", async () => {
    await expect(
      resolveArticleRoute(
        "a",
        fakeRepository({
          currentRevisionId: "rev3",
          mappings: [
            { from: "a", to: "b", kind: "modified" },
            { from: "b", to: "a", kind: "modified" },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "ARTICLE_MAPPING_CYCLE" });
  });

  it("現行Revision所属のArticleはcurrent", async () => {
    const resolution = await resolveArticleRoute(
      "current-article",
      fakeRepository({
        currentRevisionId: "rev1",
        mappings: [],
      }),
    );
    expect(resolution).toEqual({
      kind: "current",
      articleId: "current-article",
    });
  });

  it("mapping先が削除(kind=removed)ならremoved", async () => {
    const resolution = await resolveArticleRoute(
      "old-article",
      fakeRepository({
        currentRevisionId: "rev2",
        mappings: [
          { from: "old-article", to: null, kind: "removed" },
        ],
      }),
    );
    expect(resolution).toEqual({
      kind: "removed",
      articleId: "old-article",
      currentLawRevisionId: "rev2",
    });
  });

  it("確定mappingのtoArticleIdがnullならremoved", async () => {
    const resolution = await resolveArticleRoute(
      "old-article",
      fakeRepository({
        currentRevisionId: "rev2",
        mappings: [{ from: "old-article", to: null, kind: "modified" }],
      }),
    );
    expect(resolution).toEqual({
      kind: "removed",
      articleId: "old-article",
      currentLawRevisionId: "rev2",
    });
  });

  it("mapping状態がambiguousならhistorical(ambiguous)", async () => {
    const resolution = await resolveArticleRoute(
      "old-article",
      fakeRepository({
        currentRevisionId: "rev2",
        mappings: [
          {
            from: "old-article",
            to: "new-article",
            kind: "renumbered",
            status: "ambiguous",
          },
        ],
      }),
    );
    expect(resolution).toEqual({
      kind: "historical",
      articleId: "old-article",
      reason: "ambiguous",
    });
  });

  it("旧Revision所属でmappingが未作成ならhistorical(unmapped)", async () => {
    const resolution = await resolveArticleRoute(
      "old-article",
      fakeRepository({
        currentRevisionId: "rev2",
        mappings: [],
        oldArticles: ["old-article"],
      }),
    );
    expect(resolution).toEqual({
      kind: "historical",
      articleId: "old-article",
      reason: "unmapped",
    });
  });

  it("Articleが存在しないならmissing", async () => {
    const resolution = await resolveArticleRoute(
      "ghost",
      fakeRepository({
        currentRevisionId: "rev1",
        mappings: [],
        missing: ["ghost"],
      }),
    );
    expect(resolution).toEqual({ kind: "missing" });
  });

  it("1hopで直接redirectする", async () => {
    const resolution = await resolveArticleRoute(
      "old",
      fakeRepository({
        currentRevisionId: "rev2",
        mappings: [{ from: "old", to: "current", kind: "unchanged" }],
      }),
    );
    expect(resolution).toEqual({ kind: "redirect", articleId: "current" });
  });
});
