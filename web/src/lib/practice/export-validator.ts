import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";

// ─── Types ───

export type ValidationLevel = "FATAL" | "WARNING" | "INFO";

export interface ValidationError {
  level: ValidationLevel;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  fatal: boolean;
  errors: ValidationError[];
}

export interface ArticleRef {
  lawId: string;
  articleNumberNormalized: string;
}

export interface ImportReport {
  ok: boolean;
  fatal: boolean;
  errors: ValidationError[];
  imported: Record<string, number>;
  skipped: Record<string, number>;
}

// ─── Checksum ───

/** SHA-256 of normalized JSON (keys sorted, checksum field excluded) */
export function computeChecksum(obj: Record<string, unknown>): string {
  const { checksum, ...rest } = obj;
  const normalized = JSON.stringify(rest, Object.keys(rest).sort());
  const hash = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `sha256:${hash}`;
}

export function validateChecksum(
  obj: Record<string, unknown>,
): { ok: boolean; error?: string } {
  const expected = obj.checksum;
  if (!expected || typeof expected !== "string") {
    return { ok: false, error: "checksum is missing or not a string" };
  }
  const actual = computeChecksum(obj);
  if (actual !== expected) {
    return { ok: false, error: "checksum mismatch" };
  }
  return { ok: true };
}

// ─── Backup Version ───

/** Major version must be "1" */
export function validateBackupVersion(version: string): { ok: boolean; error?: string } {
  if (!version || typeof version !== "string") {
    return { ok: false, error: "backupVersion is missing or not a string" };
  }
  const major = version.split(".")[0];
  if (major !== "1") {
    return { ok: false, error: `backupVersion major must be 1, got ${version}` };
  }
  return { ok: true };
}

// ─── Envelope Validation ───

export function validateEnvelope(obj: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    errors.push({ level: "FATAL", message: "JSON body must be an object" });
    return { ok: false, fatal: true, errors };
  }

  const data = obj as Record<string, unknown>;

  for (const field of ["backupVersion", "schemaVersion", "exportDate", "exportType"]) {
    if (typeof data[field] !== "string") {
      errors.push({ level: "FATAL", message: `missing or invalid field: ${field}` });
    }
  }

  if (errors.length > 0) {
    return { ok: false, fatal: true, errors };
  }

  if (typeof data.exportType === "string" && !["laws", "full"].includes(data.exportType)) {
    errors.push({ level: "WARNING", message: `unknown exportType: ${data.exportType}` });
  }

  const vResult = validateBackupVersion(data.backupVersion as string);
  if (!vResult.ok) {
    errors.push({ level: "FATAL", message: vResult.error! });
  }

  const cResult = validateChecksum(data as Record<string, unknown>);
  if (!cResult.ok) {
    errors.push({ level: "FATAL", message: cResult.error! });
  }

  const fatal = errors.some((e) => e.level === "FATAL");
  return { ok: errors.length === 0, fatal, errors };
}

// ─── Article Ref Resolution ───

export function refKey(lawId: string, articleNumberNormalized: string): string {
  return `${lawId}:${articleNumberNormalized}`;
}

/**
 * Batch-resolve article refs (lawId = egovLawId + articleNumberNormalized) to internal Article IDs.
 * Single query regardless of ref count.
 */
