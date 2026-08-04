import type { PrismaClient } from "@prisma/client";

const EDITION_KEY = "ksk-2026";
const CIVIL_CODE_EGOV_ID = "129AC0000000089";
const VERIFIED_BY = "operator:ocr-20260728";

interface ArticleEvidence {
  articleNumberNormalized: string;
  evidenceFiles: string[];
}

interface ArticleRow {
  entryId: string;
  stableNodeKey: string;
  articleNumberNormalized: string;
}

const SOURCE_IMAGES = {
  a: "1785240027901.jpg",
  b: "1785240027879.jpg",
  c: "1785240027853.jpg",
  d: "1785240027828.jpg",
  e: "1785240027801.jpg",
  f: "1785240027745.jpg",
  g: "1785240158168.jpg",
  h: "1785240158129.jpg",
} as const;

function evidence(
  articleNumberNormalized: string,
  ...evidenceFiles: string[]
): ArticleEvidence {
  return { articleNumberNormalized, evidenceFiles };
}

/** 目視とOCRで二重確認した掲載順。 */
export const CIVIL_CODE_ARTICLE_EVIDENCE: ArticleEvidence[] = [
  evidence("1", SOURCE_IMAGES.a),
  evidence("206", SOURCE_IMAGES.a),
  evidence("207", SOURCE_IMAGES.a),
  evidence("209", SOURCE_IMAGES.a),
  evidence("210", SOURCE_IMAGES.a),
  evidence("211", SOURCE_IMAGES.a),
  evidence("212", SOURCE_IMAGES.a),
  evidence("213", SOURCE_IMAGES.a, SOURCE_IMAGES.b),
  evidence("213の2", SOURCE_IMAGES.b),
  evidence("213の3", SOURCE_IMAGES.b),
  evidence("214", SOURCE_IMAGES.b),
  evidence("215", SOURCE_IMAGES.b),
  evidence("216", SOURCE_IMAGES.b),
  evidence("217", SOURCE_IMAGES.b),
  evidence("218", SOURCE_IMAGES.b),
  evidence("219", SOURCE_IMAGES.b),
  evidence("220", SOURCE_IMAGES.b, SOURCE_IMAGES.c),
  evidence("221", SOURCE_IMAGES.c),
  evidence("222", SOURCE_IMAGES.c),
  evidence("223", SOURCE_IMAGES.c),
  evidence("224", SOURCE_IMAGES.c),
  evidence("225", SOURCE_IMAGES.c),
  evidence("226", SOURCE_IMAGES.c),
  evidence("227", SOURCE_IMAGES.c),
  evidence("228", SOURCE_IMAGES.c),
  evidence("229", SOURCE_IMAGES.c),
  evidence("230", SOURCE_IMAGES.c),
  evidence("231", SOURCE_IMAGES.c),
  evidence("232", SOURCE_IMAGES.c),
  evidence("233", SOURCE_IMAGES.c, SOURCE_IMAGES.d),
  evidence("234", SOURCE_IMAGES.d),
  evidence("235", SOURCE_IMAGES.d),
  evidence("236", SOURCE_IMAGES.d),
  evidence("237", SOURCE_IMAGES.d),
  evidence("238", SOURCE_IMAGES.d),
  evidence("264の2", SOURCE_IMAGES.d),
  evidence("264の3", SOURCE_IMAGES.d),
  evidence("264の8", SOURCE_IMAGES.d, SOURCE_IMAGES.e),
  evidence("264の9", SOURCE_IMAGES.e),
  evidence("264の10", SOURCE_IMAGES.e),
  evidence("264の14", SOURCE_IMAGES.e),
  evidence("415", SOURCE_IMAGES.e),
  evidence("541", SOURCE_IMAGES.f),
  evidence("542", SOURCE_IMAGES.f),
  evidence("543", SOURCE_IMAGES.f),
  evidence("559", SOURCE_IMAGES.f),
  evidence("562", SOURCE_IMAGES.f),
  evidence("563", SOURCE_IMAGES.f, SOURCE_IMAGES.g),
  evidence("564", SOURCE_IMAGES.g),
  evidence("565", SOURCE_IMAGES.g),
  evidence("566", SOURCE_IMAGES.g),
  evidence("567", SOURCE_IMAGES.g),
  evidence("632", SOURCE_IMAGES.g),
  evidence("633", SOURCE_IMAGES.g),
  evidence("634", SOURCE_IMAGES.g),
  evidence("635", SOURCE_IMAGES.h),
  evidence("636", SOURCE_IMAGES.h),
  evidence("637", SOURCE_IMAGES.h),
  evidence("641", SOURCE_IMAGES.h),
  evidence("642", SOURCE_IMAGES.h),
  evidence("709", SOURCE_IMAGES.h),
];

