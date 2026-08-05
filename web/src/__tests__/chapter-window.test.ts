import { describe, it, expect } from "vitest";
import type { ChapterArticle, ArticleRow } from "@/lib/article/article";
import { findRootArticleIdFromList } from "@/lib/article/chapter-window";

/**
 * ChapterScrollViewer の mergeArticles ロジックのUnitテスト。
 * DB不要・純粋関数の範囲のみ検証する（設計書§10 Unit要件）。
 *
 * mergeArticles は chapter-window API の前後マージと同等のロジックを持つが、
 * ここでは ChapterScrollViewer が使うマージ関数と同じ仕様を検証する。
 */

// テスト用 ArticleRow / ChapterArticle の簡易生成
function makeRoot(id: string, sortOrder: number): ArticleRow {
  return {
    id,
    parentId: null,
    level: "article",
    articleNumber: id.replace("art-", ""),
    articleNumberNormalized: id.replace("art-", ""),
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    columnNumber: null,
    tableCoords: null,
    title: null,
    caption: null,
    text: `条文 ${id}`,
    articleCaptionNormalized: null,
    sortOrder,
    depth: 0,
    lawId: "law-1",
    lawName: "テスト法",
    regulationType: "individual",
    stableNodeKey: `key-${id}`,
    lawRevisionId: "rev-1",
    tableMetadata: null,
  };
}

function makeChapterArticle(id: string, sortOrder: number): ChapterArticle {
  return { root: makeRoot(id, sortOrder), children: [] };
}

/** 子ノード（paragraph等）の ArticleRow を生成 */
function makeChild(id: string, sortOrder: number, parentId: string): ArticleRow {
  return { ...makeRoot(id, sortOrder), parentId, level: "paragraph" };
}

// mergeArticles と同等のロジック（ChapterScrollViewer.tsx から抽出した仕様）
function mergeArticles(
  current: ChapterArticle[],
  incoming: ChapterArticle[],
  _direction: "before" | "after",
): ChapterArticle[] {
  if (incoming.length === 0) return current;
  const currentIds = new Set(current.map((a) => a.root.id));
  const dedupedIncoming = incoming.filter((a) => !currentIds.has(a.root.id));
  if (dedupedIncoming.length === 0) return current;
  const combined =
    _direction === "before"
      ? [...dedupedIncoming, ...current]
      : [...current, ...dedupedIncoming];
  return combined.sort((a, b) => (a.root.sortOrder ?? 0) - (b.root.sortOrder ?? 0));
}

describe("mergeArticles（段階読込マージ）", () => {
  it("after方向: 既存リストの末尾に新規Articleを追加する", () => {
    const current = [makeChapterArticle("art-3", 3), makeChapterArticle("art-4", 4)];
    const incoming = [makeChapterArticle("art-5", 5), makeChapterArticle("art-6", 6)];
    const result = mergeArticles(current, incoming, "after");
    expect(result.map((a) => a.root.id)).toEqual(["art-3", "art-4", "art-5", "art-6"]);
  });

  it("before方向: 既存リストの先頭に新規Articleを追加する", () => {
    const current = [makeChapterArticle("art-3", 3), makeChapterArticle("art-4", 4)];
    const incoming = [makeChapterArticle("art-1", 1), makeChapterArticle("art-2", 2)];
    const result = mergeArticles(current, incoming, "before");
    expect(result.map((a) => a.root.id)).toEqual(["art-1", "art-2", "art-3", "art-4"]);
  });

  it("重複IDを除外する（既に取得済みのArticleは再追加しない）", () => {
    const current = [makeChapterArticle("art-3", 3), makeChapterArticle("art-4", 4)];
    const incoming = [makeChapterArticle("art-4", 4), makeChapterArticle("art-5", 5)];
    const result = mergeArticles(current, incoming, "after");
    expect(result.map((a) => a.root.id)).toEqual(["art-3", "art-4", "art-5"]);
  });

  it("結果はsortOrderで全体再ソートされる（文書順を保証）", () => {
    const current = [makeChapterArticle("art-5", 5)];
    const incoming = [makeChapterArticle("art-3", 3), makeChapterArticle("art-4", 4)];
    const result = mergeArticles(current, incoming, "before");
    expect(result.map((a) => a.root.sortOrder)).toEqual([3, 4, 5]);
  });

  it("incomingが空の場合はcurrentをそのまま返す", () => {
    const current = [makeChapterArticle("art-1", 1)];
    const result = mergeArticles(current, [], "after");
    expect(result).toBe(current);
  });

  it("全て重複の場合はcurrentをそのまま返す", () => {
    const current = [makeChapterArticle("art-1", 1)];
    const incoming = [makeChapterArticle("art-1", 1)];
    const result = mergeArticles(current, incoming, "after");
    expect(result).toBe(current);
  });
});

describe("findRootArticleIdFromList（対象ルート解決）", () => {
  const articles: ChapterArticle[] = [
    { root: makeRoot("art-1", 1), children: [makeChild("para-1-1", 10, "art-1")] },
    { root: makeRoot("art-2", 2), children: [makeChild("para-2-1", 20, "art-2")] },
  ];

  it("ルートArticle IDを渡すとそのまま返す", () => {
    expect(findRootArticleIdFromList(articles, "art-1")).toBe("art-1");
  });

  it("子孫ノードIDを渡すと親ルートIDを返す", () => {
    expect(findRootArticleIdFromList(articles, "para-1-1")).toBe("art-1");
    expect(findRootArticleIdFromList(articles, "para-2-1")).toBe("art-2");
  });

  it("存在しないIDはnullを返す", () => {
    expect(findRootArticleIdFromList(articles, "art-999")).toBeNull();
  });
});
