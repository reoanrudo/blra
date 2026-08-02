import { describe, expect, it } from "vitest";
import { validateApplicabilitySnapshot } from "@/lib/applicability/applicability-snapshot";

describe("validateApplicabilitySnapshot", () => {
  it("3項目を省略した既存保存経路を許可する", () => {
    expect(validateApplicabilitySnapshot({}, "revision-1")).toEqual({
      kind: "valid",
      snapshot: null,
    });
  });

  it("完全な作成時スナップショットを受理する", () => {
    expect(
      validateApplicabilitySnapshot(
        {
          applicabilityAnchor: "CONFIRMATION_APPLICATION",
          applicabilityDate: "2026-04-01",
          snapshotLawRevisionId: "revision-1",
        },
        "revision-1",
      ),
    ).toEqual({
      kind: "valid",
      snapshot: {
        applicabilityAnchor: "CONFIRMATION_APPLICATION",
        applicabilityDate: "2026-04-01",
        snapshotLawRevisionId: "revision-1",
      },
    });
  });

  it("一部だけ指定されたスナップショットを拒否する", () => {
    expect(
      validateApplicabilitySnapshot(
        { applicabilityAnchor: "TODAY" },
        "revision-1",
      ),
    ).toEqual({ kind: "invalid", reason: "INCOMPLETE_SNAPSHOT" });
  });

  it("未知のアンカーを拒否する", () => {
    expect(
      validateApplicabilitySnapshot(
        {
          applicabilityAnchor: "UNKNOWN",
          applicabilityDate: "2026-04-01",
          snapshotLawRevisionId: "revision-1",
        },
        "revision-1",
      ),
    ).toEqual({ kind: "invalid", reason: "INVALID_ANCHOR" });
  });

  it("存在しない日付を拒否する", () => {
    expect(
      validateApplicabilitySnapshot(
        {
          applicabilityAnchor: "CUSTOM",
          applicabilityDate: "2026-02-30",
          snapshotLawRevisionId: "revision-1",
        },
        "revision-1",
      ),
    ).toEqual({ kind: "invalid", reason: "INVALID_DATE" });
  });

  it("Articleと異なる条文版のスナップショットを拒否する", () => {
    expect(
      validateApplicabilitySnapshot(
        {
          applicabilityAnchor: "CUSTOM",
          applicabilityDate: "2026-04-01",
          snapshotLawRevisionId: "revision-2",
        },
        "revision-1",
      ),
    ).toEqual({ kind: "conflict", reason: "REVISION_MISMATCH" });
  });
});
