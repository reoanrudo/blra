import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { materializeArticleRows, parseLawXml } from "@/lib/law-refresh/parse-law-xml";
import {
  RefreshRepository,
  type ActivateCandidateRevisionInput,
  type StageCandidateRevisionInput,
} from "@/lib/law-refresh/refresh-repository";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

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
  /**
   * activateCandidate オプション付与時に設定される、
   * 候補 Revision を activate したあとの情報。
   * 未指定時は undefined。
   */
  activated?: {
    /** activate 済み候補 Revision ID（Law.currentRevisionId と一致）。 */
    candidateRevisionId: string;
    /** 候補 Revision に属する最初の Article ID。 */
    candidateArticleId: string;
    /**
     * LawBookEntry が指している Revision ID（activate 前に作成したため旧版のまま）。
     * read scope テストは Entry が旧版を指していても公開本文が current になることを検証する。
     */
    entryRevisionId: string;
    /** 作成した LawBookEntry の id。 */
    lawBookEntryId: string;
  };
}

/** createCurrentLawRefreshFixture へ渡すオプション。 */
export interface CreateCurrentLawRefreshFixtureOptions {
  /**
   * true の場合、テスト用 LawBookEntry（ksk-2026 所属・旧 Revision 指向）を作成し、
   * stageCandidateRevision → activateCandidateRevision で候補 Revision を current へ切り替える。
   * activated フィールドへ候補 Revision 情報が格納される。
   * LawBookEntry.lawRevisionId は旧 Revision のまま更新しない（read scope テストの前提）。
   */
  activateCandidate?: boolean;
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
  options: CreateCurrentLawRefreshFixtureOptions = {},
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

  // oldRevision の Article を作成（並列テストでID衝突しないよう runSuffix を含める）
  const oldRows = materializeArticleRows(oldDoc, `${TEST_PREFIX}art-old-${runSuffix}-`);
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
      tableMetadata: row.tableMetadata as never,
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

  // candidateInput の egovLawId / xmlChecksum は runSuffix ごとに一意にする。
  // stageCandidateRevision が Article ID を `art_${egovLower}_${checksumPrefix}_` で生成するため、
  // 固定値だと並列テストでID衝突する。
  const candidateEgovLawId = `${TEST_EGOV_LAW_ID}-${runSuffix.slice(0, 8)}`;
  const candidateChecksum = `${runSuffix.replace(/-/g, "").padEnd(64, "d").slice(0, 64)}`;

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
            xmlChecksum: candidateChecksum,
          },
        ],
      },
      manifestChecksum: "e".repeat(64),
      signature: "test-candidate-signature",
      signerKeyId: `${TEST_PREFIX}signer-${runSuffix}`,
    },
    egovLawId: candidateEgovLawId,
    sourceUpdatedAt: effectiveFrom,
    fetchedAt: now,
    sourceUrl: `https://example.invalid/candidate-${runSuffix}`,
    xmlStorageKey: `${TEST_PREFIX}candidate-${runSuffix}.xml`,
    xmlChecksum: candidateChecksum,
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
    diffSummary: null,
  };

  // activateCandidate オプション: ksk-2026 Edition 所属の LawBookEntry（旧 Revision 指向）を作成し、
  // stage → activate で候補 Revision を current へ切り替える。
  // Entry.lawRevisionId は旧 Revision のまま更新しない（read scope テストの前提）。
  let activated: CurrentLawRefreshFixture["activated"];
  let lawBookEntryId: string | undefined;
  if (options.activateCandidate) {
    // ksk-2026 Edition を取得（存在しない場合はテスト環境ではないためスキップ）
    const edition = await prisma.lawBookEdition.findUnique({
      where: { editionKey: CURRENT_LAW_BOOK_EDITION_KEY },
      select: { id: true },
    });
    if (!edition) {
      throw new Error(
        `LawBookEdition "${CURRENT_LAW_BOOK_EDITION_KEY}" が存在しません。seed を実行してください。`,
      );
    }

    // LawBookEntry を旧 Revision へ紐付けて作成（displayOrder は一意制約回避のため乱数由来の大きい値）
    lawBookEntryId = `${TEST_PREFIX}entry-${runSuffix}`;
    await prisma.lawBookEntry.create({
      data: {
        id: lawBookEntryId,
        editionId: edition.id,
        lawId,
        lawRevisionId: oldRevisionId,
        displayOrder: 900000 + Math.floor(Math.random() * 100000),
        inclusionMode: "full",
        printedTitle: `${TEST_PREFIX}法令`,
        catalogSourceLocator: "test",
        verificationStatus: "approved",
        verifiedAt: now,
      },
    });

    // stage → activate で候補 Revision を current へ
    const repository = new RefreshRepository({ prisma });
    const staged = await repository.stageCandidateRevision(candidateInput);
    await repository.activateCandidateRevision({
      ...activationInput,
      candidateRevisionId: staged.revisionId,
    });

    // 候補 Revision の最初の Article を取得（read scope assert 用）
    const candidateArticle = await prisma.article.findFirst({
      where: { lawRevisionId: staged.revisionId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });

    activated = {
      candidateRevisionId: staged.revisionId,
      candidateArticleId: candidateArticle?.id ?? "",
      entryRevisionId: oldRevisionId,
      lawBookEntryId,
    };
  }

  const cleanup = async (): Promise<void> => {
    // 外部キー制約の順序に従って削除:
    // LawSyncState → ArticleRevisionMapping → LawBookEntryRangeResolution
    // → LawBookEntryRange → LawBookEntry → Link → Article
    // → LawRefreshLawResult → LawRefreshRun → Law.currentRevisionId解除
    // → LawRevision → LawPackage → Law
    // LawBookEntry / LawBookEntryRange は lawId で一括削除し、テスト中断時の残留を防ぐ。
    await prisma.lawSyncState.deleteMany({ where: { lawId } });
    await prisma.articleRevisionMapping.deleteMany({ where: { lawId } });
    await prisma.lawBookEntryRangeResolution.deleteMany({
      where: { lawRevision: { lawId } },
    });
    await prisma.lawBookEntryRange.deleteMany({
      where: { lawBookEntry: { lawId } },
    });
    await prisma.lawBookEntry.deleteMany({ where: { lawId } });
    await prisma.link.deleteMany({
      where: {
        OR: [{ source: { lawId } }, { target: { lawId } }],
      },
    });
    // 候補 Revision の Article も含めて全削除
    await prisma.article.deleteMany({ where: { lawId } });
    await prisma.lawRefreshLawResult.deleteMany({ where: { lawId } });
    await prisma.lawRefreshRun.deleteMany({ where: { id: runId } });
    await prisma.law.updateMany({
      where: { id: lawId },
      data: { currentRevisionId: null },
    });
    await prisma.lawRevision.deleteMany({ where: { lawId } });
    await prisma.lawPackage.deleteMany({ where: { id: packageId } });
    await prisma.law.deleteMany({ where: { id: lawId } });
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
    activated,
  };
}
