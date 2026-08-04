import { describe, expect, it, vi } from "vitest";
import type { EgovLawVersion } from "@/lib/law-refresh/egov-client";
import type {
  CandidateVerificationReport,
} from "@/lib/law-refresh/verify-candidate";
import type { LawRevisionDiff } from "@/lib/law-refresh/diff-law-revisions";
import type { ParsedLawDocument } from "@/lib/law-refresh/types";
import {
  refreshCurrentLaws,
  type RefreshCurrentLawsRequest,
  type RefreshDeps,
  type RefreshRunReport,
} from "@/lib/law-refresh/refresh-service";

// ─── テスト用ヘルパ ───

const BASE_VERSION: EgovLawVersion = {
  lawId: "325AC0000000201",
  revisionId: "rev-egov-1",
  title: "建築基準法",
  effectiveFrom: "2025-04-01",
  sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
  repealStatus: "InEffect",
  repealDate: null,
};

const UPDATED_VERSION: EgovLawVersion = {
  ...BASE_VERSION,
  revisionId: "rev-egov-2",
  sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
};

function parsedDoc(revisionId: string, count = 1): ParsedLawDocument {
  return {
    lawId: "law-1",
    egovLawId: "325AC0000000201",
    revisionId,
    nodes: Array.from({ length: count }, (_, i) => ({
      sourceIndex: i,
      parentSourceIndex: i === 0 ? null : i - 1,
      level: "article" as const,
      legacyStableNodeKey: `root/article:${i + 1}@${i + 1}`,
      durableNodeKey: `main/article:${i + 1}`,
      contentChecksum: `checksum-${revisionId}-${i}`,
      bodyChecksum: `body-${revisionId}-${i}`,
      articleNumber: String(i + 1),
      articleNumberNormalized: String(i + 1),
      paragraphNumber: null,
      itemNumber: null,
      subitemNumber: null,
      title: `第${i + 1}条`,
      caption: null,
      text: `本文${i + 1}`,
      sortOrder: i + 1,
      systemTags: null,
    })),
  };
}

const PUBLISHABLE_DIFF: LawRevisionDiff = {
  items: [],
  counts: { unchanged: 0, modified: 0, added: 0, removed: 0, held: 0 },
  publishable: true,
  holdReasons: [],
};

const HELD_DIFF: LawRevisionDiff = {
  items: [
    {
      kind: "renumbered_candidate",
      previous: null,
      candidate: null,
      reason: "renumber candidate",
    },
  ],
  counts: { unchanged: 0, modified: 0, added: 0, removed: 0, held: 1 },
  publishable: false,
  holdReasons: ["RENUMBERING_REVIEW_REQUIRED"],
};

function publishableReport(): CandidateVerificationReport {
  return {
    publishable: true,
    errors: [],
    warnings: [],
    rangeResolutions: [],
    metrics: { nodeCount: 1, articleCount: 1, nodeDeltaRatio: 0 },
  };
}

function heldReport(): CandidateVerificationReport {
  return {
    publishable: false,
    errors: [{ code: "UNRESOLVED_DIFF", detail: "保留" }],
    warnings: [],
    rangeResolutions: [],
    metrics: { nodeCount: 1, articleCount: 1, nodeDeltaRatio: 0 },
  };
}

/** fakeRefreshDeps のモック設定。 */
interface FakeDepsConfig {
  /** 公式版番号（getLawVersionAt の戻り値）。 */
  egovVersion?: EgovLawVersion;
  /** DB上の現行 Revision ID。null で初回導入扱い。 */
  localRevision?: string | null;
  /** 同期状態に記録された最後の公式版キー。null で未観測扱い。 */
  observedRevision?: string | null;
  /** 差分結果。デフォルト publishable。 */
  diff?: LawRevisionDiff;
  /** 検証結果。デフォルト publishable。 */
  report?: CandidateVerificationReport;
  /** 法令の公開範囲一覧（verify へ渡す ranges）。デフォルト空。 */
  ranges?: never[];
  /** recordUnchangedCheck へ渡された repealStatus/repealDate を検証したいとき。 */
  repealStatus?: string;
  repealDate?: string | null;
}

/**
 * 依存注入で全ての外部副作用をmockした RefreshDeps を作る。
 * jest.fn 相当の tracker として vi.fn を使う。
 */
