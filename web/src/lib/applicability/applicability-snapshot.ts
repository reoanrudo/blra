import {
  APPLICABILITY_ANCHORS,
  isIsoCalendarDate,
  type ApplicabilityAnchorType,
} from "./applicability-context";

export interface ApplicabilitySnapshotInput {
  applicabilityAnchor?: unknown;
  applicabilityDate?: unknown;
  snapshotLawRevisionId?: unknown;
}

export interface ValidApplicabilitySnapshot {
  applicabilityAnchor: ApplicabilityAnchorType;
  applicabilityDate: string;
  snapshotLawRevisionId: string;
}

export type ApplicabilitySnapshotValidation =
  | {
      kind: "valid";
      snapshot: ValidApplicabilitySnapshot | null;
    }
  | {
      kind: "invalid";
      reason: "INCOMPLETE_SNAPSHOT" | "INVALID_ANCHOR" | "INVALID_DATE";
    }
  | { kind: "conflict"; reason: "REVISION_MISMATCH" };

export function validateApplicabilitySnapshot(
  input: ApplicabilitySnapshotInput,
  articleLawRevisionId: string,
): ApplicabilitySnapshotValidation {
  const values = [
    input.applicabilityAnchor,
    input.applicabilityDate,
    input.snapshotLawRevisionId,
  ];
  const providedCount = values.filter(
    (value) => value !== undefined && value !== null,
  ).length;

  if (providedCount === 0) return { kind: "valid", snapshot: null };
  if (providedCount !== values.length) {
    return { kind: "invalid", reason: "INCOMPLETE_SNAPSHOT" };
  }

  if (
    typeof input.applicabilityAnchor !== "string" ||
    !(APPLICABILITY_ANCHORS as readonly string[]).includes(
      input.applicabilityAnchor,
    )
  ) {
    return { kind: "invalid", reason: "INVALID_ANCHOR" };
  }

  if (
    typeof input.applicabilityDate !== "string" ||
    !isIsoCalendarDate(input.applicabilityDate)
  ) {
    return { kind: "invalid", reason: "INVALID_DATE" };
  }

  if (
    typeof input.snapshotLawRevisionId !== "string" ||
    input.snapshotLawRevisionId !== articleLawRevisionId
  ) {
    return { kind: "conflict", reason: "REVISION_MISMATCH" };
  }

  return {
    kind: "valid",
    snapshot: {
      applicabilityAnchor:
        input.applicabilityAnchor as ApplicabilityAnchorType,
      applicabilityDate: input.applicabilityDate,
      snapshotLawRevisionId: input.snapshotLawRevisionId,
    },
  };
}
