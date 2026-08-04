import { describe, expect, it } from "vitest";
import { CIVIL_CODE_ARTICLE_EVIDENCE } from "../../scripts/lib/seed-verified-excerpt-ranges";

describe("民法（抄）の検証証跡", () => {
  it("ページ番号を保持せず画像ファイルを条文へ直接対応付ける", () => {
    expect(CIVIL_CODE_ARTICLE_EVIDENCE).toHaveLength(61);
    expect(
      CIVIL_CODE_ARTICLE_EVIDENCE.every(
        (item) => !("printedPages" in item) && item.evidenceFiles.length > 0,
      ),
    ).toBe(true);
  });
});
