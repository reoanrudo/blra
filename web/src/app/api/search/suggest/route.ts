import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

interface SuggestItem {
  kind: "history" | "caption" | "articleNumber";
  label: string;
  articleId?: string;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || null;

  if (!q) {
    return NextResponse.json({ suggestions: [] });
  }

  const userId = await getOrCreateDefaultUser();
  const suggestions: SuggestItem[] = [];
  const seen = new Set<string>();

  // 1. Recent search history (last 5)
  const history = await prisma.userActivity.findMany({
    where: { userId, type: "search", query: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const h of history) {
    if (h.query && h.query.includes(q) && !seen.has(h.query)) {
      seen.add(h.query);
      suggestions.push({ kind: "history", label: h.query });
    }
  }

  const remaining = 10 - suggestions.length;
  if (remaining <= 0) {
    return NextResponse.json({ suggestions });
  }

  // 2. Caption prefix match
  const escaped = escapeLike(q);
  const prefixPattern = `${escaped}%`;
  const lawBookScope = currentLawBookArticleScopeSql("a", "e", "l");
  const captionRows = await prisma.$queryRawUnsafe<{ id: string; caption: string }[]>(
    `SELECT a."id", a."caption"
     FROM "Article" a
     JOIN "Law" l ON a."lawId" = l.id
     JOIN "LawBookEntry" e
       ON e."lawId" = l.id
      AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     WHERE edition."editionKey" = $2
       AND ${lawBookScope}
       AND a."caption" LIKE $1
     ORDER BY a."sortOrder"
     LIMIT $3`,
    prefixPattern,
    CURRENT_LAW_BOOK_EDITION_KEY,
    remaining,
  );
  for (const r of captionRows) {
    if (r.caption && !seen.has(r.caption)) {
      seen.add(r.caption);
      suggestions.push({ kind: "caption", label: r.caption, articleId: r.id });
    }
  }

  const stillRemaining = 10 - suggestions.length;
  if (stillRemaining <= 0) {
    return NextResponse.json({ suggestions });
  }

  // 3. Article number prefix match
  const numRows = await prisma.$queryRawUnsafe<{
    id: string;
    articleNumberNormalized: string;
    articleNumber: string;
  }[]>(
    `SELECT a."id", a."articleNumberNormalized", a."articleNumber"
     FROM "Article" a
     JOIN "Law" l ON a."lawId" = l.id
     JOIN "LawBookEntry" e
       ON e."lawId" = l.id
      AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     WHERE edition."editionKey" = $2
       AND ${lawBookScope}
       AND a."level" = 'article'
       AND a."articleNumberNormalized" LIKE $1
     ORDER BY a."sortOrder"
     LIMIT $3`,
    prefixPattern,
    CURRENT_LAW_BOOK_EDITION_KEY,
    stillRemaining,
  );
  for (const r of numRows) {
    const label = `第${r.articleNumber ?? r.articleNumberNormalized}条`;
    if (!seen.has(label)) {
      seen.add(label);
      suggestions.push({ kind: "articleNumber", label, articleId: r.id });
    }
  }

  return NextResponse.json({ suggestions, projectId });
}
