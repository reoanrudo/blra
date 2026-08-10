#!/usr/bin/env npx tsx

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "../src/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "../src/lib/law-book/current-scope";
import {
  buildArchitectLawExamManifest,
  validateArchitectLawExamManifest,
  type ArchitectLawExamSplit,
} from "../src/lib/search-evaluation/architect-law-exam-manifest";
import { evaluateSearchCases, type ProvisionRef } from "../src/lib/search-evaluation/evaluator";
import {
  parseGroundTruthDocument,
  summarizeGroundTruthCoverage,
} from "../src/lib/search-evaluation/ground-truth";

const DEFAULT_DATASET_PATH = fileURLToPath(
  new URL("../benchmarks/architect-law-exam-ground-truth.json", import.meta.url),
);

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function readOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function formatRate(value: number | null): string {
  return value === null ? "未計測" : `${(value * 100).toFixed(1)}%`;
}

function printCoverage(coverage: ReturnType<typeof summarizeGroundTruthCoverage>): void {
  console.log("一級建築士 学科Ⅲ（法規） 正解セット整備状況");
  console.log("区分       マニフェスト  入力済み  検証済み");
  console.log(
    `学習       ${String(coverage.learning.manifest).padStart(6)}件  ${String(coverage.learning.reviewed).padStart(6)}件  ${String(coverage.learning.verified).padStart(6)}件`,
  );
  console.log(
    `未見評価   ${String(coverage.holdout.manifest).padStart(6)}件  ${String(coverage.holdout.reviewed).padStart(6)}件  ${String(coverage.holdout.verified).padStart(6)}件`,
  );
  console.log(
    `合計       ${String(coverage.total.manifest).padStart(6)}件  ${String(coverage.total.reviewed).padStart(6)}件  ${String(coverage.total.verified).padStart(6)}件`,
  );
}

async function runSearch(prisma: PrismaClient, query: string): Promise<ProvisionRef[]> {
  const likePattern = `%${escapeLike(query)}%`;
  const scope = currentLawBookArticleScopeSql("article", "entry", "law");

  return prisma.$queryRawUnsafe<ProvisionRef[]>(
    `SELECT
       law."egovLawId" AS "egovLawId",
       article."articleNumberNormalized" AS "articleNumberNormalized"
     FROM "Article" article
     JOIN "Law" law ON law.id = article."lawId"
     JOIN "LawBookEntry" entry
       ON entry."lawId" = law.id
      AND entry."editionId" = (
        SELECT edition_inner.id
        FROM "LawBookEdition" edition_inner
        WHERE edition_inner."editionKey" = $2
      )
     JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
     WHERE edition."editionKey" = $2
       AND ${scope}
       AND article."articleNumberNormalized" IS NOT NULL
       AND (article.text LIKE $1 OR article.caption LIKE $1 OR article.title LIKE $1)
     ORDER BY
       CASE WHEN article.caption LIKE $1 OR article.title LIKE $1 THEN 0 ELSE 1 END,
       article."sortOrder"
     LIMIT 10`,
    likePattern,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}

async function main(): Promise<void> {
  const manifest = buildArchitectLawExamManifest();
  const manifestIssues = validateArchitectLawExamManifest(manifest);
  if (manifestIssues.length > 0) {
    throw new Error(`マニフェストが不正です:\n${manifestIssues.join("\n")}`);
  }

  const datasetPath = readOption("dataset") ?? DEFAULT_DATASET_PATH;
  const document = JSON.parse(await readFile(datasetPath, "utf8")) as unknown;
  const cases = parseGroundTruthDocument(document, manifest);
  printCoverage(summarizeGroundTruthCoverage(manifest, cases));

  if (!process.argv.includes("--run")) return;

  const splitValue = readOption("split") ?? "learning";
  if (splitValue !== "learning" && splitValue !== "holdout") {
    throw new Error(`--split は learning または holdout を指定してください: ${splitValue}`);
  }
  const split = splitValue as ArchitectLawExamSplit;
  const runnableCases = cases.filter(
    (evaluationCase) => evaluationCase.split === split && evaluationCase.rationaleStatus === "verified",
  );
  if (runnableCases.length === 0) {
    throw new Error(`${split} に rationaleStatus=verified の評価ケースがありません`);
  }

  const prisma = new PrismaClient();
  try {
    const observations: Record<string, { searchResults: ProvisionRef[] }> = {};
    for (const evaluationCase of runnableCases) {
      observations[evaluationCase.id] = {
        searchResults: await runSearch(prisma, evaluationCase.query),
      };
    }

    const report = evaluateSearchCases(runnableCases, observations);
    console.log(`\n評価区分: ${split}（${report.summary.caseCount}件）`);
    console.log(`Recall@10: ${formatRate(report.summary.recallAt10)}`);
    console.log(`MRR: ${report.summary.meanReciprocalRank.toFixed(3)}`);
    console.log(`根拠条文セット完全取得率: ${formatRate(report.summary.completeSearchSetRate)}`);
    for (const [category, metrics] of Object.entries(report.byCategory)) {
      console.log(
        `- ${category}: ${metrics.caseCount}件 / Recall@10 ${formatRate(metrics.recallAt10)} / MRR ${metrics.meanReciprocalRank.toFixed(3)}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
