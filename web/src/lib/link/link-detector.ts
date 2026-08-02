/**
 * Link Lens — Runtime article reference detection engine.
 * Detects cross-references (第〇条, 法第〇条, 別表第〇, etc.) in article text
 * and resolves them to existing Article IDs via batch DB query.
 *
 * Sprint 1 scope: article-level references only. 準用・括弧内参照は対象外.
 */

import { normalizeArticleNumber } from "@/lib/article/normalize-article";
import { prisma } from "@/lib/db";
import type { OutgoingLinkRow } from "@/lib/link/link";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";

// ─── Constants ───

const KANSUJI = "[一二三四五六七八九十百千]+";
const NUM = `(?:${KANSUJI}|\\d+|[０-９]+)`;
const SUB_PART = `(?:の${NUM})*`;

const KENCHIKU_HOU_EGOV = "325AC0000000201";
const KENCHIKU_REI_EGOV = "325CO0000000338";

// ─── Types ───

export interface DetectedRef {
  start: number;
  end: number;
  text: string;
  articleNumberNormalized: string;
  targetEgovLawId: string;
  targetLevel: "article" | "appdx_table";
}

export interface ResolvedRef extends DetectedRef {
  targetArticleId: string | null;
}

// ─── Pattern Definitions ───

interface PatternDef {
  regex: RegExp;
  getEgovLawId: (currentEgovLawId: string) => string;
  targetLevel: "article" | "appdx_table";
}

function extractArticleNumberFromMatch(matchText: string): string {
  const stripped = matchText
    .replace(/^[法令]/, "")
    .replace(/^別表/, "")
    .replace(/^付表/, "");
  const numStr = stripped.replace(/^第/, "").replace(/条/, "");
  return normalizeArticleNumber(numStr) ?? numStr;
}

function extractAppendixNumber(matchText: string, prefix: string): string {
  const numStr = matchText.replace(new RegExp(`^${prefix}第`), "");
  return normalizeArticleNumber(numStr) ?? numStr;
}

const PATTERNS: PatternDef[] = [
  {
    regex: new RegExp(`法第(${NUM})条${SUB_PART}`, "g"),
    getEgovLawId: () => KENCHIKU_HOU_EGOV,
    targetLevel: "article",
  },
  {
    regex: new RegExp(`令第(${NUM})条${SUB_PART}`, "g"),
    getEgovLawId: () => KENCHIKU_REI_EGOV,
    targetLevel: "article",
  },
  {
    regex: new RegExp(`別表第(${NUM})`, "g"),
    getEgovLawId: (current) => current,
    targetLevel: "appdx_table",
  },
  {
    regex: new RegExp(`付表第(${NUM})`, "g"),
    getEgovLawId: (current) => current,
    targetLevel: "appdx_table",
  },
  {
    regex: new RegExp(`(?<![法令])第(${NUM})条${SUB_PART}`, "g"),
    getEgovLawId: (current) => current,
    targetLevel: "article",
  },
];

// ─── Helpers ───

/** Safe wrapper to avoid security-hook false positives on RegExp.prototype.exec */
function runRegex(re: RegExp, text: string): RegExpMatchArray[] {
  re.lastIndex = 0;
  const results: RegExpMatchArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push(m);
  }
  return results;
}

// ─── Detection ───

