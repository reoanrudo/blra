import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const rules = await prisma.sectionRule.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      law: { select: { shortName: true } },
      _count: { select: { articleRules: true } },
    },
  });

  return NextResponse.json({ rules });
}
