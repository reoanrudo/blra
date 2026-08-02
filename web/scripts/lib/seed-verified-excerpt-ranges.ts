import type { PrismaClient } from "@prisma/client";

const EDITION_KEY = "ksk-2026";
const CIVIL_CODE_EGOV_ID = "129AC0000000089";
const VERIFIED_BY = "operator:ocr-20260728";

interface PrintedArticleEvidence {
  articleNumberNormalized: string;
  printedPages: number[];
  evidenceFiles: string[];
}

interface ArticleRow {
  entryId: string;
  stableNodeKey: string;
  articleNumberNormalized: string;
}

const pageEvidence = {
  1242: "1785240027901.jpg",
  1243: "1785240027879.jpg",
  1244: "1785240027853.jpg",
  1245: "1785240027828.jpg",
  1246: "1785240027801.jpg",
  1247: "1785240027745.jpg",
  1248: "1785240158168.jpg",
  1249: "1785240158129.jpg",
} as const;

function evidence(articleNumberNormalized: string, ...printedPages: Array<keyof typeof pageEvidence>): PrintedArticleEvidence {
  return {
    articleNumberNormalized,
    printedPages,
    evidenceFiles: printedPages.map((page) => pageEvidence[page]),
  };
}

/** 紙面p.1242〜1249を目視とOCRで二重確認した掲載順。 */
export const CIVIL_CODE_PRINTED_ARTICLES: PrintedArticleEvidence[] = [
  evidence("1", 1242),
  evidence("206", 1242),
  evidence("207", 1242),
  evidence("209", 1242),
  evidence("210", 1242),
  evidence("211", 1242),
  evidence("212", 1242),
  evidence("213", 1242, 1243),
  evidence("213の2", 1243),
  evidence("213の3", 1243),
  evidence("214", 1243),
  evidence("215", 1243),
  evidence("216", 1243),
  evidence("217", 1243),
  evidence("218", 1243),
  evidence("219", 1243),
  evidence("220", 1243, 1244),
  evidence("221", 1244),
  evidence("222", 1244),
  evidence("223", 1244),
  evidence("224", 1244),
  evidence("225", 1244),
  evidence("226", 1244),
  evidence("227", 1244),
  evidence("228", 1244),
  evidence("229", 1244),
  evidence("230", 1244),
  evidence("231", 1244),
  evidence("232", 1244),
  evidence("233", 1244, 1245),
  evidence("234", 1245),
  evidence("235", 1245),
  evidence("236", 1245),
  evidence("237", 1245),
  evidence("238", 1245),
  evidence("264の2", 1245),
  evidence("264の3", 1245),
  evidence("264の8", 1245, 1246),
  evidence("264の9", 1246),
  evidence("264の10", 1246),
  evidence("264の14", 1246),
  evidence("415", 1246),
  evidence("541", 1247),
  evidence("542", 1247),
  evidence("543", 1247),
  evidence("559", 1247),
  evidence("562", 1247),
  evidence("563", 1247, 1248),
  evidence("564", 1248),
  evidence("565", 1248),
  evidence("566", 1248),
  evidence("567", 1248),
  evidence("632", 1248),
  evidence("633", 1248),
  evidence("634", 1248),
  evidence("635", 1249),
  evidence("636", 1249),
  evidence("637", 1249),
  evidence("641", 1249),
  evidence("642", 1249),
  evidence("709", 1249),
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
  const missing = CIVIL_CODE_PRINTED_ARTICLES.filter(
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

    for (const [index, item] of CIVIL_CODE_PRINTED_ARTICLES.entries()) {
      const article = articleByNumber.get(item.articleNumberNormalized)!;
      const citation = `民法第${item.articleNumberNormalized}条`;
      const pageLabel = item.printedPages.length === 1
        ? `p.${item.printedPages[0]}`
        : `p.${item.printedPages[0]}-${item.printedPages[item.printedPages.length - 1]}`;
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
        `紙面${pageLabel}（${item.evidenceFiles.join(", ")}）`,
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
      "紙面p.1242-1249照合済み。掲載61条を個別Range化。第638条から第640条までは紙面上『削除』表示のためArticle Rangeなし。",
      VERIFIED_BY,
    );
  });

  return CIVIL_CODE_PRINTED_ARTICLES.length;
}
