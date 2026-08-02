import { NextResponse } from "next/server";
import { listPracticeTopics } from "@/lib/practice/practice";

export async function GET() {
  try {
    const topics = await listPracticeTopics();
    return NextResponse.json(topics);
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
