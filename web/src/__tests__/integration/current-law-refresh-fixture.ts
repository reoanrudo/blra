import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { materializeArticleRows, parseLawXml } from "@/lib/law-refresh/parse-law-xml";
import type {
  ActivateCandidateRevisionInput,
  StageCandidateRevisionInput,
} from "@/lib/law-refresh/refresh-repository";

/**
 * 現行法令リフレッシュの統合テスト用fixture。
 *
 * テスト用の Law / LawRevision(old + other) / LawPackage / Article / LawRefreshRun /
 * LawRefreshLawResult を作成し、終了時にこれらを完全に削除する cleanup 関数を返す。
 *
 * 作成するテストデータはすべて明示的なプレフィックス（law-refresh-test-）を持ち、
 * cleanup は外部キー制約の順序に従って確実に削除する。
 */

const TEST_PREFIX = "law-refresh-test-";
const TEST_EGOV_LAW_ID = "999ZZ0000000001";

/** テスト用法令の基本情報。 */
export interface CurrentLawRefreshFixture {
  /** テスト用 Law ID。 */
  lawId: string;
  /** テスト開始時点の current Revision ID（旧版）。 */
  oldRevisionId: string;
  /** 切替拒否テストで current を差し替えるためのもう1つの Revision ID。 */
  otherRevisionId: string;
  /** 旧 Revision に属する Article ID。 */
  oldArticleId: string;
  /** stageCandidateRevision へ渡す入力。 */
  candidateInput: StageCandidateRevisionInput;
  /** activateCandidateRevision へ渡す基本入力（candidateRevisionId は別途上書き）。 */
  activationInput: Omit<ActivateCandidateRevisionInput, "candidateRevisionId">;
  /** run.resultId（LawRefreshLawResult.id）。 */
  runResultId: string;
  /** run.id。 */
  runId: string;
  /** 同期状態書込み用のメタデータ。 */
  syncMetadata: {
    observedVersionKey: string;
    egovUpdatedAt: Date;
  };
  /** cleanup 関数。テスト終了時に必ず呼ぶこと。 */
  cleanup: () => Promise<void>;
}

/**
 * テスト用の最小法令 XML を2種類（旧版・候補版）へパースし、Article 行へ変換する。
 *
 * 既存DBの partial unique index `idx_article_unique` が
 * `(lawId, level, articleNumberNormalized) WHERE level='article' AND deletedAt IS NULL`
 * を要求するため、旧版と候補版で条番号が重複しないようにする。
 * 旧版は第10条、候補版は第20条 + 第21条とし、差分を発生させる。
 *
 * makeMinimalLawXml は ["10", "11"] のみをサポートするため、fixture 固有の
 * 数字→漢数字変換を行うヘルパーを使ってXMLを直接生成する。
 */
const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const KANJI_TENS = ["", "十", "二十", "三十", "四十", "五十", "六十", "七十", "八十", "九十"];

