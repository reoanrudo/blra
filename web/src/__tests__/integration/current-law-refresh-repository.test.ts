import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaClientConstructor } from "@prisma/client";
import {
  CurrentRevisionChangedError,
  RefreshAlreadyRunningError,
  RefreshRepository,
} from "@/lib/law-refresh/refresh-repository";
import {
  createCurrentLawRefreshFixture,
  type CurrentLawRefreshFixture,
} from "./current-law-refresh-fixture";

const prisma: PrismaClient = new PrismaClientConstructor();
const repository = new RefreshRepository({ prisma });

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // テスト間で advisory lock が残らないよう、確実に解放する。
  await prisma.$queryRaw`SELECT pg_advisory_unlock_all()`.catch(() => {});
});

/** 指定法令の currentRevisionId を取得する。 */
async function currentRevisionId(lawId: string): Promise<string | null> {
  const law = await prisma.law.findUnique({
    where: { id: lawId },
    select: { currentRevisionId: true },
  });
  return law?.currentRevisionId ?? null;
}

/** 指定 Revision の status を取得する。 */
async function revisionStatus(revisionId: string): Promise<string | null> {
  const rev = await prisma.lawRevision.findUnique({
    where: { id: revisionId },
    select: { status: true },
  });
  return rev?.status ?? null;
}

/** テスト用プレフィックスで残存するデータを検査する。 */
async function countTestResidue(): Promise<Record<string, number>> {
  const [laws, revisions, packages, runs, results, articles, mappings, syncStates] =
    await Promise.all([
      prisma.law.count({ where: { id: { startsWith: "law-refresh-test-" } } }),
      prisma.lawRevision.count({
        where: { id: { startsWith: "law-refresh-test-" } },
      }),
      prisma.lawPackage.count({
        where: { id: { startsWith: "law-refresh-test-" } },
      }),
      prisma.lawRefreshRun.count({
        where: { id: { startsWith: "law-refresh-test-" } },
      }),
      prisma.lawRefreshLawResult.count({
        where: { id: { startsWith: "law-refresh-test-" } },
      }),
      prisma.article.count({
        where: { id: { startsWith: "law-refresh-test-" } },
      }),
      prisma.articleRevisionMapping.count({
        where: { lawId: { startsWith: "law-refresh-test-" } },
      }),
      prisma.lawSyncState.count({
        where: { lawId: { startsWith: "law-refresh-test-" } },
      }),
    ]);
  return { laws, revisions, packages, runs, results, articles, mappings, syncStates };
}

