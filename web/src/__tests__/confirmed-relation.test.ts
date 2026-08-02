import { describe, expect, it } from "vitest";
import {
  normalizeRelationRationale,
  sortConfirmedRelationRows,
  type ConfirmedRelationSortRow,
} from "@/lib/relations/confirmed-relation";

const base: ConfirmedRelationSortRow = {
  id: "relation-1",
  relationType: "CITES",
  confirmedAt: "2026-08-02T00:00:00.000Z",
  targetLawDisplayOrder: 1,
  targetArticleSortOrder: 2,
};

describe("confirmed relation domain", () => {
  it("委任、準用、定義、例外、参照の順で安定ソートする", () => {
    const rows: ConfirmedRelationSortRow[] = [
      base,
      { ...base, id: "relation-2", relationType: "DEFINES" },
      { ...base, id: "relation-3", relationType: "DELEGATES_TO" },
      { ...base, id: "relation-4", relationType: "EXCEPTS" },
      { ...base, id: "relation-5", relationType: "APPLIES_MUTATIS_MUTANDIS" },
    ];
    expect(sortConfirmedRelationRows(rows).map((row) => row.id)).toEqual([
      "relation-3",
      "relation-5",
      "relation-2",
      "relation-4",
      "relation-1",
    ]);
  });

  it("根拠をtrimし、空文字と501文字を拒否する", () => {
    expect(normalizeRelationRationale("  確認済み  ")).toBe("確認済み");
    expect(() => normalizeRelationRationale("   ")).toThrow("1〜500文字");
    expect(() => normalizeRelationRationale("あ".repeat(501))).toThrow("1〜500文字");
  });
});
