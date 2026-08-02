import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getFullLawDocument } from "@/lib/article/full-law-repository";

export const runtime = "nodejs";

const CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=86400";

function cacheHeaders(etag: string): HeadersInit {
  return {
    ETag: etag,
    "Cache-Control": CACHE_CONTROL,
  };
}

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const document = await getFullLawDocument(id);
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
        headers: cacheHeaders(etag),
      });
    }

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...cacheHeaders(etag),
      },
    });
  } catch (error) {
    console.error("Failed to load full law document", error);
    return NextResponse.json(
      { error: "failed to load law document" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
