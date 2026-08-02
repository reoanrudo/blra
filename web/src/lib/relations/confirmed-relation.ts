export const RELATION_TYPE_ORDER = [
  "DELEGATES_TO",
  "APPLIES_MUTATIS_MUTANDIS",
  "DEFINES",
  "EXCEPTS",
  "CITES",
] as const;

export type RelationEdgeTypeValue = (typeof RELATION_TYPE_ORDER)[number];

export const RELATION_TYPE_LABELS: Record<RelationEdgeTypeValue, string> = {
  DELEGATES_TO: "委任先",
  APPLIES_MUTATIS_MUTANDIS: "準用",
  DEFINES: "定義",
  EXCEPTS: "例外",
  CITES: "参照",
};

export interface ConfirmedRelation {
  id: string;
  relationType: RelationEdgeTypeValue;
  rationale: string;
  confirmedAt: string;
  target: {
    articleId: string;
    lawName: string;
    lawShortName: string | null;
    articleNumber: string | null;
    caption: string | null;
  };
}

export interface ConfirmedRelationsDocument {
  revisionId: string;
  relationsBySource: Record<string, ConfirmedRelation[]>;
}

export interface ConfirmedRelationSortRow {
  id: string;
  relationType: RelationEdgeTypeValue;
  confirmedAt: string;
  targetLawDisplayOrder: number;
  targetArticleSortOrder: number;
}

export function normalizeRelationRationale(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 500) {
    throw new Error("確認根拠は1〜500文字で入力してください");
  }
  return normalized;
}

export function sortConfirmedRelationRows<T extends ConfirmedRelationSortRow>(
  relations: T[],
): T[] {
  const typeOrder = new Map(
    RELATION_TYPE_ORDER.map((value, index) => [value, index]),
  );
  return [...relations].sort((left, right) =>
    (typeOrder.get(left.relationType) ?? 99) -
      (typeOrder.get(right.relationType) ?? 99) ||
    left.targetLawDisplayOrder - right.targetLawDisplayOrder ||
    left.targetArticleSortOrder - right.targetArticleSortOrder ||
    left.confirmedAt.localeCompare(right.confirmedAt) ||
    left.id.localeCompare(right.id),
  );
}
