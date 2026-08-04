import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const prefix = request.nextUrl.searchParams.get("prefix");

  if (!q) {
    return NextResponse.json({ articles: [] });
  }

  const conditions: string[] = [
    `a."level" = 'article'`,
    `(a."articleNumber" = $1 OR a."articleNumberNormalized" = $1)`,
  ];

  if (prefix === "法") {
    conditions.push(`l."category" = 'law'`);
  } else if (prefix === "令") {
    conditions.push(`l."category" = 'cabinet_order'`);
  }

  const whereClause = conditions.join(" AND ");
  const lawBookScope = currentLawBookArticleScopeSql("a", "e", "l");

  const articles = await prisma.$queryRawUnsafe<
    {
      id: string;
      articleNumber: string | null;
      caption: string | null;
      lawName: string;
      lawShortName: string | null;
    }[]
  >(
    `SELECT
      a.id,
      a."articleNumber",
      a.caption,
      l."name" AS "lawName",
      l."shortName" AS "lawShortName"
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l.id
    JOIN "LawBookEntry" e
      ON e."lawId" = l.id
     AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE ${whereClause}
      AND edition."editionKey" = $2
      AND ${lawBookScope}
    ORDER BY a."sortOrder"
    LIMIT 20`,
    q,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  return NextResponse.json({ articles });
}
