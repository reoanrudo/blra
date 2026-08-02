export interface RevisionInterval {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export type RevisionSelectionResult =
  | {
      kind: "resolved";
      revisionId: string;
      effectiveFrom: string;
      effectiveTo: string | null;
    }
  | {
      kind: "coverage_out_of_range";
      coverageStart: string | null;
      coverageEnd: string | null;
    }
  | { kind: "ambiguous"; revisionIds: string[] };

export function selectRevisionForDate(
  revisions: RevisionInterval[],
  asOf: string,
): RevisionSelectionResult {
  const candidates = revisions.filter(
    (revision) =>
      revision.effectiveFrom <= asOf &&
      (revision.effectiveTo === null || asOf < revision.effectiveTo),
  );

  if (candidates.length === 1) {
    const revision = candidates[0];
    return {
      kind: "resolved",
      revisionId: revision.id,
      effectiveFrom: revision.effectiveFrom,
      effectiveTo: revision.effectiveTo,
    };
  }

  if (candidates.length > 1) {
    return {
      kind: "ambiguous",
      revisionIds: candidates.map((revision) => revision.id),
    };
  }

  if (revisions.length === 0) {
    return {
      kind: "coverage_out_of_range",
      coverageStart: null,
      coverageEnd: null,
    };
  }

  const coverageStart = revisions.reduce(
    (earliest, revision) =>
      revision.effectiveFrom < earliest
        ? revision.effectiveFrom
        : earliest,
    revisions[0].effectiveFrom,
  );
  const openEnded = revisions.some((revision) => revision.effectiveTo === null);
  const finiteEnds = revisions.flatMap((revision) =>
    revision.effectiveTo === null ? [] : [revision.effectiveTo],
  );
  const coverageEnd = openEnded
    ? null
    : finiteEnds.reduce(
        (latest, end) => (end > latest ? end : latest),
        finiteEnds[0] ?? coverageStart,
      );

  return {
    kind: "coverage_out_of_range",
    coverageStart,
    coverageEnd,
  };
}
