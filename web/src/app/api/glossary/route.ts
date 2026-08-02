import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface GlossaryRow {
  id: string;
  term: string;
  reading: string;
  category: string;
  definitionArticleId: string | null;
  description: string | null;
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category")?.trim();

  let rows: GlossaryRow[];
  if (category) {
    rows = await prisma.$queryRawUnsafe<GlossaryRow[]>(
      'SELECT id, term, reading, category, "definitionArticleId", description FROM "GlossaryTerm" WHERE category::text = $1 ORDER BY reading',
      category,
    );
  } else {
    rows = await prisma.$queryRawUnsafe<GlossaryRow[]>(
      'SELECT id, term, reading, category, "definitionArticleId", description FROM "GlossaryTerm" ORDER BY reading',
    );
  }

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
