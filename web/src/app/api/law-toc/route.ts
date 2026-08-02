import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";
import type { TocNode } from "@/lib/article/toc-tree";
import { groupSupplementaryProvisions } from "@/lib/article/toc-supplements";

export async function GET(request: NextRequest) {
  const lawId = request.nextUrl.searchParams.get("lawId")?.trim();

  if (!lawId) {
    return NextResponse.json({ error: "lawId is required" }, { status: 400 });
  }

  const lawBookScope = lawBookArticleScopeSql("toc_tree", "entry");

  const rows = await prisma.$queryRawUnsafe<(TocNode & { lawRevisionId: string })[]>(
    `WITH RECURSIVE toc_tree AS (
      SELECT a.id, a."parentId", a.level, a.title, a."articleNumber",
             a.caption, a."sortOrder", 0 AS depth,
             ARRAY[a."sortOrder"] AS path,
             split_part(a.text, E'\n', 1) AS "textFirstLine",
             a."paragraphNumber", a."stableNodeKey", a."lawRevisionId"
      FROM "Article" a
      WHERE a."lawId" = $1
        AND EXISTS (
          SELECT 1
          FROM "LawBookEntry" e
          JOIN "LawBookEdition" edition ON edition.id = e."editionId"
          WHERE edition."editionKey" = $2
            AND e."lawId" = a."lawId"
            AND e."lawRevisionId" = a."lawRevisionId"
        )
        AND a."parentId" IS NULL
        AND a."deletedAt" IS NULL
      UNION ALL
      SELECT a.id, a."parentId", a.level, a.title, a."articleNumber",
             a.caption, a."sortOrder", t.depth + 1,
             t.path || a."sortOrder",
             split_part(a.text, E'\n', 1) AS "textFirstLine",
             a."paragraphNumber", a."stableNodeKey", a."lawRevisionId"
      FROM "Article" a
      INNER JOIN toc_tree t ON a."parentId" = t.id
      WHERE a."deletedAt" IS NULL
        AND (
          a.level IN (
            'chapter', 'section', 'subsection', 'article',
            'appdx_table', 'table_struct', 'table',
            'suppl_provision'
          )
          OR (a.level = 'paragraph' AND t.level = 'suppl_provision')
        )
    )
    SELECT toc_tree.id, toc_tree."parentId", toc_tree.level, toc_tree.title,
           toc_tree."articleNumber", toc_tree.caption, toc_tree."sortOrder",
           toc_tree.depth, toc_tree.path, toc_tree."textFirstLine", toc_tree."paragraphNumber",
           toc_tree."lawRevisionId"
    FROM toc_tree
    JOIN "LawBookEntry" entry
      ON entry."lawId" = $1 AND entry."lawRevisionId" = toc_tree."lawRevisionId"
    JOIN "LawBookEdition" selected_edition ON selected_edition.id = entry."editionId"
    WHERE selected_edition."editionKey" = $2
      AND ${lawBookScope}
    ORDER BY path`,
    lawId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  const groupedRows = groupSupplementaryProvisions(rows, lawId);
  // 目次API応答へ lawRevisionId を含める（設計書§4.2: Revision変更検知用）
  const lawRevisionId = rows[0]?.lawRevisionId ?? null;

  return NextResponse.json(
    { lawRevisionId, editionKey: CURRENT_LAW_BOOK_EDITION_KEY, nodes: groupedRows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
