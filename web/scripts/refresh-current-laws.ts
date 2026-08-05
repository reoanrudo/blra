#!/usr/bin/env npx tsx
/**
 * 現行法令の差分更新 CLI。
 *
 * Task 8 の service を実DB・実e-Gov APIへバインドして実行する。
 *
 * 使い方:
 *   npm run lawbook:current:check -- --asof 2026-08-04
 *   npm run lawbook:current:refresh -- --asof 2026-08-04 --dry-run
 *   npm run lawbook:current:refresh -- --asof 2026-08-04 --law 325AC0000000201
 *   npm run lawbook:current:refresh -- --asof 2026-08-04 --review-dir config/law-refresh-mappings --json
 *
 * 終了コード:
 *   0  全成功または全無変更
 *   2  部分保留（held または failed が1件以上あるが全滅ではない）
 *   1  致命的エラー（未知law ID / 未来日 / lock取得失敗 / 全法令check失敗 / 引数エラー）
 */

import { PrismaClient } from "@prisma/client";
import {
  refreshCurrentLaws,
  type RefreshDeps,
  type RefreshRunReport,
} from "../src/lib/law-refresh/refresh-service";
import { RefreshRepository } from "../src/lib/law-refresh/refresh-repository";
import { getLawVersionAt, getLawXmlAt } from "../src/lib/law-refresh/egov-client";
import { parseLawXml } from "../src/lib/law-refresh/parse-law-xml";
import { diffLawRevisions } from "../src/lib/law-refresh/diff-law-revisions";
import { verifyCandidate } from "../src/lib/law-refresh/verify-candidate";
import { resolveVerifiedRanges } from "../src/lib/law-refresh/range-resolution";
import {
  loadReviewedRevisionDecision,
  parseReviewedRevisionDecision,
} from "../src/lib/law-refresh/reviewed-mappings";
import {
  loadSigningKey,
  signRefreshManifest,
} from "../src/lib/law-refresh/package-signer";
import { FileSystemLawXmlStore } from "../src/lib/law-refresh/xml-store";
import { LAW_BOOK_2026 } from "./law-book-2026";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

// ─── 引数解析 ───

interface CliArgs {
  asOf: string | undefined;
  mode: "check" | "dry-run" | "refresh";
  lawIds: string[];
  reviewDir: string | undefined;
  json: boolean;
  help: boolean;
}

const HELP = `現行法令の差分更新 CLI

使い方:
  npm run lawbook:current:check -- [options]
  npm run lawbook:current:refresh -- [options]

オプション:
  --asof <YYYY-MM-DD>   対象日。省略時は Asia/Tokyo の当日
  --law <egovLawId>     対象法令を限定（複数回指定可）。省略時は120件すべて
  --dry-run             取得・parse・verifyまで。DBへ書き込まない（refreshのみ）
  --review-dir <path>   人手確認済み Revision pair の JSON ディレクトリ
  --json                stdout を RefreshRunReport のJSONに限定（進捗はstderr）
  --help, -h            このヘルプを表示
`;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    asOf: undefined,
    mode: "refresh",
    lawIds: [],
    reviewDir: undefined,
    json: false,
    help: false,
  };

  let i = 0;
  // check コマンドか refresh コマンドかは script 名で決まる前提だが、
  // 引数からも mode を判定できるようにする
  const scriptName = argv[0] ?? "";
  if (scriptName.includes("check") && !scriptName.includes("refresh")) {
    args.mode = "check";
  }

  while (i < argv.length) {
    const arg = argv[i]!;
    i++;
    switch (arg) {
      case "--asof":
        args.asOf = argv[i++];
        break;
      case "--law":
        args.lawIds.push(argv[i++]!);
        break;
      case "--dry-run":
        args.mode = "dry-run";
        break;
      case "--review-dir":
        args.reviewDir = argv[i++];
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        // check サブコマンドの場合は mode=check を強制
        if (arg === "check") {
          args.mode = "check";
        } else if (arg === "refresh") {
          args.mode = "refresh";
        } else {
          throw new Error(`未知の引数です: ${arg}\n\n${HELP}`);
        }
    }
  }

  return args;
}

// ─── Asia/Tokyo 当日 ───

