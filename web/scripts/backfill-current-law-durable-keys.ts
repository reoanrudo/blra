#!/usr/bin/env npx tsx
/**
 * 現行120法令の Article へ durableNodeKey と bodyChecksum を安全に backfill する CLI。
 *
 * 計画書 Task 9 Step 3/5/6 の実装。
 *
 * アルゴリズム:
 * 1. Law.currentRevisionId が指す Revision ごとに原本XMLを読む（xmlStorageKey）。
 * 2. 同じ Revision ID で parseLawXml を実行する。
 * 3. 既存Article（DB）と parser node（XML）を legacyStableNodeKey で1対1照合する。
 * 4. planDurableKeyBackfill で件数・contentChecksum・親子数を検証し、
 *    すべて一致した法令だけ更新対象にする。
 * 5. dry-run は計画だけ出力（DurableKeyBackfillReport）。本実行しない。
 * 6. 本実行は法令ごとの transaction で Article.durableNodeKey/bodyChecksum と、
 *    現在の検証済み LawBookEntryRange に対応する LawBookEntryRangeResolution を保存する。
 *
 * 安全要件（計画書 Step 6）:
 * - 本実行前に必ず pg_dump でバックアップを取得すること。
 * - dry-run で lawsBlocked=0 を確認してから本実行すること。
 * - 未検証の105抄録へ範囲解決（RangeResolution）を作らないこと。
 *
 * Usage:
 *   npm run lawbook:current:backfill -- --dry-run
 *   npm run lawbook:current:backfill
 *   npm run lawbook:current:backfill -- --law 325AC0000000201
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  planDurableKeyBackfill,
  BackfillChecksumMismatchError,
  type BackfillDbNode,
  type BackfillParsedNode,
  type DurableKeyBackfillReport,
  type DurableKeyBackfillUpdate,
} from "../src/lib/law-refresh/backfill-durable-keys";
import { parseLawXml } from "../src/lib/law-refresh/parse-law-xml";
import { resolveVerifiedRanges } from "../src/lib/law-refresh/range-resolution";
import { LAW_BOOK_2026 } from "./law-book-2026";

// ─── パス解決 ───

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.join(__dirname, "..");

// ─── DB行の型 ───

interface LawWithRevision {
  lawId: string;
  egovLawId: string;
  shortName: string | null;
  name: string;
  currentRevisionId: string | null;
}

interface RevisionRow {
  id: string;
  lawId: string;
  xmlStorageKey: string;
  xmlChecksum: string;
}

interface ArticleBackfillRow {
  id: string;
  stableNodeKey: string;
  contentChecksum: string;
  parentId: string | null;
}

interface VerifiedRangeRow {
  id: string;
  rangeType: string;
  startStableNodeKey: string | null;
  endStableNodeKey: string | null;
  officialCitationStart: string | null;
  officialCitationEnd: string | null;
}

// ─── CLI引数 ───

interface CliArgs {
  dryRun: boolean;
  lawIds: string[];
  help: boolean;
}

const HELP = `現行法令の durable key backfill CLI

使い方:
  npm run lawbook:current:backfill -- [options]

オプション:
  --dry-run           計画だけ出力（DB書き込みなし）
  --law <egovLawId>   対象法令を限定（複数回指定可）。省略時は収録120法令すべて
  --help, -h          このヘルプを表示

安全要件:
  本実行前に pg_dump でバックアップを取得してください。
  dry-run で lawsBlocked=0 を確認してから本実行してください。
`;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, lawIds: [], help: false };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    i++;
    switch (arg) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--law":
        args.lawIds.push(argv[i++]!);
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

// ─── XML読込 ───

/**
 * Revision.xmlStorageKey（web/からの相対パス）から原本XMLを読む。
 * xmlStorageKey が絶対パスの場合はそのまま、相対パスの場合は web/ を基準に解決する。
 */
function readRevisionXml(xmlStorageKey: string, lawId: string): string {
  const resolved = path.isAbsolute(xmlStorageKey)
    ? xmlStorageKey
    : path.join(WEB_DIR, xmlStorageKey);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `${lawId}: 原本XMLが見つかりません xmlStorageKey=${xmlStorageKey} resolved=${resolved}`,
    );
  }
  return fs.readFileSync(resolved, "utf-8");
}

// ─── DB取得ヘルパー ───

