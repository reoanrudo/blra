/**
 * 現行法令リフレッシュの repository。
 *
 * 更新 run 監査の作成、候補 Revision のステージング、法令単位での原子的な切替、
 * 同期状態の記録、および advisory lock による同時実行排除を担う。
 *
 * 重要な不変条件:
 * - 全ての書き込み操作はトランザクション内で行う。
 * - current pointer の切替は compare-and-swap (updateMany where currentRevisionId) で
 *   原子性を保証する。別プロセスが先に切替を行っていた場合は CURRENT_REVISION_CHANGED。
 * - staged Revision は公開されない。activate だけが current pointer を変更する。
 * - 候補がすべて拒否された場合のみ package を rejected にする。
 *
 * DB操作の安全性は PostgreSQL の transaction と advisory lock に基づく。
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import type { ArticleLevel, LawPackageStatus, LawRevisionStatus } from "@prisma/client";
import type { ParsedLawDocument } from "./types";
import type { RangeResolutionResult } from "./range-resolution";
import type { SignedRefreshManifest } from "./package-signer";
import { materializeArticleRows } from "./parse-law-xml";

// ─── 公開DTO ───

export interface LawRefreshRunRecord {
  id: string;
  targetDate: string;
  trigger: "scheduled" | "manual";
  status: "running" | "succeeded" | "partial" | "failed";
}

export interface StagedArticleMapping {
  /** mapping 元（旧版）の Revision ID。 */
  fromRevisionId: string;
  /** mapping 元の Article ID。 */
  fromArticleId: string;
  /** mapping 先（候補版）の Article ID。removed の場合は null。 */
  toArticleId: string | null;
  kind: "unchanged" | "modified" | "renumbered" | "removed";
  status: "automatic" | "verified" | "ambiguous";
  method: string;
  rationale: string | null;
}

export interface StagedRangeResolution {
  lawBookEntryRangeId: string;
  startDurableNodeKey: string | null;
  endDurableNodeKey: string | null;
  status: "resolved" | "blocked";
  errorCode: string | null;
}

/** stageCandidateRevision の戻り値。 */
export interface StagedRevision {
  revisionId: string;
  /** 既存 Revision を再利用した場合は true。 */
  reused: boolean;
  /** 作成・再利用された Revision に紐づく Article 数。 */
  articleCount: number;
  /** Revision 間 mapping（DB へ書き込んだもの）。 */
  mappings: StagedArticleMapping[];
  /** 範囲解決（DB へ書き込んだもの）。 */
  rangeResolutions: StagedRangeResolution[];
}

// ─── 入力型 ───

export interface CreateRefreshRunInput {
  targetDate: string;
  trigger: "scheduled" | "manual";
}

export interface StageCandidateRevisionInput {
  lawId: string;
  runId: string;
  runResultId: string;
  /** e-Gov 公式版キー。(lawId, officialVersionKey) で一意。 */
  officialVersionKey: string;
  /** 候補 Revision の parse 済みドキュメント。 */
  candidateDocument: ParsedLawDocument;
  /** 署名済み manifest。 */
  signedManifest: SignedRefreshManifest;
  /** e-Gov 法令 ID（Article ID 生成に使用）。 */
  egovLawId: string;
  /** 候補 Revision の出典メタデータ。 */
  sourceUpdatedAt: Date;
  fetchedAt: Date;
  sourceUrl: string;
  xmlStorageKey: string;
  xmlChecksum: string;
  effectiveFrom: Date;
  /** Revision 間 Article 対応（空配列可）。 */
  mappings: StagedArticleMapping[];
  /** 書籍範囲解決結果（空配列可）。 */
  rangeResolutions: StagedRangeResolution[];
}

export interface ActivateCandidateRevisionInput {
  lawId: string;
  /** 切替前の current Revision ID。compare-and-swap の期待値。 */
  previousRevisionId: string;
  candidateRevisionId: string;
  runResultId: string;
  mappings: StagedArticleMapping[];
  rangeResolutions: StagedRangeResolution[];
  sync: {
    observedVersionKey: string;
    egovUpdatedAt: Date;
  };
  /**
   * 変更通知バナー用の差分サマリー（設計書 §13.2）。
   * activate 成功時に LawRefreshLawResult.diffSummary へ保存される。
   * null の場合は diffSummary を更新しない（従来互換）。
   */
  diffSummary: unknown | null;
}

