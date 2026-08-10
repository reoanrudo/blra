export type ArchitectLawExamSplit = "learning" | "holdout";

export interface LegalSnapshot {
  baseDate: string;
  overrides: ReadonlyArray<{
    effectiveDate: string;
    scope: string;
  }>;
}

export interface ArchitectLawExamManifestEntry {
  id: string;
  examYear: number;
  reiwaYear: number;
  questionNo: number;
  split: ArchitectLawExamSplit;
  officialAnswer: number;
  legalSnapshot: LegalSnapshot;
  questionSourceUrl: string;
  answerSourceUrl: string;
}

interface ExamYearDefinition {
  examYear: number;
  reiwaYear: number;
  split: ArchitectLawExamSplit;
  officialAnswers: readonly number[];
  legalSnapshot: LegalSnapshot;
}

const SOURCE_BASE_URL = "https://www.jaeic.or.jp/assets/pdf/shiken/1k/1k-mondai";

const EXAM_YEARS: readonly ExamYearDefinition[] = [
  {
    examYear: 2021,
    reiwaYear: 3,
    split: "learning",
    officialAnswers: [4, 4, 3, 2, 1, 1, 2, 4, 1, 4, 3, 2, 2, 2, 4, 4, 3, 3, 1, 2, 4, 3, 3, 1, 3, 3, 1, 1, 2, 3],
    legalSnapshot: { baseDate: "2021-01-01", overrides: [] },
  },
  {
    examYear: 2022,
    reiwaYear: 4,
    split: "learning",
    officialAnswers: [1, 4, 3, 2, 4, 3, 2, 2, 1, 3, 4, 1, 4, 4, 3, 4, 3, 3, 2, 3, 1, 4, 2, 1, 1, 2, 1, 2, 2, 4],
    legalSnapshot: { baseDate: "2022-01-01", overrides: [] },
  },
  {
    examYear: 2023,
    reiwaYear: 5,
    split: "learning",
    officialAnswers: [1, 4, 3, 1, 2, 3, 2, 4, 4, 3, 2, 3, 4, 2, 4, 4, 3, 3, 1, 3, 1, 1, 4, 2, 1, 1, 1, 1, 4, 2],
    legalSnapshot: { baseDate: "2023-01-01", overrides: [] },
  },
  {
    examYear: 2024,
    reiwaYear: 6,
    split: "learning",
    officialAnswers: [3, 2, 2, 4, 2, 3, 2, 1, 2, 4, 2, 1, 4, 4, 1, 1, 3, 3, 1, 3, 4, 4, 1, 3, 2, 3, 1, 4, 3, 4],
    legalSnapshot: { baseDate: "2024-01-01", overrides: [] },
  },
  {
    examYear: 2025,
    reiwaYear: 7,
    split: "holdout",
    officialAnswers: [3, 2, 3, 4, 3, 1, 3, 4, 2, 1, 1, 4, 2, 3, 2, 4, 3, 2, 4, 3, 2, 3, 2, 4, 1, 1, 3, 4, 4, 1],
    legalSnapshot: {
      baseDate: "2025-01-01",
      overrides: [
        {
          effectiveDate: "2025-04-01",
          scope: "令和4年法律第69号とその施行政省令に基づく規定",
        },
      ],
    },
  },
];

function questionId(examYear: number, questionNo: number): string {
  return `1k-${examYear}-gakka3-q${String(questionNo).padStart(2, "0")}`;
}

export function buildArchitectLawExamManifest(): ArchitectLawExamManifestEntry[] {
  return EXAM_YEARS.flatMap((year) =>
    year.officialAnswers.map((officialAnswer, index) => ({
      id: questionId(year.examYear, index + 1),
      examYear: year.examYear,
      reiwaYear: year.reiwaYear,
      questionNo: index + 1,
      split: year.split,
      officialAnswer,
      legalSnapshot: year.legalSnapshot,
      questionSourceUrl: `${SOURCE_BASE_URL}/1k-${year.examYear}-1st-gakka3.pdf`,
      answerSourceUrl: `${SOURCE_BASE_URL}/1k-${year.examYear}-1st-gokakukijun.pdf`,
    })),
  );
}

export function validateArchitectLawExamManifest(
  entries: readonly ArchitectLawExamManifestEntry[],
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();

  if (entries.length !== 150) {
    issues.push(`問題数は150件である必要があります（実際: ${entries.length}件）`);
  }

  for (const entry of entries) {
    if (ids.has(entry.id)) {
      issues.push(`問題IDが重複しています: ${entry.id}`);
    }
    ids.add(entry.id);

    const expectedSplit: ArchitectLawExamSplit = entry.examYear === 2025 ? "holdout" : "learning";
    if (entry.split !== expectedSplit) {
      issues.push(`${entry.id} のsplitは ${expectedSplit} である必要があります`);
    }
    if (entry.questionNo < 1 || entry.questionNo > 30) {
      issues.push(`${entry.id} の問題番号が1〜30の範囲外です`);
    }
    if (entry.officialAnswer < 1 || entry.officialAnswer > 4) {
      issues.push(`${entry.id} の公式正答肢が1〜4の範囲外です`);
    }
    if (entry.legalSnapshot.baseDate !== `${entry.examYear}-01-01`) {
      issues.push(`${entry.id} の法令基準日が年度の1月1日ではありません`);
    }
  }

  const learningCount = entries.filter((entry) => entry.split === "learning").length;
  const holdoutCount = entries.filter((entry) => entry.split === "holdout").length;
  if (learningCount !== 120) {
    issues.push(`学習セットは120件である必要があります（実際: ${learningCount}件）`);
  }
  if (holdoutCount !== 30) {
    issues.push(`未見評価セットは30件である必要があります（実際: ${holdoutCount}件）`);
  }

  return issues;
}
