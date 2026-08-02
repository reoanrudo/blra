import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getConfirmedRelationsDocument } from "@/lib/relations/confirmed-relations-repository";

export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

type RouteContext = { params: { id: string } | Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const document = await getConfirmedRelationsDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: "law revision not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = JSON.stringify(document);
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": CACHE_CONTROL },
      });
    }

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag,
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("Failed to load confirmed relations", error);
    return NextResponse.json(
      { error: "failed to load confirmed relations" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