export interface RecordHeldCandidateInput {
  runResultId: string;
  lawId: string;
  previousRevisionId: string | null;
  observedVersionKey: string | null;
  diffSummary: unknown;
  errorCode: string;
  errorDetail: string;
}

export interface RecordFailedCheckInput {
  runResultId: string | null;
  lawId: string;
  errorCode: string;
  errorDetail: string;
}

export interface RecordUnchangedCheckInput {
  runResultId: string | null;
  lawId: string;
  observedVersionKey: string;
  egovUpdatedAt: Date;
  repealStatus?: string | null;
  repealDate?: Date | null;
}

// ─── エラー ───

/** current pointer が期待値と異なり、compare-and-swap が失敗した。 */
export class CurrentRevisionChangedError extends Error {
  readonly code = "CURRENT_REVISION_CHANGED" as const;
  constructor(message = "currentRevisionId が期待値と異なります。別プロセスが先に切替を行った可能性があります。") {
    super(message);
    this.name = "CurrentRevisionChangedError";
  }
}

/** 同じ (lawId, officialVersionKey) で異なる checksum が検出された。 */
export class OfficialVersionChecksumConflictError extends Error {
  readonly code = "OFFICIAL_VERSION_CHECKSUM_CONFLICT" as const;
  constructor(message = "同じ officialVersionKey で異なる XML checksum が検出されました。") {
    super(message);
    this.name = "OfficialVersionChecksumConflictError";
  }
}

/** advisory lock の2本目の同時取得を拒否した。 */
export class RefreshAlreadyRunningError extends Error {
  readonly code = "REFRESH_ALREADY_RUNNING" as const;
  constructor(message = "別のリフレッシュ処理が実行中です。advisory lock を取得できませんでした。") {
    super(message);
    this.name = "RefreshAlreadyRunningError";
  }
}

// ─── advisory lock ───

/**
 * リフレッシュ全体を排他実行するための固定 advisory lock key。
 *
 * PostgreSQL の pg_advisory_lock は bigint 1個または int 2個のキーを使う。
 * ここでは意図的に固定値を使い、全プロセスで同じ lock を共有する。
 */
const REFRESH_ADVISORY_LOCK_KEY = 0x42_4c_52_41; // "BLRA" の4バイトを表す固定値

// ─── repository 本体 ───

export interface RefreshRepositoryDeps {
  prisma: PrismaClient;
}

export class RefreshRepository {
  constructor(private readonly deps: RefreshRepositoryDeps) {}

  private get prisma(): PrismaClient {
    return this.deps.prisma;
  }

  /**
   * 新しいリフレッシュ run を作成する。
   *
   * run は status=running で開始し、完了時に completeRefreshRun で確定する。
   * package は stageCandidateRevision の初回呼び出し時に作成されるため、
   * ここでは package を紐付けない。
   */
  async createRefreshRun(input: CreateRefreshRunInput): Promise<LawRefreshRunRecord> {
    const targetDate = parseDateOnly(input.targetDate);
    const run = await this.prisma.lawRefreshRun.create({
      data: {
        targetDate,
        trigger: input.trigger,
        status: "running",
      },
    });
    return {
      id: run.id,
      targetDate: input.targetDate,
      trigger: input.trigger,
      status: "running",
    };
  }

