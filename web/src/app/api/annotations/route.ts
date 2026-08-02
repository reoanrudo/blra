import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";
import type { AnnotationTag } from "@prisma/client";
import { validateApplicabilitySnapshot } from "@/lib/applicability/applicability-snapshot";

// GET /api/annotations?articleId=xxx&projectId=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const articleId = searchParams.get("articleId");
  const projectId = searchParams.get("projectId");

  const userId = await getOrCreateDefaultUser();

  const where: Record<string, unknown> = { userId };
  if (articleId) where.articleId = articleId;
  if (projectId) where.projectId = projectId;

  const annotations = await prisma.articleAnnotation.findMany({
    where,
    include: {
      article: {
        select: {
          id: true,
          articleNumber: true,
          articleNumberNormalized: true,
          caption: true,
          level: true,
          law: { select: { shortName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(annotations);
}

// POST /api/annotations — Upsert (create or update)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    articleId,
    tag,
    note,
    projectId,
    applicabilityAnchor,
    applicabilityDate,
    snapshotLawRevisionId,
  } = body as {
    articleId?: string;
    tag?: string;
    note?: string;
    projectId?: string;
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

  const validTags: AnnotationTag[] = ["applicable", "review", "reference"];
  if (tag && !validTags.includes(tag as AnnotationTag)) {
    return NextResponse.json(
      { error: `tag must be one of: ${validTags.join(", ")}` },
      { status: 400 },
    );
  }

  const userId = await getOrCreateDefaultUser();

  // Verify article exists and is not soft-deleted
  const article = await prisma.article.findFirst({
    where: { id: articleId, deletedAt: null },
    select: { id: true, lawRevisionId: true },
  });
  if (!article) {
    return NextResponse.json(
      { error: "Article not found" },
      { status: 404 },
    );
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

  const annotationTag = (tag ?? "review") as AnnotationTag;
  const annotation = await prisma.articleAnnotation.upsert({
    where: { userId_articleId: { userId, articleId } },
    update: {
      tag: annotationTag,
      note: note ?? null,
      projectId: projectId ?? null,
    },
    create: {
      userId,
      articleId,
      tag: annotationTag,
      note: note ?? null,
      projectId: projectId ?? null,
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

  return NextResponse.json(annotation);
}
