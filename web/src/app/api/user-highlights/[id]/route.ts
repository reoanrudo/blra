import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";

// DELETE /api/user-highlights/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getOrCreateDefaultUser();

  const existing = await prisma.userHighlight.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Highlight not found" },
      { status: 404 },
    );
  }

  await prisma.userHighlight.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