export async function batchResolveArticleRefs(
  refs: ArticleRef[],
): Promise<{ resolved: Map<string, string>; unknown: string[] }> {
  if (refs.length === 0) return { resolved: new Map(), unknown: [] };

  const uniqueMap = new Map<string, ArticleRef>();
  for (const ref of refs) {
    const key = refKey(ref.lawId, ref.articleNumberNormalized);
    if (!uniqueMap.has(key)) uniqueMap.set(key, ref);
  }

  const conditions: string[] = [];
  const params: string[] = [];
  let idx = 1;
  uniqueMap.forEach((ref) => {
    conditions.push(
      `(l."egovLawId" = $${idx} AND a."articleNumberNormalized" = $${idx + 1})`,
    );
    params.push(ref.lawId, ref.articleNumberNormalized);
    idx += 2;
  });
  const editionKeyParam = idx;
  params.push(CURRENT_LAW_BOOK_EDITION_KEY);
  const lawBookScope = lawBookArticleScopeSql("a", "e");

  const rows = await prisma.$queryRawUnsafe<
    { id: string; egovLawId: string; articleNumberNormalized: string }[]
  >(
    `SELECT a.id, l."egovLawId", a."articleNumberNormalized"
     FROM "Article" a
     JOIN "Law" l ON a."lawId" = l.id
     JOIN "LawBookEntry" e
       ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     WHERE a."level" = 'article'
       AND a."deletedAt" IS NULL
       AND edition."editionKey" = $${editionKeyParam}
       AND ${lawBookScope}
       AND (${conditions.join(" OR ")})`,
    ...params,
  );

  const resolved = new Map<string, string>();
  for (const row of rows) {
    const key = refKey(row.egovLawId, row.articleNumberNormalized);
    resolved.set(key, row.id);
  }

  const unknown: string[] = [];
  uniqueMap.forEach((_, key) => {
    if (!resolved.has(key)) unknown.push(key);
  });

  return { resolved, unknown };
}

/** Collect all unique article refs from an import payload */
export function collectArticleRefs(data: Record<string, unknown>): ArticleRef[] {
  const refs: ArticleRef[] = [];
  const seen = new Set<string>();

  const add = (lawId: unknown, articleNumberNormalized: unknown) => {
    if (typeof lawId !== "string" || typeof articleNumberNormalized !== "string") return;
    const key = refKey(lawId, articleNumberNormalized);
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ lawId, articleNumberNormalized });
  };

  // Projects → checkItems
  const projects = data.projects;
  if (Array.isArray(projects)) {
    for (const p of projects) {
      if (p && typeof p === "object" && Array.isArray((p as Record<string, unknown>).checkItems)) {
        for (const ci of (p as Record<string, unknown>).checkItems as Array<Record<string, unknown>>) {
          add(ci.lawId, ci.articleNumberNormalized);
        }
      }
    }
  }

  // Highlights
  const highlights = data.highlights;
  if (Array.isArray(highlights)) {
    for (const h of highlights) {
      if (h && typeof h === "object") {
        add((h as Record<string, unknown>).lawId, (h as Record<string, unknown>).articleNumberNormalized);
      }
    }
  }

  // Tags
  const tags = data.tags;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (t && typeof t === "object") {
        add((t as Record<string, unknown>).lawId, (t as Record<string, unknown>).articleNumberNormalized);
      }
    }
  }

  // Packs → items
  const packs = data.packs;
  if (Array.isArray(packs)) {
    for (const p of packs) {
      if (p && typeof p === "object" && Array.isArray((p as Record<string, unknown>).items)) {
        for (const item of (p as Record<string, unknown>).items as Array<Record<string, unknown>>) {
          add(item.lawId, item.articleNumberNormalized);
        }
      }
    }
  }

  // DrawingNoteTemplates
  const templates = data.drawingNoteTemplates;
  if (Array.isArray(templates)) {
    for (const d of templates) {
      if (d && typeof d === "object") {
        add((d as Record<string, unknown>).lawId, (d as Record<string, unknown>).articleNumberNormalized);
      }
    }
  }

  // PracticeTopics → articleRefs
  const topics = data.practiceTopics;
  if (Array.isArray(topics)) {
    for (const t of topics) {
      if (t && typeof t === "object" && Array.isArray((t as Record<string, unknown>).articleRefs)) {
        for (const ar of (t as Record<string, unknown>).articleRefs as Array<Record<string, unknown>>) {
          add(ar.lawId, ar.articleNumberNormalized);
        }
      }
    }
  }

  // ArticleCooccurrences → source + related
  const cooccurrences = data.articleCooccurrences;
  if (Array.isArray(cooccurrences)) {
    for (const c of cooccurrences) {
      if (c && typeof c === "object") {
        const cObj = c as Record<string, unknown>;
        const source = cObj.source as Record<string, unknown> | undefined;
        const related = cObj.related as Record<string, unknown> | undefined;
        if (source) add(source.lawId, source.articleNumberNormalized);
        if (related) add(related.lawId, related.articleNumberNormalized);
      }
    }
  }

  return refs;
}
