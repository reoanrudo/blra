import type { ArchitectLawExamManifestEntry } from "./architect-law-exam-manifest";
import type {
  ProvisionRef,
  RationaleStatus,
  SearchEvaluationCase,
} from "./evaluator";

const CATEGORIES = new Set([
  "definition",
  "procedure",
  "fire-evacuation",
  "structure",
  "collective-regulations",
  "other-laws",
  "cross-law",
]);

const CASE_FIELDS = new Set([
  "examId",
  "category",
  "query",
  "targetProvisions",
  "navigationPath",
  "exceptions",
  "unsupportedSources",
  "rationaleStatus",
]);

interface CoverageCount {
  manifest: number;
  reviewed: number;
  verified: number;
}

export interface GroundTruthCoverage {
  total: CoverageCount;
  learning: CoverageCount;
  holdout: CoverageCount;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, field: string, examId: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${examId} の ${field} は空でない文字列である必要があります`);
  }
  return value.trim();
}

function stringArray(record: Record<string, unknown>, field: string, examId: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${examId} の ${field} は空でない文字列の配列である必要があります`);
  }
  return value.map((item) => item.trim());
}

function provisionArray(record: Record<string, unknown>, field: string, examId: string): ProvisionRef[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`${examId} の ${field} は条文参照の配列である必要があります`);
  }

  return value.map((item, index) => {
    if (!isObject(item)) {
      throw new Error(`${examId} の ${field}[${index}] が条文参照ではありません`);
    }
    return {
      egovLawId: requiredString(item, "egovLawId", `${examId}.${field}[${index}]`),
      articleNumberNormalized: requiredString(
        item,
        "articleNumberNormalized",
        `${examId}.${field}[${index}]`,
      ),
    };
  });
}

export function parseGroundTruthDocument(
  input: unknown,
  manifest: readonly ArchitectLawExamManifestEntry[],
): SearchEvaluationCase[] {
  if (!isObject(input) || input.schemaVersion !== 1 || !Array.isArray(input.cases)) {
    throw new Error("正解セットは schemaVersion=1 と cases 配列を持つ必要があります");
  }

  const manifestById = new Map(manifest.map((entry) => [entry.id, entry]));
  const seenIds = new Set<string>();

  return input.cases.map((item, index) => {
    if (!isObject(item)) {
      throw new Error(`cases[${index}] がオブジェクトではありません`);
    }

    for (const field of Object.keys(item)) {
      if (!CASE_FIELDS.has(field)) {
        throw new Error(`cases[${index}] に許可されていないフィールドがあります: ${field}`);
      }
    }

    const examId = requiredString(item, "examId", `cases[${index}]`);
    const manifestEntry = manifestById.get(examId);
    if (!manifestEntry) {
      throw new Error(`公式マニフェストにない問題IDです: ${examId}`);
    }
    if (seenIds.has(examId)) {
      throw new Error(`正解セットの問題IDが重複しています: ${examId}`);
    }
    seenIds.add(examId);

    const category = requiredString(item, "category", examId);
    if (!CATEGORIES.has(category)) {
      throw new Error(`${examId} の category が未定義です: ${category}`);
    }

    const rationaleStatus = requiredString(item, "rationaleStatus", examId);
    if (!["unreviewed", "draft", "verified"].includes(rationaleStatus)) {
      throw new Error(`${examId} の rationaleStatus が不正です: ${rationaleStatus}`);
    }

    return {
      id: examId,
      split: manifestEntry.split,
      category,
      query: requiredString(item, "query", examId),
      targetProvisions: provisionArray(item, "targetProvisions", examId),
      navigationPath: provisionArray(item, "navigationPath", examId),
      exceptions: stringArray(item, "exceptions", examId),
      unsupportedSources: stringArray(item, "unsupportedSources", examId),
      rationaleStatus: rationaleStatus as RationaleStatus,
    };
  });
}

function coverageFor(
  manifest: readonly ArchitectLawExamManifestEntry[],
  cases: readonly SearchEvaluationCase[],
): CoverageCount {
  return {
    manifest: manifest.length,
    reviewed: cases.length,
    verified: cases.filter((item) => item.rationaleStatus === "verified").length,
  };
}

export function summarizeGroundTruthCoverage(
  manifest: readonly ArchitectLawExamManifestEntry[],
  cases: readonly SearchEvaluationCase[],
): GroundTruthCoverage {
  const learningManifest = manifest.filter((entry) => entry.split === "learning");
  const holdoutManifest = manifest.filter((entry) => entry.split === "holdout");
  const learningCases = cases.filter((entry) => entry.split === "learning");
  const holdoutCases = cases.filter((entry) => entry.split === "holdout");

  return {
    total: coverageFor(manifest, cases),
    learning: coverageFor(learningManifest, learningCases),
    holdout: coverageFor(holdoutManifest, holdoutCases),
  };
}
