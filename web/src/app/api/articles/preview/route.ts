import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";

interface PreviewResult {
  id: string;
  articleNumberNormalized: string | null;
  articleNumber: string | null;
  caption: string | null;
  textExcerpt: string | null;
  lawName: string;
  lawShortName: string | null;
  egovLawId: string;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const lawBookScope = lawBookArticleScopeSql("a", "e");
  const rows = await prisma.$queryRawUnsafe<PreviewResult[]>(
    `SELECT
      a.id,
      a."articleNumberNormalized",
      a."articleNumber",
      a."caption",
      left(a."text", 300) AS "textExcerpt",
      l."name" AS "lawName",
      l."shortName" AS "lawShortName",
      l."egovLawId"
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l.id
    JOIN "LawBookEntry" e
      ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE a.id = $1
      AND a."deletedAt" IS NULL
      AND edition."editionKey" = $2
      AND ${lawBookScope}
    LIMIT 1`,
    id,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