function fakeRefreshDeps(config: FakeDepsConfig = {}): RefreshDeps & {
  calls: {
    getLawVersionAt: number;
    getLawXmlAt: number;
    stageCandidateRevision: number;
    activateCandidateRevision: number;
    recordUnchangedCheck: number;
    recordFailedCheck: number;
    recordHeldCandidate: number;
    createRefreshRun: number;
    completeRefreshRun: number;
    withRefreshLock: number;
  };
} {
  const egovVersion = config.egovVersion ?? BASE_VERSION;
  const localRevision = config.localRevision ?? null;
  const observedRevision = config.observedRevision ?? null;
  const diff = config.diff ?? PUBLISHABLE_DIFF;
  const report = config.report ?? publishableReport();
  const ranges = config.ranges ?? [];

  const calls = {
    getLawVersionAt: 0,
    getLawXmlAt: 0,
    stageCandidateRevision: 0,
    activateCandidateRevision: 0,
    recordUnchangedCheck: 0,
    recordFailedCheck: 0,
    recordHeldCandidate: 0,
    createRefreshRun: 0,
    completeRefreshRun: 0,
    withRefreshLock: 0,
  };

  const getLawVersionAt = vi.fn(async (): Promise<EgovLawVersion> => {
    calls.getLawVersionAt++;
    return egovVersion;
  });
  const getLawXmlAt = vi.fn(async () => {
    calls.getLawXmlAt++;
    return {
      lawId: egovVersion.lawId,
      revisionId: egovVersion.revisionId,
      xml: "<Law><MainProvision/></Law>",
      checksum: "fake-checksum",
      sourceUrl: "https://example.invalid/xml",
      fetchedAt: new Date("2026-08-04T00:00:00Z"),
    };
  });
  const getCurrentRevisionId = vi.fn(async (): Promise<string | null> => {
    return localRevision;
  });
  const getLastObservedVersionKey = vi.fn(async (): Promise<string | null> => {
    return observedRevision;
  });
  const getLawRanges = vi.fn(async () => ranges);
  const createRefreshRun = vi.fn(async () => {
    calls.createRefreshRun++;
    return {
      id: "run-1",
      targetDate: "2026-08-04",
      trigger: "manual" as const,
      status: "running" as const,
    };
  });
  const createLawRefreshLawResult = vi.fn(async () => "result-1");
  const stageCandidateRevision = vi.fn(async () => {
    calls.stageCandidateRevision++;
    return {
      revisionId: "rev-candidate",
      reused: false,
      articleCount: 1,
      mappings: [],
      rangeResolutions: [],
    };
  });
  const activateCandidateRevision = vi.fn(async () => {
    calls.activateCandidateRevision++;
  });
  const recordUnchangedCheck = vi.fn(async (input: Record<string, unknown>) => {
    calls.recordUnchangedCheck++;
    return input;
  });
  const recordFailedCheck = vi.fn(async () => {
    calls.recordFailedCheck++;
  });
  const recordHeldCandidate = vi.fn(async () => {
    calls.recordHeldCandidate++;
  });
  const completeRefreshRun = vi.fn(async () => {
    calls.completeRefreshRun++;
  });
  const withRefreshLock = (async <T>(work: () => Promise<T>): Promise<T> => {
    calls.withRefreshLock++;
    return await work();
  }) as never;
  const loadSigningKey = vi.fn(async () => ({
    privateKey: {} as never,
    keyId: "test-key",
  }));
  const signRefreshManifest = vi.fn(() => ({
    manifest: { runId: "run-1", targetDate: "2026-08-04", laws: [] },
    manifestChecksum: "manifest-checksum",
    signature: "sig",
    signerKeyId: "test-key",
  }));
  const parseLawXml = vi.fn(() => parsedDoc(egovVersion.revisionId));
  const diffLawRevisions = vi.fn(() => diff);
  const verifyCandidate = vi.fn(() => report);
  const resolveVerifiedRanges = vi.fn(() => []);
  const store = {
    put: vi.fn(async () => ({
      lawId: egovVersion.lawId,
      revisionId: egovVersion.revisionId,
      checksum: "fake-checksum",
      storedPath: "/tmp/fake.xml",
    })),
  };
  const loadReviewedRevisionDecision = (vi.fn(async () => undefined)) as never;

  return {
    getLawVersionAt,
    getLawXmlAt,
    getCurrentRevisionId,
    getLastObservedVersionKey,
    getLawRanges,
    createRefreshRun,
    createLawRefreshLawResult,
    stageCandidateRevision,
    activateCandidateRevision,
    recordUnchangedCheck,
    recordFailedCheck,
    recordHeldCandidate,
    completeRefreshRun,
    withRefreshLock,
    loadSigningKey,
    signRefreshManifest,
    parseLawXml,
    diffLawRevisions,
    verifyCandidate,
    resolveVerifiedRanges,
    store,
    loadReviewedRevisionDecision,
    calls,
  } as unknown as RefreshDeps & { calls: typeof calls };
}

