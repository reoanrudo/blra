import { NextRequest, NextResponse } from "next/server";
import { createCheckItem, updateCheckItemStatus } from "@/lib/practice/project";
import { getRecentCheckItems } from "@/lib/practice/practice";
import { prisma } from "@/lib/db";
import { validateApplicabilitySnapshot } from "@/lib/applicability/applicability-snapshot";

export async function GET(request: NextRequest) {
  try {
    const recent = request.nextUrl.searchParams.get("recent");
    if (recent === "true") {
      const items = await getRecentCheckItems(20);
      return NextResponse.json(items);
    }
    return NextResponse.json([]);
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.projectId || !body.articleId) {
      return NextResponse.json(
        { error: "projectId and articleId required" },
        { status: 400 },
      );
    }
    const article = await prisma.article.findFirst({
      where: { id: body.articleId, deletedAt: null },
      select: { lawRevisionId: true },
    });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }
    const hasSnapshotInput = [
      body.applicabilityAnchor,
      body.applicabilityDate,
      body.snapshotLawRevisionId,
    ].some((value) => value !== undefined && value !== null);
    const snapshotValidation = validateApplicabilitySnapshot(
      {
        applicabilityAnchor: body.applicabilityAnchor,
        applicabilityDate: body.applicabilityDate,
        snapshotLawRevisionId:
          body.snapshotLawRevisionId ??
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
    const item = await createCheckItem({
      projectId: body.projectId,
      articleId: body.articleId,
      title: body.title,
      evidenceText: body.evidenceText,
      drawingNote: body.drawingNote,
      calculationMemo: body.calculationMemo,
      consultationMemo: body.consultationMemo,
      sortOrder: body.sortOrder,
      snapshot: snapshotValidation.snapshot,
    });
    if (!item) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id || !body.status) {
      return NextResponse.json(
        { error: "id and status required" },
        { status: 400 },
      );
    }
    const item = await updateCheckItemStatus(body.id, body.status);
    if (!item) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
