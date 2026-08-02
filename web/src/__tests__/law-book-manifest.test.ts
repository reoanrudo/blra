import { describe, expect, it } from "vitest";
import {
  LAW_BOOK_2026,
  lawCategoryFromEgovId,
  officialLawDataUrl,
} from "../../scripts/law-book-2026";

describe("LAW_BOOK_2026", () => {
  it("総目次で確認した120文書を掲載順どおり一意に保持する", () => {
    expect(LAW_BOOK_2026).toHaveLength(120);
    expect(LAW_BOOK_2026.map((entry) => entry.displayOrder)).toEqual(
      Array.from({ length: 120 }, (_, index) => index + 1),
    );
    expect(new Set(LAW_BOOK_2026.map((entry) => entry.egovLawId)).size).toBe(120);
    expect(new Set(LAW_BOOK_2026.map((entry) => entry.officialTitle)).size).toBe(120);
  });

  it("公式DBで照合した文書種別内訳を維持する", () => {
    const counts = { law: 0, cabinet_order: 0, ministry_ordinance: 0 };
    for (const entry of LAW_BOOK_2026) {
      counts[lawCategoryFromEgovId(entry.egovLawId)] += 1;
    }
    expect(counts).toEqual({ law: 65, cabinet_order: 29, ministry_ordinance: 26 });
  });

  it("全文14件と抄録106件を区別し、書籍掲載頁を失わない", () => {
    expect(LAW_BOOK_2026.filter((entry) => entry.inclusionMode === "full")).toHaveLength(14);
    expect(LAW_BOOK_2026.filter((entry) => entry.inclusionMode === "excerpt")).toHaveLength(106);
    expect(LAW_BOOK_2026[0]).toMatchObject({
      egovLawId: "325AC0000000201",
      printedPage: 1,
      inclusionMode: "full",
    });
    expect(LAW_BOOK_2026[119]).toMatchObject({
      egovLawId: "419AC0000000052",
      printedPage: 1258,
      inclusionMode: "excerpt",
    });
  });

  it("2026年1月1日時点の公式本文URLを生成する", () => {
    expect(officialLawDataUrl("325AC0000000201")).toBe(
      "https://laws.e-gov.go.jp/api/2/law_file/xml/325AC0000000201?asof=2026-01-01",
    );
  });
});
