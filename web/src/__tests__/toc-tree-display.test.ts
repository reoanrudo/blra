import { describe, it, expect } from "vitest";
import { nodeLabel, type TocNode } from "@/lib/article/toc-tree";

/** TocNode を簡易生成するヘルパー */
function makeNode(partial: Partial<TocNode>): TocNode {
  return {
    id: "test-id",
    parentId: null,
    level: "article",
    title: null,
    articleNumber: null,
    caption: null,
    sortOrder: 0,
    depth: 0,
    path: [],
    textFirstLine: null,
    paragraphNumber: null,
    ...partial,
  };
}

describe("toc-tree 表示変換（設計書§4.1）", () => {
  describe("nodeLabel: 条番号の算用数字化", () => {
    it("「第九条」を「第9条」に変換する", () => {
      const node = makeNode({ level: "article", articleNumber: "九" });
      expect(nodeLabel(node)).toBe("第9条");
    });

    it("「第一条」を「第1条」に変換する", () => {
      const node = makeNode({ level: "article", articleNumber: "一" });
      expect(nodeLabel(node)).toBe("第1条");
    });

    it("「第一の二条」を「第1の2条」に変換する", () => {
      const node = makeNode({ level: "article", articleNumber: "一の二" });
      expect(nodeLabel(node)).toBe("第1の2条");
    });
  });

  describe("nodeLabel: 二重括弧の解消（設計書§4.1）", () => {
    it("captionが括弧付きの場合、二重括弧にならない", () => {
      const node = makeNode({
        level: "article",
        articleNumber: "一",
        caption: "（目的）",
      });
      expect(nodeLabel(node)).toBe("第1条（目的）");
    });

    it("captionが括弧なしの場合、括弧を付ける", () => {
      const node = makeNode({
        level: "article",
        articleNumber: "一",
        caption: "目的",
      });
      expect(nodeLabel(node)).toBe("第1条（目的）");
    });

    it("captionが半角括弧の場合も二重括弧にならない", () => {
      const node = makeNode({
        level: "article",
        articleNumber: "一",
        caption: "(目的)",
      });
      expect(nodeLabel(node)).toBe("第1条(目的)");
    });
  });

  describe("nodeLabel: 章・節・款の算用数字化", () => {
    it("章番号を算用数字化する", () => {
      const node = makeNode({ level: "chapter", articleNumber: "三" });
      expect(nodeLabel(node)).toBe("第3章");
    });

    it("節番号を算用数字化する", () => {
      const node = makeNode({ level: "section", articleNumber: "二" });
      expect(nodeLabel(node)).toBe("第2節");
    });

    it("款番号を算用数字化する", () => {
      const node = makeNode({ level: "subsection", articleNumber: "一" });
      expect(nodeLabel(node)).toBe("第1款");
    });
  });

  describe("nodeLabel: 別表の算用数字化", () => {
    it("別表番号を算用数字化する", () => {
      const node = makeNode({ level: "appdx_table", articleNumber: "二" });
      expect(nodeLabel(node)).toBe("別表第2");
    });
  });
});
