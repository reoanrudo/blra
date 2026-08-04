#!/usr/bin/env npx tsx
/**
 * 公開現行版（Law.currentRevisionId）の完全性を検証する CLI。
 *
 * 計画書 Task 9 Step 4 の実装。
 *
 * 非0終了条件（いずれか1つでも該当すれば exit 1）:
 * 1. 収録対象が120でない
 * 2. currentRevisionId 欠損
 * 3. current Revision の active Article が0
 * 4. durable key 欠損/重複
 * 5. 検証済み Range の resolution 欠損
 * 6. Article の lawId と Revision の lawId 不一致
 *
 * --online 指定時だけ e-Gov 版番号照合も行う。
 *
 * Usage:
 *   npm run lawbook:current:verify
 *   npm run lawbook:current:verify -- --online
 */

import { PrismaClient } from "@prisma/client";
import { LAW_BOOK_2026, LAW_BOOK_EDITION_2026 } from "./law-book-2026";
import { getLawVersionAt } from "../src/lib/law-refresh/egov-client";

// ─── CLI引数 ───

interface CliArgs {
  online: boolean;
  help: boolean;
}

const HELP = `現行版の完全性検証 CLI

使い方:
  npm run lawbook:current:verify -- [options]

オプション:
  --online    e-Gov API で版番号照合も行う（省略時はDB整合性のみ）
  --help, -h  このヘルプを表示

非0終了条件:
  収録対象が120でない / currentRevisionId 欠損 /
  current Revision の active Article が0 /
  durable key 欠損・重複 / 検証済み Range の resolution 欠損 /
  Article の lawId と Revision の lawId 不一致
`;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { online: false, help: false };
  for (const arg of argv) {
    switch (arg) {
      case "--online":
        args.online = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`未知の引数です: ${arg}\n\n${HELP}`);
    }
  }
  return args;
}

// ─── 検証ユーティリティ ───

class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new VerificationError(message);
  }
}

// ─── 検証クエリの行型 ───

interface EntrySummaryRow {
  lawId: string;
  egovLawId: string;
  shortName: string | null;
  name: string;
  currentRevisionId: string | null;
}

interface ActiveArticleCountRow {
  lawId: string;
  revisionId: string;
  articleCount: bigint;
}

interface DurableKeyIssueRow {
  lawId: string;
  missingCount: bigint;
  duplicateCount: bigint;
}

interface RangeResolutionIssueRow {
  rangeId: string;
  lawId: string;
  rangeVerificationStatus: string;
  resolutionStatus: string | null;
}

interface LawRevisionMismatchRow {
  lawId: string;
  revisionId: string;
  articleLawId: string;
  revisionLawId: string;
}

// ─── Asia/Tokyo 当日 ───

