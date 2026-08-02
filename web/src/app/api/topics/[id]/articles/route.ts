import { NextRequest, NextResponse } from "next/server";
import { getArticlesForTopic } from "@/lib/practice/practice";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const articles = await getArticlesForTopic(id);
    return NextResponse.json(articles);
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
