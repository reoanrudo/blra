import { describe, expect, it } from "vitest";
import type { ArticleRow, ChapterArticle } from "@/lib/article/article";
import type { ScrollScopeInfo } from "@/lib/article/chapter-window";
import {
  appendNextScopeSegment,
  mergePageIntoLastSegment,
  type LawScrollSegment,
} from "@/lib/article/law-scroll-segments";

function makeScope(id: string, label: string): ScrollScopeInfo {
  return {
    id,
    stableNodeKey: `root/${id}`,
    title: label,
    label,
    level: "chapter",
    firstCursor: "1",
  };
}

function makeArticle(id: string, sortOrder: number): ChapterArticle {
  const root: ArticleRow = {
    id,
    parentId: "chapter-1",
    level: "article",
    articleNumber: String(sortOrder),
    articleNumberNormalized: String(sortOrder),
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    columnNumber: null,
    tableCoords: null,
    title: null,
    caption: null,
    text: `第${sortOrder}条`,
    articleCaptionNormalized: null,
    sortOrder,
    depth: 0,
    lawId: "law-1",
    lawName: "テスト法",
    regulationType: null,
    stableNodeKey: `root/article:${sortOrder}`,
    lawRevisionId: "revision-1",
  };
  return { root, children: [] };
}

describe("法令連続スクロールのsegment状態遷移", () => {
  const chapter1 = makeScope("chapter-1", "第一章");
  const chapter2 = makeScope("chapter-2", "第二章");

  it("最後のsegmentへ追加ページを重複なしで統合する", () => {
    const article1 = makeArticle("article-1", 1);
    const article2 = makeArticle("article-2", 2);
    const article3 = makeArticle("article-3", 3);
    const first: LawScrollSegment = {
      scope: chapter1,
      articles: [article1, article2],
      beforeCursor: null,
      afterCursor: "3",
      nextScope: chapter2,
    };

    const result = mergePageIntoLastSegment(
      [first],
      [article2, article3],
      null,
      chapter2,
    );

    expect(result[0]!.articles.map((article) => article.root.id)).toEqual([
      "article-1",
      "article-2",
      "article-3",
    ]);
    expect(result[0]!.afterCursor).toBeNull();
    expect(result[0]!.nextScope?.id).toBe("chapter-2");
  });

  it("次scopeを新しいsegmentとして1回だけ追加する", () => {
    const first: LawScrollSegment = {
      scope: chapter1,
      articles: [makeArticle("article-1", 1)],
      beforeCursor: null,
      afterCursor: null,
      nextScope: chapter2,
    };
    const second: LawScrollSegment = {
      scope: chapter2,
      articles: [makeArticle("article-12", 12)],
      beforeCursor: null,
      afterCursor: "2",
      nextScope: null,
    };

    const appended = appendNextScopeSegment([first], second);
    const duplicated = appendNextScopeSegment(appended, second);

    expect(appended.map((segment) => segment.scope.id)).toEqual([
      "chapter-1",
      "chapter-2",
    ]);
    expect(duplicated).toHaveLength(2);
    expect(duplicated[1]!.articles[0]!.root.id).toBe("article-12");
  });
});
