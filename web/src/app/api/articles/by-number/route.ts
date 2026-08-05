import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const prefix = request.nextUrl.searchParams.get("prefix");
  const lawId = request.nextUrl.searchParams.get("lawId")?.trim();

  if (!q) {
    return NextResponse.json({ articles: [] });
  }

  const conditions: string[] = [
    `a."deletedAt" IS NULL`,
    `a."level" = 'article'`,
    `(a."articleNumber" = $1 OR a."articleNumberNormalized" = $1)`,
  ];

  const params: (string | number)[] = [q];
  let paramIdx = 2;

  if (lawId) {
    conditions.push(`a."lawId" = $${paramIdx}`);
    params.push(lawId);
    paramIdx++;
  }

  if (prefix === "法") {
    conditions.push(`l."category" = 'law'`);
  } else if (prefix === "令") {
    conditions.push(`l."category" = 'cabinet_order'`);
  }

  const whereClause = conditions.join(" AND ");
  const lawBookScope = lawBookArticleScopeSql("a", "e");

  const articles = await prisma.$queryRawUnsafe<
    {
      id: string;
      lawId: string;
      articleNumber: string | null;
      caption: string | null;
      lawName: string;
      lawShortName: string | null;
    }[]
  >(
    `SELECT
      a.id,
      a."lawId",
      a."articleNumber",
      a."caption",
      l."name" AS "lawName",
      l."shortName" AS "lawShortName"
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l.id
    JOIN "LawBookEntry" e
      ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE ${whereClause}
      AND edition."editionKey" = $${paramIdx}
      AND ${lawBookScope}
    ORDER BY a."sortOrder"
    LIMIT 20`,
    ...params,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  return NextResponse.json({ articles });
}
