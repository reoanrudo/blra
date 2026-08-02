import { describe, expect, it } from "vitest";
import {
  buildFullLawBlocks,
  buildFullLawToc,
  fullLawAnchorId,
  type FullLawNode,
} from "@/lib/article/full-law-document";

function node(overrides: Partial<FullLawNode>): FullLawNode {
  return {
    id: "node",
    parentId: null,
    level: "article",
    articleNumber: null,
    articleNumberNormalized: null,
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    columnNumber: null,
    tableCoords: null,
    title: null,
    caption: null,
    text: null,
    articleCaptionNormalized: null,
    sortOrder: 1,
    depth: 0,
    lawId: "law-1",
    regulationType: null,
    stableNodeKey: "stable-node",
    lawRevisionId: "revision-1",
    path: [1],
    ...overrides,
  };
}

const rows: FullLawNode[] = [
  node({
    id: "chapter-1",
    parentId: "root",
    level: "chapter",
    title: "第一章　総則",
    depth: 1,
    path: [1, 1],
  }),
  node({
    id: "article-1",
    parentId: "chapter-1",
    level: "article",
    articleNumber: "一",
    articleNumberNormalized: "1",
    depth: 2,
    path: [1, 1, 1],
  }),
  node({
    id: "paragraph-1",
    parentId: "article-1",
    level: "paragraph",
    paragraphNumber: "1",
    text: "本文",
    depth: 3,
    path: [1, 1, 1, 1],
  }),
  node({
    id: "article-2",
    parentId: "chapter-1",
    level: "article",
    articleNumber: "二",
    articleNumberNormalized: "2",
    depth: 2,
    path: [1, 1, 2],
  }),
];

describe("full law document", () => {
  it("章見出しと条文を文書順の表示ブロックへ変換する", () => {
    const blocks = buildFullLawBlocks(rows, "建築基準法");
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "article",
      "article",
    ]);
    expect(blocks[1]).toMatchObject({
      kind: "article",
      article: { root: { id: "article-1" } },
    });
  });

  it("目次対象だけを保持し算用数字表示へ渡せる", () => {
    expect(buildFullLawToc(rows).map((item) => item.id)).toEqual([
      "chapter-1",
      "article-1",
      "article-2",
    ]);
  });

  it("Article IDをURL安全な固定DOM IDへ変換する", () => {
    expect(fullLawAnchorId("art_325ac_000002")).toBe(
      "law-node-art_325ac_000002",
    );
  });
});
