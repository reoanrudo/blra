import { NextRequest, NextResponse } from "next/server";
import { resolveHighlights, countHighlights, type Conditions } from "@/lib/highlight/highlight";

// GET /api/highlight/count?conditions=JSON — Lightweight count for wizard
export async function GET(request: NextRequest) {
  const condParam = request.nextUrl.searchParams.get("conditions");
  if (!condParam) {
    return NextResponse.json(
      { error: "conditions query parameter is required" },
      { status: 400 },
    );
  }

  let conditions: Conditions;
  try {
    conditions = JSON.parse(condParam);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in conditions parameter" },
      { status: 400 },
    );
  }

  if (typeof conditions !== "object" || Array.isArray(conditions)) {
    return NextResponse.json(
      { error: "conditions must be an object" },
      { status: 400 },
    );
  }

  const count = await countHighlights(conditions);
  return NextResponse.json({ count });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const conditions: Conditions = body.conditions ?? {};

  if (typeof conditions !== "object" || Array.isArray(conditions)) {
    return NextResponse.json(
      { error: "conditions must be an object" },
      { status: 400 },
    );
  }

  const result = await resolveHighlights(conditions);
  return NextResponse.json(result);
}
