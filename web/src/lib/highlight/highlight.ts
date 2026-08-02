import { prisma } from "@/lib/db";

// ── Types ──

export interface Conditions {
  useDistrict?: string;
  fireDistrict?: string;
  buildingUse?: string;
  structureType?: string;
  floors?: number;
  height?: number;
  totalFloorArea?: number;
  buildingCoverageRatio?: number;
  floorAreaRatio?: number;
  specialUses?: string[];
}

export interface HighlightEntry {
  articleId: string;
  highlightLevel: string;
  conditionTypes: string[];
  conditionValues: string[];
}

export interface HighlightGroup {
  sectionRuleId: number;
  label: string;
  conditionType: string;
  articleCount: number;
}

export interface HighlightResponse {
  highlights: HighlightEntry[];
  groups: HighlightGroup[];
  totalHighlighted: number;
  unmatchedSections: string[];
}

// ── Condition key mapping ──

const VALID_CONDITION_KEYS: Record<string, keyof Conditions> = {
  useDistrict: "useDistrict",
  fireDistrict: "fireDistrict",
  buildingUse: "buildingUse",
  structureType: "structureType",
  floorAreaRatio: "floorAreaRatio",
  buildingCoverage: "buildingCoverageRatio",
  heightLimit: "height",
};

// 条件タイプ → conditionKey のマッピング
// 複数の条件タイプが同じ条件キーに該当する場合がある
function getActiveConditionKeys(conditions: Conditions): string[] {
  const keys: string[] = [];
  for (const [type, key] of Object.entries(VALID_CONDITION_KEYS)) {
    const value = conditions[key];
    if (value !== undefined && value !== null && value !== "") {
      keys.push(type);
    }
  }
  // heightLimit は floors や height があれば有効
  if (conditions.floors || conditions.height) {
    if (!keys.includes("heightLimit")) keys.push("heightLimit");
  }
  // buildingCoverage は buildingCoverageRatio があれば有効
  if (conditions.buildingCoverageRatio) {
    if (!keys.includes("buildingCoverage")) keys.push("buildingCoverage");
  }
  // floorAreaRatio は floorAreaRatio があれば有効
  if (conditions.floorAreaRatio) {
    if (!keys.includes("floorAreaRatio")) keys.push("floorAreaRatio");
  }
  return keys;
}

// ── Main query ──