async function fetchLaws(
  prisma: PrismaClient,
  filterLawIds: string[],
): Promise<LawWithRevision[]> {
  // LAW_BOOK_2026 の egovLawId を Law.id（= law_<egov LOWER>）へ変換して対象を決める
  const catalogEgovIds = new Set<string>(LAW_BOOK_2026.map((e) => e.egovLawId));
  const requestedEgovIds: string[] =
    filterLawIds.length > 0 ? filterLawIds : Array.from(catalogEgovIds);

  // 未知の law ID 検証
  const unknown = requestedEgovIds.filter((id) => !catalogEgovIds.has(id));
  if (unknown.length > 0) {
    throw new Error(`未知の law ID です: ${unknown.join(", ")}`);
  }

  const rows = await prisma.$queryRawUnsafe<LawWithRevision[]>(
    `SELECT
       l."id" AS "lawId",
       l."egovLawId",
       l."shortName",
       l."name",
       l."currentRevisionId"
     FROM "Law" l
     WHERE l."egovLawId" = ANY($1::text[])
     ORDER BY l."egovLawId"`,
    requestedEgovIds,
  );
  return rows;
}

async function fetchRevision(
  prisma: PrismaClient,
  revisionId: string,
): Promise<RevisionRow | null> {
  const rows = await prisma.$queryRawUnsafe<RevisionRow[]>(
    `SELECT "id", "lawId", "xmlStorageKey", "xmlChecksum"
     FROM "LawRevision"
     WHERE "id" = $1`,
    revisionId,
  );
  return rows[0] ?? null;
}

async function fetchArticlesForBackfill(
  prisma: PrismaClient,
  revisionId: string,
): Promise<ArticleBackfillRow[]> {
  return prisma.$queryRawUnsafe<ArticleBackfillRow[]>(
    `SELECT "id", "stableNodeKey", "contentChecksum", "parentId"
     FROM "Article"
     WHERE "lawRevisionId" = $1 AND "deletedAt" IS NULL`,
    revisionId,
  );
}

async function fetchVerifiedRanges(
  prisma: PrismaClient,
  lawId: string,
): Promise<VerifiedRangeRow[]> {
  // 検証済み（source_verified / structure_validated）の Range だけを対象にする。
  // 計画書 Step 3: 「現在の検証済み LawBookEntryRange に対応する Resolution を保存。
  //                未検証の105抄録へ範囲を作らない。」
  return prisma.$queryRawUnsafe<VerifiedRangeRow[]>(
    `SELECT
       r."id",
       r."rangeType"::text AS "rangeType",
       r."startStableNodeKey",
       r."endStableNodeKey",
       r."officialCitationStart",
       r."officialCitationEnd"
     FROM "LawBookEntryRange" r
     JOIN "LawBookEntry" e ON e."id" = r."lawBookEntryId"
     WHERE e."lawId" = $1
       AND r."verificationStatus" IN ('source_verified', 'structure_validated')
     ORDER BY r."sortOrder"`,
    lawId,
  );
}

// ─── DBノード組み立て ───

/**
 * DB Article行から BackfillDbNode へ変換する。
 * parentId を経由して親の stableNodeKey を解決する。
 */
function buildBackfillDbNodes(
  articles: ArticleBackfillRow[],
): BackfillDbNode[] {
  // id -> stableNodeKey のマップ（親解決用）
  const keyById = new Map<string, string>();
  for (const a of articles) {
    keyById.set(a.id, a.stableNodeKey);
  }

  return articles.map((a) => ({
    id: a.id,
    stableNodeKey: a.stableNodeKey,
    contentChecksum: a.contentChecksum,
    parentStableNodeKey: a.parentId ? (keyById.get(a.parentId) ?? null) : null,
  }));
}

/**
 * ParsedLawNode から BackfillParsedNode へ変換する。
 * parentSourceIndex を経由して親の legacyStableNodeKey を解決する。
 */
function buildBackfillParsedNodes(
  parsedNodes: ReturnType<typeof parseLawXml>["nodes"],
): BackfillParsedNode[] {
  // sourceIndex -> legacyStableNodeKey のマップ（親解決用）
  const keyBySourceIndex = new Map<number, string>();
  for (const n of parsedNodes) {
    keyBySourceIndex.set(n.sourceIndex, n.legacyStableNodeKey);
  }

  return parsedNodes.map((n) => ({
    legacyStableNodeKey: n.legacyStableNodeKey,
    durableNodeKey: n.durableNodeKey,
    contentChecksum: n.contentChecksum,
    bodyChecksum: n.bodyChecksum,
    parentLegacyStableNodeKey: n.parentSourceIndex !== null
      ? (keyBySourceIndex.get(n.parentSourceIndex) ?? null)
      : null,
  }));
}

// ─── 法令ごとの処理 ───

interface LawBackfillOutcome {
  lawId: string;
  egovLawId: string;
  shortName: string;
  ready: boolean;
  errorCode: string | null;
  nodeCount: number;
  updateCount: number;
  rangeResolutionCount: number;
}

