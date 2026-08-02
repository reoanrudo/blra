import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";

export const dynamic = "force-dynamic";
import {
  validateEnvelope,
  collectArticleRefs,
  batchResolveArticleRefs,
  refKey,
  type ValidationError,
  type ImportReport,
} from "@/lib/practice/export-validator";

const MAX_SEARCH = 100;
const MAX_VIEW = 200;

// ─── POST Handler ───

export async function POST(request: NextRequest) {
  const report: ImportReport = {
    ok: true,
    fatal: false,
    errors: [],
    imported: {},
    skipped: {},
  };

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, fatal: true, errors: [{ level: "FATAL", message: "invalid JSON" }] },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, fatal: true, errors: [{ level: "FATAL", message: "body must be an object" }] },
      { status: 400 },
    );
  }

  // 1. Validate envelope (checksum, backupVersion, schemaVersion)
  const validation = validateEnvelope(body);
  report.errors.push(...validation.errors);
  if (validation.fatal) {
    return NextResponse.json(
      { ...report, ok: false, fatal: true },
      { status: 400 },
    );
  }

  const exportType = body.exportType as string;
  if (exportType !== "full") {
    report.errors.push({ level: "FATAL", message: `import only supports exportType=full, got ${exportType}` });
    return NextResponse.json({ ...report, ok: false, fatal: true }, { status: 400 });
  }

  // 2. Collect all article refs and resolve them
  const refs = collectArticleRefs(body);
  const { resolved, unknown } = await batchResolveArticleRefs(refs);

  for (const key of unknown) {
    report.errors.push({ level: "WARNING", message: `unknown stable key: ${key}` });
  }

  try {
    const userId = await getOrCreateDefaultUser();

    await prisma.$transaction(async (tx) => {
      // ─── PracticeTopics (upsert by name from slug) ───
      const topicIdMap = new Map<string, string>(); // slug → new topic id
      const topics = body.practiceTopics;
      if (Array.isArray(topics)) {
        for (const t of topics) {
          if (!t || typeof t !== "object") continue;
          const tObj = t as Record<string, unknown>;
          const name = typeof tObj.slug === "string" ? tObj.slug : typeof tObj.name === "string" ? tObj.name : null;
          if (!name) {
            report.errors.push({ level: "WARNING", message: `practiceTopic missing slug/name, skipping` });
            incrementSkipped(report, "practiceTopics");
            continue;
          }

          let topic = await tx.practiceTopic.findUnique({ where: { name } });
          if (!topic) {
            topic = await tx.practiceTopic.create({
              data: { name, description: typeof tObj.label === "string" ? tObj.label : null },
            });
          }
          topicIdMap.set(name, topic.id);

          // ArticlePracticeTopic links
          const articleRefs = tObj.articleRefs;
          if (Array.isArray(articleRefs)) {
            for (const ar of articleRefs) {
              if (!ar || typeof ar !== "object") continue;
              const arObj = ar as Record<string, unknown>;
              const key = refKey(
                arObj.lawId as string,
                arObj.articleNumberNormalized as string,
              );
              const articleId = resolved.get(key);
              if (!articleId) {
                report.errors.push({ level: "WARNING", message: `practiceTopic "${name}" article ref unknown: ${key}` });
                incrementSkipped(report, "articlePracticeTopics");
                continue;
              }

              // Check for duplicate
              const existing = await tx.articlePracticeTopic.findUnique({
                where: { articleId_topicId: { articleId, topicId: topic.id } },
              });
              if (existing) {
                report.errors.push({ level: "INFO", message: `duplicate articlePracticeTopic: ${key} for topic "${name}"` });
                incrementSkipped(report, "articlePracticeTopics");
                continue;
              }

              await tx.articlePracticeTopic.create({
                data: { articleId, topicId: topic.id, source: "manual" },
              });
              incrementImported(report, "articlePracticeTopics");
            }
          }
          incrementImported(report, "practiceTopics");
        }
      }

      // ─── DrawingNoteTemplates ───
      const templates = body.drawingNoteTemplates;
      if (Array.isArray(templates)) {
        for (const d of templates) {
          if (!d || typeof d !== "object") continue;
          const dObj = d as Record<string, unknown>;
          const key = refKey(dObj.lawId as string, dObj.articleNumberNormalized as string);
          const articleId = resolved.get(key);
          if (!articleId) {
            report.errors.push({ level: "WARNING", message: `drawingNoteTemplate unknown ref: ${key}` });
            incrementSkipped(report, "drawingNoteTemplates");
            continue;
          }

          await tx.drawingNoteTemplate.create({
            data: {
              articleId,
              title: typeof dObj.title === "string" ? dObj.title : "",
              templateText: typeof dObj.templateText === "string" ? dObj.templateText : "",
              tags: Array.isArray(dObj.tags) ? dObj.tags.filter((t): t is string => typeof t === "string") : [],
            },
          });
          incrementImported(report, "drawingNoteTemplates");
        }
      }

      // ─── Packs + PackItems ───
      const packs = body.packs;
      if (Array.isArray(packs)) {
        for (const p of packs) {
          if (!p || typeof p !== "object") continue;
          const pObj = p as Record<string, unknown>;
          const packName = typeof pObj.name === "string" ? pObj.name : "imported pack";

          const pack = await tx.pack.create({
            data: { name: packName, type: "user", ownerId: userId },
          });

          const items = pObj.items;
          if (Array.isArray(items)) {
            let sortOrder = 0;
            for (const item of items) {
              if (!item || typeof item !== "object") continue;
              const iObj = item as Record<string, unknown>;
              const key = refKey(iObj.lawId as string, iObj.articleNumberNormalized as string);
              const articleId = resolved.get(key);
              if (!articleId) {
                report.errors.push({ level: "WARNING", message: `packItem unknown ref: ${key}` });
                incrementSkipped(report, "packItems");
                continue;
              }

              const existing = await tx.packItem.findUnique({
                where: { packId_articleId: { packId: pack.id, articleId } },
              });
              if (existing) {
                report.errors.push({ level: "INFO", message: `duplicate packItem: ${key} in pack "${packName}"` });
                incrementSkipped(report, "packItems");
                continue;
              }

              await tx.packItem.create({ data: { packId: pack.id, articleId, sortOrder: sortOrder++ } });
              incrementImported(report, "packItems");
            }
          }
          incrementImported(report, "packs");
        }
      }

      // ─── Projects + CheckItems ───
      const projects = body.projects;
      if (Array.isArray(projects)) {
        for (const p of projects) {
          if (!p || typeof p !== "object") continue;
          const pObj = p as Record<string, unknown>;

          const project = await tx.projectProfile.create({
            data: {
              userId,
              name: typeof pObj.name === "string" ? pObj.name : "imported project",
              usage: typeof pObj.usage === "string" ? pObj.usage : null,
              siteArea: typeof pObj.siteArea === "number" ? pObj.siteArea : null,
              buildingArea: typeof pObj.buildingArea === "number" ? pObj.buildingArea : null,
              totalFloorArea: typeof pObj.totalFloorArea === "number" ? pObj.totalFloorArea : null,
              floors: typeof pObj.floors === "number" ? pObj.floors : null,
              structure: typeof pObj.structure === "string" ? pObj.structure : null,
              useDistrict: typeof pObj.useDistrict === "string" ? pObj.useDistrict : null,
              fireDistrict: typeof pObj.fireDistrict === "string" ? pObj.fireDistrict : null,
              roadAccess: typeof pObj.roadAccess === "string" ? pObj.roadAccess : null,
              municipality: typeof pObj.municipality === "string" ? pObj.municipality : null,
              isActive: false,
              tags: Array.isArray(pObj.tags) ? pObj.tags.filter((t): t is string => typeof t === "string") : [],
            },
          });

          const checkItems = pObj.checkItems;
          if (Array.isArray(checkItems)) {
            let sortOrder = 0;
            for (const ci of checkItems) {
              if (!ci || typeof ci !== "object") continue;
              const ciObj = ci as Record<string, unknown>;
              const key = refKey(ciObj.lawId as string, ciObj.articleNumberNormalized as string);
              const articleId = resolved.get(key);
              if (!articleId) {
                report.errors.push({ level: "WARNING", message: `checkItem unknown ref: ${key}` });
                incrementSkipped(report, "checkItems");
                continue;
              }

              await tx.checkItem.create({
                data: {
                  projectId: project.id,
                  articleId,
                  title: typeof ciObj.caption === "string" ? ciObj.caption : null,
                  status: isValidCheckStatus(ciObj.status) ? ciObj.status as "unchecked" | "applicable" | "not_applicable" | "ok" | "ng" | "needs_consultation" : "unchecked",
                  evidenceText: typeof ciObj.evidenceText === "string" ? ciObj.evidenceText : null,
                  drawingNote: typeof ciObj.drawingNote === "string" ? ciObj.drawingNote : null,
                  sortOrder: typeof ciObj.sortOrder === "number" ? ciObj.sortOrder : sortOrder++,
                  source: "manual",
                },
              });
              incrementImported(report, "checkItems");
            }
          }
          incrementImported(report, "projects");
        }
      }

      // ─── UserHighlights ───
      const highlights = body.highlights;
      if (Array.isArray(highlights)) {
        for (const h of highlights) {
          if (!h || typeof h !== "object") continue;
          const hObj = h as Record<string, unknown>;
          const key = refKey(hObj.lawId as string, hObj.articleNumberNormalized as string);
          const articleId = resolved.get(key);
          if (!articleId) {
            report.errors.push({ level: "WARNING", message: `highlight unknown ref: ${key}` });
            incrementSkipped(report, "highlights");
            continue;
          }

          await tx.userHighlight.create({
            data: {
              userId,
              articleId,
              rangeStart: typeof hObj.rangeStart === "number" ? hObj.rangeStart : 0,
              rangeEnd: typeof hObj.rangeEnd === "number" ? hObj.rangeEnd : 0,
              color: typeof hObj.color === "string" ? hObj.color : "yellow",
              type: typeof hObj.type === "string" ? hObj.type : "highlight",
            },
          });
          incrementImported(report, "highlights");
        }
      }

      // ─── UserTags ───
      const tags = body.tags;
      if (Array.isArray(tags)) {
        for (const t of tags) {
          if (!t || typeof t !== "object") continue;
          const tObj = t as Record<string, unknown>;
          const key = refKey(tObj.lawId as string, tObj.articleNumberNormalized as string);
          const articleId = resolved.get(key);
          if (!articleId) {
            report.errors.push({ level: "WARNING", message: `tag unknown ref: ${key}` });
            incrementSkipped(report, "tags");
            continue;
          }

          const tagName = typeof tObj.tagName === "string" ? tObj.tagName : "";
          if (!tagName) {
            incrementSkipped(report, "tags");
            continue;
          }

          // Check for duplicate (userId, articleId, tagName)
          const existing = await tx.userTag.findUnique({
            where: { userId_articleId_tagName: { userId, articleId, tagName } },
          });
          if (existing) {
            report.errors.push({ level: "INFO", message: `duplicate tag: "${tagName}" on ${key}` });
            incrementSkipped(report, "tags");
            continue;
          }

          await tx.userTag.create({ data: { userId, articleId, tagName } });
          incrementImported(report, "tags");
        }
      }

      // ─── UserActivity (with capping) ───
      const activities = body.activities;
      if (Array.isArray(activities)) {
        for (const a of activities) {
          if (!a || typeof a !== "object") continue;
          const aObj = a as Record<string, unknown>;
          const type = aObj.type as string;
          if (!["search", "view", "export", "import"].includes(type)) {
            incrementSkipped(report, "activities");
            continue;
          }

          await tx.userActivity.create({
            data: {
              userId,
              type: type as "search" | "view" | "export" | "import",
              query: typeof aObj.payload === "object" && aObj.payload && typeof (aObj.payload as Record<string, unknown>).query === "string"
                ? (aObj.payload as Record<string, unknown>).query as string : null,
              payload: (aObj.payload ?? undefined) as Prisma.InputJsonValue,
              createdAt: typeof aObj.createdAt === "string" ? new Date(aObj.createdAt) : undefined,
            },
          });
          incrementImported(report, "activities");
        }
      }

      // Apply UserActivity caps
      await capUserActivity(tx, userId, "search", MAX_SEARCH);
      await capUserActivity(tx, userId, "view", MAX_VIEW);

      // ─── ArticleCooccurrence (upsert with idempotent increment) ───
      const cooccurrences = body.articleCooccurrences;
      if (Array.isArray(cooccurrences)) {
        for (const c of cooccurrences) {
          if (!c || typeof c !== "object") continue;
          const cObj = c as Record<string, unknown>;
          const sourceObj = cObj.source as Record<string, unknown> | undefined;
          const relatedObj = cObj.related as Record<string, unknown> | undefined;
          if (!sourceObj || !relatedObj) {
            incrementSkipped(report, "articleCooccurrences");
            continue;
          }
          const sourceKey = refKey(sourceObj.lawId as string, sourceObj.articleNumberNormalized as string);
          const relatedKey = refKey(relatedObj.lawId as string, relatedObj.articleNumberNormalized as string);
          const articleId = resolved.get(sourceKey);
          const relatedId = resolved.get(relatedKey);
          if (!articleId || !relatedId) {
            incrementSkipped(report, "articleCooccurrences");
            continue;
          }

          await tx.$executeRawUnsafe(
            `INSERT INTO "ArticleCooccurrence" ("id", "articleId", "relatedId", "cooccurCount", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())
             ON CONFLICT ("articleId", "relatedId")
             DO UPDATE SET "cooccurCount" = "ArticleCooccurrence"."cooccurCount" + $3, "updatedAt" = NOW()`,
            articleId,
            relatedId,
            typeof cObj.cooccurCount === "number" ? cObj.cooccurCount : 1,
          );
          incrementImported(report, "articleCooccurrences");
        }
      }
    });
  } catch (e) {
    console.error("import transaction failed:", e);
    report.errors.push({ level: "FATAL", message: "import transaction failed" });
    report.fatal = true;
    report.ok = false;
    return NextResponse.json(report, { status: 500 });
  }

  return NextResponse.json(report, { status: 201 });
}

// ─── Helpers ───

function isValidCheckStatus(s: unknown): boolean {
  return typeof s === "string" &&
    ["unchecked", "applicable", "not_applicable", "ok", "ng", "needs_consultation"].includes(s);
}

function incrementImported(report: ImportReport, key: string): void {
  report.imported[key] = (report.imported[key] ?? 0) + 1;
}

function incrementSkipped(report: ImportReport, key: string): void {
  report.skipped[key] = (report.skipped[key] ?? 0) + 1;
}

async function capUserActivity(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  type: string,
  cap: number,
): Promise<void> {
  const records = await tx.userActivity.findMany({
    where: { userId, type: type as "search" | "view" | "export" | "import" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: cap,
  });
  if (records.length > 0) {
    await tx.userActivity.deleteMany({
      where: { id: { in: records.map((r) => r.id) } },
    });
  }
}