  /**
   * 候補 Revision をステージングする。
   *
   * 1. 同じ (lawId, officialVersionKey) があれば checksum 一致を確認して再利用。
   *    不一致なら OFFICIAL_VERSION_CHECKSUM_CONFLICT。
   * 2. 新規時: ID `rev_<officialVersionKey>` の LawRevision(status=staged)、
   *    Revision 固有 Article、Revision 間 mapping、範囲解決を transaction で作る。
   * 3. run package と candidate Revision の packageId を一致させる。
   *
   * Article ID: art_<egovLawId小文字>_<revision checksum先頭12>_<sourceIndexを6桁>
   */
  async stageCandidateRevision(input: StageCandidateRevisionInput): Promise<StagedRevision> {
    const { prisma } = this;

    return prisma.$transaction(async (tx) => {
      // package を取得または作成
      const run = await tx.lawRefreshRun.findUniqueOrThrow({
        where: { id: input.runId },
      });

      let packageId = run.packageId;
      if (packageId) {
        // 既存 package を検証（存在確認のみ）
        await tx.lawPackage.findUniqueOrThrow({ where: { id: packageId } });
      } else {
        packageId = `pkg_current_${input.runId}`;
        await tx.lawPackage.create({
          data: {
            id: packageId,
            packageVersion: packageId,
            manifestChecksum: input.signedManifest.manifestChecksum,
            signature: input.signedManifest.signature,
            signerKeyId: input.signedManifest.signerKeyId,
            sourceSummary: input.signedManifest.manifest as unknown as Prisma.InputJsonValue,
            effectiveAt: input.effectiveFrom,
            status: "verified",
          },
        });
        await tx.lawRefreshRun.update({
          where: { id: input.runId },
          data: { packageId },
        });
      }

      // 既存 Revision の再利用チェック
      const existing = await tx.lawRevision.findUnique({
        where: {
          lawId_officialVersionKey: {
            lawId: input.lawId,
            officialVersionKey: input.officialVersionKey,
          },
        },
      });

      if (existing) {
        if (existing.xmlChecksum !== input.xmlChecksum) {
          throw new OfficialVersionChecksumConflictError();
        }
        // 再利用: packageId を一致させる（既に一致していれば更新しない）
        if (existing.packageId !== packageId) {
          await tx.lawRevision.update({
            where: { id: existing.id },
            data: { packageId },
          });
        }
        const articleCount = await tx.article.count({
          where: { lawRevisionId: existing.id },
        });
        return {
          revisionId: existing.id,
          reused: true,
          articleCount,
          mappings: input.mappings,
          rangeResolutions: input.rangeResolutions,
        };
      }

      // 新規 Revision ID
      const revisionId = `rev_${input.officialVersionKey}`;
      const checksumPrefix = input.xmlChecksum.slice(0, 12);
      const egovLower = input.egovLawId.toLowerCase();

      // candidate document の revisionId を実際の ID へ更新して Article 行を生成
      const docWithRevisionId: ParsedLawDocument = {
        ...input.candidateDocument,
        revisionId,
      };
      const idPrefix = `art_${egovLower}_${checksumPrefix}_`;
      const articleRows = materializeArticleRows(docWithRevisionId, idPrefix);

      // LawRevision を staged で作成
      await tx.lawRevision.create({
        data: {
          id: revisionId,
          lawId: input.lawId,
          packageId,
          officialVersionKey: input.officialVersionKey,
          effectiveFrom: input.effectiveFrom,
          fetchedAt: input.fetchedAt,
          sourceUrl: input.sourceUrl,
          xmlStorageKey: input.xmlStorageKey,
          xmlChecksum: input.xmlChecksum,
          status: "staged",
          sourceUpdatedAt: input.sourceUpdatedAt,
        },
      });

      // Article を作成（createMany で一括。複合 FK 制約のため lawRevisionId/lawId を維持）
      await tx.article.createMany({
        data: articleRows.map((row) => ({
          id: row.id,
          lawId: row.lawId,
          parentId: row.parentId,
          level: row.level as ArticleLevel,
          articleNumber: row.articleNumber,
          articleNumberNormalized: row.articleNumberNormalized,
          paragraphNumber: row.paragraphNumber,
          itemNumber: row.itemNumber,
          subitemNumber: row.subitemNumber,
          columnNumber: row.columnNumber,
          tableCoords: row.tableCoords,
          title: row.title,
          caption: row.caption,
          text: row.text,
          articleCaptionNormalized: row.articleCaptionNormalized,
          sortOrder: row.sortOrder,
          regulationType: row.regulationType as never,
          systemTags: row.systemTags as never,
          lawRevisionId: revisionId,
          stableNodeKey: row.stableNodeKey,
          durableNodeKey: row.durableNodeKey,
          contentChecksum: row.contentChecksum,
          bodyChecksum: row.bodyChecksum,
          tableMetadata: row.tableMetadata as never,
        })),
      });

      // Revision 間 mapping を書き込み（空配列の場合は何もしない）
      await writeMappings(tx, input.lawId, revisionId, input.mappings);

      // 範囲解決を書き込み（空配列の場合は何もしない）
      await writeRangeResolutions(tx, revisionId, input.rangeResolutions);

      return {
        revisionId,
        reused: false,
        articleCount: articleRows.length,
        mappings: input.mappings,
        rangeResolutions: input.rangeResolutions,
      };
    });
  }