/**
 * 1法令分の backfill 計画を作成する（dry-run と本実行の共通処理）。
 * 例外は呼び出し元で catch して blocked 扱いにする。
 */
async function processOneLaw(
  prisma: PrismaClient,
  law: LawWithRevision,
  dryRun: boolean,
): Promise<LawBackfillOutcome> {
  const egovLawId = law.egovLawId;
  const shortName = law.shortName ?? law.name;

  // currentRevisionId 必須
  if (!law.currentRevisionId) {
    return {
      lawId: law.lawId,
      egovLawId,
      shortName,
      ready: false,
      errorCode: "BACKFILL_NO_CURRENT_REVISION",
      nodeCount: 0,
      updateCount: 0,
      rangeResolutionCount: 0,
    };
  }

  const revision = await fetchRevision(prisma, law.currentRevisionId);
  if (!revision) {
    return {
      lawId: law.lawId,
      egovLawId,
      shortName,
      ready: false,
      errorCode: "BACKFILL_REVISION_NOT_FOUND",
      nodeCount: 0,
      updateCount: 0,
      rangeResolutionCount: 0,
    };
  }

  // 原本XML読込
  const xml = readRevisionXml(revision.xmlStorageKey, law.lawId);

  // parse
  const parsedDocument = parseLawXml(xml, {
    lawId: law.lawId,
    egovLawId,
    revisionId: revision.id,
  });
  const parsedNodes = buildBackfillParsedNodes(parsedDocument.nodes);

  // DB側Article取得
  const dbArticles = await fetchArticlesForBackfill(prisma, revision.id);
  const dbNodes = buildBackfillDbNodes(dbArticles);

  // 計画作成（checksum不一致は throw する）
  const plan = planDurableKeyBackfill(dbNodes, parsedNodes);

  if (!plan.ready) {
    return {
      lawId: law.lawId,
      egovLawId,
      shortName,
      ready: false,
      errorCode: plan.errorCode,
      nodeCount: dbNodes.length,
      updateCount: 0,
      rangeResolutionCount: 0,
    };
  }

  // 検証済み Range の範囲解決を計算
  const verifiedRanges = await fetchVerifiedRanges(prisma, law.lawId);
  const rangeResolutions = resolveVerifiedRanges(
    verifiedRanges.map((r) => ({
      id: r.id,
      rangeType: r.rangeType as never,
      startStableNodeKey: r.startStableNodeKey,
      endStableNodeKey: r.endStableNodeKey,
      officialCitationStart: r.officialCitationStart,
      officialCitationEnd: r.officialCitationEnd,
    })),
    parsedDocument.nodes,
  );

  if (dryRun) {
    return {
      lawId: law.lawId,
      egovLawId,
      shortName,
      ready: true,
      errorCode: null,
      nodeCount: dbNodes.length,
      updateCount: plan.updates.length,
      rangeResolutionCount: rangeResolutions.filter((r) => r.status === "resolved").length,
    };
  }

  // 本実行: 法令ごとの transaction で Article と RangeResolution を更新
  await applyBackfillForLaw(prisma, law.lawId, revision.id, plan.updates, rangeResolutions);

  return {
    lawId: law.lawId,
    egovLawId,
    shortName,
    ready: true,
    errorCode: null,
    nodeCount: dbNodes.length,
    updateCount: plan.updates.length,
    rangeResolutionCount: rangeResolutions.filter((r) => r.status === "resolved").length,
  };
}

// ─── 本実行（DB書込） ───

/**
 * 法令ごとの transaction で Article.durableNodeKey/bodyChecksum と
 * LawBookEntryRangeResolution を更新する。
 *
 * 計画書 Step 3: 「法令ごとの transaction で更新。未検証の105抄録へ範囲を作らない。」
 */
async function applyBackfillForLaw(
  prisma: PrismaClient,
  lawId: string,
  revisionId: string,
  updates: readonly DurableKeyBackfillUpdate[],
  rangeResolutions: ReturnType<typeof resolveVerifiedRanges>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Article の durableNodeKey/bodyChecksum を更新
    // 更新順序は問わないが、安全のため1件ずつ update（120法令×数千ノードでも実用的な時間）
    for (const u of updates) {
      await tx.article.update({
        where: { id: u.articleId },
        data: {
          durableNodeKey: u.durableNodeKey,
          bodyChecksum: u.bodyChecksum,
        },
      });
    }

    // 検証済み Range の Resolution を upsert
    // @@unique([lawBookEntryRangeId, lawRevisionId]) があるため upsert で冪等
    for (const r of rangeResolutions) {
      await tx.lawBookEntryRangeResolution.upsert({
        where: {
          lawBookEntryRangeId_lawRevisionId: {
            lawBookEntryRangeId: r.rangeId,
            lawRevisionId: revisionId,
          },
        },
        create: {
          lawBookEntryRangeId: r.rangeId,
          lawRevisionId: revisionId,
          startDurableNodeKey: r.startDurableNodeKey,
          endDurableNodeKey: r.endDurableNodeKey,
          status: r.status,
          errorCode: r.errorCode,
          verifiedAt: new Date(),
        },
        update: {
          startDurableNodeKey: r.startDurableNodeKey,
          endDurableNodeKey: r.endDurableNodeKey,
          status: r.status,
          errorCode: r.errorCode,
          verifiedAt: new Date(),
        },
      });
    }
  });
}

