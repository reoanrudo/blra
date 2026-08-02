import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";

/**
 * ハイライト一括取得API（設計書§4.3, §5）
 *
 * POST /api/user-highlights/batch
 * Body: { articleIds: string[] }
 * Response: { highlights: Record<articleId, UserHighlightData[]> }
 *
 * 従来の /api/user-highlights?articleId=xxx を articleIds ごとに呼ぶ方式
 * （初期ウィンドウで最大124回通信）を1リクエストへ集約する。
 */
export async function POST(request: NextRequest) {
  let body: { articleIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const idsRaw = body.articleIds;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json(
      { error: "articleIds must be a non-empty array" },
      { status: 400 },
    );
  }
  const articleIds = idsRaw
    .filter((id): id is string => typeof id === "string")
    .slice(0, 200);
  if (articleIds.length === 0) {
    return NextResponse.json(
      { error: "articleIds must contain string values" },
      { status: 400 },
    );
  }

  const userId = await getOrCreateDefaultUser();
  const highlights = await prisma.userHighlight.findMany({
    where: { userId, articleId: { in: articleIds } },
    orderBy: { rangeStart: "asc" },
  });

  // articleId別にグループ化
  const grouped: Record<string, typeof highlights> = {};
  for (const h of highlights) {
    if (!grouped[h.articleId]) grouped[h.articleId] = [];
    grouped[h.articleId].push(h);
  }

  return NextResponse.json(
    { highlights: grouped },
    { headers: { "Cache-Control": "no-store" } },
  );
}