export async function resolveHighlights(
  conditions: Conditions,
): Promise<HighlightResponse> {
  const activeTypes = getActiveConditionKeys(conditions);

  if (activeTypes.length === 0) {
    return {
      highlights: [],
      groups: [],
      totalHighlighted: 0,
      unmatchedSections: [],
    };
  }

  // Step 1: SectionRule で広域フィルタ
  const sectionRules = await prisma.sectionRule.findMany({
    where: { conditionType: { in: activeTypes } },
    orderBy: { sortOrder: "asc" },
  });

  if (sectionRules.length === 0) {
    return {
      highlights: [],
      groups: [],
      totalHighlighted: 0,
      unmatchedSections: [],
    };
  }

  const sectionRuleIds = sectionRules.map((sr) => sr.id);

  // Step 2: ArticleRule で精密マッチ
  // 条件キーごとに JSONB containment マッチを構築
  const orConditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const type of activeTypes) {
    const key = VALID_CONDITION_KEYS[type];
    if (!key) continue;
    const value = conditions[key];
    if (value === undefined || value === null || value === "") continue;

    // 単一値の場合も配列で JSONB containment をチェック
    const jsonValue = JSON.stringify([value]);
    orConditions.push(
      `("ArticleRule"."conditionKey" = $${paramIdx} AND "ArticleRule"."conditionValues" @> $${paramIdx + 1}::jsonb)`,
    );
    params.push(type, jsonValue);
    paramIdx += 2;
  }

  if (orConditions.length === 0) {
    return {
      highlights: [],
      groups: [],
      totalHighlighted: 0,
      unmatchedSections: [],
    };
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number;
      articleId: string | null;
      highlightLevel: string;
      conditionKey: string;
      conditionValues: unknown;
      description: string | null;
      sectionRuleId: number;
      sectionLabel: string;
      conditionType: string;
    }>
  >(
    `SELECT
      ar.id,
      ar."articleId",
      ar."highlightLevel",
      ar."conditionKey",
      ar."conditionValues",
      ar.description,
      sr.id AS "sectionRuleId",
      sr.label AS "sectionLabel",
      sr."conditionType"
    FROM "ArticleRule" ar
    JOIN "SectionRule" sr ON ar."sectionRuleId" = sr.id
    LEFT JOIN "Article" a ON ar."articleId" = a.id
    WHERE ar."sectionRuleId" = ANY($${paramIdx}::int[])
      AND (${orConditions.join(" OR ")})
      AND (a."deletedAt" IS NULL OR a.id IS NULL)
    ORDER BY sr."sortOrder", ar."sortOrder"`,
    ...params,
    sectionRuleIds,
  );

  // Build highlights (merge same articleId entries)
  const highlightMap = new Map<string, HighlightEntry>();
  for (const row of rows) {
    if (!row.articleId) continue;

    const existing = highlightMap.get(row.articleId);
    const values = Array.isArray(row.conditionValues)
      ? (row.conditionValues as string[])
      : [];

    if (existing) {
      if (!existing.conditionTypes.includes(row.conditionType)) {
        existing.conditionTypes.push(row.conditionType);
      }
      for (const v of values) {
        if (!existing.conditionValues.includes(v)) {
          existing.conditionValues.push(v);
        }
      }
    } else {
      highlightMap.set(row.articleId, {
        articleId: row.articleId,
        highlightLevel: row.highlightLevel,
        conditionTypes: [row.conditionType],
        conditionValues: values,
      });
    }
  }

  // Build groups
  const groupMap = new Map<number, HighlightGroup>();
  for (const row of rows) {
    if (!row.articleId) continue;
    const existing = groupMap.get(row.sectionRuleId);
    if (existing) {
      existing.articleCount++;
    } else {
      groupMap.set(row.sectionRuleId, {
        sectionRuleId: row.sectionRuleId,
        label: row.sectionLabel,
        conditionType: row.conditionType,
        articleCount: 1,
      });
    }
  }

  // Unmatched sections
  const matchedSectionIds = new Set(rows.map((r) => r.sectionRuleId));
  const unmatchedSections = sectionRules
    .filter((sr) => !matchedSectionIds.has(sr.id))
    .map((sr) => `${sr.label}（条件値未選択）`);

  return {
    highlights: Array.from(highlightMap.values()),
    groups: Array.from(groupMap.values()),
    totalHighlighted: highlightMap.size,
    unmatchedSections,
  };
}

// ── Count-only (lightweight for wizard counter) ──

export async function countHighlights(
  conditions: Conditions,
): Promise<number> {
  const activeTypes = getActiveConditionKeys(conditions);
  if (activeTypes.length === 0) return 0;

  const sectionRules = await prisma.sectionRule.findMany({
    where: { conditionType: { in: activeTypes } },
    select: { id: true },
  });
  if (sectionRules.length === 0) return 0;

  const sectionRuleIds = sectionRules.map((sr) => sr.id);

  const orConditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const type of activeTypes) {
    const key = VALID_CONDITION_KEYS[type];
    if (!key) continue;
    const value = conditions[key];
    if (value === undefined || value === null || value === "") continue;

    const jsonValue = JSON.stringify([value]);
    orConditions.push(
      `("ArticleRule"."conditionKey" = $${paramIdx} AND "ArticleRule"."conditionValues" @> $${paramIdx + 1}::jsonb)`,
    );
    params.push(type, jsonValue);
    paramIdx += 2;
  }

  if (orConditions.length === 0) return 0;

  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(DISTINCT ar."articleId")::int AS count
     FROM "ArticleRule" ar
     JOIN "SectionRule" sr ON ar."sectionRuleId" = sr.id
     LEFT JOIN "Article" a ON ar."articleId" = a.id
     WHERE ar."sectionRuleId" = ANY($${paramIdx}::int[])
       AND (${orConditions.join(" OR ")})
       AND (a."deletedAt" IS NULL OR a.id IS NULL)`,
    ...params,
    sectionRuleIds,
  );

  return Number(rows[0]?.count ?? 0);
}
