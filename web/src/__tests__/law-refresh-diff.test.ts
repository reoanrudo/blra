import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import type {
  ParsedLawDocument,
  ParsedLawNode,
} from "@/lib/law-refresh/parse-law-xml";
import {
  diffLawRevisions,
  type LawNodeDiffKind,
} from "@/lib/law-refresh/diff-law-revisions";

/**
 * 差分engineのテスト用ヘルパー。
 *
 * 実パーサーの不変条件を模倣する軽量ビルダー:
 * - contentChecksum: 番号 + 本文に依存（番号が変われば変化）
 * - bodyChecksum: 本文のみに依存（番号だけの変更では変化しない）
 * - durableNodeKey: 親キー + セグメントのパス表現
 *
 * これにより「本文同一で番号だけ変更」のケースで bodyChecksum が一致し、
 * contentChecksum/durableNodeKey が変わるという parser と同じ振る舞いを再現できる。
 */

const context = {
  lawId: "law-test",
  egovLawId: "325AC0000000201",
  revisionId: "rev-test",
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type ArticleLevel = ParsedLawNode["level"];

interface NodeSeed {
  level?: ArticleLevel;
  durableNodeKey: string;
  parentDurableKey: string;
  articleNumber?: string | null;
  articleNumberNormalized?: string | null;
  body: string;
  /** 本文が同じでも意図的に異なる bodyChecksum にしたい場合に指定する */
  bodyChecksumOverride?: string;
}

function node(seed: NodeSeed, index: number): ParsedLawNode {
  const level = seed.level ?? "article";
  const identity = [
    level,
    seed.articleNumberNormalized ?? seed.articleNumber ?? "",
  ].join("|");
  const contentChecksum = sha256(`content|${identity}|${seed.body}`);
  const bodyChecksum = seed.bodyChecksumOverride ?? sha256(`body|${level}|${seed.body}`);
  return {
    sourceIndex: index,
    parentSourceIndex: null,
    level,
    legacyStableNodeKey: `legacy/${seed.durableNodeKey}@${index + 1}`,
    durableNodeKey: seed.durableNodeKey,
    contentChecksum,
    bodyChecksum,
    articleNumber: seed.articleNumber ?? null,
    articleNumberNormalized: seed.articleNumberNormalized ?? seed.articleNumber ?? null,
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    title: null,
    caption: null,
    text: seed.body,
    sortOrder: index + 1,
    systemTags: null,
    tableCellMeta: null,
  };
}

interface ArticleSeed {
  number: string;
  body: string;
  /** 親 durable key（既定は "main" = 本則直下） */
  parent?: string;
  bodyChecksumOverride?: string;
}

function article(seed: ArticleSeed, index: number): ParsedLawNode {
  const parent = seed.parent ?? "main";
  return node(
    {
      level: "article",
      durableNodeKey: `${parent}/article:${seed.number}`,
      parentDurableKey: parent,
      articleNumber: seed.number,
      articleNumberNormalized: seed.number,
      body: seed.body,
      bodyChecksumOverride: seed.bodyChecksumOverride,
    },
    index,
  );
}

function parsed(nodes: ParsedLawNode[]): ParsedLawDocument {
  return { ...context, nodes };
}

/** 複数記事を本則直下に並べる簡易ビルダー */
function articlesMain(seeds: Array<[string, string]>): ParsedLawDocument {
  return parsed(seeds.map(([number, body], i) => article({ number, body }, i)));
}

const kindCounts = (diff: ReturnType<typeof diffLawRevisions>) => {
  const byKind = new Map<LawNodeDiffKind, number>();
  for (const item of diff.items) {
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
  }
  return byKind;
};

describe("diffLawRevisions", () => {
  it("同一構成ならすべて unchanged で公開可能", () => {
    const doc = articlesMain([
      ["10", "A"],
      ["11", "B"],
    ]);
    const diff = diffLawRevisions(doc, doc);

    expect(diff.counts).toEqual({
      unchanged: 2,
      modified: 0,
      added: 0,
      removed: 0,
      held: 0,
    });
    expect(diff.publishable).toBe(true);
    expect(diff.holdReasons).toEqual([]);
    expect(kindCounts(diff).get("unchanged")).toBe(2);
  });

  it("挿入で後続条文をunchangedに保つ", () => {
    const diff = diffLawRevisions(
      articlesMain([
        ["10", "A"],
        ["11", "B"],
      ]),
      articlesMain([
        ["10", "A"],
        ["10の2", "NEW"],
        ["11", "B"],
      ]),
    );
    expect(diff.counts).toEqual({
      unchanged: 2,
      modified: 0,
      added: 1,
      removed: 0,
      held: 0,
    });
    expect(diff.publishable).toBe(true);
  });

  it("本文が変われば modified になる", () => {
    const diff = diffLawRevisions(
      articlesMain([["10", "A"]]),
      articlesMain([["10", "A改"]]),
    );
    expect(diff.counts).toEqual({
      unchanged: 0,
      modified: 1,
      added: 0,
      removed: 0,
      held: 0,
    });
    expect(kindCounts(diff).get("modified")).toBe(1);
    expect(diff.publishable).toBe(true);
  });

  it("条文の削除は removed になる", () => {
    const diff = diffLawRevisions(
      articlesMain([
        ["10", "A"],
        ["11", "B"],
      ]),
      articlesMain([["10", "A"]]),
    );
    expect(diff.counts).toEqual({
      unchanged: 1,
      modified: 0,
      added: 0,
      removed: 1,
      held: 0,
    });
    expect(kindCounts(diff).get("removed")).toBe(1);
    expect(diff.publishable).toBe(true);
  });

  it("条文の追加は added になる", () => {
    const diff = diffLawRevisions(
      articlesMain([["10", "A"]]),
      articlesMain([
        ["10", "A"],
        ["11", "B"],
      ]),
    );
    expect(diff.counts).toEqual({
      unchanged: 1,
      modified: 0,
      added: 1,
      removed: 0,
      held: 0,
    });
    expect(kindCounts(diff).get("added")).toBe(1);
    expect(diff.publishable).toBe(true);
  });

  it("本文同一で条番号だけが変わった候補は自動公開しない", () => {
    const diff = diffLawRevisions(
      articlesMain([["10", "same body"]]),
      articlesMain([["12", "same body"]]),
    );
    expect(diff.items.map((item) => item.kind)).toContain(
      "renumbered_candidate",
    );
    expect(diff.publishable).toBe(false);
    expect(diff.holdReasons).toContain("RENUMBERING_REVIEW_REQUIRED");
    expect(diff.counts.held).toBe(1);
    expect(diff.counts.added).toBe(0);
    expect(diff.counts.removed).toBe(0);
  });

  it("改番候補は previous/candidate 両ノードと理由を保持する", () => {
    const diff = diffLawRevisions(
      articlesMain([["10", "same body"]]),
      articlesMain([["12", "same body"]]),
    );
    const candidate = diff.items.find(
      (item) => item.kind === "renumbered_candidate",
    )!;
    expect(candidate.previous).not.toBeNull();
    expect(candidate.candidate).not.toBeNull();
    expect(candidate.previous?.articleNumber).toBe("10");
    expect(candidate.candidate?.articleNumber).toBe("12");
    expect(typeof candidate.reason).toBe("string");
    expect(candidate.reason?.length).toBeGreaterThan(0);
  });

  it("同一親で同 bodyChecksum の候補が複数あると ambiguous になる", () => {
    // 旧版: 第10条(本文X) と 第11条(本文X)（同じ本文）
    // 新版: 第20条(本文X) と 第21条(本文X)
    // removed{10,11} × added{20,21} で 2対2 となり一意に対応付けられない
    const diff = diffLawRevisions(
      articlesMain([
        ["10", "same"],
        ["11", "same"],
      ]),
      articlesMain([
        ["20", "same"],
        ["21", "same"],
      ]),
    );
    expect(diff.items.map((item) => item.kind)).toContain("ambiguous");
    expect(diff.publishable).toBe(false);
    expect(diff.holdReasons).toContain("RENUMBERING_REVIEW_REQUIRED");
    // ambiguous は removed/added にも数えず held に含める
    expect(diff.counts.removed).toBe(0);
    expect(diff.counts.added).toBe(0);
    expect(diff.counts.held).toBe(4);
  });

  it("親が異なれば bodyChecksum が同じでも改番候補にしない", () => {
    // 本則の第10条(本文X) と 附則の第1条(本文X) は親が違うため、
    // 単なる removed + added として扱う
    const previous = parsed([
      article({ number: "10", body: "same", parent: "main" }, 0),
    ]);
    const candidate = parsed([
      article({ number: "1", body: "same", parent: "supplementary" }, 0),
    ]);
    const diff = diffLawRevisions(previous, candidate);

    expect(diff.counts.removed).toBe(1);
    expect(diff.counts.added).toBe(1);
    expect(diff.counts.held).toBe(0);
    expect(diff.publishable).toBe(true);
  });

  it("level が異なれば bodyChecksum が同じでも改番候補にしない", () => {
    const previous = parsed([
      node({
        level: "article",
        durableNodeKey: "main/article:1",
        parentDurableKey: "main",
        articleNumber: "1",
        body: "same",
      }, 0),
    ]);
    const candidate = parsed([
      node({
        level: "paragraph",
        durableNodeKey: "main/paragraph:1",
        parentDurableKey: "main",
        body: "same",
      }, 0),
    ]);
    const diff = diffLawRevisions(previous, candidate);

    expect(diff.counts.removed).toBe(1);
    expect(diff.counts.added).toBe(1);
    expect(diff.counts.held).toBe(0);
    expect(diff.publishable).toBe(true);
  });

  it("変更と改番候補が混在しても両方を正しく分類する", () => {
    // 旧: 10(本文A) / 11(本文B)
    // 新: 10(本文A改 = modified) / 30(本文B = 第11条からの改番候補)
    const diff = diffLawRevisions(
      articlesMain([
        ["10", "A"],
        ["11", "B"],
      ]),
      articlesMain([
        ["10", "A改"],
        ["30", "B"],
      ]),
    );
    expect(diff.counts).toEqual({
      unchanged: 0,
      modified: 1,
      added: 0,
      removed: 0,
      held: 1,
    });
    expect(kindCounts(diff).get("modified")).toBe(1);
    expect(kindCounts(diff).get("renumbered_candidate")).toBe(1);
    expect(diff.publishable).toBe(false);
    expect(diff.holdReasons).toContain("RENUMBERING_REVIEW_REQUIRED");
  });

  it("改番候補が1組でも ambiguous が1組あれば保留する", () => {
    // 旧: 10(X) / 11(X) / 12(Y)
    // 新: 13(X) / 14(X) / 15(Y)
    // 10/11 -> 13/14 は ambiguous、12 -> 15 は renumbered_candidate
    const diff = diffLawRevisions(
      articlesMain([
        ["10", "X"],
        ["11", "X"],
        ["12", "Y"],
      ]),
      articlesMain([
        ["13", "X"],
        ["14", "X"],
        ["15", "Y"],
      ]),
    );
    const kinds = diff.items.map((item) => item.kind);
    expect(kinds).toContain("ambiguous");
    expect(kinds).toContain("renumbered_candidate");
    expect(diff.publishable).toBe(false);
    expect(diff.holdReasons).toContain("RENUMBERING_REVIEW_REQUIRED");
  });

  it("durableNodeKey が同じで本文が同じなら unchanged（番号表記の差は関知しない）", () => {
    // durable key 側で正規化済みという前提: 同一 durableNodeKey なら unchanged/modified 判定
    const previous = parsed([
      article({ number: "10", body: "same body" }, 0),
    ]);
    const candidate = parsed([
      article({ number: "10", body: "same body" }, 0),
    ]);
    const diff = diffLawRevisions(previous, candidate);
    expect(diff.counts.unchanged).toBe(1);
    expect(diff.publishable).toBe(true);
  });

  it("空ドキュメント同士の差分は空で公開可能", () => {
    const empty = parsed([]);
    const diff = diffLawRevisions(empty, empty);
    expect(diff.items).toEqual([]);
    expect(diff.counts).toEqual({
      unchanged: 0,
      modified: 0,
      added: 0,
      removed: 0,
      held: 0,
    });
    expect(diff.publishable).toBe(true);
    expect(diff.holdReasons).toEqual([]);
  });

  it("previous だけにノードがあれば removed、candidate だけにあれば added", () => {
    const diff = diffLawRevisions(
      articlesMain([["10", "A"]]),
      articlesMain([["20", "B"]]),
    );
    // bodyChecksum が異なるため改番候補にはならず removed + added
    expect(diff.counts).toEqual({
      unchanged: 0,
      modified: 0,
      added: 1,
      removed: 1,
      held: 0,
    });
    expect(diff.publishable).toBe(true);
  });
});
