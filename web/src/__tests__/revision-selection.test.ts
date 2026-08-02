import { describe, expect, it } from "vitest";
import { selectRevisionForDate } from "@/lib/applicability/revision-selection";

const revisions = [
  {
    id: "old",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-04-01",
  },
  {
    id: "new",
    effectiveFrom: "2026-04-01",
    effectiveTo: null,
  },
];

describe("selectRevisionForDate", () => {
  it("開始日を含める", () => {
    expect(selectRevisionForDate(revisions, "2025-01-01")).toEqual({
      kind: "resolved",
      revisionId: "old",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2026-04-01",
    });
  });

  it("終了日を含まず次版を選ぶ", () => {
    expect(selectRevisionForDate(revisions, "2026-04-01")).toEqual({
      kind: "resolved",
      revisionId: "new",
      effectiveFrom: "2026-04-01",
      effectiveTo: null,
    });
  });

  it("適用範囲外で最寄り版を返さない", () => {
    expect(selectRevisionForDate(revisions, "2024-12-31")).toEqual({
      kind: "coverage_out_of_range",
      coverageStart: "2025-01-01",
      coverageEnd: null,
    });
  });

  it("候補が空なら境界不明の範囲外を返す", () => {
    expect(selectRevisionForDate([], "2026-04-01")).toEqual({
      kind: "coverage_out_of_range",
      coverageStart: null,
      coverageEnd: null,
    });
  });

  it("重複する版を曖昧性エラーにする", () => {
    expect(
      selectRevisionForDate(
        [
          ...revisions,
          {
            id: "duplicate",
            effectiveFrom: "2026-01-01",
            effectiveTo: null,
          },
        ],
        "2026-05-01",
      ),
    ).toEqual({
      kind: "ambiguous",
      revisionIds: ["new", "duplicate"],
    });
  });
});
