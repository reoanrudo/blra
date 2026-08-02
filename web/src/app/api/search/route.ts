import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordSearch } from "@/lib/system/activity";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function makeSnippet(text: string, term: string, maxLen = 150): string {
  const idx = text.indexOf(term);
  if (idx === -1) {
    // Fallback: term not found directly, return beginning of text
    const escaped = escapeHtml(text.slice(0, maxLen));
    return escaped + (text.length > maxLen ? "…" : "");
  }
  const half = Math.floor((maxLen - term.length) / 2);
  let start = Math.max(0, idx - half);
  let end = Math.min(text.length, idx + term.length + half);
  // Adjust to word boundaries (Japanese-safe: just avoid cutting mid-character)
  if (start > 0) start = Math.max(0, start);
  if (end < text.length) end = Math.min(text.length, end);

  const prefix = escapeHtml(text.slice(start, idx));
  const highlighted = escapeHtml(text.slice(idx, idx + term.length));
  const suffix = escapeHtml(text.slice(idx + term.length, end));

  let snippet = "";
  if (start > 0) snippet += "…";
  snippet += prefix + "<mark>" + highlighted + "</mark>" + suffix;
  if (end < text.length) snippet += "…";
  return snippet;
}

interface SearchResultRow {
  id: string;
  articleNumberNormalized: string | null;
  caption: string | null;
  text: string | null;
  lawName: string;
  lawShortName: string | null;
  matchSource: "caption" | "text";
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || null;

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const escaped = escapeLike(q);
  const likePattern = `%${escaped}%`;
  const lawBookScope = lawBookArticleScopeSql("a", "e");

  const rows = await prisma.$queryRawUnsafe<SearchResultRow[]>(
    `SELECT
      a."id",
      a."articleNumberNormalized",
      COALESCE(a."caption", a."title") AS "caption",
      a."text",
      l."name" AS "lawName",
      l."shortName" AS "lawShortName",
      CASE
        WHEN a."caption" LIKE $1 OR a."title" LIKE $1 THEN 'caption'
        ELSE 'text'
      END AS "matchSource"
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l."id"
    JOIN "LawBookEntry" e
      ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE a."deletedAt" IS NULL
      AND edition."editionKey" = $2
      AND ${lawBookScope}
      AND (a."text" LIKE $1 OR a."caption" LIKE $1 OR a."title" LIKE $1)
    ORDER BY
      CASE WHEN a."caption" LIKE $1 OR a."title" LIKE $1 THEN 0 ELSE 1 END,
      a."sortOrder"
    LIMIT 20`,
    likePattern,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  const results = rows.map((row) => {
    const matchTerm = q; // Use original query for snippet/sorting
    const sourceText = row.matchSource === "caption" && row.caption ? row.caption : (row.text ?? "");
    const snippet = sourceText ? makeSnippet(sourceText, matchTerm) : "";

    return {
      id: row.id,
      articleNumberNormalized: row.articleNumberNormalized,
      caption: row.caption,
      textSnippet: snippet,
      lawName: row.lawName,
      lawShortName: row.lawShortName,
      matchSource: row.matchSource,
    };
  });

  // Fire-and-forget: record search activity (don't block response)
  recordSearch(q, results.length).catch(() => {});

  return NextResponse.json({ results, projectId });
}
