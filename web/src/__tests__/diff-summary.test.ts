import { describe, expect, it } from "vitest";
import { buildDiffSummary } from "@/lib/law-refresh/diff-summary";
import type { LawRevisionDiff } from "@/lib/law-refresh/diff-law-revisions";
import type { ParsedLawNode } from "@/lib/law-refresh/types";

function makeNode(
  overrides: Partial<ParsedLawNode> = {},
): ParsedLawNode {
  return {
    sourceIndex: 0,
    parentSourceIndex: null,
    level: "article",
    legacyStableNodeKey: "key-1",
    durableNodeKey: "root/key-1",
    contentChecksum: "cc-1",
    bodyChecksum: "bc-1",
    articleNumber: "第1条",
    articleNumberNormalized: "1",
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    title: null,
    caption: null,
    text: "本文",
    sortOrder: 0,
    systemTags: null,
    tableCellMeta: null,
    ...overrides,
  };
}

function makeDiff(overrides: Partial<LawRevisionDiff> = {}): LawRevisionDiff {
  return {
    items: [],
    counts: { unchanged: 0, modified: 0, added: 0, removed: 0, held: 0 },
    publishable: true,
    holdReasons: [],
    ...overrides,
  };
}

describe("buildDiffSummary", () => {
  it("初回導入時はchangedArticleNumbersが空配列になる", () => {
    const diff = makeDiff({
      items: [
        { kind: "added", previous: null, candidate: makeNode({ articleNumber: "第1条" }), reason: null },
      ],
      counts: { unchanged: 0, modified: 0, added: 1, removed: 0, held: 0 },
    });

    const result = buildDiffSummary(diff, true);

    expect(result.changedArticleNumbers).toEqual([]);
    expect(result.counts.added).toBe(1);
  });

  it("article レベルの modified/added/removed から条番号を抽出する", () => {
    const diff = makeDiff({
      items: [
        { kind: "modified", previous: makeNode({ articleNumber: "第6条" }), candidate: makeNode({ articleNumber: "第6条" }), reason: null },
        { kind: "added", previous: null, candidate: makeNode({ articleNumber: "第12条" }), reason: null },
        { kind: "removed", previous: makeNode({ articleNumber: "第48条" }), candidate: null, reason: null },
        { kind: "unchanged", previous: makeNode({ articleNumber: "第1条" }), candidate: makeNode({ articleNumber: "第1条" }), reason: null },
      ],
      counts: { unchanged: 1, modified: 1, added: 1, removed: 1, held: 0 },
    });

    const result = buildDiffSummary(diff, false);

    expect(result.changedArticleNumbers).toContain("第6条");
    expect(result.changedArticleNumbers).toContain("第12条");
    expect(result.changedArticleNumbers).toContain("第48条");
    expect(result.changedArticleNumbers).not.toContain("第1条");
  });

  it("同一条番号の重複を排除する", () => {
    const diff = makeDiff({
      items: [
        { kind: "modified", previous: makeNode({ articleNumber: "第6条" }), candidate: makeNode({ articleNumber: "第6条" }), reason: null },
        { kind: "added", previous: null, candidate: makeNode({ articleNumber: "第6条の2" }), reason: null },
        { kind: "modified", previous: makeNode({ articleNumber: "第6条" }), candidate: makeNode({ articleNumber: "第6条" }), reason: null },
      ],
      counts: { unchanged: 0, modified: 2, added: 1, removed: 0, held: 0 },
    });

    const result = buildDiffSummary(diff, false);

    const count6 = result.changedArticleNumbers.filter((n) => n === "第6条").length;
    expect(count6).toBe(1);
    expect(result.changedArticleNumbers).toContain("第6条の2");
  });

  it("articleNumber が null のノードは除外する", () => {
    const diff = makeDiff({
      items: [
        { kind: "modified", previous: makeNode({ articleNumber: null }), candidate: makeNode({ articleNumber: null }), reason: null },
        { kind: "modified", previous: makeNode({ level: "paragraph", articleNumber: null }), candidate: makeNode({ level: "paragraph", articleNumber: null }), reason: null },
      ],
      counts: { unchanged: 0, modified: 2, added: 0, removed: 0, held: 0 },
    });

    const result = buildDiffSummary(diff, false);

    expect(result.changedArticleNumbers).toEqual([]);
  });

  it("renumbered_candidate や ambiguous は変更通知に含まない", () => {
    const diff = makeDiff({
      items: [
        { kind: "renumbered_candidate", previous: makeNode({ articleNumber: "第10条" }), candidate: makeNode({ articleNumber: "第11条" }), reason: "本文同一" },
        { kind: "ambiguous", previous: makeNode({ articleNumber: "第12条" }), candidate: makeNode({ articleNumber: "第13条" }), reason: "複数マッチ" },
      ],
      counts: { unchanged: 0, modified: 0, added: 0, removed: 0, held: 2 },
      publishable: false,
      holdReasons: ["RENUMBERING_REVIEW_REQUIRED"],
    });

    const result = buildDiffSummary(diff, false);

    expect(result.changedArticleNumbers).toEqual([]);
  });

  it("差分アイテムが空の場合は空配列を返す", () => {
    const diff = makeDiff();

    const result = buildDiffSummary(diff, false);

    expect(result.changedArticleNumbers).toEqual([]);
    expect(result.counts).toEqual({ unchanged: 0, modified: 0, added: 0, removed: 0, held: 0 });
  });
});
