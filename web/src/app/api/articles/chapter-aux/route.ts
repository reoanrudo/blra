import { NextRequest, NextResponse } from "next/server";
import { getAuxDataForArticles } from "@/lib/article/chapter-aux";

/**
 * 追加取得Article群の注釈・リンク一括取得API（設計書§4.3, §5）
 *
 * POST /api/articles/chapter-aux
 * Body: { nodeIds: string[] }
 * Response: ChapterAuxResponse
 *
 * 条文本文追加取得後に呼ばれ、注釈・リンクを一括取得する。
 */
export async function POST(request: NextRequest) {
  let body: { nodeIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const nodeIdsRaw = body.nodeIds;
  if (!Array.isArray(nodeIdsRaw) || nodeIdsRaw.length === 0) {
    return NextResponse.json(
      { error: "nodeIds must be a non-empty array" },
      { status: 400 },
    );
  }
  const nodeIds = nodeIdsRaw
    .filter((id): id is string => typeof id === "string")
    .slice(0, 200);
  if (nodeIds.length === 0) {
    return NextResponse.json(
      { error: "nodeIds must contain string values" },
      { status: 400 },
    );
  }

  const result = await getAuxDataForArticles(nodeIds);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
