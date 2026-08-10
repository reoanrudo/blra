export interface ProvisionRef {
  egovLawId: string;
  articleNumberNormalized: string;
}

export type RationaleStatus = "unreviewed" | "draft" | "verified";

export interface SearchEvaluationCase {
  id: string;
  split: "learning" | "holdout";
  category: string;
  query: string;
  targetProvisions: ProvisionRef[];
  navigationPath: ProvisionRef[];
  exceptions: string[];
  unsupportedSources: string[];
  rationaleStatus: RationaleStatus;
}

export interface SearchEvaluationObservation {
  searchResults: ProvisionRef[];
  visitedProvisions?: ProvisionRef[];
  navigationPath?: ProvisionRef[];
  confirmedExceptions?: string[];
  disclosedUnsupportedSources?: string[];
  assertedProvisions?: ProvisionRef[];
}

export interface EvaluationMetrics {
  caseCount: number;
  recallAt10: number;
  meanReciprocalRank: number;
  completeSearchSetRate: number;
  provisionSetReachRate: number | null;
  navigationPathCompleteness: number | null;
  exceptionConfirmationRate: number | null;
  unsupportedSourceDisclosureRate: number | null;
  falseEvidenceRate: number | null;
}

export interface SearchEvaluationReport {
  summary: EvaluationMetrics;
  byCategory: Record<string, EvaluationMetrics>;
}

function provisionKey(ref: ProvisionRef): string {
  return `${ref.egovLawId}:${ref.articleNumberNormalized}`;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function setCoverage(expected: readonly string[], observed: readonly string[]): number {
  const expectedSet = new Set(expected);
  if (expectedSet.size === 0) return 1;
  const observedSet = new Set(observed);
  return [...expectedSet].filter((value) => observedSet.has(value)).length / expectedSet.size;
}

function orderedCoverage(expected: readonly ProvisionRef[], observed: readonly ProvisionRef[]): number {
  if (expected.length === 0) return 1;
  const expectedKeys = expected.map(provisionKey);
  const observedKeys = observed.map(provisionKey);
  let expectedIndex = 0;

  for (const key of observedKeys) {
    if (key === expectedKeys[expectedIndex]) {
      expectedIndex += 1;
      if (expectedIndex === expectedKeys.length) break;
    }
  }

  return expectedIndex / expectedKeys.length;
}

function validateInputs(
  cases: readonly SearchEvaluationCase[],
  observations: Readonly<Record<string, SearchEvaluationObservation>>,
): void {
  if (cases.length === 0) {
    throw new Error("評価対象がありません");
  }

  const ids = new Set<string>();
  for (const evaluationCase of cases) {
    if (ids.has(evaluationCase.id)) {
      throw new Error(`評価ケースIDが重複しています: ${evaluationCase.id}`);
    }
    ids.add(evaluationCase.id);

    if (evaluationCase.rationaleStatus !== "verified") {
      throw new Error(`${evaluationCase.id} は rationaleStatus=verified ではありません`);
    }
    if (!evaluationCase.query.trim()) {
      throw new Error(`${evaluationCase.id} の検索課題が空です`);
    }
    if (evaluationCase.targetProvisions.length === 0) {
      throw new Error(`${evaluationCase.id} の根拠条文セットが空です`);
    }
    if (!observations[evaluationCase.id]) {
      throw new Error(`${evaluationCase.id} の観測結果がありません`);
    }
  }
}

function calculateMetrics(
  cases: readonly SearchEvaluationCase[],
  observations: Readonly<Record<string, SearchEvaluationObservation>>,
): EvaluationMetrics {
  let relevantHitCount = 0;
  let expectedProvisionCount = 0;
  let completeSearchSetCount = 0;
  const reciprocalRanks: number[] = [];
  const provisionReachValues: number[] = [];
  const navigationValues: number[] = [];
  const exceptionValues: number[] = [];
  const unsupportedValues: number[] = [];
  let falseAssertionCount = 0;
  let assertionCount = 0;

  for (const evaluationCase of cases) {
    const observation = observations[evaluationCase.id];
    const expectedKeys = new Set(evaluationCase.targetProvisions.map(provisionKey));
    const topTen = observation.searchResults.slice(0, 10);
    const topTenKeys = new Set(topTen.map(provisionKey));
    const hitCount = [...expectedKeys].filter((key) => topTenKeys.has(key)).length;

    relevantHitCount += hitCount;
    expectedProvisionCount += expectedKeys.size;
    if (hitCount === expectedKeys.size) completeSearchSetCount += 1;

    const firstRelevantIndex = topTen.findIndex((result) => expectedKeys.has(provisionKey(result)));
    reciprocalRanks.push(firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1));

    if (observation.visitedProvisions) {
      provisionReachValues.push(
        setCoverage([...expectedKeys], observation.visitedProvisions.map(provisionKey)),
      );
    }
    if (observation.navigationPath) {
      navigationValues.push(orderedCoverage(evaluationCase.navigationPath, observation.navigationPath));
    }
    if (evaluationCase.exceptions.length > 0 && observation.confirmedExceptions) {
      exceptionValues.push(setCoverage(evaluationCase.exceptions, observation.confirmedExceptions));
    }
    if (evaluationCase.unsupportedSources.length > 0 && observation.disclosedUnsupportedSources) {
      unsupportedValues.push(
        setCoverage(evaluationCase.unsupportedSources, observation.disclosedUnsupportedSources),
      );
    }
    if (observation.assertedProvisions && observation.assertedProvisions.length > 0) {
      assertionCount += observation.assertedProvisions.length;
      falseAssertionCount += observation.assertedProvisions.filter(
        (assertion) => !expectedKeys.has(provisionKey(assertion)),
      ).length;
    }
  }

  return {
    caseCount: cases.length,
    recallAt10: relevantHitCount / expectedProvisionCount,
    meanReciprocalRank: average(reciprocalRanks) ?? 0,
    completeSearchSetRate: completeSearchSetCount / cases.length,
    provisionSetReachRate: average(provisionReachValues),
    navigationPathCompleteness: average(navigationValues),
    exceptionConfirmationRate: average(exceptionValues),
    unsupportedSourceDisclosureRate: average(unsupportedValues),
    falseEvidenceRate: assertionCount === 0 ? null : falseAssertionCount / assertionCount,
  };
}

export function evaluateSearchCases(
  cases: readonly SearchEvaluationCase[],
  observations: Readonly<Record<string, SearchEvaluationObservation>>,
): SearchEvaluationReport {
  validateInputs(cases, observations);

  const categories = [...new Set(cases.map((evaluationCase) => evaluationCase.category))];
  return {
    summary: calculateMetrics(cases, observations),
    byCategory: Object.fromEntries(
      categories.map((category) => {
        const categoryCases = cases.filter((evaluationCase) => evaluationCase.category === category);
        return [category, calculateMetrics(categoryCases, observations)];
      }),
    ),
  };
}