// ─── テスト本体 ───

describe("refreshCurrentLaws", () => {
  it("公式版番号が一致する法令はmetadata確認だけで終了する", async () => {
    // DB同期状態の観測版キーとe-Gov版キーが一致 → XML取得もstageもしない
    const deps = fakeRefreshDeps({
      localRevision: "rev-1",
      observedRevision: BASE_VERSION.revisionId,
    });
    const request: RefreshCurrentLawsRequest = {
      asOf: "2026-08-04",
      trigger: "manual",
      mode: "refresh",
      lawIds: ["325AC0000000201"],
    };

    const report: RefreshRunReport = await refreshCurrentLaws(request, deps);

    expect(report.counts).toEqual({
      checked: 1,
      unchanged: 1,
      updated: 0,
      held: 0,
      failed: 0,
    });
    expect(deps.calls.getLawXmlAt).toBe(0);
    expect(deps.calls.stageCandidateRevision).toBe(0);
    expect(deps.calls.recordUnchangedCheck).toBe(1);
    expect(deps.calls.activateCandidateRevision).toBe(0);
  });

  it("公式版番号が変化した法令はXML取得・parse・verify・stage・activateまで実行する", async () => {
    const deps = fakeRefreshDeps({
      localRevision: "rev-1",
      observedRevision: "rev-old",
      egovVersion: UPDATED_VERSION,
    });
    const request: RefreshCurrentLawsRequest = {
      asOf: "2026-08-04",
      trigger: "manual",
      mode: "refresh",
      lawIds: ["325AC0000000201"],
    };

    const report = await refreshCurrentLaws(request, deps);

    expect(report.counts).toEqual({
      checked: 1,
      unchanged: 0,
      updated: 1,
      held: 0,
      failed: 0,
    });
    expect(deps.calls.getLawXmlAt).toBe(1);
    expect(deps.calls.stageCandidateRevision).toBe(1);
    expect(deps.calls.activateCandidateRevision).toBe(1);
    expect(report.laws[0]?.status).toBe("updated");
    // to には stage された候補 Revision ID が入る
    expect(report.laws[0]?.to).toBe("rev-candidate");
  });

  it("検証保留を法令内に閉じ込める（1法令heldでも他法令updated）", async () => {
    // 2法令: 1件目は保留、2件目は更新成功
    const calls = {
      getLawVersionAt: 0,
      activate: 0,
    };
    const updatedVersion: EgovLawVersion = {
      ...BASE_VERSION,
      revisionId: "rev-egov-2",
    };

    let versionIndex = 0;
    const versions = [
      { ...BASE_VERSION, revisionId: "rev-egov-held" },
      { ...BASE_VERSION, revisionId: "rev-egov-updated" },
    ];
    const diffs = [HELD_DIFF, PUBLISHABLE_DIFF];
    const reports = [heldReport(), publishableReport()];
    let diffIndex = 0;
    let reportIndex = 0;

    const deps: RefreshDeps = {
      getLawVersionAt: vi.fn(async () => {
        const v = versions[versionIndex]!;
        versionIndex++;
        return v;
      }),
      getLawXmlAt: vi.fn(async (version: EgovLawVersion) => ({
        lawId: version.lawId,
        revisionId: version.revisionId,
        xml: "<Law><MainProvision/></Law>",
        checksum: `checksum-${version.revisionId}`,
        sourceUrl: "https://example.invalid",
        fetchedAt: new Date(),
      })),
      getCurrentRevisionId: vi.fn(async () => "rev-previous"),
      getLastObservedVersionKey: vi.fn(async () => "rev-old"),
      getLawRanges: vi.fn(async () => []),
      createRefreshRun: vi.fn(async () => ({
        id: "run-1",
        targetDate: "2026-08-04",
        trigger: "scheduled" as const,
        status: "running" as const,
      })),
      createLawRefreshLawResult: vi.fn(async () => "result-1"),
      stageCandidateRevision: vi.fn(async () => ({
        revisionId: "rev-candidate",
        reused: false,
        articleCount: 1,
        mappings: [],
        rangeResolutions: [],
      })),
      activateCandidateRevision: vi.fn(async () => {
        calls.activate++;
      }),
      recordUnchangedCheck: vi.fn(async () => {}),
      recordFailedCheck: vi.fn(async () => {}),
      recordHeldCandidate: vi.fn(async () => {}),
      completeRefreshRun: vi.fn(async () => {}),
      withRefreshLock: (async <T>(work: () => Promise<T>): Promise<T> => {
        calls.getLawVersionAt; // tracker
        return await work();
      }) as never,
      loadSigningKey: vi.fn(async () => ({
        privateKey: {} as never,
        keyId: "test-key",
      })),
      signRefreshManifest: vi.fn(() => ({
        manifest: { runId: "run-1", targetDate: "2026-08-04", laws: [] },
        manifestChecksum: "checksum",
        signature: "sig",
        signerKeyId: "test-key",
      })),
      parseLawXml: vi.fn(() => parsedDoc("rev-candidate")),
      diffLawRevisions: vi.fn(() => {
        const d = diffs[diffIndex]!;
        diffIndex++;
        return d;
      }),
      verifyCandidate: vi.fn(() => {
        const r = reports[reportIndex]!;
        reportIndex++;
        return r;
      }),
      resolveVerifiedRanges: vi.fn(() => []),
      store: {
        put: vi.fn(async () => ({
          lawId: "x",
          revisionId: "rev",
          checksum: "c",
          storedPath: "/tmp/x.xml",
        })),
      } as never,
      loadReviewedRevisionDecision: (vi.fn(async () => undefined)) as never,
    };

    const report = await refreshCurrentLaws(
      {
        asOf: "2026-08-04",
        trigger: "scheduled",
        mode: "refresh",
        lawIds: ["law-a", "law-b"],
      },
      deps,
    );

    expect(report.counts).toMatchObject({
      checked: 2,
      updated: 1,
      held: 1,
      failed: 0,
    });
    // 更新成功したのは2件目の法令だけ
    expect(calls.activate).toBe(1);
    const statuses = report.laws.map((l) => l.status).sort();
    expect(statuses).toEqual(["held", "updated"]);
  });

  it("廃止状態でも既存Revisionを削除せず同期状態へ廃止日を記録する", async () => {
    const repealedVersion: EgovLawVersion = {
      ...BASE_VERSION,
      repealStatus: "Repealed",
      repealDate: "2026-08-04",
    };
    // observedRevision と一致 → unchanged パスへ入るが廃止状態を持つ
    const deps = fakeRefreshDeps({
      localRevision: "rev-last",
      observedRevision: repealedVersion.revisionId,
      egovVersion: repealedVersion,
    });

    const report = await refreshCurrentLaws(
      {
        asOf: "2026-08-04",
        trigger: "manual",
        mode: "refresh",
        lawIds: ["law-repealed"],
      },
      deps,
    );

    // 削除操作はDIに存在しないため呼ばれない。変更判定は versionKey 一致で unchanged。
    expect(report.counts).toMatchObject({ unchanged: 1, updated: 0, failed: 0 });
    expect(deps.calls.recordUnchangedCheck).toBe(1);
    // recordUnchangedCheck へ廃止情報が渡ることを検証
    const unchangedSpy = deps.recordUnchangedCheck as unknown as {
      mock: { calls: Array<Record<string, unknown>> };
    };
    expect(unchangedSpy.mock.calls[0]?.[0]).toMatchObject({
      repealStatus: "Repealed",
      repealDate: new Date("2026-08-04T00:00:00.000Z"),
    });
  });

  it("check モードは metadata 比較と同期状態記録だけでXML取得しない", async () => {
    // version が変化していても check では XML を取らない
    const deps = fakeRefreshDeps({
      localRevision: "rev-1",
      observedRevision: "rev-old",
      egovVersion: UPDATED_VERSION,
    });

    const report = await refreshCurrentLaws(
      {
        asOf: "2026-08-04",
        trigger: "manual",
        mode: "check",
        lawIds: ["325AC0000000201"],
      },
      deps,
    );

    expect(deps.calls.getLawXmlAt).toBe(0);
    expect(deps.calls.stageCandidateRevision).toBe(0);
    // check でも unchanged 記録は呼ばない（metadata のみ）。変化を検知しても記録しない。
    expect(deps.calls.recordUnchangedCheck).toBe(0);
    // 変化があったことをreportへ載せる
    expect(report.laws[0]?.status).toBe("updated");
    expect(report.counts.updated).toBe(1);
  });

  it("dry-run モードは取得・parse・verifyまで行うがstage/activateしない", async () => {
    const deps = fakeRefreshDeps({
      localRevision: "rev-1",
      observedRevision: "rev-old",
      egovVersion: UPDATED_VERSION,
    });

    const report = await refreshCurrentLaws(
      {
        asOf: "2026-08-04",
        trigger: "manual",
        mode: "dry-run",
        lawIds: ["325AC0000000201"],
      },
      deps,
    );

    expect(deps.calls.getLawXmlAt).toBe(1);
    expect(deps.calls.stageCandidateRevision).toBe(0);
    expect(deps.calls.activateCandidateRevision).toBe(0);
    expect(report.laws[0]?.status).toBe("updated");
  });

  it(
    "取得失敗は recordFailedCheck を呼び次法令へ進む",
    async () => {
    // 1件目は getLawVersionAt で常に 503、2件目は成功する deps
    const updatedVersion: EgovLawVersion = UPDATED_VERSION;
    const deps: RefreshDeps = {
      getLawVersionAt: vi.fn(async (lawId: string) => {
        // law-fail はリトライ上限を超えて常に失敗、law-ok は成功
        if (lawId === "law-fail") {
          throw new Error("e-Gov API: HTTP 503 で失敗しました");
        }
        return updatedVersion;
      }),
      getLawXmlAt: vi.fn(async (version: EgovLawVersion) => ({
        lawId: version.lawId,
        revisionId: version.revisionId,
        xml: "<Law><MainProvision/></Law>",
        checksum: `c-${version.revisionId}`,
        sourceUrl: "https://example.invalid",
        fetchedAt: new Date(),
      })),
      getCurrentRevisionId: vi.fn(async () => "rev-1"),
      getLastObservedVersionKey: vi.fn(async () => "rev-old"),
      getLawRanges: vi.fn(async () => []),
      createRefreshRun: vi.fn(async () => ({
        id: "run-1",
        targetDate: "2026-08-04",
        trigger: "scheduled" as const,
        status: "running" as const,
      })),
      createLawRefreshLawResult: vi.fn(async () => "result-1"),
      stageCandidateRevision: vi.fn(async () => ({
        revisionId: "rev-candidate",
        reused: false,
        articleCount: 1,
        mappings: [],
        rangeResolutions: [],
      })),
      activateCandidateRevision: vi.fn(async () => {}),
      recordUnchangedCheck: vi.fn(async () => {}),
      recordFailedCheck: vi.fn(async () => {}),
      recordHeldCandidate: vi.fn(async () => {}),
      completeRefreshRun: vi.fn(async () => {}),
      withRefreshLock: (async <T>(work: () => Promise<T>): Promise<T> => {
        return await work();
      }) as never,
      loadSigningKey: vi.fn(async () => ({
        privateKey: {} as never,
        keyId: "test-key",
      })),
      signRefreshManifest: vi.fn(() => ({
        manifest: { runId: "run-1", targetDate: "2026-08-04", laws: [] },
        manifestChecksum: "checksum",
        signature: "sig",
        signerKeyId: "test-key",
      })),
      parseLawXml: vi.fn(() => parsedDoc("rev-candidate")),
      diffLawRevisions: vi.fn(() => PUBLISHABLE_DIFF),
      verifyCandidate: vi.fn(() => publishableReport()),
      resolveVerifiedRanges: vi.fn(() => []),
      store: {
        put: vi.fn(async () => ({
          lawId: "x",
          revisionId: "rev",
          checksum: "c",
          storedPath: "/tmp/x.xml",
        })),
      } as never,
      loadReviewedRevisionDecision: (vi.fn(async () => undefined)) as never,
    };
    const failedSpy = deps.recordFailedCheck as unknown as {
      mock: { calls: unknown[] };
    };
    const activateSpy = deps.activateCandidateRevision as unknown as {
      mock: { calls: unknown[] };
    };

    const report = await refreshCurrentLaws(
      {
        asOf: "2026-08-04",
        trigger: "scheduled",
        mode: "refresh",
        lawIds: ["law-fail", "law-ok"],
      },
      deps,
    );

    expect(report.counts).toMatchObject({ failed: 1, updated: 1, checked: 2 });
    expect(failedSpy.mock.calls.length).toBe(1);
    expect(activateSpy.mock.calls.length).toBe(1);
    const failLaw = report.laws.find((l) => l.lawId === "law-fail");
    expect(failLaw?.status).toBe("failed");
    expect(failLaw?.errorCode).toBeTruthy();
  },
    // リトライの指数backoff（1s+2s+4s）が実際にかかるため延長
    20000,
  );

  it("withRefreshLock でrun全体を囲む", async () => {
    const deps = fakeRefreshDeps({
      localRevision: "rev-1",
      observedRevision: BASE_VERSION.revisionId,
    });

    await refreshCurrentLaws(
      {
        asOf: "2026-08-04",
        trigger: "manual",
        mode: "refresh",
        lawIds: ["325AC0000000201"],
      },
      deps,
    );

    expect(deps.calls.withRefreshLock).toBe(1);
    expect(deps.calls.createRefreshRun).toBe(1);
    expect(deps.calls.completeRefreshRun).toBe(1);
  });
});
