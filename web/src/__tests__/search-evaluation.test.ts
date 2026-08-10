import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildArchitectLawExamManifest,
  validateArchitectLawExamManifest,
} from "@/lib/search-evaluation/architect-law-exam-manifest";
import {
  evaluateSearchCases,
  type ProvisionRef,
  type SearchEvaluationCase,
} from "@/lib/search-evaluation/evaluator";
import {
  parseGroundTruthDocument,
  summarizeGroundTruthCoverage,
} from "@/lib/search-evaluation/ground-truth";

const provision = (
  egovLawId: string,
  articleNumberNormalized: string,
): ProvisionRef => ({
  egovLawId,
  articleNumberNormalized,
});

describe("一級建築士法規ベンチマークのマニフェスト", () => {
  it("令和3〜6年の学習120問と令和7年の未見評価30問を重複なく固定する", () => {
    const entries = buildArchitectLawExamManifest();

    expect(validateArchitectLawExamManifest(entries)).toEqual([]);
    expect(entries).toHaveLength(150);
    expect(entries.filter((entry) => entry.split === "learning")).toHaveLength(
      120,
    );
    expect(entries.filter((entry) => entry.split === "holdout")).toHaveLength(
      30,
    );
    expect(new Set(entries.map((entry) => entry.id))).toHaveLength(150);
    expect(new Set(entries.map((entry) => entry.examYear))).toEqual(
      new Set([2021, 2022, 2023, 2024, 2025]),
    );
    expect(
      entries.every(
        (entry) => entry.officialAnswer >= 1 && entry.officialAnswer <= 4,
      ),
    ).toBe(true);
  });

  it("令和7年の法令基準日と4月1日施行分の例外を失わない", () => {
    const entry = buildArchitectLawExamManifest().find(
      (candidate) => candidate.examYear === 2025,
    );

    expect(entry?.legalSnapshot.baseDate).toBe("2025-01-01");
    expect(entry?.legalSnapshot.overrides).toEqual([
      {
        effectiveDate: "2025-04-01",
        scope: "令和4年法律第69号とその施行政省令に基づく規定",
      },
    ]);
  });
});

describe("Search Evaluation Harness", () => {
  const buildingActArticle1 = provision("325AC0000000201", "1");
  const buildingActArticle2 = provision("325AC0000000201", "2");
  const enforcementOrderArticle1 = provision("325CO0000000338", "1");
  const unrelated = provision("999AC0000000001", "99");

  const cases: SearchEvaluationCase[] = [
    {
      id: "1k-2021-gakka3-q01",
      split: "learning",
      category: "definition",
      query: "建築物の定義",
      targetProvisions: [buildingActArticle1, buildingActArticle2],
      navigationPath: [buildingActArticle1, enforcementOrderArticle1],
      exceptions: ["適用除外"],
      unsupportedSources: ["対象告示"],
      rationaleStatus: "verified",
    },
    {
      id: "1k-2021-gakka3-q02",
      split: "learning",
      category: "definition",
      query: "建築面積",
      targetProvisions: [enforcementOrderArticle1],
      navigationPath: [enforcementOrderArticle1],
      exceptions: [],
      unsupportedSources: [],
      rationaleStatus: "verified",
    },
  ];

  it("上位10件の根拠再現率・MRR・完全到達率を重複結果で水増しせず算出する", () => {
    const report = evaluateSearchCases(cases, {
      "1k-2021-gakka3-q01": {
        searchResults: [unrelated, buildingActArticle1, buildingActArticle1],
        visitedProvisions: [buildingActArticle1, buildingActArticle2],
        navigationPath: [buildingActArticle1],
        confirmedExceptions: [],
        disclosedUnsupportedSources: ["対象告示"],
        assertedProvisions: [buildingActArticle1, unrelated],
      },
      "1k-2021-gakka3-q02": {
        searchResults: [enforcementOrderArticle1],
        visitedProvisions: [enforcementOrderArticle1],
        navigationPath: [enforcementOrderArticle1],
        confirmedExceptions: [],
        disclosedUnsupportedSources: [],
        assertedProvisions: [enforcementOrderArticle1],
      },
    });

    expect(report.summary).toMatchObject({
      caseCount: 2,
      recallAt10: 2 / 3,
      meanReciprocalRank: 0.75,
      completeSearchSetRate: 0.5,
      provisionSetReachRate: 1,
      navigationPathCompleteness: 0.75,
      exceptionConfirmationRate: 0,
      unsupportedSourceDisclosureRate: 1,
      falseEvidenceRate: 1 / 3,
    });
    expect(report.byCategory.definition).toEqual(report.summary);
  });

  it("根拠未確認の設問を評価済みとして混ぜない", () => {
    expect(() =>
      evaluateSearchCases([{ ...cases[0], rationaleStatus: "draft" }], {
        "1k-2021-gakka3-q01": {
          searchResults: [],
        },
      }),
    ).toThrow(/verified/);
  });

  it("観測していない実務指標をゼロ扱いしない", () => {
    const report = evaluateSearchCases([cases[1]], {
      "1k-2021-gakka3-q02": {
        searchResults: [enforcementOrderArticle1],
      },
    });

    expect(report.summary).toMatchObject({
      provisionSetReachRate: null,
      navigationPathCompleteness: null,
      exceptionConfirmationRate: null,
      unsupportedSourceDisclosureRate: null,
      falseEvidenceRate: null,
    });
  });
});

