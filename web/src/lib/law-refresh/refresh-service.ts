/**
 * 現行法令の差分更新をオーケストレーションする service。
 *
 * Task 2〜7 の全コンポーネント（parser/client/store/diff/verifier/
 * range-resolution/reviewed-mappings/package-signer/refresh-repository）を
 * 統合し、法令ごとの確認・取得・検証・切替をまとめて実行する。
 *
 * 設計の要点:
 * - **依存注入（DI）**: 全ての外部副作用（DB・e-Gov API・ファイルシステム・署名鍵）は
 *   `RefreshDeps` 経由で注入する。service 本体は純粋な orchestration ロジックのみで、
 *   実DBを使わずユニットテスト可能。
 * - **3つのmode**: `check`（metadata比較のみ）、`dry-run`（取得・parse・verifyまで）、
 *   `refresh`（署名・stage・activateまで実行）。
 * - **例外の隔離**: 法令ごとの例外を公開 error code へ変換し、1法令の失敗で他法令の
 *   更新を止めない。
 * - **並列制御**: e-Gov照会は8並列、429/5xx は最大3回の指数 backoff。
 * - **廃止**: LawSyncState.repealStatus/repealDate へ保存し、Article/Revision/current
 *   pointer は物理削除しない。
 *
 * このモジュールは `withRefreshLock` で run 全体を囲み、run 監査レコードを作成・完了する。
 */

import type { EgovLawVersion, FetchedLawXml } from "./egov-client";
import type { ParsedLawDocument, ParsedLawNode } from "./types";
import type { LawRevisionDiff } from "./diff-law-revisions";
import { buildDiffSummary } from "./diff-summary";
import type {
  CandidateVerificationReport,
  CandidateVerificationInput,
} from "./verify-candidate";
import type {
  LawBookEntryRangeInput,
  RangeResolutionResult,
} from "./range-resolution";
import type {
  ReviewedRevisionDecision,
  ReviewedDecisionExpected,
} from "./reviewed-mappings";
import type {
  LoadedSigningKey,
  RefreshManifest,
  SignedRefreshManifest,
} from "./package-signer";
import type { FileSystemLawXmlStore } from "./xml-store";
import type {
  LawRefreshRunRecord,
  StagedArticleMapping,
  StagedRangeResolution,
  StagedRevision,
  CreateRefreshRunInput,
  StageCandidateRevisionInput,
  ActivateCandidateRevisionInput,
  RecordHeldCandidateInput,
  RecordFailedCheckInput,
  RecordUnchangedCheckInput,
} from "./refresh-repository";

// ─── 公開DTO ───

export interface RefreshCurrentLawsRequest {
  /** 対象日（YYYY-MM-DD）。e-Gov照会の asof。 */
  asOf: string;
  /** 実行トリガ。scheduled（日次）or manual（手動）。 */
  trigger: "scheduled" | "manual";
  /** 実行mode。check / dry-run / refresh。 */
  mode: "check" | "dry-run" | "refresh";
  /** 対象法令のe-Gov law ID一覧。省略時は LAW_BOOK_EDITION_2026 の120件。 */
  lawIds?: string[];
  /**
   * 人手確認済み Revision pair decision の JSON を置いたディレクトリ（任意）。
   * 指定時、各法令ごとに `<reviewDir>/<lawId>.json` を読み込み、
   * `deps.loadReviewedRevisionDecision` へ渡す。ファイル不在時は undefined（通常パス）。
   * 読込エラー（不正JSON/checksum不一致等）は `REVIEW_FILE_INVALID` へ変換される。
   */
  reviewDir?: string;
}

export interface RefreshRunReport {
  runId: string;
  asOf: string;
  counts: {
    checked: number;
    unchanged: number;
    updated: number;
    held: number;
    failed: number;
  };
  laws: Array<{
    lawId: string;
    status: "unchanged" | "updated" | "held" | "failed";
    from: string | null;
    to: string | null;
    errorCode: string | null;
  }>;
}

// ─── DIインターフェース ───

