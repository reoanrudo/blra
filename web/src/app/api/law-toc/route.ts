import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";
import type { TocNode } from "@/lib/article/toc-tree";
import { groupSupplementaryProvisions } from "@/lib/article/toc-supplements";

export async function GET(request: NextRequest) {
  const lawId = request.nextUrl.searchParams.get("lawId")?.trim();

  if (!lawId) {
    return NextResponse.json({ error: "lawId is required" }, { status: 400 });
  }

  // 外部クエリで全ノードへ current scope を適用するため、
  // CTE 側は current revision のドキュメントツリー全体を組み立てる（scope 判定は外部で行う）。
  // CTE 内部の article alias = a、外部クエリの CTE alias = toc_tree。
  const outerScope = currentLawBookArticleScopeSql("toc_tree", "entry", "law");

  const rows = await prisma.$queryRawUnsafe<(TocNode & { lawRevisionId: string })[]>(
    `WITH RECURSIVE toc_tree AS (
      SELECT a.id, a."parentId", a.level, a.title, a."articleNumber",
             a.caption, a."sortOrder", 0 AS depth,
             ARRAY[a."sortOrder"] AS path,
             split_part(a.text, E'\n', 1) AS "textFirstLine",
             a."paragraphNumber", a."stableNodeKey", a."durableNodeKey",
             a."deletedAt", a."lawRevisionId", a."lawId"
      FROM "Article" a
      JOIN "Law" root_law ON root_law.id = a."lawId"
      WHERE root_law.id = $1
        AND a."lawRevisionId" = root_law."currentRevisionId"
        AND a."parentId" IS NULL
        AND a."deletedAt" IS NULL
      UNION ALL
      SELECT a.id, a."parentId", a.level, a.title, a."articleNumber",
             a.caption, a."sortOrder", t.depth + 1,
             t.path || a."sortOrder",
             split_part(a.text, E'\n', 1) AS "textFirstLine",
             a."paragraphNumber", a."stableNodeKey", a."durableNodeKey",
             a."deletedAt", a."lawRevisionId", a."lawId"
      FROM "Article" a
      INNER JOIN toc_tree t ON a."parentId" = t.id
      WHERE a."deletedAt" IS NULL
        AND a."lawRevisionId" = t."lawRevisionId"
        AND (
          a.level IN (
            'chapter', 'section', 'subsection', 'article',
            'appdx_table'
          )
        )
    )
    SELECT toc_tree.id, toc_tree."parentId", toc_tree.level, toc_tree.title,
           toc_tree."articleNumber", toc_tree.caption, toc_tree."sortOrder",
           toc_tree.depth, toc_tree.path, toc_tree."textFirstLine", toc_tree."paragraphNumber",
           toc_tree."lawRevisionId"
    FROM toc_tree
    JOIN "Law" law ON law.id = toc_tree."lawId"
    JOIN "LawBookEntry" entry
      ON entry."lawId" = law.id
     AND entry."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
    JOIN "LawBookEdition" selected_edition ON selected_edition.id = entry."editionId"
    WHERE selected_edition."editionKey" = $2
      AND ${outerScope}
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
