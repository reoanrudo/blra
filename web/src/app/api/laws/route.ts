import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  computeCorpusVersion,
  type LawListItem,
} from "@/lib/law-book/law-list";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";

interface LawListQueryRow {
  id: string;
  name: string;
  shortName: string | null;
  printedTitle: string;
  displayOrder: number;
  inclusionMode: string;
  printedPage: number;
  firstArticleId: string;
  currentRevisionId: string | null;
  repealStatus: string | null;
  repealDate: string | null;
}

export async function GET() {
  const firstArticleScope = currentLawBookArticleScopeSql("a", "e", "l");
  const rows = await prisma.$queryRawUnsafe<LawListQueryRow[]>(
    `SELECT
       l."id",
       l."name",
       l."shortName",
       e."printedTitle",
       e."displayOrder",
       e."inclusionMode"::text AS "inclusionMode",
       e."printedPage",
       first_article."id" AS "firstArticleId",
       l."currentRevisionId",
       sync."repealStatus",
       to_char(sync."repealDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "repealDate"
     FROM "LawBookEntry" e
     JOIN "LawBookEdition" edition ON edition."id" = e."editionId"
     JOIN "Law" l ON l."id" = e."lawId"
     LEFT JOIN "LawSyncState" sync ON sync."lawId" = l."id"
     JOIN LATERAL (
       SELECT a."id"
       FROM "Article" a
       WHERE a."lawId" = l."id"
         AND a."deletedAt" IS NULL
         AND ${firstArticleScope}
       ORDER BY a."sortOrder", a."id"
       LIMIT 1
     ) first_article ON true
     WHERE edition."editionKey" = $1
       AND e."verificationStatus" IN ('structure_validated', 'link_validated', 'approved')
       AND l."currentRevisionId" IS NOT NULL
     ORDER BY e."displayOrder"`,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  const laws: LawListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    printedTitle: row.printedTitle,
    displayOrder: row.displayOrder,
    inclusionMode: row.inclusionMode as "full" | "excerpt",
    printedPage: row.printedPage,
    firstArticleId: row.firstArticleId,
    repealStatus: row.repealStatus,
    repealDate: row.repealDate,
  }));

  // 計画書 Task 14 Step 5: 掲載順の (lawId, currentRevisionId) を SHA-256 化。
  // 法令更新で値が変わりクライアントcacheを失効させる。
  const corpusVersion = await computeCorpusVersion(rows);

  // 設計書§4.1: 法令一覧は editionKey と法令配列を返す。
  // Task 14: corpusVersion を追加し、cache失効の根拠とする。
  return NextResponse.json({
    editionKey: CURRENT_LAW_BOOK_EDITION_KEY,
    corpusVersion,
    laws,
  });
}