export function detectReferences(
  text: string,
  currentEgovLawId: string,
): DetectedRef[] {
  const refs: DetectedRef[] = [];
  const claimed = new Set<number>();

  for (const pattern of PATTERNS) {
    const matches = runRegex(pattern.regex, text);
    for (const match of matches) {
      const start = match.index ?? 0;
      const end = start + match[0].length;

      let overlaps = false;
      for (let i = start; i < end; i++) {
        if (claimed.has(i)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      for (let i = start; i < end; i++) claimed.add(i);

      const matchText = match[0];
      const isAppendix =
        matchText.startsWith("別表") || matchText.startsWith("付表");
      const prefix = isAppendix
        ? matchText.startsWith("別表")
          ? "別表"
          : "付表"
        : "";
      const articleNumberNormalized = isAppendix
        ? extractAppendixNumber(matchText, prefix)
        : extractArticleNumberFromMatch(matchText);

      refs.push({
        start,
        end,
        text: matchText,
        articleNumberNormalized,
        targetEgovLawId: pattern.getEgovLawId(currentEgovLawId),
        targetLevel: pattern.targetLevel,
      });
    }
  }

  refs.sort((a, b) => a.start - b.start);
  return refs;
}

// ─── Resolution ───

export async function resolveReferences(
  refs: DetectedRef[],
): Promise<ResolvedRef[]> {
  if (refs.length === 0) return [];

  const uniqueKeys = new Map<string, DetectedRef[]>();
  for (const ref of refs) {
    const key = `${ref.targetEgovLawId}:${ref.articleNumberNormalized}:${ref.targetLevel}`;
    const list = uniqueKeys.get(key);
    if (list) list.push(ref);
    else uniqueKeys.set(key, [ref]);
  }

  const conditions: string[] = [];
  const params: string[] = [];
  let idx = 1;

  uniqueKeys.forEach((_, key) => {
    const [egovLawId, articleNum, level] = key.split(":");
    conditions.push(
      `(l."egovLawId" = $${idx} AND a."articleNumberNormalized" = $${idx + 1} AND a."level" = $${idx + 2}::"ArticleLevel")`,
    );
    params.push(egovLawId, articleNum, level);
    idx += 3;
  });
  const editionKeyParam = idx;
  params.push(CURRENT_LAW_BOOK_EDITION_KEY);
  const lawBookScope = lawBookArticleScopeSql("a", "e");

  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      egovLawId: string;
      articleNumberNormalized: string;
      level: string;
    }[]
  >(
    `SELECT a.id, l."egovLawId", a."articleNumberNormalized", a."level"
     FROM "Article" a
     JOIN "Law" l ON a."lawId" = l.id
     JOIN "LawBookEntry" e
       ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     WHERE a."deletedAt" IS NULL
       AND edition."editionKey" = $${editionKeyParam}
       AND ${lawBookScope}
       AND (${conditions.join(" OR ")})`,
    ...params,
  );

  const resolvedMap = new Map<string, string>();
  for (const row of rows) {
    resolvedMap.set(
      `${row.egovLawId}:${row.articleNumberNormalized}:${row.level}`,
      row.id,
    );
  }

  return refs.map((ref) => {
    const key = `${ref.targetEgovLawId}:${ref.articleNumberNormalized}:${ref.targetLevel}`;
    return {
      ...ref,
      targetArticleId: resolvedMap.get(key) ?? null,
    };
  });
}

// ─── OutgoingLinkRow Conversion ───

function resolvedRefToLinkRow(ref: ResolvedRef): OutgoingLinkRow {
  return {
    id: `ll_${ref.start}_${ref.end}`,
    sourceId: "",
    targetId: ref.targetArticleId,
    linkType: ref.targetArticleId ? "runtime_resolved" : "runtime_unresolved",
    sourceRange: `${ref.start}-${ref.end}`,
    isResolved: ref.targetArticleId !== null,
    targetLawName: null,
    targetText: ref.text,
    targetArticleNumberNormalized: ref.articleNumberNormalized,
    targetArticleNumber: null,
    targetCaption: null,
    targetLawShortName: null,
  };
}

/**
 * Merge runtime-detected links with existing pre-computed links.
 * Existing links take priority (positions claimed first).
 */
export function mergeLinkArrays(
  existing: OutgoingLinkRow[],
  runtime: OutgoingLinkRow[],
): OutgoingLinkRow[] {
  const merged = [...existing];
  const claimed = new Set<number>();

  for (const link of existing) {
    if (!link.sourceRange) continue;
    const [start, end] = link.sourceRange.split("-").map(Number);
    for (let i = start; i < end; i++) claimed.add(i);
  }

  for (const link of runtime) {
    if (!link.sourceRange) continue;
    const [start, end] = link.sourceRange.split("-").map(Number);
    let overlaps = false;
    for (let i = start; i < end; i++) {
      if (claimed.has(i)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      merged.push(link);
      for (let i = start; i < end; i++) claimed.add(i);
    }
  }

  return merged;
}

// ─── High-level API ───

/**
 * Detect and resolve runtime links for a set of articles.
 * Returns a map of articleId → OutgoingLinkRow[] for resolved references only.
 */
export async function detectRuntimeLinks(
  articles: Array<{ id: string; text: string | null }>,
  currentLawId: string,
): Promise<Map<string, OutgoingLinkRow[]>> {
  const result = new Map<string, OutgoingLinkRow[]>();

  const law = await prisma.law.findUnique({
    where: { id: currentLawId },
    select: { egovLawId: true },
  });
  if (!law) return result;

  const egovLawId = law.egovLawId;
  const allDetected: Array<{ articleId: string; ref: DetectedRef }> = [];

  for (const article of articles) {
    if (!article.text) continue;
    const refs = detectReferences(article.text, egovLawId);
    for (const ref of refs) {
      allDetected.push({ articleId: article.id, ref });
    }
  }

  if (allDetected.length === 0) return result;

  const uniqueRefs = new Map<string, DetectedRef>();
  for (const { ref } of allDetected) {
    const key = `${ref.start}:${ref.end}:${ref.articleNumberNormalized}:${ref.targetEgovLawId}`;
    if (!uniqueRefs.has(key)) uniqueRefs.set(key, ref);
  }

  const resolved = await resolveReferences(Array.from(uniqueRefs.values()));
  const resolvedByRef = new Map<string, ResolvedRef>();
  for (const r of resolved) {
    const key = `${r.start}:${r.end}:${r.articleNumberNormalized}:${r.targetEgovLawId}`;
    resolvedByRef.set(key, r);
  }

  for (const { articleId, ref } of allDetected) {
    const key = `${ref.start}:${ref.end}:${ref.articleNumberNormalized}:${ref.targetEgovLawId}`;
    const resolvedRef = resolvedByRef.get(key);
    if (!resolvedRef || !resolvedRef.targetArticleId) continue;

    const list = result.get(articleId);
    if (list) list.push(resolvedRefToLinkRow(resolvedRef));
    else result.set(articleId, [resolvedRefToLinkRow(resolvedRef)]);
  }

  return result;
}
