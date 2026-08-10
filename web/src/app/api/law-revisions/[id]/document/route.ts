import { NextRequest, NextResponse } from "next/server";
import { getOrBuildCachedDocument } from "@/lib/article/full-law-document-cache";

export const runtime = "nodejs";

const CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=86400";

function cacheHeaders(etag: string): HeadersInit {
  return {
    ETag: etag,
    "Cache-Control": CACHE_CONTROL,
    Vary: "Accept-Encoding",
  };
}

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cached = await getOrBuildCachedDocument(id);
    if (!cached) {
      return NextResponse.json(
        { error: "law revision not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const acceptsGzip = /(?:^|,)\s*gzip\s*(?:;|,|$)/i.test(
      request.headers.get("accept-encoding") ?? "",
    );
    const etag = acceptsGzip
      ? `"${cached.digest}-gzip"`
      : `"${cached.digest}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: cacheHeaders(etag),
      });
    }

    if (acceptsGzip) {
      return new Response(cached.gzipBody as BodyInit, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Encoding": "gzip",
          "Content-Length": String(cached.gzipBody.byteLength),
          ...cacheHeaders(etag),
        },
      });
    }

    return new Response(cached.body, {
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
