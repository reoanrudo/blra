import { describe, it, expect } from "vitest";
import {
  articleContextTitle,
  articleDisplayTitle,
  articleLabel,
  isHeadingLevel,
} from "@/lib/article/article";
import type { ArticleRow } from "@/lib/article/article";

function makeRow(overrides: Partial<ArticleRow> = {}): ArticleRow {
  return {
    id: "test-1",
    parentId: null,
    level: "article",
    articleNumber: "1",
    articleNumberNormalized: "1",
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    columnNumber: null,
    tableCoords: null,
    title: null,
    caption: null,
    text: "条文テキスト",
    articleCaptionNormalized: null,
    sortOrder: 1,
    depth: 0,
    lawId: "law-1",
    lawName: "建築基準法",
    regulationType: "individual",
    stableNodeKey: null,
    lawRevisionId: "rev-1",
    ...overrides,
  };
}

describe("articleLabel", () => {
  it('formats "article" level with articleNumber', () => {
    expect(articleLabel(makeRow({ level: "article", articleNumber: "87" }))).toBe("第87条");
  });

  it("returns paragraphNumber for paragraph level", () => {
    expect(articleLabel(makeRow({ level: "paragraph", paragraphNumber: "２" }))).toBe("２");
  });

  it("returns empty string for empty paragraphNumber (第1項, unnumbered)", () => {
    expect(articleLabel(makeRow({ level: "paragraph", paragraphNumber: "" }))).toBe("");
    expect(articleLabel(makeRow({ level: "paragraph", paragraphNumber: null }))).toBe("");
  });

  it("returns itemNumber for item level（号番号は原文維持・設計書§4.3）", () => {
    expect(articleLabel(makeRow({ level: "item", itemNumber: "一", articleNumber: "1" }))).toBe("一");
  });

  it("falls back to articleNumber when itemNumber is empty", () => {
    expect(articleLabel(makeRow({ level: "item", itemNumber: "", articleNumber: "3" }))).toBe("3");
    expect(articleLabel(makeRow({ level: "item", itemNumber: null, articleNumber: "5" }))).toBe("5");
  });

  it("returns subitemNumber for subitem levels", () => {
    expect(articleLabel(makeRow({ level: "subitem1", subitemNumber: "(1)" }))).toBe("(1)");
    expect(articleLabel(makeRow({ level: "subitem2", subitemNumber: "(i)" }))).toBe("(i)");
    expect(articleLabel(makeRow({ level: "subitem3", subitemNumber: "a" }))).toBe("a");
  });

  it("returns column label for column level", () => {
    expect(articleLabel(makeRow({ level: "column", columnNumber: "1" }))).toBe("Column 1");
  });

  it("returns appendix/supplement labels", () => {
    expect(articleLabel(makeRow({ level: "appdx_table", articleNumber: "1" }))).toBe("別表第1");
    expect(articleLabel(makeRow({ level: "suppl_provision" }))).toBe("附則");
    expect(
      articleLabel(
        makeRow({
          level: "suppl_provision",
          title: "附則（昭和二六年六月一日法律第一七八号・抄）",
        }),
      ),
    ).toBe("附則（昭和二六年六月一日法律第一七八号・抄）");
    expect(articleLabel(makeRow({ level: "table", title: "表A" }))).toBe("表A");
    expect(articleLabel(makeRow({ level: "table_struct", title: "別表第2 構造" }))).toBe("別表第2 構造");
  });

  it("returns empty string for unknown levels", () => {
    expect(articleLabel(makeRow({ level: "chapter" }))).toBe("");
    expect(articleLabel(makeRow({ level: "section" }))).toBe("");
  });
});

describe("articleDisplayTitle", () => {
  it("内部level名ではなく、段落の利用者向け見出しを返す（算用数字）", () => {
    expect(
      articleDisplayTitle(makeRow({ level: "paragraph", paragraphNumber: "１" })),
    ).toBe("第1項");
  });

  it("表示名を決められない内部ノードも内部level名を露出しない", () => {
    expect(articleDisplayTitle(makeRow({ level: "unknown_level" }))).toBe("条文");
  });

  it("章タイトル内の番号を算用数字化する", () => {
    expect(
      articleDisplayTitle(
        makeRow({ level: "chapter", title: "第二章　指定建築基準適合判定資格者検定機関" }),
      ),
    ).toBe("第2章　指定建築基準適合判定資格者検定機関");
  });

  it("章タイトルの「の」区切りも算用数字化する", () => {
    expect(
      articleDisplayTitle(
        makeRow({ level: "chapter", title: "第二章の二　指定構造計算適合判定資格者検定機関" }),
      ),
    ).toBe("第2章の2　指定構造計算適合判定資格者検定機関");
  });
});

describe("articleContextTitle", () => {
  it("附則の項を直接開いても、改正法番号を含む親附則を併記する", () => {
    const supplement = makeRow({
      id: "supplement",
      level: "suppl_provision",
      title: "附則（昭和二六年六月四日法律第一九五号・抄）",
    });
    const paragraph = makeRow({
      id: "paragraph",
      parentId: "supplement",
      level: "paragraph",
      paragraphNumber: "１",
      title: null,
    });

    expect(articleContextTitle([supplement, paragraph])).toBe(
      "附則（昭和二六年六月四日法律第一九五号・抄） 第1項",
    );
  });
});

describe("isHeadingLevel", () => {
  it("returns true for heading levels", () => {
    expect(isHeadingLevel("chapter")).toBe(true);
    expect(isHeadingLevel("section")).toBe(true);
    expect(isHeadingLevel("subsection")).toBe(true);
    expect(isHeadingLevel("appdx_table")).toBe(true);
    expect(isHeadingLevel("suppl_provision")).toBe(true);
  });

  it("returns false for article and below", () => {
    expect(isHeadingLevel("article")).toBe(false);
    expect(isHeadingLevel("paragraph")).toBe(false);
    expect(isHeadingLevel("item")).toBe(false);
    expect(isHeadingLevel("subitem1")).toBe(false);
    expect(isHeadingLevel("column")).toBe(false);
    expect(isHeadingLevel("table")).toBe(false);
    expect(isHeadingLevel("table_struct")).toBe(false);
  });

  it("returns false for unknown level strings", () => {
    expect(isHeadingLevel("unknown")).toBe(false);
  });
});