function numberToKanji(num: number): string {
  if (num <= 0) return String(num);
  if (num < 10) return KANJI_DIGITS[num]!;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${KANJI_TENS[tens] ?? ""}${ones > 0 ? KANJI_DIGITS[ones]! : ""}`;
  }
  return String(num);
}

function makeFixtureLawXml(articleNumbers: number[]): string {
  const articleXml = (num: number): string => {
    const kanji = numberToKanji(num);
    return `
      <Article Num="${num}">
        <ArticleTitle>第${kanji}条</ArticleTitle>
        <Paragraph Num="1">
          <ParagraphNum>1</ParagraphNum>
          <ParagraphSentence>
            <Sentence Num="1">第${kanji}条の本文</Sentence>
          </ParagraphSentence>
        </Paragraph>
      </Article>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<Law Lang="ja" Era="Showa" Year="25" Num="201" PromulgateMonth="05" PromulgateDay="24" LawType="Act">
  <LawBody>
    <MainProvision>${articleNumbers.map(articleXml).join("")}
    </MainProvision>
  </LawBody>
</Law>`;
}

function buildParsedDocuments(lawId: string, oldRevisionId: string, candidateRevisionId: string) {
  // 旧版は第10条、候補版は第20条 + 第21条（番号重複を避ける）
  const oldXml = makeFixtureLawXml([10]);
  const candidateXml = makeFixtureLawXml([20, 21]);

  const oldDoc = parseLawXml(oldXml, {
    lawId,
    egovLawId: TEST_EGOV_LAW_ID,
    revisionId: oldRevisionId,
  });
  const candidateDoc = parseLawXml(candidateXml, {
    lawId,
    egovLawId: TEST_EGOV_LAW_ID,
    revisionId: candidateRevisionId,
  });

  return { oldDoc, candidateDoc };
}

/**
 * テスト用 Law / LawRevision(old + other) / LawPackage / Article / Run / Result を作成する。
 *
 * - oldRevision は status=active で Law.currentRevisionId へ設定済み。
 * - otherRevision は status=staged（切替拒否テストで current を差し替える用）。
 * - candidate Revision は stageCandidateRevision 呼び出し時に作成される。
 */
export async function createCurrentLawRefreshFixture(
  prisma: PrismaClient,
): Promise<CurrentLawRefreshFixture> {
  const runSuffix = randomUUID();
  const lawId = `${TEST_PREFIX}${runSuffix}`;
  const oldRevisionId = `${TEST_PREFIX}rev-old-${runSuffix}`;
  const otherRevisionId = `${TEST_PREFIX}rev-other-${runSuffix}`;
  const candidateRevisionIdPlaceholder = `${TEST_PREFIX}rev-candidate-${runSuffix}`;
  const packageId = `${TEST_PREFIX}pkg-${runSuffix}`;
  const runId = `${TEST_PREFIX}run-${runSuffix}`;
  const runResultId = `${TEST_PREFIX}result-${runSuffix}`;

  const { oldDoc, candidateDoc } = buildParsedDocuments(
    lawId,
    oldRevisionId,
    candidateRevisionIdPlaceholder,
  );

  const now = new Date();
  const effectiveFrom = new Date("2026-05-27T00:00:00+09:00");
  const targetDate = new Date("2026-08-04T00:00:00+09:00");

  // テスト用 LawPackage（署名付きmanifestを模した値）
  await prisma.lawPackage.create({
    data: {
      id: packageId,
      packageVersion: `${TEST_PREFIX}${runSuffix}`,
      manifestChecksum: "a".repeat(64),
      signature: "test-signature-base64",
      signerKeyId: `${TEST_PREFIX}signer-${runSuffix}`,
      sourceSummary: { test: true, runSuffix },
      effectiveAt: now,
      status: "verified",
    },
  });

  // Law を先に作成するが、currentRevisionId はまだ設定しない（FK制約のため）
  await prisma.law.create({
    data: {
      id: lawId,
      egovLawId: `${TEST_EGOV_LAW_ID}-${runSuffix.slice(0, 8)}`,
      name: `${TEST_PREFIX}法令`,
      shortName: "テスト法",
      category: "law",
    },
  });

  // oldRevision (active)
  await prisma.lawRevision.create({
    data: {
      id: oldRevisionId,
      lawId,
      packageId,
      officialVersionKey: `${TEST_PREFIX}old-${runSuffix}`,
      effectiveFrom,
      fetchedAt: now,
      sourceUrl: `https://example.invalid/${oldRevisionId}`,
      xmlStorageKey: `${TEST_PREFIX}old-${runSuffix}.xml`,
      xmlChecksum: "b".repeat(64),
      status: "active",
      sourceUpdatedAt: effectiveFrom,
    },
  });

  // otherRevision (staged) - 切替拒否テストで current を差し替える用
  await prisma.lawRevision.create({
    data: {
      id: otherRevisionId,
      lawId,
      packageId,
      officialVersionKey: `${TEST_PREFIX}other-${runSuffix}`,
      effectiveFrom,
      fetchedAt: now,
      sourceUrl: `https://example.invalid/${otherRevisionId}`,
      xmlStorageKey: `${TEST_PREFIX}other-${runSuffix}.xml`,
      xmlChecksum: "c".repeat(64),
      status: "staged",
      sourceUpdatedAt: effectiveFrom,
    },
  });

  // oldRevision を作成した後に currentRevisionId を設定
  await prisma.law.update({
    where: { id: lawId },
    data: { currentRevisionId: oldRevisionId },
  });

  // oldRevision の Article を作成
  const oldRows = materializeArticleRows(oldDoc, `${TEST_PREFIX}art-old-`);
  await prisma.article.createMany({
    data: oldRows.map((row) => ({
      id: row.id,
      lawId: row.lawId,
      parentId: row.parentId,
      level: row.level,
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
      lawRevisionId: oldRevisionId,
      stableNodeKey: row.stableNodeKey,
      durableNodeKey: row.durableNodeKey,
      contentChecksum: row.contentChecksum,
      bodyChecksum: row.bodyChecksum,
    })),
  });
  const oldArticleId = oldRows[0]!.id;

  // LawRefreshRun
  await prisma.lawRefreshRun.create({
    data: {
      id: runId,
      targetDate,
      trigger: "manual",
      status: "running",
      packageId,
    },
  });

  // LawRefreshLawResult
  await prisma.lawRefreshLawResult.create({
    data: {
      id: runResultId,
      runId,
      lawId,
      previousRevisionId: oldRevisionId,
      status: "unchanged",
      phase: "checking",
    },
  });

  const candidateInput: StageCandidateRevisionInput = {
    lawId,
    runId,
    runResultId,
    officialVersionKey: `${TEST_PREFIX}candidate-${runSuffix}`,
    candidateDocument: candidateDoc,
    signedManifest: {
      manifest: {
        runId,
        targetDate: "2026-08-04",
        laws: [
          {
            lawId,
            from: oldRevisionId,
            to: candidateRevisionIdPlaceholder,
            xmlChecksum: "d".repeat(64),
          },
        ],
      },
      manifestChecksum: "e".repeat(64),
      signature: "test-candidate-signature",
      signerKeyId: `${TEST_PREFIX}signer-${runSuffix}`,
    },
    egovLawId: TEST_EGOV_LAW_ID,
    sourceUpdatedAt: effectiveFrom,
    fetchedAt: now,
    sourceUrl: `https://example.invalid/candidate-${runSuffix}`,
    xmlStorageKey: `${TEST_PREFIX}candidate-${runSuffix}.xml`,
    xmlChecksum: "d".repeat(64),
    effectiveFrom,
    mappings: [],
    rangeResolutions: [],
  };

  const syncMetadata = {
    observedVersionKey: candidateInput.officialVersionKey,
    egovUpdatedAt: effectiveFrom,
  };

  const activationInput: Omit<ActivateCandidateRevisionInput, "candidateRevisionId"> = {
    lawId,
    previousRevisionId: oldRevisionId,
    runResultId,
    mappings: [],
    rangeResolutions: [],
    sync: syncMetadata,
  };

  const cleanup = async (): Promise<void> => {
    // 外部キー制約の順序に従って削除:
    // LawSyncState → ArticleRevisionMapping → Article → LawBookEntryRangeResolution
    // → LawRefreshLawResult → LawRefreshRun → LawRevision → LawPackage → Law
    await prisma.lawSyncState.deleteMany({ where: { lawId } }).catch(() => {});
    await prisma.articleRevisionMapping.deleteMany({ where: { lawId } }).catch(() => {});
    // 候補 Revision の Article も含めて全削除
    await prisma.article.deleteMany({ where: { lawId } }).catch(() => {});
    await prisma.lawBookEntryRangeResolution.deleteMany({
      where: { lawRevision: { lawId } },
    }).catch(() => {});
    await prisma.lawRefreshLawResult.deleteMany({ where: { lawId } }).catch(() => {});
    await prisma.lawRefreshRun.deleteMany({ where: { id: runId } }).catch(() => {});
    await prisma.lawRevision.deleteMany({ where: { lawId } }).catch(() => {});
    await prisma.lawPackage.deleteMany({ where: { id: packageId } }).catch(() => {});
    await prisma.law.deleteMany({ where: { id: lawId } }).catch(() => {});
  };

  return {
    lawId,
    oldRevisionId,
    otherRevisionId,
    oldArticleId,
    candidateInput,
    activationInput,
    runResultId,
    runId,
    syncMetadata,
    cleanup,
  };
}