// ─── Report 集計 ───

function buildReport(outcomes: readonly LawBackfillOutcome[]): DurableKeyBackfillReport {
  let lawsChecked = 0;
  let lawsReady = 0;
  let lawsBlocked = 0;
  let nodesReady = 0;
  const blocked: Array<{ lawId: string; errorCode: string }> = [];

  for (const o of outcomes) {
    lawsChecked += 1;
    if (o.ready) {
      lawsReady += 1;
      nodesReady += o.nodeCount;
    } else {
      lawsBlocked += 1;
      blocked.push({ lawId: o.lawId, errorCode: o.errorCode ?? "UNKNOWN" });
    }
  }

  return { lawsChecked, lawsReady, lawsBlocked, nodesReady, blocked };
}

function formatReport(report: DurableKeyBackfillReport, dryRun: boolean): string {
  const lines: string[] = [];
  lines.push(
    `=== durable key backfill ${dryRun ? "[DRY RUN]" : "[本実行]"} ===`,
  );
  lines.push(
    `lawsChecked=${report.lawsChecked} lawsReady=${report.lawsReady} lawsBlocked=${report.lawsBlocked} nodesReady=${report.nodesReady}`,
  );
  if (report.blocked.length > 0) {
    lines.push("blocked:");
    for (const b of report.blocked) {
      lines.push(`  ${b.lawId}: ${b.errorCode}`);
    }
  }
  return lines.join("\n");
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

  process.stderr.write(
    `durable key backfill を開始: mode=${cliArgs.dryRun ? "dry-run" : "apply"} laws=${cliArgs.lawIds.length > 0 ? cliArgs.lawIds.join(",") : "all"}\n`,
  );

  const prisma = new PrismaClient();
  const outcomes: LawBackfillOutcome[] = [];

  try {
    const laws = await fetchLaws(prisma, cliArgs.lawIds);
    process.stderr.write(`対象法令: ${laws.length}件\n`);

    for (const law of laws) {
      try {
        const outcome = await processOneLaw(prisma, law, cliArgs.dryRun);
        outcomes.push(outcome);
        const tag = outcome.ready ? "READY" : `BLOCKED(${outcome.errorCode})`;
        process.stderr.write(
          `  ${law.egovLawId} ${(law.shortName ?? law.name).padEnd(20)} nodes=${outcome.nodeCount} updates=${outcome.updateCount} ranges=${outcome.rangeResolutionCount} -> ${tag}\n`,
        );
      } catch (error) {
        // BACKFILL_CHECKSUM_MISMATCH（throw）もここで受け止めて blocked 扱いにする。
        // 1法令の失敗で他法令を止めない（計画書の global constraint）。
        const errorCode =
          error instanceof BackfillChecksumMismatchError
            ? error.code
            : "BACKFILL_UNEXPECTED_ERROR";
        const detail = error instanceof Error ? error.message : String(error);
        outcomes.push({
          lawId: law.lawId,
          egovLawId: law.egovLawId,
          shortName: law.shortName ?? law.name,
          ready: false,
          errorCode,
          nodeCount: 0,
          updateCount: 0,
          rangeResolutionCount: 0,
        });
        process.stderr.write(
          `  ${law.egovLawId} ${(law.shortName ?? law.name).padEnd(20)} -> BLOCKED(${errorCode}): ${detail}\n`,
        );
      }
    }

    const report = buildReport(outcomes);
    process.stdout.write(`${formatReport(report, cliArgs.dryRun)}\n`);

    // blocked が1件でもあれば非0終了（dry-run / 本実行ともに）
    if (report.lawsBlocked > 0) {
      process.stderr.write(
        `${report.lawsBlocked}法令がblockedです。詳細は上記ログを参照してください。\n`,
      );
      return 1;
    }
    process.stderr.write("全法令 ready（exit code 0）\n");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`致命的エラー: ${message}\n`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => {
  process.exit(code);
});
