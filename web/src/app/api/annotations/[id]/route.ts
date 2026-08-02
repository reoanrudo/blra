import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";
import type { AnnotationTag } from "@prisma/client";

// PATCH /api/annotations/[id]
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await _request.json();
  const { tag, note } = body as { tag?: string; note?: string };

  const validTags: AnnotationTag[] = ["applicable", "review", "reference"];
  if (tag && !validTags.includes(tag as AnnotationTag)) {
    return NextResponse.json(
      { error: `tag must be one of: ${validTags.join(", ")}` },
      { status: 400 },
    );
  }

  const userId = await getOrCreateDefaultUser();

  const existing = await prisma.articleAnnotation.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Annotation not found" },
      { status: 404 },
    );
  }

  const updated = await prisma.articleAnnotation.update({
    where: { id },
    data: {
      ...(tag ? { tag: tag as AnnotationTag } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/annotations/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getOrCreateDefaultUser();

  const existing = await prisma.articleAnnotation.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Annotation not found" },
      { status: 404 },
    );
  }

  await prisma.articleAnnotation.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
