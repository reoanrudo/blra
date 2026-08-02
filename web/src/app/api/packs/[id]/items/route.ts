import { NextRequest, NextResponse } from "next/server";
import { addPackItem } from "@/lib/practice/practice";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: packId } = await params;
    const body = await request.json();
    if (!body.articleId) {
      return NextResponse.json(
        { error: "articleId required" },
        { status: 400 },
      );
    }
    const item = await addPackItem(packId, body.articleId, body.sortOrder);
    if (!item) {
      return NextResponse.json(
        { error: "pack not found or inaccessible" },
        { status: 404 },
      );
    }
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