function todayInTokyo(): string {
  const now = new Date();
  // Asia/Tokyo (UTC+9) の当日を YYYY-MM-DD で返す
  const tokyo = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = tokyo.getUTCFullYear();
  const mm = String(tokyo.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tokyo.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── 軽量ロガー（--json 時はstderrへ） ───

function log(args: CliArgs, message: string): void {
  if (!args.json) {
    process.stderr.write(`${message}\n`);
  }
}

// ─── DB依存の実装 ───

async function createDeps(
  prisma: PrismaClient,
  cliArgs: CliArgs,
): Promise<RefreshDeps> {
  const repository = new RefreshRepository({ prisma });

  // カタログに存在する law ID の集合（未知 ID 検証用）
  const knownLawIds = new Set<string>(
    LAW_BOOK_2026.map((e) => e.egovLawId as string),
  );

  // lawId -> egovLawId のマッピング（Law テーブルの id は egovLawId と一致する前提）
  // DBの Law.id は egovLawId と同じ文字列を使う設計。

  // reviewed decision をディレクトリから読み込むラッパー。
  // <reviewDir>/<lawId>.json を探し、存在しなければ undefined を返す。
  const deps: RefreshDeps = {
    // e-Gov API
    getLawVersionAt,
    getLawXmlAt,

    // DB参照
    getCurrentRevisionId: async (lawId: string) => {
      const law = await prisma.law.findUnique({
        where: { id: lawId },
        select: { currentRevisionId: true },
      });
      return law?.currentRevisionId ?? null;
    },
    getLastObservedVersionKey: async (lawId: string) => {
      const sync = await prisma.lawSyncState.findUnique({
        where: { lawId },
        select: { lastObservedVersionKey: true },
      });
      return sync?.lastObservedVersionKey ?? null;
    },
    getLawRanges: async (lawId: string) => {
      const ranges = await prisma.lawBookEntryRange.findMany({
        where: { lawBookEntry: { lawId } },
        select: {
          id: true,
          rangeType: true,
          startStableNodeKey: true,
          endStableNodeKey: true,
          officialCitationStart: true,
          officialCitationEnd: true,
        },
      });
      return ranges;
    },

    // repository書き込み
    createRefreshRun: (input) => repository.createRefreshRun(input),
    createLawRefreshLawResult: async (input) => {
      const result = await prisma.lawRefreshLawResult.create({
        data: {
          runId: input.runId,
          lawId: input.lawId,
          status: "unchanged",
          phase: "checking",
        },
      });
      return result.id;
    },
    stageCandidateRevision: (input) => repository.stageCandidateRevision(input),
    activateCandidateRevision: (input) =>
      repository.activateCandidateRevision(input),
    recordHeldCandidate: (input) => repository.recordHeldCandidate(input),
    recordFailedCheck: (input) => repository.recordFailedCheck(input),
    recordUnchangedCheck: (input) => repository.recordUnchangedCheck(input),
    completeRefreshRun: (runId) => repository.completeRefreshRun(runId),
    withRefreshLock: <T>(work: () => Promise<T>) =>
      repository.withRefreshLock(work),

    // 署名
    loadSigningKey,
    signRefreshManifest,

    // 純粋関数
    parseLawXml,
    diffLawRevisions,
    verifyCandidate,
    resolveVerifiedRanges,

    // store（環境変数 LAW_XML_STORAGE_DIR 必須）
    store: new FileSystemLawXmlStore(),

    // reviewed decision 読込
    loadReviewedRevisionDecision: async (path, expected) => {
      try {
        await stat(path);
      } catch {
        return undefined;
      }
      return loadReviewedRevisionDecision(path, expected);
    },
  };

  // 未知 law ID 検証（check/refresh 共通）
  if (cliArgs.lawIds.length > 0) {
    const unknown = cliArgs.lawIds.filter((id) => !knownLawIds.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `未知の law ID です: ${unknown.join(", ")}（カタログに存在しません）`,
      );
    }
  }

  return deps;
}

// ─── 終了コード計算 ───

function computeExitCode(report: RefreshRunReport): number {
  const { counts } = report;
  // 全滅（全件 failed）は致命的
  if (counts.checked > 0 && counts.failed === counts.checked) {
    return 1;
  }
  // held or failed が1件でもあれば部分保留
  if (counts.held > 0 || counts.failed > 0) {
    return 2;
  }
  // 全成功 or 全無変更
  return 0;
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

  // asOf 解決（省略時は Asia/Tokyo 当日）
  const asOf = cliArgs.asOf ?? todayInTokyo();

  // 未来日検証
  const today = todayInTokyo();
  if (asOf > today) {
    process.stderr.write(
      `エラー: --asof ${asOf} は未来日です（今日=${today}）\n`,
    );
    return 1;
  }

  log(cliArgs, `現行法令更新を開始: asOf=${asOf} mode=${cliArgs.mode}`);

  // check コマンドで --dry-run が指定されたら無視（check が優先）
  const mode = cliArgs.mode === "check" ? "check" : cliArgs.mode;

  const prisma = new PrismaClient();
  let exitCode = 0;
  try {
    const deps = await createDeps(prisma, cliArgs);

    const report = await refreshCurrentLaws(
      {
        asOf,
        trigger: "manual",
        mode,
        lawIds: cliArgs.lawIds.length > 0 ? cliArgs.lawIds : undefined,
        reviewDir: cliArgs.reviewDir,
      },
      deps,
    );

    if (cliArgs.json) {
      // stdout は report の JSON 1個だけ
      process.stdout.write(`${JSON.stringify(report)}\n`);
    } else {
      // 人間可読なサマリ
      log(cliArgs, formatReport(report));
    }

    exitCode = computeExitCode(report);
    if (exitCode === 2) {
      log(cliArgs, "部分保留があります（exit code 2）");
    } else if (exitCode === 1) {
      log(cliArgs, "全法令の確認に失敗しました（exit code 1）");
    } else {
      log(cliArgs, "完了（exit code 0）");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // lock 取得失敗は致命的
    if (message.includes("REFRESH_ALREADY_RUNNING")) {
      process.stderr.write(
        `エラー: 別のリフレッシュ処理が実行中です（lock取得失敗）\n`,
      );
    } else {
      process.stderr.write(`致命的エラー: ${message}\n`);
    }
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  return exitCode;
}

function formatReport(report: RefreshRunReport): string {
  const lines: string[] = [];
  lines.push(
    `runId=${report.runId} asOf=${report.asOf} ` +
      `checked=${report.counts.checked} unchanged=${report.counts.unchanged} ` +
      `updated=${report.counts.updated} held=${report.counts.held} failed=${report.counts.failed}`,
  );
  for (const law of report.laws) {
    const parts = [
      `  ${law.lawId}: ${law.status}`,
      law.from ? `from=${law.from}` : "from=(none)",
      law.to ? `to=${law.to}` : "to=(none)",
    ];
    if (law.errorCode) parts.push(`errorCode=${law.errorCode}`);
    lines.push(parts.join(" "));
  }
  return lines.join("\n");
}

main().then((code) => {
  process.exit(code);
});
