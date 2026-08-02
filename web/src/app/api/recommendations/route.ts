import { NextRequest, NextResponse } from "next/server";
import {
  getRecommendations,
  isColdStart,
  getColdStartRecommendations,
} from "@/lib/practice/cooccurrence";
import type { RecommendationsResponse } from "@/types/recommendations";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");
  const regulationType = searchParams.get("regulationType") ?? undefined;

  if (!articleId) {
    return NextResponse.json(
      { error: "articleId is required" },
      { status: 400 },
    );
  }

  try {
    const coldStart = await isColdStart();

    let data;

    if (coldStart) {
      data = await getColdStartRecommendations(articleId, regulationType);
    } else {
      data = await getRecommendations(articleId, { regulationType });

      // Fallback to cold-start if no real data yet
      if (data.length === 0) {
        data = await getColdStartRecommendations(articleId, regulationType);
      }
    }

    const response: RecommendationsResponse = {
      data,
      isColdStart: coldStart || data.length === 0,
    };

    // If data is still empty after fallback, return empty
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 },
    );
  }
}