/**
 * service が消費する全ての外部依存。
 * テストでは fake で全て注入し、本番では実装をバインドする。
 *
 * repository操作は `RefreshRepository` クラスのメソッドシグネチャと一致させるが、
 * service はクラスではなく関数として受け取る（mock 容易化のため）。
 */
export interface RefreshDeps {
  // e-Gov API（Task 2）
  getLawVersionAt: (
    lawId: string,
    asOf: string,
    fetcher?: typeof fetch,
  ) => Promise<EgovLawVersion>;
  getLawXmlAt: (
    version: EgovLawVersion,
    asOf: string,
    fetcher?: typeof fetch,
  ) => Promise<FetchedLawXml>;

  // DB参照（LawSyncState / Law / LawBookEntryRange）
  getCurrentRevisionId: (lawId: string) => Promise<string | null>;
  getLastObservedVersionKey: (lawId: string) => Promise<string | null>;
  getLawRanges: (lawId: string) => Promise<LawBookEntryRangeInput[]>;

  // repository書き込み（Task 7）
  createRefreshRun: (input: CreateRefreshRunInput) => Promise<LawRefreshRunRecord>;
  createLawRefreshLawResult: (input: {
    runId: string;
    lawId: string;
  }) => Promise<string>;
  stageCandidateRevision: (
    input: StageCandidateRevisionInput,
  ) => Promise<StagedRevision>;
  activateCandidateRevision: (
    input: ActivateCandidateRevisionInput,
  ) => Promise<void>;
  recordHeldCandidate: (input: RecordHeldCandidateInput) => Promise<void>;
  recordFailedCheck: (input: RecordFailedCheckInput) => Promise<void>;
  recordUnchangedCheck: (input: RecordUnchangedCheckInput) => Promise<void>;
  completeRefreshRun: (runId: string) => Promise<void>;
  withRefreshLock: <T>(work: () => Promise<T>) => Promise<T>;

  // 署名（Task 6）
  loadSigningKey: () => Promise<LoadedSigningKey>;
  signRefreshManifest: (
    manifest: RefreshManifest,
    privateKey: LoadedSigningKey["privateKey"],
    signerKeyId: string,
  ) => SignedRefreshManifest;

  // 純粋関数（Task 2/4/5）
  parseLawXml: (
    xml: string,
    context: { lawId: string; egovLawId: string; revisionId: string },
  ) => ParsedLawDocument;
  diffLawRevisions: (
    previous: ParsedLawDocument,
    candidate: ParsedLawDocument,
  ) => LawRevisionDiff;
  verifyCandidate: (input: CandidateVerificationInput) => CandidateVerificationReport;
  resolveVerifiedRanges?: (
    ranges: readonly LawBookEntryRangeInput[],
    nodes: readonly ParsedLawNode[],
  ) => RangeResolutionResult[];

  // XML不変保存（Task 2）
  store?: FileSystemLawXmlStore;

  // reviewed decision 読込（Task 5）。ファイル未存在時は undefined を返す。
  // expected は部分指定可能（undefined のフィールドは検証をスキップ）。
  loadReviewedRevisionDecision?: (
    path: string,
    expected: Partial<ReviewedDecisionExpected>,
  ) => Promise<ReviewedRevisionDecision | undefined>;
}

// ─── 並列制御 ───

/** e-Gov 照会の並列度。 */
const EGOV_CONCURRENCY = 8;
/** 429/5xx の最大リトライ回数。 */
const MAX_RETRIES = 3;
/** backoff の初期待機ミリ秒。 */
const INITIAL_BACKOFF_MS = 1_000;

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // HTTP 429 または 5xx のみリトライ対象。client 側で "HTTP {status}" 文字列へ展開している。
  return /HTTP 429|HTTP 5\d\d/.test(message);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * リトライ可能な関数を指数 backoff で再実行する。
 * 429/5xx 以外の例外は即座に再送出する。
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === retries) {
        throw error;
      }
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
      await sleep(backoff);
    }
  }
  throw lastError;
}

