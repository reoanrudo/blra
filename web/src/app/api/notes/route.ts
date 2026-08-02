import { NextRequest, NextResponse } from "next/server";
import { getDrawingNoteTemplates } from "@/lib/practice/note";

export async function GET(request: NextRequest) {
  const articleId = request.nextUrl.searchParams.get("articleId");
  if (!articleId) {
    return NextResponse.json({ error: "articleId required" }, { status: 400 });
  }
  const templates = await getDrawingNoteTemplates(articleId);
  return NextResponse.json(templates);
}
