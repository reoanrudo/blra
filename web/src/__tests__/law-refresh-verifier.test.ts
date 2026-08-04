import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import type {
  ParsedLawDocument,
  ParsedLawNode,
} from "@/lib/law-refresh/parse-law-xml";
import type { LawRevisionDiff } from "@/lib/law-refresh/diff-law-revisions";
import {
  loadReviewedRevisionDecision,
  parseReviewedRevisionDecision,
} from "@/lib/law-refresh/reviewed-mappings";
import {
  verifyCandidate,
  type CandidateVerificationInput,
} from "@/lib/law-refresh/verify-candidate";

/**
 * verify-candidate の単体テスト。
 *
 * ParsedLawNode は実パーサーの不変条件を模倣した軽量ビルダーで組み立てる。
 * durableNodeKey は「親キー/セグメント」のパス表現とし、parentSourceIndex は
 * nodes 配列上の index を指す。これにより循環検出や親子破損を擬似的に再現する。
 */

type ArticleLevel = ParsedLawNode["level"];

const context = {
  lawId: "law-test",
  egovLawId: "325AC0000000201",
  revisionId: "rev-candidate",
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

interface NodeSeed {
  level?: ArticleLevel;
  durableKey: string;
  parentSourceIndex?: number | null;
  articleNumber?: string | null;
  articleNumberNormalized?: string | null;
  body?: string;
}

function node(seed: NodeSeed, index: number): ParsedLawNode {
  const level = seed.level ?? "article";
  return {
    sourceIndex: index,
    parentSourceIndex: seed.parentSourceIndex ?? null,
    level,
    legacyStableNodeKey: `legacy/${seed.durableKey}@${index + 1}`,
    durableNodeKey: seed.durableKey,
    contentChecksum: sha256(
      `content|${level}|${seed.articleNumberNormalized ?? seed.articleNumber ?? ""}|${seed.body ?? "x"}`,
    ),
    bodyChecksum: sha256(`body|${level}|${seed.body ?? "x"}`),
    articleNumber: seed.articleNumber ?? null,
    articleNumberNormalized: seed.articleNumberNormalized ?? seed.articleNumber ?? null,
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    title: seed.articleNumber ? `第${seed.articleNumber}条` : null,
    caption: null,
    text: seed.body ?? null,
    sortOrder: index + 1,
    systemTags: null,
  };
}

function documentWith(nodes: ParsedLawNode[]): ParsedLawDocument {
  return { ...context, nodes };
}

/** 公開可能な空差分（変更なし）。 */
function publishableDiff(): LawRevisionDiff {
  return {
    items: [],
    counts: { unchanged: 0, modified: 0, added: 0, removed: 0, held: 0 },
    publishable: true,
    holdReasons: [],
  };
}

function baseInput(
  overrides: Partial<CandidateVerificationInput> = {},
): CandidateVerificationInput {
  return {
    document: documentWith([
      node({ durableKey: "main/article:1", articleNumber: "1" }, 0),
    ]),
    diff: publishableDiff(),
    ranges: [],
    previousNodeCount: 1,
    ...overrides,
  };
}

describe("verifyCandidate", () => {
  it("存在しないparentを持つ候補を公開不可にする", () => {
    const report = verifyCandidate({
      document: documentWith([
        node(
          {
            durableKey: "main/article:1",
            articleNumber: "1",
            parentSourceIndex: 999,
          },
          0,
        ),
      ]),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 1,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "ORPHAN_NODE" }),
    );
  });

  it("node 0件の候補は EMPTY_DOCUMENT で公開不可", () => {
    const report = verifyCandidate({
      document: documentWith([]),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 0,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "EMPTY_DOCUMENT" }),
    );
  });

  it("durable key が重複する候補は DUPLICATE_DURABLE_KEY で公開不可", () => {
    const report = verifyCandidate({
      document: documentWith([
        node({ durableKey: "main/article:1", articleNumber: "1" }, 0),
        node({ durableKey: "main/article:1", articleNumber: "1" }, 1),
      ]),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 2,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_DURABLE_KEY" }),
    );
  });

  it("親子関係に循環がある候補は CYCLE_DETECTED で公開不可", () => {
    // 2 -> 1, 1 -> 2 の循環
    const report = verifyCandidate({
      document: documentWith([
        node(
          { durableKey: "main/article:1", articleNumber: "1", parentSourceIndex: 1 },
          0,
        ),
        node(
          { durableKey: "main/article:2", articleNumber: "2", parentSourceIndex: 0 },
          1,
        ),
      ]),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 2,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "CYCLE_DETECTED" }),
    );
  });

  it("同一親・同一level・同一番号の重複は COLLISION_SIBLING_NUMBER で公開不可", () => {
    // 異なる durable key だが同じ親・article・正規化番号の重複
    const report = verifyCandidate({
      document: documentWith([
        node(
          { durableKey: "main/a/article:5", articleNumber: "5", parentSourceIndex: null },
          0,
        ),
        node(
          { durableKey: "main/b/article:5", articleNumber: "5", parentSourceIndex: null },
          1,
        ),
      ]),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 2,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "COLLISION_SIBLING_NUMBER" }),
    );
  });

  it("diff が publishable=false の候補は UNRESOLVED_DIFF で公開不可", () => {
    const report = verifyCandidate({
      document: documentWith([
        node({ durableKey: "main/article:1", articleNumber: "1" }, 0),
      ]),
      diff: {
        items: [],
        counts: { unchanged: 0, modified: 0, added: 0, removed: 0, held: 1 },
        publishable: false,
        holdReasons: ["RENUMBERING_REVIEW_REQUIRED"],
      },
      ranges: [],
      previousNodeCount: 1,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "UNRESOLVED_DIFF" }),
    );
  });

  it("blocked な範囲解決が1件でもあると RANGE_UNRESOLVED で公開不可", () => {
    const report = verifyCandidate({
      document: documentWith([
        node({ durableKey: "main/article:1", articleNumber: "1" }, 0),
      ]),
      diff: publishableDiff(),
      ranges: [
        {
          id: "range-9",
          rangeType: "article",
          officialCitationStart: "第9条",
          officialCitationEnd: "第9条",
        },
      ],
      previousNodeCount: 1,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "RANGE_UNRESOLVED" }),
    );
    expect(report.rangeResolutions).toEqual([
      expect.objectContaining({ status: "blocked" }),
    ]);
  });

  it("正常な候補は publishable=true で metrics を計算する", () => {
    const report = verifyCandidate(
      baseInput({
        document: documentWith([
          node({ durableKey: "main/article:1", articleNumber: "1" }, 0),
          node({ durableKey: "main/article:2", articleNumber: "2" }, 1),
          node(
            {
              level: "paragraph",
              durableKey: "main/article:2/paragraph:1",
              parentSourceIndex: 1,
            },
            2,
          ),
        ]),
        previousNodeCount: 3,
      }),
    );
    expect(report.publishable).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.metrics).toEqual({
      nodeCount: 3,
      articleCount: 2,
      nodeDeltaRatio: 0,
    });
  });

  it("node件数が旧版から20%以上減少すると STRUCTURE_CHANGE_REVIEW_REQUIRED で保留", () => {
    // 旧版 10 件 -> 新版 7 件 = -30%
    const nodes = Array.from({ length: 7 }, (_, i) =>
      node({ durableKey: `main/article:${i + 1}`, articleNumber: String(i + 1) }, i),
    );
    const report = verifyCandidate({
      document: documentWith(nodes),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 10,
    });
    expect(report.publishable).toBe(false);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ code: "STRUCTURE_CHANGE_REVIEW_REQUIRED" }),
    );
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "STRUCTURE_CHANGE_REVIEW_REQUIRED" }),
    );
    expect(report.metrics.nodeDeltaRatio).toBeCloseTo(-0.3, 5);
  });

  it("node件数が旧版から20%以上増加すると STRUCTURE_CHANGE_REVIEW_REQUIRED で保留", () => {
    // 旧版 10 件 -> 新版 13 件 = +30%
    const nodes = Array.from({ length: 13 }, (_, i) =>
      node({ durableKey: `main/article:${i + 1}`, articleNumber: String(i + 1) }, i),
    );
    const report = verifyCandidate({
      document: documentWith(nodes),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 10,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "STRUCTURE_CHANGE_REVIEW_REQUIRED" }),
    );
    expect(report.metrics.nodeDeltaRatio).toBeCloseTo(0.3, 5);
  });

  it("node件数が±20%未満の変動なら保留しない", () => {
    // 旧版 10 件 -> 新版 11 件 = +10%
    const nodes = Array.from({ length: 11 }, (_, i) =>
      node({ durableKey: `main/article:${i + 1}`, articleNumber: String(i + 1) }, i),
    );
    const report = verifyCandidate({
      document: documentWith(nodes),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 10,
    });
    expect(report.publishable).toBe(true);
    expect(report.warnings).not.toContainEqual(
      expect.objectContaining({ code: "STRUCTURE_CHANGE_REVIEW_REQUIRED" }),
    );
  });

  it("previousNodeCount が 0 の場合は構造変化保留を出さない（初回導入）", () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      node({ durableKey: `main/article:${i + 1}`, articleNumber: String(i + 1) }, i),
    );
    const report = verifyCandidate({
      document: documentWith(nodes),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 0,
    });
    expect(report.publishable).toBe(true);
    expect(report.metrics.nodeDeltaRatio).toBe(0);
  });

  it("reviewed decision で STRUCTURE_CHANGE_REVIEW_REQUIRED を上書き解除できる", () => {
    const nodes = Array.from({ length: 7 }, (_, i) =>
      node({ durableKey: `main/article:${i + 1}`, articleNumber: String(i + 1) }, i),
    );
    const decision = parseReviewedRevisionDecision(
      {
        schemaVersion: 1,
        lawId: context.lawId,
        fromRevisionId: "rev-prev",
        toRevisionId: context.revisionId,
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
        mappings: [],
        approvedGuards: ["STRUCTURE_CHANGE_REVIEW_REQUIRED"],
        verifiedBy: "operator",
        verifiedAt: "2026-08-04T09:00:00+09:00",
        rationale: "公式XML差分を確認した",
      },
      {
        lawId: context.lawId,
        fromRevisionId: "rev-prev",
        toRevisionId: context.revisionId,
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
      },
    );
    const report = verifyCandidate({
      document: documentWith(nodes),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 10,
      reviewedDecision: decision,
    });
    expect(report.publishable).toBe(true);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ code: "STRUCTURE_CHANGE_REVIEW_REQUIRED" }),
    );
    // 保留理由は reviewed decision で解除済みのため errors には含まれない
    expect(report.errors).not.toContainEqual(
      expect.objectContaining({ code: "STRUCTURE_CHANGE_REVIEW_REQUIRED" }),
    );
  });

  it("reviewed decision が承認していない guard は解除できない", () => {
    const nodes = Array.from({ length: 7 }, (_, i) =>
      node({ durableKey: `main/article:${i + 1}`, articleNumber: String(i + 1) }, i),
    );
    const decision = parseReviewedRevisionDecision(
      {
        schemaVersion: 1,
        lawId: context.lawId,
        fromRevisionId: "rev-prev",
        toRevisionId: context.revisionId,
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
        mappings: [],
        approvedGuards: [],
        verifiedBy: "operator",
        verifiedAt: "2026-08-04T09:00:00+09:00",
        rationale: "構造変化は未承認",
      },
      {
        lawId: context.lawId,
        fromRevisionId: "rev-prev",
        toRevisionId: context.revisionId,
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
      },
    );
    const report = verifyCandidate({
      document: documentWith(nodes),
      diff: publishableDiff(),
      ranges: [],
      previousNodeCount: 10,
      reviewedDecision: decision,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "STRUCTURE_CHANGE_REVIEW_REQUIRED" }),
    );
  });

  it("reviewed decision で renumbered_candidate を覆せば diff 未解決も解除できる", () => {
    const removed = node(
      { durableKey: "main/article:10", articleNumber: "10", body: "X" },
      0,
    );
    const added = node(
      { durableKey: "main/article:12", articleNumber: "12", body: "X" },
      1,
    );
    const diff: LawRevisionDiff = {
      items: [
        {
          kind: "renumbered_candidate",
          previous: removed,
          candidate: added,
          reason: "test",
        },
      ],
      counts: { unchanged: 0, modified: 0, added: 0, removed: 0, held: 1 },
      publishable: false,
      holdReasons: ["RENUMBERING_REVIEW_REQUIRED"],
    };
    const decision = parseReviewedRevisionDecision(
      {
        schemaVersion: 1,
        lawId: context.lawId,
        fromRevisionId: "rev-prev",
        toRevisionId: context.revisionId,
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
        mappings: [
          {
            fromDurableNodeKey: "main/article:10",
            toDurableNodeKey: "main/article:12",
            kind: "renumbered",
            rationale: "第10条は第12条へ改番",
          },
        ],
        approvedGuards: [],
        verifiedBy: "operator",
        verifiedAt: "2026-08-04T09:00:00+09:00",
        rationale: "改番対応を公式公布で確認",
      },
      {
        lawId: context.lawId,
        fromRevisionId: "rev-prev",
        toRevisionId: context.revisionId,
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
      },
    );
    const report = verifyCandidate({
      document: documentWith([added]),
      diff,
      ranges: [],
      previousNodeCount: 1,
      reviewedDecision: decision,
    });
    expect(report.publishable).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("reviewed mapping が renumbered 候補を1件でも覆い切れない場合は再公開しない", () => {
    const removed1 = node(
      { durableKey: "main/article:10", articleNumber: "10", body: "X" },
      0,
    );
    const removed2 = node(
      { durableKey: "main/article:11", articleNumber: "11", body: "X" },
      1,
    );
    const added = node(
      { durableKey: "main/article:12", articleNumber: "12", body: "X" },
      2,
    );
    const diff: LawRevisionDiff = {
      items: [
        {
          kind: "renumbered_candidate",
          previous: removed1,
          candidate: added,
          reason: "10->12",
        },
        {
          kind: "renumbered_candidate",
          previous: removed2,
          candidate: added,
          reason: "11->12",
        },
      ],
      counts: { unchanged: 0, modified: 0, added: 0, removed: 0, held: 2 },
      publishable: false,
      holdReasons: ["RENUMBERING_REVIEW_REQUIRED"],
    };
    const decision = parseReviewedRevisionDecision(
      {
        schemaVersion: 1,
        lawId: context.lawId,
        fromRevisionId: "rev-prev",
        toRevisionId: context.revisionId,
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
        mappings: [
          {
            fromDurableNodeKey: "main/article:10",
            toDurableNodeKey: "main/article:12",
            kind: "renumbered",
            rationale: "第10条だけ改番",
          },
        ],
        approvedGuards: [],
        verifiedBy: "operator",
        verifiedAt: "2026-08-04T09:00:00+09:00",
        rationale: "第11条は別途確認予定",
      },
      {
        lawId: context.lawId,
        fromRevisionId: "rev-prev",
        toRevisionId: context.revisionId,
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
      },
    );
    const report = verifyCandidate({
      document: documentWith([added]),
      diff,
      ranges: [],
      previousNodeCount: 2,
      reviewedDecision: decision,
    });
    expect(report.publishable).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "UNRESOLVED_DIFF" }),
    );
  });
});