export async function seedVerifiedExcerptRanges(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<ArticleRow[]>(
    `SELECT
       entry.id AS "entryId",
       article."stableNodeKey",
       article."articleNumberNormalized"
     FROM "LawBookEntry" entry
     JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
     JOIN "Law" law ON law.id = entry."lawId"
     JOIN "Article" article
       ON article."lawId" = entry."lawId"
      AND article."lawRevisionId" = entry."lawRevisionId"
     WHERE edition."editionKey" = $1
       AND law."egovLawId" = $2
       AND article."deletedAt" IS NULL
       AND article.level = 'article'`,
    EDITION_KEY,
    CIVIL_CODE_EGOV_ID,
  );
  if (rows.length === 0) throw new Error("民法（抄）の2026年版Articleが見つかりません");

  const entryIds = new Set(rows.map((row) => row.entryId));
  if (entryIds.size !== 1) throw new Error(`民法（抄）のEntryが一意ではありません: ${entryIds.size}`);
  const entryId = rows[0].entryId;
  const articleByNumber = new Map(rows.map((row) => [row.articleNumberNormalized, row]));
  const missing = CIVIL_CODE_ARTICLE_EVIDENCE.filter(
    (item) => !articleByNumber.has(item.articleNumberNormalized),
  );
  if (missing.length > 0) {
    throw new Error(`民法（抄）の公式Articleが不足しています: ${missing.map((item) => item.articleNumberNormalized).join(", ")}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM "LawBookEntryRange"
       WHERE "lawBookEntryId" = $1 AND "rangeType" = 'article'`,
      entryId,
    );

    for (const [index, item] of CIVIL_CODE_ARTICLE_EVIDENCE.entries()) {
      const article = articleByNumber.get(item.articleNumberNormalized)!;
      const citation = `民法第${item.articleNumberNormalized}条`;
      await tx.$executeRawUnsafe(
        `INSERT INTO "LawBookEntryRange" (
           id, "lawBookEntryId", "rangeType", "startStableNodeKey", "endStableNodeKey",
           "officialCitationStart", "officialCitationEnd", "inclusionReason", "sortOrder",
           "verificationStatus", "verifiedAt", "verifiedBy", "createdAt", "updatedAt"
         ) VALUES ($1, $2, 'article', $3, $3, $4, $4, $5, $6,
           'source_verified', CURRENT_TIMESTAMP, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        `range_2026_civil_${item.articleNumberNormalized.replaceAll("の", "_")}`,
        entryId,
        article.stableNodeKey,
        citation,
        `検証画像（${item.evidenceFiles.join(", ")}）`,
        index + 1,
        VERIFIED_BY,
      );
    }

    await tx.$executeRawUnsafe(
      `UPDATE "LawBookEntry"
       SET "verificationNote" = $2,
           "verifiedAt" = CURRENT_TIMESTAMP,
           "verifiedBy" = $3,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      entryId,
      "収録範囲照合済み。掲載61条を個別Range化。第638条から第640条までは原典上「削除」表示のためArticle Rangeなし。",
      VERIFIED_BY,
    );
  });

  return CIVIL_CODE_ARTICLE_EVIDENCE.length;
}
