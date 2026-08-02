import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { LawListItem } from "@/lib/law-book/law-list";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";

export async function GET() {
  const firstArticleScope = lawBookArticleScopeSql("a", "e");
  const rows = await prisma.$queryRawUnsafe<Omit<LawListItem, "isCurrent">[]>(
    `SELECT
       l."id",
       l."name",
       l."shortName",
       e."printedTitle",
       e."displayOrder",
       e."inclusionMode"::text AS "inclusionMode",
       e."printedPage",
       first_article."id" AS "firstArticleId"
     FROM "LawBookEntry" e
     JOIN "LawBookEdition" edition ON edition."id" = e."editionId"
     JOIN "Law" l ON l."id" = e."lawId"
     JOIN LATERAL (
       SELECT a."id"
       FROM "Article" a
       WHERE a."lawId" = l."id"
         AND a."lawRevisionId" = e."lawRevisionId"
         AND a."deletedAt" IS NULL
         AND ${firstArticleScope}
       ORDER BY a."sortOrder", a."id"
       LIMIT 1
     ) first_article ON true
     WHERE edition."editionKey" = $1
       AND e."verificationStatus" IN ('structure_validated', 'link_validated', 'approved')
     ORDER BY e."displayOrder"`,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  // 設計書§4.1: 法令一覧は editionKey と法令配列を返す。
  // isCurrentは廃止: クライアント側で currentLawId を別途管理する。
  return NextResponse.json({
    editionKey: CURRENT_LAW_BOOK_EDITION_KEY,
    laws: rows,
  });
}