function todayInTokyo(): string {
  const now = new Date();
  const tokyo = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = tokyo.getUTCFullYear();
  const mm = String(tokyo.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tokyo.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── 検証本体 ───

async function verify(
  prisma: PrismaClient,
  cliArgs: CliArgs,
): Promise<void> {
  // 検証1: 収録対象が120
  const entries = await prisma.$queryRawUnsafe<EntrySummaryRow[]>(
    `SELECT
       l."id" AS "lawId",
       l."egovLawId",
       l."shortName",
       l."name",
       l."currentRevisionId"
     FROM "LawBookEntry" e
     JOIN "LawBookEdition" edition ON edition."id" = e."editionId"
     JOIN "Law" l ON l."id" = e."lawId"
     WHERE edition."editionKey" = $1
     ORDER BY e."displayOrder"`,
    LAW_BOOK_EDITION_2026.editionKey,
  );

  assert(
    entries.length === 120,
    `収録対象が120ではありません: ${entries.length}`,
  );

  const catalogEgovIds = LAW_BOOK_2026.map((e) => e.egovLawId);
  const entryEgovIds = entries.map((e) => e.egovLawId);
  assert(
    JSON.stringify(entryEgovIds) === JSON.stringify(catalogEgovIds),
    "DB収録台帳とマニフェストの法令ID/順序が一致しません",
  );

  // 検証2: currentRevisionId 欠損
  const missingRevision = entries.filter((e) => !e.currentRevisionId);
  assert(
    missingRevision.length === 0,
    `currentRevisionId 欠損の法令があります: ${missingRevision.map((e) => e.egovLawId).join(", ")}`,
  );

  // 検証3: current Revision の active Article が0でない
  const revisionIds = entries
    .map((e) => e.currentRevisionId!)
    .filter(Boolean);
  const activeCounts = await prisma.$queryRawUnsafe<ActiveArticleCountRow[]>(
    `SELECT
       r."lawId",
       r."id" AS "revisionId",
       COUNT(a."id")::bigint AS "articleCount"
     FROM "LawRevision" r
     LEFT JOIN "Article" a
       ON a."lawRevisionId" = r."id" AND a."deletedAt" IS NULL
     WHERE r."id" = ANY($1::text[])
     GROUP BY r."id", r."lawId"`,
    revisionIds,
  );
  const countByRevision = new Map(
    activeCounts.map((r) => [r.revisionId, Number(r.articleCount)]),
  );
  const zeroArticleRevisions = revisionIds.filter(
    (rid) => (countByRevision.get(rid) ?? 0) === 0,
  );
  assert(
    zeroArticleRevisions.length === 0,
    `active Article が0件の current Revision があります: ${zeroArticleRevisions.length}件`,
  );

  const totalActiveArticles = activeCounts.reduce(
    (sum, r) => sum + Number(r.articleCount),
    0,
  );

  // 検証4: durable key 欠損/重複
  const durableIssues = await prisma.$queryRawUnsafe<DurableKeyIssueRow[]>(
    `SELECT
       a."lawId",
       COUNT(*) FILTER (WHERE a."durableNodeKey" IS NULL)::bigint AS "missingCount",
       COUNT(*) FILTER (WHERE a."durableNodeKey" IS NOT NULL)
         - COUNT(DISTINCT a."durableNodeKey")::bigint AS "duplicateCount"
     FROM "Article" a
     WHERE a."lawRevisionId" = ANY($1::text[])
       AND a."deletedAt" IS NULL
     GROUP BY a."lawId"`,
    revisionIds,
  );
  const missingDurable = durableIssues.filter((r) => Number(r.missingCount) > 0);
  assert(
    missingDurable.length === 0,
    `durable key 欠損の法令があります: ${missingDurable.map((r) => r.lawId).join(", ")}`,
  );
  const duplicateDurable = durableIssues.filter((r) => Number(r.duplicateCount) > 0);
  assert(
    duplicateDurable.length === 0,
    `durable key 重複の法令があります: ${duplicateDurable.map((r) => r.lawId).join(", ")}`,
  );

  // 検証5: 検証済み Range の resolution 欠損
  // 検証済み Range（source_verified / structure_validated）は現在 current Revision へ
  // resolution が存在しなければならない。
  const rangeResolutionIssues = await prisma.$queryRawUnsafe<RangeResolutionIssueRow[]>(
    `SELECT
       r."id" AS "rangeId",
       e."lawId",
       r."verificationStatus"::text AS "rangeVerificationStatus",
       COALESCE(res."status"::text, '__MISSING__') AS "resolutionStatus"
     FROM "LawBookEntryRange" r
     JOIN "LawBookEntry" e ON e."id" = r."lawBookEntryId"
     JOIN "Law" l ON l."id" = e."lawId"
     LEFT JOIN "LawBookEntryRangeResolution" res
       ON res."lawBookEntryRangeId" = r."id"
       AND res."lawRevisionId" = l."currentRevisionId"
     WHERE r."verificationStatus" IN ('source_verified', 'structure_validated')
       AND l."currentRevisionId" IS NOT NULL`,
  );
  const missingResolutions = rangeResolutionIssues.filter(
    (r) => r.resolutionStatus === "__MISSING__" || r.resolutionStatus !== "resolved",
  );
  assert(
    missingResolutions.length === 0,
    `検証済み Range の resolution が欠損/未解決です: ${missingResolutions.length}件（先頭: ${missingResolutions[0]?.rangeId ?? "(none)"}）`,
  );

  // 検証6: Article の lawId と Revision の lawId 不一致
  const mismatches = await prisma.$queryRawUnsafe<LawRevisionMismatchRow[]>(
    `SELECT
       a."lawId",
       a."lawRevisionId" AS "revisionId",
       a."lawId" AS "articleLawId",
       r."lawId" AS "revisionLawId"
     FROM "Article" a
     JOIN "LawRevision" r ON r."id" = a."lawRevisionId"
     WHERE a."lawRevisionId" = ANY($1::text[])
       AND a."deletedAt" IS NULL
       AND a."lawId" <> r."lawId"`,
    revisionIds,
  );
  assert(
    mismatches.length === 0,
    `Article.lawId と Revision.lawId が不一致の行があります: ${mismatches.length}件`,
  );

  // --online: e-Gov 版番号照合
  let onlineResults: { checked: number; mismatched: number } | null = null;
  if (cliArgs.online) {
    const asOf = todayInTokyo();
    let checked = 0;
    let mismatched = 0;
    const mismatchDetails: string[] = [];
    for (const entry of entries) {
      try {
        const version = await getLawVersionAt(entry.egovLawId, asOf);
        checked += 1;
        // 現行 Revision の officialVersionKey と e-Gov の revisionId を比較
        const revision = await prisma.lawRevision.findUnique({
          where: { id: entry.currentRevisionId! },
          select: { officialVersionKey: true },
        });
        if (revision && revision.officialVersionKey !== version.revisionId) {
          mismatched += 1;
          mismatchDetails.push(
            `${entry.egovLawId}: db=${revision.officialVersionKey} egov=${version.revisionId}`,
          );
        }
      } catch (error) {
        // e-Gov API 障害は検証失敗とはみなさず、チェック済み件数から除外する
        // （計画書: e-Gov障害では旧版を維持）
        process.stderr.write(
          `  [online] ${entry.egovLawId}: e-Gov API エラーでスキップ (${error instanceof Error ? error.message : String(error)})\n`,
        );
      }
    }
    assert(
      mismatched === 0,
      `e-Gov 版番号不一致: ${mismatched}件（${mismatchDetails.slice(0, 5).join(", ")}）`,
    );
    onlineResults = { checked, mismatched };
  }

  // ─── サマリ出力 ───
  const resolvedRangeCount = rangeResolutionIssues.length;
  console.log("=== 現行版 完全性検証: OK ===");
  console.log(`収録法令: ${entries.length}/120`);
  console.log(`active Article: ${totalActiveArticles.toLocaleString()}ノード`);
  console.log(`検証済み Range resolution: ${resolvedRangeCount}件`);
  console.log(`durable key 欠損/重複: 0`);
  console.log(`Article.lawId / Revision.lawId 不一致: 0`);
  if (onlineResults) {
    console.log(
      `e-Gov 版番号照合: checked=${onlineResults.checked} mismatched=${onlineResults.mismatched}`,
    );
  }
}

// ─── main ───

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  let cliArgs: CliArgs;
  try {
    cliArgs = parseArgs(argv);
  } catch (error) {
    process.stderr.write(
      `引数エラー: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }

  if (cliArgs.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const prisma = new PrismaClient();
  try {
    await verify(prisma, cliArgs);
    return 0;
  } catch (error) {
    if (error instanceof VerificationError) {
      process.stderr.write(`検証失敗: ${error.message}\n`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`致命的エラー: ${message}\n`);
    }
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => {
  process.exit(code);
});
