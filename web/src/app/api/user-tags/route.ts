import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";

// GET /api/user-tags?articleId=xxx
export async function GET(request: NextRequest) {
  const articleId = request.nextUrl.searchParams.get("articleId");
  if (!articleId) {
    return NextResponse.json(
      { error: "articleId query parameter is required" },
      { status: 400 },
    );
  }

  const userId = await getOrCreateDefaultUser();

  const tags = await prisma.userTag.findMany({
    where: { userId, articleId },
    orderBy: { tagName: "asc" },
  });

  return NextResponse.json({ tags });
}

// POST /api/user-tags
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { articleId, tagName } = body as {
    articleId?: string;
    tagName?: string;
  };

  if (!articleId) {
    return NextResponse.json(
      { error: "articleId is required" },
      { status: 400 },
    );
  }

  if (!tagName || typeof tagName !== "string" || tagName.trim().length === 0) {
    return NextResponse.json(
      { error: "tagName must be a non-empty string" },
      { status: 400 },
    );
  }

  if (tagName.length > 50) {
    return NextResponse.json(
      { error: "tagName must be 50 characters or less" },
      { status: 400 },
    );
  }

  const userId = await getOrCreateDefaultUser();

  // Verify article exists and is not soft-deleted
  const article = await prisma.article.findFirst({
    where: { id: articleId, deletedAt: null },
    select: { id: true },
  });
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  try {
    const tag = await prisma.userTag.create({
      data: { userId, articleId, tagName: tagName.trim() },
    });
    return NextResponse.json(tag, { status: 201 });
  } catch (err: unknown) {
    // Unique constraint violation (duplicate tag)
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This tag already exists for this article" },
        { status: 409 },
      );
    }
    throw err;
  }
}