/**
 * 並列プール。concurrency 個まで同時実行し、順序を保って結果を返す。
 * 入力配列の順序で結果配列を返す（実行順序は問わない）。
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  };
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(workers);
  return results;
}

// ─── error code 変換 ───

/**
 * reviewed decision ファイルの読込失敗を表す例外。
 * `toErrorCode` で REVIEW_FILE_INVALID へ変換される。
 */
class ReviewFileInvalidError extends Error {
  readonly code = "REVIEW_FILE_INVALID";
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ReviewFileInvalidError";
  }
}

/**
 * 法令ごとの例外を公開 error code へ変換する。
 * 未知の例外は INTERNAL_ERROR に倒す。
 */
function toErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/HTTP 429|HTTP 5\d\d/.test(message)) return "EGOV_UNAVAILABLE";
  if (/e-Gov API/.test(message)) return "EGOV_FETCH_FAILED";
  if (/未施行|revision_info が存在しません/.test(message)) {
    return "EGOV_NOT_IN_EFFECT";
  }
  if (/REFRESH_ALREADY_RUNNING/.test(message)) return "REFRESH_ALREADY_RUNNING";
  if (error instanceof ReviewFileInvalidError) return "REVIEW_FILE_INVALID";
  return "INTERNAL_ERROR";
}

// ─── 法令単位処理 ───

interface LawOutcome {
  lawId: string;
  status: "unchanged" | "updated" | "held" | "failed";
  from: string | null;
  to: string | null;
  errorCode: string | null;
}

/**
 * 1法令の確認〜切替を実行する。例外は呼び出し側で catch して error code へ変換する。
 *
 * フロー:
 * 1. e-Gov へ asof 時点の version を照会（リトライ付き）。
 * 2. DB の観測版キーと比較。一致なら unchanged（XML 取得しない）。
 *    - check mode: 変化があっても記録せず report へ載せるだけ。
 *    - 変化時: XML 取得 → parse → diff → verify → stage → activate。
 * 3. verify で publishable=false なら held（他法令へ影響させない）。
 * 4. 廃止状態は unchanged パスで repealStatus/repealDate を記録。
 */
