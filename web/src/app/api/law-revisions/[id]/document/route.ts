import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { getFullLawDocument } from "@/lib/article/full-law-repository";

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
    const document = await getFullLawDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: "law revision not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = JSON.stringify(document);
    const acceptsGzip = /(?:^|,)\s*gzip\s*(?:;|,|$)/i.test(
      request.headers.get("accept-encoding") ?? "",
    );
    const digest = createHash("sha256").update(body).digest("hex");
    const etag = acceptsGzip ? `"${digest}-gzip"` : `"${digest}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: cacheHeaders(etag),
      });
    }

    const responseBody = acceptsGzip ? gzipSync(body) : body;
    return new Response(responseBody, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(acceptsGzip
          ? {
              "Content-Encoding": "gzip",
              "Content-Length": String(Buffer.byteLength(responseBody)),
            }
          : {}),
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
