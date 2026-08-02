import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";
import { validateApplicabilitySnapshot } from "@/lib/applicability/applicability-snapshot";

const VALID_COLORS = ["red", "blue", "green", "yellow", "purple", "orange"] as const;
const VALID_TYPES = ["highlight", "underline", "bracket", "symbol"] as const;

/**
 * ハイライトのアンカー整合性チェックサムを計算する。
 *
 * 素材: 範囲前後のコンテキスト（前10文字 + 引用文 + 後10文字）。
 * SHA-256 の先頭16文字（64bit相当）を使用する。
 *
 * 条文改正後に原文が変わると、前後コンテキストが変化するため
 * チェックサムが不一致となり、再アンカーが必要であることを検出できる。
 *
 * @param articleText Article.text 全文
 * @param rangeStart ハイライト開始位置（原文オフセット）
 * @param rangeEnd ハイライト終了位置（原文オフセット）
 * @param exactQuote サーバー側で生成した引用文（articleText の rangeStart..rangeEnd）
 */
function computeAnchorChecksum(
  articleText: string,
  rangeStart: number,
  rangeEnd: number,
  exactQuote: string,
): string {
  const contextBefore = articleText.slice(Math.max(0, rangeStart - 10), rangeStart);
  const contextAfter = articleText.slice(rangeEnd, Math.min(articleText.length, rangeEnd + 10));
  const material = `${contextBefore}⟦${exactQuote}⟧${contextAfter}`;
  return createHash("sha256").update(material, "utf8").digest("hex").slice(0, 16);
}

// GET /api/user-highlights?articleId=xxx
export async function GET(request: NextRequest) {
  const articleId = request.nextUrl.searchParams.get("articleId");
  if (!articleId) {
    return NextResponse.json(
      { error: "articleId query parameter is required" },
      { status: 400 },
    );
  }

  const userId = await getOrCreateDefaultUser();

  const highlights = await prisma.userHighlight.findMany({
    where: { userId, articleId },
    orderBy: { rangeStart: "asc" },
  });

  return NextResponse.json({ highlights });
}

// POST /api/user-highlights
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    articleId,
    rangeStart,
    rangeEnd,
    exactQuote,
    color,
    type,
    applicabilityAnchor,
    applicabilityDate,
    snapshotLawRevisionId,
  } = body as {
    articleId?: string;
    rangeStart?: number;
    rangeEnd?: number;
    exactQuote?: string;
    color?: string;
    type?: string;
    applicabilityAnchor?: unknown;
    applicabilityDate?: unknown;
    snapshotLawRevisionId?: unknown;
  };

  if (!articleId) {
    return NextResponse.json(
      { error: "articleId is required" },
      { status: 400 },
    );
  }

  if (
    typeof rangeStart !== "number" ||
    typeof rangeEnd !== "number" ||
    !Number.isInteger(rangeStart) ||
    !Number.isInteger(rangeEnd) ||
    rangeStart < 0 ||
    rangeEnd <= rangeStart
  ) {
    return NextResponse.json(
      { error: "rangeStart and rangeEnd must be non-negative integers with start < end" },
      { status: 400 },
    );
  }

  if (!exactQuote || typeof exactQuote !== "string" || exactQuote.length === 0) {
    return NextResponse.json(
      { error: "exactQuote is required (must be original text, not display text)" },
      { status: 400 },
    );
  }

  if (!color || !VALID_COLORS.includes(color as (typeof VALID_COLORS)[number])) {
    return NextResponse.json(
      { error: `color must be one of: ${VALID_COLORS.join(", ")}` },
      { status: 400 },
    );
  }

  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const userId = await getOrCreateDefaultUser();

  // Article を取得し、本文で範囲の正当性を検証する。
  // exactQuote はクライアント送信値を信頼せず、サーバー側で article.text から生成する。
  // 改ざん・不整合を防ぐため、クライアント送信値とサーバー生成値が一致することを確認する。
  const article = await prisma.article.findFirst({
    where: { id: articleId, deletedAt: null },
    select: { id: true, text: true, lawRevisionId: true },
  });
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const hasSnapshotInput = [
    applicabilityAnchor,
    applicabilityDate,
    snapshotLawRevisionId,
  ].some((value) => value !== undefined && value !== null);
  const snapshotValidation = validateApplicabilitySnapshot(
    {
      applicabilityAnchor,
      applicabilityDate,
      snapshotLawRevisionId:
        snapshotLawRevisionId ??
        (hasSnapshotInput ? article.lawRevisionId : undefined),
    },
    article.lawRevisionId,
  );
  if (snapshotValidation.kind === "invalid") {
    return NextResponse.json(
      { error: snapshotValidation.reason },
      { status: 400 },
    );
  }
  if (snapshotValidation.kind === "conflict") {
    return NextResponse.json(
      { error: snapshotValidation.reason },
      { status: 409 },
    );
  }
  const snapshot = snapshotValidation.snapshot;

  const articleText = article.text ?? "";
  if (rangeEnd > articleText.length) {
    return NextResponse.json(
      { error: "rangeEnd exceeds article text length" },
      { status: 400 },
    );
  }

  // サーバー側で公式原文から引用を生成
  const serverExactQuote = articleText.slice(rangeStart, rangeEnd);

  // クライアント送信値と照合（改ざん検出）
  if (serverExactQuote !== exactQuote) {
    return NextResponse.json(
      {
        error: "exactQuote does not match server-side generated quote from article text",
        hint: "The client must send the original text (from data-original-text), not the display text",
      },
      { status: 422 },
    );
  }

  // anchorChecksum: 前後コンテキスト + 引用文の SHA-256 ハッシュ（真正のチェックサム）
  const anchorChecksum = computeAnchorChecksum(articleText, rangeStart, rangeEnd, serverExactQuote);

  const highlight = await prisma.userHighlight.create({
    data: {
      userId,
      articleId,
      rangeStart,
      rangeEnd,
      exactQuote: serverExactQuote,
      anchorChecksum,
      color,
      type,
      ...(snapshot
        ? {
            applicabilityAnchor: snapshot.applicabilityAnchor,
            applicabilityDate: new Date(
              `${snapshot.applicabilityDate}T00:00:00.000Z`,
            ),
            snapshotLawRevisionId: snapshot.snapshotLawRevisionId,
          }
        : {}),
    },
  });

  return NextResponse.json(highlight, { status: 201 });
}
