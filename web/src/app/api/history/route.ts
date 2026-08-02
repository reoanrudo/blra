import { NextResponse } from "next/server";
import { getViewHistory } from "@/lib/practice/practice";

export async function GET() {
  try {
    const history = await getViewHistory(20);
    return NextResponse.json(history);
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
