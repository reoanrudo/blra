import { NextRequest, NextResponse } from "next/server";
import {
  getChapterWindow,
  getChapterArticlesPaginated,
} from "@/lib/article/chapter-window";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";

/**
 * 同一法令スクロールのscope単位段階読込API（設計書 §4.3）
 *
 * 初期ウィンドウ:
 *   GET /api/articles/chapter-window?articleId=<id>
 *   → 対象Articleを中心に前後5件（最大11件）。
 *
 * 追加取得:
 *   GET /api/articles/chapter-window?articleId=<id>&direction=before&cursor=<sortOrder>&scopeId=<scopeId>&limit=10
 *   GET /api/articles/chapter-window?articleId=<id>&direction=after&cursor=<sortOrder>&scopeId=<scopeId>&limit=10
 *
 * 応答:
 *   { articles, beforeCursor, afterCursor, chapterKey, lawRevisionId }
 *
 * lawRevisionId を含めることで、クライアント側でRevision不一致を検知してキャッシュを破棄できる。
 */
export async function GET(request: NextRequest) {
  const articleId = request.nextUrl.searchParams.get("articleId")?.trim();
  const direction = request.nextUrl.searchParams.get("direction"); // undefined | "before" | "after"
  const cursorRaw = request.nextUrl.searchParams.get("cursor");
  const scopeId = request.nextUrl.searchParams.get("scopeId")?.trim();
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 10, 1), 20) : 10;

  if (!articleId) {
    return NextResponse.json(
      { error: "articleId is required" },
      { status: 400 },
    );
  }

  // Article の lawRevisionId を取得（Revision識別子として応答へ含める）
  const lawBookScope = currentLawBookArticleScopeSql("a", "e", "l");
  const metaRows = await prisma.$queryRawUnsafe<
    Array<{ lawRevisionId: string }>
  >(
    `
    SELECT a."lawRevisionId"
    FROM "Article" a
    JOIN "Law" l ON l.id = a."lawId"
    JOIN "LawBookEntry" e
      ON e."lawId" = l.id
     AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE a.id = $1
      AND edition."editionKey" = $2
      AND ${lawBookScope}
    LIMIT 1
    `,
    articleId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  if (metaRows.length === 0) {
    return NextResponse.json(
      { error: "Article not found or out of scope" },
      { status: 404 },
    );
  }
  const lawRevisionId = metaRows[0]!.lawRevisionId;

  // ── 初期ウィンドウ ──
  if (!direction) {
    const result = await getChapterWindow(articleId);
    return NextResponse.json({
      articles: result.articles,
      beforeCursor: result.beforeCursor,
      afterCursor: result.afterCursor,
      chapterKey: result.chapterKey,
      scopeAncestor: result.scopeAncestor,
      scope: result.scope,
      nextScope: result.nextScope,
      lawRevisionId,
    });
  }

  // ── ページング（before/after） ──
  if (direction !== "before" && direction !== "after") {
    return NextResponse.json(
      { error: "direction must be 'before' or 'after'" },
      { status: 400 },
    );
  }
  if (!scopeId) {
    return NextResponse.json(
      { error: "scopeId is required for pagination" },
      { status: 400 },
    );
  }
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : NaN;
  if (Number.isNaN(cursor) || cursor < 1) {
    return NextResponse.json(
      { error: "cursor must be a positive integer (1-based root sequence)" },
      { status: 400 },
    );
  }

  const result = await getChapterArticlesPaginated(
    scopeId,
    cursor,
    direction,
    limit,
  );

  // ノードID集合を抽出（ルート + 子孫）- 利用者データ一括取得用
  const nodeIds = result.articles.flatMap((a) => [
    a.root.id,
    ...a.children.map((c) => c.id),
  ]);

  return NextResponse.json({
    articles: result.articles,
    beforeCursor: result.beforeCursor,
    afterCursor: result.afterCursor,
    nodeIds,
    scope: result.scope,
    nextScope: result.nextScope,
    lawRevisionId,
  });
}