  /**
   * 検証済み候補 Revision を法令単位の1トランザクションで current へ切り替える。
   *
   * compare-and-swap で current pointer の原子性を保証する。
   * 同じ transaction 内で:
   * - candidate を active
   * - previous を superseded
   * - run result を updated/completed
   * - LawSyncState を成功値へ upsert
   *
   * 失敗記録は内部詳細をDBへ保存するが、公開DTOへは error code だけを出す。
   */
  async activateCandidateRevision(input: ActivateCandidateRevisionInput): Promise<void> {
    const { prisma } = this;

    await prisma.$transaction(async (tx) => {
      // Step 1: compare-and-swap で current pointer を更新
      const changed = await tx.law.updateMany({
        where: {
          id: input.lawId,
          currentRevisionId: input.previousRevisionId,
        },
        data: { currentRevisionId: input.candidateRevisionId },
      });
      if (changed.count !== 1) {
        throw new CurrentRevisionChangedError();
      }

      // Step 2: candidate を active へ
      await tx.lawRevision.update({
        where: { id: input.candidateRevisionId },
        data: { status: "active" as LawRevisionStatus },
      });

      // Step 3: previous を superseded へ（previousRevisionId が null でなければ）
      if (input.previousRevisionId) {
        await tx.lawRevision.update({
          where: { id: input.previousRevisionId },
          data: { status: "superseded" as LawRevisionStatus },
        });
      }

      // Step 4: run result を updated/completed へ
      await tx.lawRefreshLawResult.update({
        where: { id: input.runResultId },
        data: {
          candidateRevisionId: input.candidateRevisionId,
          status: "updated",
          phase: "completed",
          completedAt: new Date(),
          ...(input.diffSummary != null
            ? {
                diffSummary: input.diffSummary as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      // Step 5: LawSyncState を成功値へ upsert
      await tx.lawSyncState.upsert({
        where: { lawId: input.lawId },
        create: {
          lawId: input.lawId,
          lastAttemptAt: new Date(),
          lastSuccessfulCheckAt: new Date(),
          lastUpdatedAt: new Date(),
          lastObservedVersionKey: input.sync.observedVersionKey,
          lastEgovUpdatedAt: input.sync.egovUpdatedAt,
          lastErrorCode: null,
          lastErrorDetail: null,
        },
        update: {
          lastAttemptAt: new Date(),
          lastSuccessfulCheckAt: new Date(),
          lastUpdatedAt: new Date(),
          lastObservedVersionKey: input.sync.observedVersionKey,
          lastEgovUpdatedAt: input.sync.egovUpdatedAt,
          lastErrorCode: null,
          lastErrorDetail: null,
        },
      });
    });
  }

  /**
   * 検証保留候補を記録する。current pointer は変更しない。
   */
  async recordHeldCandidate(input: RecordHeldCandidateInput): Promise<void> {
    const { prisma } = this;
    await prisma.lawRefreshLawResult.update({
      where: { id: input.runResultId },
      data: {
        previousRevisionId: input.previousRevisionId,
        observedVersionKey: input.observedVersionKey,
        status: "held",
        phase: "verifying",
        diffSummary: input.diffSummary as Prisma.InputJsonValue,
        errorCode: input.errorCode,
        errorDetail: input.errorDetail,
        completedAt: new Date(),
      },
    });
  }

  /**
   * 無変更確認を記録する。
   * lastAttemptAt/lastSuccessfulCheckAt/lastObservedVersionKey/lastEgovUpdatedAt を更新し、
   * 既存 error を消す。current pointer は維持する。
   */
  async recordUnchangedCheck(input: RecordUnchangedCheckInput): Promise<void> {
    const { prisma } = this;
    const now = new Date();

    await prisma.lawSyncState.upsert({
      where: { lawId: input.lawId },
      create: {
        lawId: input.lawId,
        lastAttemptAt: now,
        lastSuccessfulCheckAt: now,
        lastObservedVersionKey: input.observedVersionKey,
        lastEgovUpdatedAt: input.egovUpdatedAt,
        lastErrorCode: null,
        lastErrorDetail: null,
        repealStatus: input.repealStatus ?? null,
        repealDate: input.repealDate ?? null,
      },
      update: {
        lastAttemptAt: now,
        lastSuccessfulCheckAt: now,
        lastObservedVersionKey: input.observedVersionKey,
        lastEgovUpdatedAt: input.egovUpdatedAt,
        lastErrorCode: null,
        lastErrorDetail: null,
        repealStatus: input.repealStatus ?? null,
        repealDate: input.repealDate ?? null,
      },
    });

    if (input.runResultId) {
      await prisma.lawRefreshLawResult.update({
        where: { id: input.runResultId },
        data: {
          status: "unchanged",
          phase: "completed",
          observedVersionKey: input.observedVersionKey,
          completedAt: now,
        },
      });
    }
  }

  /**
   * 失敗確認を記録する。
   * lastAttemptAt/lastErrorCode/lastErrorDetail だけを更新し、
   * 最後の成功日時と current pointer を維持する。
   */
  async recordFailedCheck(input: RecordFailedCheckInput): Promise<void> {
    const { prisma } = this;
    const now = new Date();

    await prisma.lawSyncState.upsert({
      where: { lawId: input.lawId },
      create: {
        lawId: input.lawId,
        lastAttemptAt: now,
        lastErrorCode: input.errorCode,
        lastErrorDetail: input.errorDetail,
      },
      update: {
        lastAttemptAt: now,
        lastErrorCode: input.errorCode,
        lastErrorDetail: input.errorDetail,
      },
    });

    if (input.runResultId) {
      await prisma.lawRefreshLawResult.update({
        where: { id: input.runResultId },
        data: {
          status: "failed",
          phase: "completed",
          errorCode: input.errorCode,
          errorDetail: input.errorDetail,
          completedAt: now,
        },
      });
    }
  }

  /**
   * リフレッシュ run を完了状態へ確定する。
   *
   * 更新成功が1件以上なら package を published、候補がすべて拒否なら rejected。
   */
  async completeRefreshRun(runId: string): Promise<void> {
    const { prisma } = this;
    await prisma.$transaction(async (tx) => {
      const results = await tx.lawRefreshLawResult.findMany({
        where: { runId },
        select: { status: true },
      });
      const hasUpdated = results.some((r) => r.status === "updated");
      const hasFailed = results.some((r) => r.status === "failed");
      const hasHeld = results.some((r) => r.status === "held");

      let runStatus: "succeeded" | "partial" | "failed";
      if (results.length === 0 || results.every((r) => r.status === "failed")) {
        runStatus = "failed";
      } else if (hasFailed || hasHeld) {
        runStatus = "partial";
      } else {
        runStatus = "succeeded";
      }

      const run = await tx.lawRefreshRun.update({
        where: { id: runId },
        data: {
          status: runStatus,
          completedAt: new Date(),
          summary: {
            total: results.length,
            updated: results.filter((r) => r.status === "updated").length,
            unchanged: results.filter((r) => r.status === "unchanged").length,
            held: results.filter((r) => r.status === "held").length,
            failed: results.filter((r) => r.status === "failed").length,
          } as Prisma.InputJsonValue,
        },
        include: { package: true },
      });

      // package status を確定
      if (run.package) {
        let packageStatus: LawPackageStatus = run.package.status;
        if (hasUpdated) {
          packageStatus = "published";
        } else if (results.length > 0 && results.every((r) =>
          r.status === "held" || r.status === "failed")) {
          packageStatus = "rejected";
        }
        if (packageStatus !== run.package.status) {
          await tx.lawPackage.update({
            where: { id: run.package.id },
            data: {
              status: packageStatus,
              publishedAt: packageStatus === "published" ? new Date() : run.package.publishedAt,
            },
          });
        }
      }
    });
  }

  /**
   * リフレッシュ全体を advisory lock で囲む。
   *
   * 同じDB接続で pg_advisory_lock を取得し、work 実行後に pg_advisory_unlock で解放する。
   * 2本目の同時取得は REFRESH_ALREADY_RUNNING で拒否する。
   *
   * 実装上の注意:
   * Prisma の connection pool はクエリごとに異なる接続を使う可能性があるため、
   * lock の取得と解放を必ず同じ接続で行うために、明示的に1本の接続を確保する。
   * Prisma では $transaction 内の全クエリが同じ接続で実行されるため、
   * interactive transaction を1本使い、その接続上で session-level advisory lock を
   * 取得・保持・解放する。
   *
   * work は同じ Prisma Client インスタンス（別接続）で実行されるが、lock の目的は
   * 「2本目の withRefreshLock が同時実行されるのを防ぐこと」であり、work 内クエリが
   * 同じ接続である必要はない。lock は PostgreSQL の session（接続）に紐づくため、
   * transaction 接続が生きている間だけ有効である。
   *
   * work 内で例外が起きても接続が閉じられるときに PostgreSQL の connection cleanup が
   * 残存 lock を解放するため、lock が永続的に保持されることはない。
   */
  async withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
    const { prisma } = this;

    // pg_try_advisory_lock は即座に true/false を返す。
    // 同じ key を別 session が保持していれば false。
    // interactive transaction の接続で lock を取得し、finally で解放する。
    // transaction の timeout を長めに設定し、work の実行時間を許容する。
    return await prisma.$transaction(
      async (tx) => {
        const acquired = await tx.$queryRaw<Array<{ try_lock: boolean }>>`
          SELECT pg_try_advisory_lock(${REFRESH_ADVISORY_LOCK_KEY}::bigint) AS try_lock
        `;
        if (!acquired[0]?.try_lock) {
          throw new RefreshAlreadyRunningError();
        }

        try {
          return await work();
        } finally {
          // 確実に解放する。同一接続（tx）で実行することが必須。
          await tx.$queryRaw`
            SELECT pg_advisory_unlock(${REFRESH_ADVISORY_LOCK_KEY}::bigint)
          `;
        }
      },
      {
        // work が長時間実行される可能性があるため、interactive transaction の
        // timeout を延長する。maxWait は接続取得待ち、timeout は実行時間。
        maxWait: 10_000,
        timeout: 600_000, // 10分
        isolationLevel: "ReadCommitted",
      },
    );
  }
}

// ─── ヘルパー ───

/**
 * YYYY-MM-DD 形式の文字列を Date へ変換する。
 * Prisma の @db.Date は時刻成分を切り捨てるため、UTC の深夜を設定する。
 */
function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`無効な日付形式です: ${value}（YYYY-MM-DD を期待）`);
  }
  return date;
}

/**
 * Revision 間 Article mapping を DB へ書き込む。
 * fromArticle/toArticle は実際に存在する Article ID を指す必要がある。
 * toRevisionId は候補 Revision、fromRevisionId は旧 Revision。
 */
async function writeMappings(
  tx: Prisma.TransactionClient,
  lawId: string,
  toRevisionId: string,
  mappings: readonly StagedArticleMapping[],
): Promise<void> {
  if (mappings.length === 0) return;
  await tx.articleRevisionMapping.createMany({
    data: mappings.map((m) => ({
      lawId,
      fromRevisionId: m.fromRevisionId,
      toRevisionId,
      fromArticleId: m.fromArticleId,
      toArticleId: m.toArticleId,
      kind: m.kind,
      status: m.status,
      method: m.method,
      rationale: m.rationale,
    })),
  });
}

/**
 * 書籍範囲解決を DB へ書き込む。
 */
async function writeRangeResolutions(
  tx: Prisma.TransactionClient,
  revisionId: string,
  resolutions: readonly StagedRangeResolution[],
): Promise<void> {
  if (resolutions.length === 0) return;
  await tx.lawBookEntryRangeResolution.createMany({
    data: resolutions.map((r) => ({
      lawBookEntryRangeId: r.lawBookEntryRangeId,
      lawRevisionId: revisionId,
      startDurableNodeKey: r.startDurableNodeKey,
      endDurableNodeKey: r.endDurableNodeKey,
      status: r.status,
      errorCode: r.errorCode,
      verifiedAt: new Date(),
    })),
  });
}