describe("current-law refresh repository", () => {
  describe("stageCandidateRevision / activateCandidateRevision", () => {
    let fixture: CurrentLawRefreshFixture;

    afterEach(async () => {
      if (fixture) {
        await fixture.cleanup();
        fixture = undefined as unknown as CurrentLawRefreshFixture;
      }
    });

    it("検証済み候補だけを1トランザクションでcurrentへ切り替える", async () => {
      fixture = await createCurrentLawRefreshFixture(prisma);
      const staged = await repository.stageCandidateRevision(fixture.candidateInput);

      // staged Revision が作成されても current pointer は変わらない
      expect(await currentRevisionId(fixture.lawId)).toBe(fixture.oldRevisionId);

      await repository.activateCandidateRevision({
        lawId: fixture.lawId,
        previousRevisionId: fixture.oldRevisionId,
        candidateRevisionId: staged.revisionId,
        runResultId: fixture.runResultId,
        mappings: staged.mappings,
        rangeResolutions: staged.rangeResolutions,
        sync: fixture.syncMetadata,
      });

      // activate 後に current pointer が候補へ切り替わる
      expect(await currentRevisionId(fixture.lawId)).toBe(staged.revisionId);
      expect(await revisionStatus(fixture.oldRevisionId)).toBe("superseded");
      expect(await revisionStatus(staged.revisionId)).toBe("active");
    });

    it("staged Revisionは公開されず、activateだけがpointerを変える", async () => {
      fixture = await createCurrentLawRefreshFixture(prisma);
      const before = await currentRevisionId(fixture.lawId);

      const staged = await repository.stageCandidateRevision(fixture.candidateInput);

      // stage 直後は current pointer 不変、Revision status は staged
      expect(await currentRevisionId(fixture.lawId)).toBe(before);
      expect(await revisionStatus(staged.revisionId)).toBe("staged");
      expect(staged.reused).toBe(false);
      expect(staged.articleCount).toBeGreaterThan(0);
    });

    it("同じofficialVersionKeyの再stageはchecksum一致で再利用する", async () => {
      fixture = await createCurrentLawRefreshFixture(prisma);
      const first = await repository.stageCandidateRevision(fixture.candidateInput);
      const second = await repository.stageCandidateRevision(fixture.candidateInput);

      expect(second.revisionId).toBe(first.revisionId);
      expect(second.reused).toBe(true);
    });

    it("previousRevisionIdが変わっていたら切替を拒否する", async () => {
      fixture = await createCurrentLawRefreshFixture(prisma);
      const staged = await repository.stageCandidateRevision(fixture.candidateInput);

      // 別プロセスが先に current を otherRevisionId へ切替した状態を再現
      await prisma.law.update({
        where: { id: fixture.lawId },
        data: { currentRevisionId: fixture.otherRevisionId },
      });

      await expect(
        repository.activateCandidateRevision({
          lawId: fixture.lawId,
          previousRevisionId: fixture.oldRevisionId,
          candidateRevisionId: staged.revisionId,
          runResultId: fixture.runResultId,
          mappings: staged.mappings,
          rangeResolutions: staged.rangeResolutions,
          sync: fixture.syncMetadata,
        }),
      ).rejects.toMatchObject({ code: "CURRENT_REVISION_CHANGED" });

      // candidate Revision は staged のまま（activate は成功していない）
      expect(await revisionStatus(staged.revisionId)).toBe("staged");
      // current pointer は otherRevisionId のまま
      expect(await currentRevisionId(fixture.lawId)).toBe(fixture.otherRevisionId);
    });

    it("LawSyncStateを成功値へ更新し既存errorを消す", async () => {
      fixture = await createCurrentLawRefreshFixture(prisma);
      const staged = await repository.stageCandidateRevision(fixture.candidateInput);

      await repository.activateCandidateRevision({
        lawId: fixture.lawId,
        previousRevisionId: fixture.oldRevisionId,
        candidateRevisionId: staged.revisionId,
        runResultId: fixture.runResultId,
        mappings: staged.mappings,
        rangeResolutions: staged.rangeResolutions,
        sync: fixture.syncMetadata,
      });

      const sync = await prisma.lawSyncState.findUnique({
        where: { lawId: fixture.lawId },
      });
      expect(sync).not.toBeNull();
      expect(sync?.lastErrorCode).toBeNull();
      expect(sync?.lastSuccessfulCheckAt).not.toBeNull();
      expect(sync?.lastObservedVersionKey).toBe(fixture.syncMetadata.observedVersionKey);
    });
  });

  describe("recordUnchangedCheck / recordFailedCheck", () => {
    let fixture: CurrentLawRefreshFixture;

    afterEach(async () => {
      if (fixture) {
        await fixture.cleanup();
        fixture = undefined as unknown as CurrentLawRefreshFixture;
      }
    });

    it("recordUnchangedCheckは成功日時と観察版数を記録しerrorを消す", async () => {
      fixture = await createCurrentLawRefreshFixture(prisma);

      // 先に failed 状態を書く
      await repository.recordFailedCheck({
        runResultId: fixture.runResultId,
        lawId: fixture.lawId,
        errorCode: "EGOV_UNAVAILABLE",
        errorDetail: "e-Gov API が応答しませんでした",
      });
      let sync = await prisma.lawSyncState.findUnique({
        where: { lawId: fixture.lawId },
      });
      expect(sync?.lastErrorCode).toBe("EGOV_UNAVAILABLE");

      // unchanged で上書き
      await repository.recordUnchangedCheck({
        runResultId: fixture.runResultId,
        lawId: fixture.lawId,
        observedVersionKey: "v-unchanged",
        egovUpdatedAt: new Date("2026-08-04T10:00:00+09:00"),
      });
      sync = await prisma.lawSyncState.findUnique({
        where: { lawId: fixture.lawId },
      });
      expect(sync?.lastErrorCode).toBeNull();
      expect(sync?.lastSuccessfulCheckAt).not.toBeNull();
      expect(sync?.lastObservedVersionKey).toBe("v-unchanged");
    });

    it("recordFailedCheckは最後の成功日時とcurrent pointerを維持する", async () => {
      fixture = await createCurrentLawRefreshFixture(prisma);
      const beforeCurrent = await currentRevisionId(fixture.lawId);

      await repository.recordFailedCheck({
        runResultId: fixture.runResultId,
        lawId: fixture.lawId,
        errorCode: "PARSE_ERROR",
        errorDetail: "XML 構文エラー",
      });

      // current pointer は維持される
      expect(await currentRevisionId(fixture.lawId)).toBe(beforeCurrent);
      const sync = await prisma.lawSyncState.findUnique({
        where: { lawId: fixture.lawId },
      });
      expect(sync?.lastErrorCode).toBe("PARSE_ERROR");
      expect(sync?.lastErrorDetail).toBe("XML 構文エラー");
      expect(sync?.lastAttemptAt).not.toBeNull();
    });
  });

  describe("withRefreshLock", () => {
    let fixture: CurrentLawRefreshFixture;

    afterEach(async () => {
      // lock が残存しないよう全解放
      await prisma.$queryRaw`SELECT pg_advisory_unlock_all()`.catch(() => {});
      if (fixture) {
        await fixture.cleanup();
        fixture = undefined as unknown as CurrentLawRefreshFixture;
      }
    });

    it("同時更新lockを取得できない2本目を拒否する", async () => {
      // 1本目の withRefreshLock が実際に lock を取得したことを確実にするため、
      // lock 取得後に resolve する Promise を使う。
      // JavaScript はシングルスレッドだため、withRefreshLock の transaction が
      // 開始されて pg_try_advisory_lock が実行されるには、一度 await する必要がある。
      let signalLockAcquired!: () => void;
      const lockAcquired = new Promise<void>((resolve) => {
        signalLockAcquired = resolve;
      });
      let resolveFirst!: (value: string) => void;
      const deferredWork = new Promise<string>((resolve) => {
        resolveFirst = resolve;
      });

      // 1本目: lock を取得したことを通知し、その後 deferredWork で待機
      const first = repository.withRefreshLock(async () => {
        signalLockAcquired();
        return deferredWork;
      });

      // 1本目が lock を取得するまで確実に待機
      await lockAcquired;

      // 2本目: REFRESH_ALREADY_RUNNING で拒否される
      await expect(repository.withRefreshLock(async () => "second")).rejects.toMatchObject({
        code: "REFRESH_ALREADY_RUNNING",
      });

      // 1本目を完了させ、lock が解放されて正常終了することを確認
      resolveFirst("first");
      await expect(first).resolves.toBe("first");
    });

    it("work完了後にlockは解放され次の取得が成功する", async () => {
      await repository.withRefreshLock(async () => "done");
      // 2回目は即座に成功するはず
      await expect(repository.withRefreshLock(async () => "again")).resolves.toBe("again");
    });
  });

  describe("fixture cleanup 検証", () => {
    it("cleanup後にテスト用law/run/package/article/mapping/range resolutionが0件", async () => {
      const before = await countTestResidue();
      const fixture = await createCurrentLawRefreshFixture(prisma);
      await repository.stageCandidateRevision(fixture.candidateInput);
      await fixture.cleanup();

      const after = await countTestResidue();
      // cleanup 後は before と同じ件数（基本0件）に戻る
      expect(after).toEqual(before);
    });
  });
});