describe("法規過去問の派生正解セット", () => {
  const manifest = buildArchitectLawExamManifest();
  const record = {
    examId: "1k-2021-gakka3-q01",
    category: "definition",
    query: "建築物の定義",
    targetProvisions: [
      { egovLawId: "325AC0000000201", articleNumberNormalized: "2" },
    ],
    navigationPath: [
      { egovLawId: "325AC0000000201", articleNumberNormalized: "2" },
    ],
    exceptions: [],
    unsupportedSources: [],
    rationaleStatus: "verified",
  };

  it("試験IDから学習・未見評価の区分を付与し、整備率を集計する", () => {
    const cases = parseGroundTruthDocument(
      { schemaVersion: 1, cases: [record] },
      manifest,
    );

    expect(cases[0]).toMatchObject({ id: record.examId, split: "learning" });
    expect(summarizeGroundTruthCoverage(manifest, cases)).toEqual({
      total: { manifest: 150, reviewed: 1, verified: 1 },
      learning: { manifest: 120, reviewed: 1, verified: 1 },
      holdout: { manifest: 30, reviewed: 0, verified: 0 },
    });
  });

  it("令和3年30問を下書きとして保持し、検証前の評価対象に混ぜない", () => {
    const document = JSON.parse(
      readFileSync(
        new URL(
          "../../benchmarks/architect-law-exam-ground-truth.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown;
    const cases = parseGroundTruthDocument(document, manifest);

    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((item) => item.id)).size).toBe(30);
    expect(cases.every((item) => item.id.startsWith("1k-2021-gakka3-q"))).toBe(
      true,
    );
    expect(cases.every((item) => item.rationaleStatus === "draft")).toBe(true);
    expect(cases.every((item) => item.targetProvisions.length > 0)).toBe(true);
    expect(summarizeGroundTruthCoverage(manifest, cases)).toEqual({
      total: { manifest: 150, reviewed: 30, verified: 0 },
      learning: { manifest: 120, reviewed: 30, verified: 0 },
      holdout: { manifest: 30, reviewed: 0, verified: 0 },
    });
  });

  it("公式マニフェストにない問題IDを受け付けない", () => {
    expect(() =>
      parseGroundTruthDocument(
        { schemaVersion: 1, cases: [{ ...record, examId: "unknown" }] },
        manifest,
      ),
    ).toThrow(/unknown/);
  });

  it("問題文や選択肢の転載につながるフィールドを受け付けない", () => {
    expect(() =>
      parseGroundTruthDocument(
        {
          schemaVersion: 1,
          cases: [{ ...record, questionText: "転載してはいけない問題文" }],
        },
        manifest,
      ),
    ).toThrow(/questionText/);
  });
});
