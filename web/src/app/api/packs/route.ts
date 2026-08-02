import { NextRequest, NextResponse } from "next/server";
import { listPacks, getPack, createUserPack } from "@/lib/practice/practice";

export async function GET(request: NextRequest) {
  try {
    const packId = request.nextUrl.searchParams.get("id");
    if (packId) {
      const pack = await getPack(packId);
      if (!pack) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json(pack);
    }
    const packs = await listPacks();
    return NextResponse.json(packs);
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const pack = await createUserPack(body.name);
    return NextResponse.json(pack, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
