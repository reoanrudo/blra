/**
 * valid-from.ts のユニットテスト。
 * e-Gov API revision_info → §4.2 valid_from / valid_from_status の導出を検証。
 */
import { describe, it, expect } from "vitest";
import { deriveValidFrom } from "../../src/ingest/valid-from.js";
import type { RevisionInfo } from "../../src/ingest/types.js";

describe("deriveValidFrom", () => {
  it("amendment_enforcement_date がある場合は FIXED", () => {
    const revision: RevisionInfo = {
      law_revision_id: "rev1",
      law_title: "テスト法",
      amendment_enforcement_date: "2025-04-01",
    };
    const result = deriveValidFrom(revision);
    expect(result.validFromStatus).toBe("FIXED");
    expect(result.validFrom).toEqual(new Date("2025-04-01"));
  });

  it("amendment_enforcement_date 無し・scheduled がある場合は UNDETERMINED", () => {
    const revision: RevisionInfo = {
      law_revision_id: "rev1",
      law_title: "テスト法",
      amendment_scheduled_enforcement_date: "2025-06-01",
    };
    const result = deriveValidFrom(revision);
    expect(result.validFromStatus).toBe("UNDETERMINED");
    expect(result.validFrom).toBeNull();
  });

  it("どちらも無い場合は UNDETERMINED + validFrom=null", () => {
    const revision: RevisionInfo = {
      law_revision_id: "rev1",
      law_title: "テスト法",
    };
    const result = deriveValidFrom(revision);
    expect(result.validFromStatus).toBe("UNDETERMINED");
    expect(result.validFrom).toBeNull();
  });

  it("enforcement より scheduled が優先されることはない（enforcement 第一優先）", () => {
    const revision: RevisionInfo = {
      law_revision_id: "rev1",
      law_title: "テスト法",
      amendment_enforcement_date: "2025-04-01",
      amendment_scheduled_enforcement_date: "2025-06-01",
    };
    const result = deriveValidFrom(revision);
    expect(result.validFromStatus).toBe("FIXED");
    expect(result.validFrom).toEqual(new Date("2025-04-01"));
  });
});