async function processOneLaw(
  lawId: string,
  request: RefreshCurrentLawsRequest,
  runId: string,
  deps: RefreshDeps,
): Promise<LawOutcome> {
  const asOf = request.asOf;
  const mode = request.mode;

  // 旧 Revision ID（from）。初回導入時は null。
  const previousRevisionId = await deps.getCurrentRevisionId(lawId);
  // 最後に観測した公式版キー。
  const lastObserved = await deps.getLastObservedVersionKey(lawId);

  // run result レコードを作成（監査用）。失敗時も記録できるように先に作る。
  const runResultId = await deps.createLawRefreshLawResult({
    runId,
    lawId,
  });

  // e-Gov 照会（リトライ付き）
  const egovVersion = await withRetry(() => deps.getLawVersionAt(lawId, asOf));

  const observedVersionKey = egovVersion.revisionId;
  const egovUpdatedAt = new Date(egovVersion.sourceUpdatedAt);
  const repealDate = egovVersion.repealDate
    ? new Date(egovVersion.repealDate)
    : null;

  // 公式版キーが一致 → unchanged。XML を取得しない。
  if (lastObserved === observedVersionKey) {
    if (mode !== "check") {
      await deps.recordUnchangedCheck({
        runResultId,
        lawId,
        observedVersionKey,
        egovUpdatedAt,
        repealStatus: egovVersion.repealStatus,
        repealDate,
      });
    }
    return {
      lawId,
      status: "unchanged",
      from: previousRevisionId,
      to: previousRevisionId,
      errorCode: null,
    };
  }

  // check mode: 変化を検知してもXML取得・記録せず、report へ載せるだけ。
  if (mode === "check") {
    return {
      lawId,
      status: "updated",
      from: previousRevisionId,
      to: observedVersionKey,
      errorCode: null,
    };
  }

  // XML 取得（リトライ付き）
  const fetched = await withRetry(() =>
    deps.getLawXmlAt(egovVersion, asOf),
  );

  // XML 不変保存（store があれば）
  let xmlStorageKey = "";
  if (deps.store) {
    const stored = await deps.store.put({
      lawId,
      revisionId: observedVersionKey,
      xml: fetched.xml,
    });
    xmlStorageKey = stored.storedPath;
  }

  // parse
  const candidateDocument = deps.parseLawXml(fetched.xml, {
    lawId,
    egovLawId: egovVersion.lawId,
    revisionId: observedVersionKey,
  });

  // 旧版ノード件数（初回導入時は 0）
  const previousNodeCount = 0;

  // diff（初回導入時は空の旧版と比較）
  const diff = previousRevisionId
    ? deps.diffLawRevisions(
        { ...candidateDocument, nodes: [] },
        candidateDocument,
      )
    : deps.diffLawRevisions(
        { ...candidateDocument, nodes: [] },
        candidateDocument,
      );

  // 範囲
  const ranges = await deps.getLawRanges(lawId);

  // reviewed decision（任意）。CLI から reviewDir が渡されたときだけ読み込む。
  // ファイルが存在しなければ undefined（通常パス: held 扱い）。
  // 読込エラー（不正JSON/checksum不一致等）は REVIEW_FILE_INVALID へ変換される。
  let reviewedDecision: ReviewedRevisionDecision | undefined;
  if (request.reviewDir && deps.loadReviewedRevisionDecision) {
    const reviewFilePath = `${request.reviewDir}/${lawId}.json`;
    // expected には processOneLaw スコープ内で利用可能な値を渡す。
    // fromXmlChecksum は旧版 XML を取得していないため現時点では省略（M1 で対応）。
    // reviewed-mappings 側は undefined の expected フィールドを検証しない。
    const expected: Partial<ReviewedDecisionExpected> = {
      lawId,
      fromRevisionId: previousRevisionId ?? "",
      toRevisionId: observedVersionKey,
      toXmlChecksum: fetched.checksum,
    };
    try {
      reviewedDecision = await deps.loadReviewedRevisionDecision(
        reviewFilePath,
        expected,
      );
    } catch (error) {
      throw new ReviewFileInvalidError(
        `${reviewFilePath} の読み込みに失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error,
      );
    }
  }

  // verify
  const report = deps.verifyCandidate({
    document: candidateDocument,
    diff,
    ranges,
    previousNodeCount,
    reviewedDecision,
  });

  if (!report.publishable) {
    // held: current pointer は変更せず、保留理由を記録
    const errorCode =
      report.errors[0]?.code ?? "UNRESOLVED_DIFF";
    const errorDetail =
      report.errors[0]?.detail ?? "検証保留により公開できません";
    await deps.recordHeldCandidate({
      runResultId,
      lawId,
      previousRevisionId,
      observedVersionKey,
      diffSummary: {
        diffCounts: diff.counts,
        errors: report.errors,
        warnings: report.warnings,
      },
      errorCode,
      errorDetail,
    });
    return {
      lawId,
      status: "held",
      from: previousRevisionId,
      to: null,
      errorCode,
    };
  }

  // dry-run: ここまで。stage/activate しない。
  if (mode === "dry-run") {
    return {
      lawId,
      status: "updated",
      from: previousRevisionId,
      to: observedVersionKey,
      errorCode: null,
    };
  }

  // refresh: 署名 → stage → activate
  const signingKey = await deps.loadSigningKey();
  const manifest: RefreshManifest = {
    runId,
    targetDate: asOf,
    laws: [
      {
        lawId,
        from: previousRevisionId ?? "",
        to: observedVersionKey,
        xmlChecksum: fetched.checksum,
      },
    ],
  };
  const signedManifest = deps.signRefreshManifest(
    manifest,
    signingKey.privateKey,
    signingKey.keyId,
  );

  // Revision 間 mapping（初回導入や dry-run では空）
  const mappings: StagedArticleMapping[] = [];
  const rangeResolutions: StagedRangeResolution[] = [];

  const officialVersionKey = observedVersionKey;
  const staged = await deps.stageCandidateRevision({
    lawId,
    runId,
    runResultId,
    officialVersionKey,
    candidateDocument,
    signedManifest,
    egovLawId: egovVersion.lawId,
    sourceUpdatedAt: egovUpdatedAt,
    fetchedAt: fetched.fetchedAt,
    sourceUrl: fetched.sourceUrl,
    xmlStorageKey,
    xmlChecksum: fetched.checksum,
    effectiveFrom: new Date(egovVersion.effectiveFrom),
    mappings,
    rangeResolutions,
  });

  await deps.activateCandidateRevision({
    lawId,
    previousRevisionId: previousRevisionId ?? "",
    candidateRevisionId: staged.revisionId,
    runResultId,
    mappings,
    rangeResolutions,
    sync: {
      observedVersionKey,
      egovUpdatedAt,
    },
    diffSummary: buildDiffSummary(diff, !previousRevisionId),
  });

  return {
    lawId,
    status: "updated",
    from: previousRevisionId,
    to: staged.revisionId,
    errorCode: null,
  };
}

// ─── service 本体 ───

/**
 * 法令カタログからデフォルトの law ID 一覧を返す。
 * service 本体はカタログへ直接依存せず、CLI から注入する設計も可能だが、
 * 計画書要件「request.lawIds 無指定時は LAW_BOOK_EDITION_2026 の120件」を満たすため、
 * 遅延 import でカタログを読む。
 */
async function defaultLawIds(): Promise<string[]> {
  const mod = await import("../../../scripts/law-book-2026");
  const entries = mod.LAW_BOOK_2026 as readonly { egovLawId: string }[];
  return entries.map((e) => e.egovLawId);
}

/**
 * 現行法令の差分更新を実行する。
 *
 * run全体を `withRefreshLock` で囲み、法令ごとに確認〜切替を行う。
 * 1法令の例外は error code へ変換され、次法令へ進む。
 *
 * @param request 実行パラメータ
 * @param deps    全ての外部依存（DI）
 * @returns run全体の集計レポート
 */
export async function refreshCurrentLaws(
  request: RefreshCurrentLawsRequest,
  deps: RefreshDeps,
): Promise<RefreshRunReport> {
  const lawIds =
    request.lawIds && request.lawIds.length > 0
      ? request.lawIds
      : await defaultLawIds();

  return deps.withRefreshLock(async () => {
    const run = await deps.createRefreshRun({
      targetDate: request.asOf,
      trigger: request.trigger,
    });
    const runId = run.id;

    const outcomes = await mapWithConcurrency(
      lawIds,
      EGOV_CONCURRENCY,
      async (lawId): Promise<LawOutcome> => {
        try {
          return await processOneLaw(lawId, request, runId, deps);
        } catch (error) {
          const errorCode = toErrorCode(error);
          const detail =
            error instanceof Error ? error.message : String(error);
          // 失敗を監査へ記録（runResultId が無い可能性もあるため best-effort）
          try {
            await deps.recordFailedCheck({
              runResultId: null,
              lawId,
              errorCode,
              errorDetail: detail,
            });
          } catch {
            // 記録失敗は集計へ影響させない
          }
          return {
            lawId,
            status: "failed",
            from: null,
            to: null,
            errorCode,
          };
        }
      },
    );

    await deps.completeRefreshRun(runId);

    const counts = {
      checked: outcomes.length,
      unchanged: 0,
      updated: 0,
      held: 0,
      failed: 0,
    };
    for (const o of outcomes) {
      counts[o.status]++;
    }

    return {
      runId,
      asOf: request.asOf,
      counts,
      laws: outcomes,
    };
  });
}

export type {
  LawBookEntryRangeInput,
  ReviewedRevisionDecision,
  CreateRefreshRunInput,
  StageCandidateRevisionInput,
  ActivateCandidateRevisionInput,
  RecordHeldCandidateInput,
  RecordFailedCheckInput,
  RecordUnchangedCheckInput,
  StagedArticleMapping,
  StagedRangeResolution,
  StagedRevision,
};