describe("parseReviewedRevisionDecision", () => {
  const baseExpected = {
    lawId: "law-1",
    fromRevisionId: "rev-1",
    toRevisionId: "rev-2",
    fromXmlChecksum: "a".repeat(64),
    toXmlChecksum: "b".repeat(64),
  };

  it("XML checksumが一致しない人手確認ファイルを拒否する", () => {
    expect(() =>
      parseReviewedRevisionDecision(
        {
          schemaVersion: 1,
          lawId: "law-1",
          fromRevisionId: "rev-1",
          toRevisionId: "rev-2",
          fromXmlChecksum: "a".repeat(64),
          toXmlChecksum: "b".repeat(64),
          mappings: [],
          approvedGuards: ["STRUCTURE_CHANGE_REVIEW_REQUIRED"],
          verifiedBy: "operator",
          verifiedAt: "2026-08-04T09:00:00+09:00",
          rationale: "公式XML差分を確認した",
        },
        {
          lawId: "law-1",
          fromRevisionId: "rev-1",
          toRevisionId: "rev-2",
          fromXmlChecksum: "a".repeat(64),
          toXmlChecksum: "c".repeat(64),
        },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "REVIEW_CHECKSUM_MISMATCH" }),
    );
  });

  it("lawId が不一致なら REVIEW_REVISION_MISMATCH を投げる", () => {
    expect(() =>
      parseReviewedRevisionDecision(
        {
          schemaVersion: 1,
          lawId: "law-other",
          fromRevisionId: "rev-1",
          toRevisionId: "rev-2",
          fromXmlChecksum: "a".repeat(64),
          toXmlChecksum: "b".repeat(64),
          mappings: [],
          approvedGuards: [],
          verifiedBy: "operator",
          verifiedAt: "2026-08-04T09:00:00+09:00",
          rationale: "x",
        },
        baseExpected,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "REVIEW_REVISION_MISMATCH" }),
    );
  });

  it("revisionId が不一致なら REVIEW_REVISION_MISMATCH を投げる", () => {
    expect(() =>
      parseReviewedRevisionDecision(
        {
          schemaVersion: 1,
          lawId: "law-1",
          fromRevisionId: "rev-1",
          toRevisionId: "rev-other",
          fromXmlChecksum: "a".repeat(64),
          toXmlChecksum: "b".repeat(64),
          mappings: [],
          approvedGuards: [],
          verifiedBy: "operator",
          verifiedAt: "2026-08-04T09:00:00+09:00",
          rationale: "x",
        },
        baseExpected,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "REVIEW_REVISION_MISMATCH" }),
    );
  });

  it("schemaVersion が異なるなら REVIEW_SCHEMA_UNSUPPORTED を投げる", () => {
    expect(() =>
      parseReviewedRevisionDecision(
        {
          schemaVersion: 2 as 1,
          lawId: "law-1",
          fromRevisionId: "rev-1",
          toRevisionId: "rev-2",
          fromXmlChecksum: "a".repeat(64),
          toXmlChecksum: "b".repeat(64),
          mappings: [],
          approvedGuards: [],
          verifiedBy: "operator",
          verifiedAt: "2026-08-04T09:00:00+09:00",
          rationale: "x",
        },
        baseExpected,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "REVIEW_SCHEMA_UNSUPPORTED" }),
    );
  });

  it("未知の approvedGuards 値は REVIEW_SCHEMA_UNSUPPORTED を投げる", () => {
    expect(() =>
      parseReviewedRevisionDecision(
        {
          schemaVersion: 1,
          lawId: "law-1",
          fromRevisionId: "rev-1",
          toRevisionId: "rev-2",
          fromXmlChecksum: "a".repeat(64),
          toXmlChecksum: "b".repeat(64),
          mappings: [],
          approvedGuards: ["UNKNOWN_GUARD" as "STRUCTURE_CHANGE_REVIEW_REQUIRED"],
          verifiedBy: "operator",
          verifiedAt: "2026-08-04T09:00:00+09:00",
          rationale: "x",
        },
        baseExpected,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "REVIEW_SCHEMA_UNSUPPORTED" }),
    );
  });

  it("未知の mapping kind は REVIEW_SCHEMA_UNSUPPORTED を投げる", () => {
    expect(() =>
      parseReviewedRevisionDecision(
        {
          schemaVersion: 1,
          lawId: "law-1",
          fromRevisionId: "rev-1",
          toRevisionId: "rev-2",
          fromXmlChecksum: "a".repeat(64),
          toXmlChecksum: "b".repeat(64),
          mappings: [
            {
              fromDurableNodeKey: "a",
              toDurableNodeKey: "b",
              kind: "merge" as "renumbered",
              rationale: "x",
            },
          ],
          approvedGuards: [],
          verifiedBy: "operator",
          verifiedAt: "2026-08-04T09:00:00+09:00",
          rationale: "x",
        },
        baseExpected,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "REVIEW_SCHEMA_UNSUPPORTED" }),
    );
  });

  it("mapping の fromDurableNodeKey が重複すると REVIEW_MAPPING_AMBIGUOUS を投げる", () => {
    expect(() =>
      parseReviewedRevisionDecision(
        {
          schemaVersion: 1,
          lawId: "law-1",
          fromRevisionId: "rev-1",
          toRevisionId: "rev-2",
          fromXmlChecksum: "a".repeat(64),
          toXmlChecksum: "b".repeat(64),
          mappings: [
            {
              fromDurableNodeKey: "a",
              toDurableNodeKey: "b",
              kind: "renumbered",
              rationale: "x",
            },
            {
              fromDurableNodeKey: "a",
              toDurableNodeKey: "c",
              kind: "renumbered",
              rationale: "y",
            },
          ],
          approvedGuards: [],
          verifiedBy: "operator",
          verifiedAt: "2026-08-04T09:00:00+09:00",
          rationale: "x",
        },
        baseExpected,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "REVIEW_MAPPING_AMBIGUOUS" }),
    );
  });

  it("JSON 文字列からも同様にパースできる", () => {
    const valid = {
      schemaVersion: 1,
      lawId: "law-1",
      fromRevisionId: "rev-1",
      toRevisionId: "rev-2",
      fromXmlChecksum: "a".repeat(64),
      toXmlChecksum: "b".repeat(64),
      mappings: [],
      approvedGuards: [],
      verifiedBy: "operator",
      verifiedAt: "2026-08-04T09:00:00+09:00",
      rationale: "ok",
    };
    const decision = parseReviewedRevisionDecision(
      JSON.stringify(valid),
      baseExpected,
    );
    expect(decision.lawId).toBe("law-1");
    expect(decision.mappings).toEqual([]);
  });
});

describe("loadReviewedRevisionDecision", () => {
  it("ファイルから decision を読み込める", async () => {
    // vitest は cwd = web を前提とする。テスト用 JSON を fixtures 配下へ置かず、
    // 一時ファイル経由で検証する。
    const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "blra-review-"));
    try {
      const path = join(dir, "decision.json");
      const valid = {
        schemaVersion: 1,
        lawId: "law-1",
        fromRevisionId: "rev-1",
        toRevisionId: "rev-2",
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
        mappings: [],
        approvedGuards: [],
        verifiedBy: "operator",
        verifiedAt: "2026-08-04T09:00:00+09:00",
        rationale: "ok",
      };
      await writeFile(path, JSON.stringify(valid), "utf8");
      const decision = await loadReviewedRevisionDecision(path, {
        lawId: "law-1",
        fromRevisionId: "rev-1",
        toRevisionId: "rev-2",
        fromXmlChecksum: "a".repeat(64),
        toXmlChecksum: "b".repeat(64),
      });
      expect(decision.lawId).toBe("law-1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
