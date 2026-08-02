import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";
import { computeChecksum } from "@/lib/practice/export-validator";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

export const dynamic = "force-dynamic";

const REGULATION_CATEGORIES = {
  law: { icon: "法", label: "法律", color: "#333" },
  cabinet_order: { icon: "政", label: "政令", color: "#666" },
  ministry_ordinance: { icon: "省", label: "省令", color: "#666" },
  agency_ordinance: { icon: "府", label: "府令", color: "#666" },
  notification: { icon: "告", label: "告示", color: "#7b2d8b" },
} as const;

// ─── Laws Export ───

async function buildLawsPayload(): Promise<Record<string, unknown>> {
  const laws = await prisma.$queryRawUnsafe<
    Array<{ egovLawId: string; name: string; shortName: string | null; category: string }>
  >(
    `SELECT l."egovLawId", l.name, l."shortName", l.category::text
     FROM "LawBookEntry" e
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     JOIN "Law" l ON l.id = e."lawId"
     WHERE edition."editionKey" = $1
     ORDER BY e."displayOrder"`,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  return {
    exportType: "laws",
    laws: laws.map((l) => ({
      lawId: l.egovLawId,
      name: l.name,
      shortName: l.shortName,
      category: l.category,
    })),
    regulationCategories: REGULATION_CATEGORIES,
  };
}

// ─── Full Export ───

interface ExportedArticleRef {
  lawId: string;
  articleNumberNormalized: string;
}

async function buildFullPayload(): Promise<Record<string, unknown>> {
  const userId = await getOrCreateDefaultUser();

  // Fetch all data in parallel (single round-trip per entity type)
  const [
    user,
    projects,
    highlights,
    tags,
    packs,
    drawingNoteTemplates,
    practiceTopics,
    activities,
    articleCooccurrences,
    // For resolving Article references → egovLawId + articleNumberNormalized
    articleInfoMap,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    prisma.projectProfile.findMany({
      where: { userId },
      include: { checkItems: { orderBy: { sortOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.userHighlight.findMany({
      where: { userId },
      select: { articleId: true, rangeStart: true, rangeEnd: true, color: true, type: true },
    }),
    prisma.userTag.findMany({
      where: { userId },
      select: { articleId: true, tagName: true },
    }),
    prisma.pack.findMany({
      where: { OR: [{ type: "system" }, { ownerId: userId }] },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    }),
    prisma.drawingNoteTemplate.findMany({
      orderBy: { title: "asc" },
    }),
    prisma.practiceTopic.findMany({
      include: { articles: { include: { article: { select: { lawId: true, articleNumberNormalized: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { type: true, query: true, payload: true, createdAt: true },
    }),
    prisma.articleCooccurrence.findMany({
      select: { articleId: true, relatedId: true, cooccurCount: true },
    }),
    // Resolve all articleId → (egovLawId, articleNumberNormalized) in one batch
    resolveAllArticleInfo(),
  ]);

  const refMap = articleInfoMap;

  const resolveRef = (articleId: string): ExportedArticleRef | null => {
    const info = refMap.get(articleId);
    if (!info) return null;
    return { lawId: info.egovLawId, articleNumberNormalized: info.articleNumberNormalized ?? "" };
  };

  return {
    exportType: "full",
    profile: user ? { userId: user.id, userName: user.name } : { userId, userName: "default" },
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      usage: p.usage,
      siteArea: p.siteArea,
      buildingArea: p.buildingArea,
      totalFloorArea: p.totalFloorArea,
      floors: p.floors,
      structure: p.structure,
      useDistrict: p.useDistrict,
      fireDistrict: p.fireDistrict,
      roadAccess: p.roadAccess,
      municipality: p.municipality,
      isActive: p.isActive,
      tags: p.tags,
      checkItems: p.checkItems.map((ci) => {
        const ref = resolveRef(ci.articleId);
        return {
          lawId: ref?.lawId ?? null,
          articleNumberNormalized: ref?.articleNumberNormalized ?? null,
          caption: ci.title,
          articleCaptionNormalized: ci.title,
          status: ci.status,
          evidenceText: ci.evidenceText,
          drawingNote: ci.drawingNote,
          sortOrder: ci.sortOrder,
        };
      }),
    })),
    highlights: highlights
      .map((h) => {
        const ref = resolveRef(h.articleId);
        if (!ref) return null;
        return { ...ref, rangeStart: h.rangeStart, rangeEnd: h.rangeEnd, color: h.color, type: h.type };
      })
      .filter(Boolean),
    tags: tags
      .map((t) => {
        const ref = resolveRef(t.articleId);
        if (!ref) return null;
        return { ...ref, tagName: t.tagName };
      })
      .filter(Boolean),
    packs: packs.map((p) => ({
      name: p.name,
      type: p.type,
      color: "blue",
      items: p.items
        .map((i) => {
          const ref = resolveRef(i.articleId);
          if (!ref) return null;
          return ref;
        })
        .filter(Boolean),
    })),
    drawingNoteTemplates: drawingNoteTemplates
      .map((d) => {
        const ref = resolveRef(d.articleId);
        if (!ref) return null;
        return { ...ref, title: d.title, templateText: d.templateText, tags: d.tags };
      })
      .filter(Boolean),
    practiceTopics: practiceTopics.map((t) => ({
      slug: t.name,
      label: t.name,
      articleRefs: t.articles
        .map((apt) => {
          if (!apt.article) return null;
          return {
            lawId: refMap.get(apt.articleId)?.egovLawId ?? null,
            articleNumberNormalized: apt.article.articleNumberNormalized,
          };
        })
        .filter(Boolean),
    })),
    activities: activities.map((a) => ({
      type: a.type,
      payload: a.payload ?? (a.query ? { query: a.query } : {}),
      createdAt: a.createdAt.toISOString(),
    })),
    articleCooccurrences: articleCooccurrences
      .map((c) => {
        const sourceRef = resolveRef(c.articleId);
        const relatedRef = resolveRef(c.relatedId);
        if (!sourceRef || !relatedRef) return null;
        return {
          source: sourceRef,
          related: relatedRef,
          cooccurCount: c.cooccurCount,
        };
      })
      .filter(Boolean),
  };
}

async function resolveAllArticleInfo(): Promise<
  Map<string, { egovLawId: string; articleNumberNormalized: string | null }>
> {
  // Backup must preserve user references even when an Article is archived or outside
  // the current printed excerpt. Public text/search scope is enforced by read APIs.
  const rows = await prisma.$queryRawUnsafe<
    { articleId: string; egovLawId: string; articleNumberNormalized: string | null }[]
  >(
    `SELECT a.id AS "articleId", l."egovLawId", a."articleNumberNormalized"
     FROM "Article" a
     JOIN "Law" l ON a."lawId" = l.id`,
  );
  const map = new Map<string, { egovLawId: string; articleNumberNormalized: string | null }>();
  for (const row of rows) {
    map.set(row.articleId, { egovLawId: row.egovLawId, articleNumberNormalized: row.articleNumberNormalized });
  }
  return map;
}

// ─── Route Handler ───

export async function GET(request: NextRequest) {
  try {
    const exportType = request.nextUrl.searchParams.get("type") ?? "full";

    if (!["laws", "full"].includes(exportType)) {
      return NextResponse.json({ error: "type must be 'laws' or 'full'" }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (exportType === "laws") {
      const payload = await buildLawsPayload();
      const envelope = {
        backupVersion: "1.0.0",
        schemaVersion: "mvp-1",
        exportDate: now,
        ...payload,
      };
      const checksum = computeChecksum(envelope);
      return NextResponse.json({ ...envelope, checksum });
    }

    const payload = await buildFullPayload();
    const envelope = {
      backupVersion: "1.0.0",
      schemaVersion: "mvp-1",
      exportDate: now,
      ...payload,
    };
    const checksum = computeChecksum(envelope);
    return NextResponse.json({ ...envelope, checksum });
  } catch (e) {
    console.error("export failed:", e);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
