export const APPLICABILITY_ANCHORS = [
  "TODAY",
  "CONFIRMATION_APPLICATION",
  "CONSTRUCTION_START",
  "EXISTING_BUILDING_ORIGIN",
  "CUSTOM",
] as const;

export type ApplicabilityAnchorType =
  (typeof APPLICABILITY_ANCHORS)[number];

export const APPLICABILITY_ANCHOR_LABELS: Record<
  ApplicabilityAnchorType,
  string
> = {
  TODAY: "本日",
  CONFIRMATION_APPLICATION: "確認申請日",
  CONSTRUCTION_START: "着工日",
  EXISTING_BUILDING_ORIGIN: "既存建築物の基準日",
  CUSTOM: "任意指定日",
};

export interface ApplicabilityContextValue {
  anchor: ApplicabilityAnchorType;
  asOf: string;
  projectId: string | null;
}

export type ApplicabilityParseResult =
  | { kind: "valid"; context: ApplicabilityContextValue }
  | { kind: "redirect"; context: ApplicabilityContextValue }
  | {
      kind: "invalid";
      reason:
        | "MISSING_ANCHOR"
        | "INVALID_ANCHOR"
        | "MISSING_AS_OF"
        | "INVALID_AS_OF";
    };

export interface ApplicabilitySearchParams {
  anchor?: string | string[];
  asOf?: string | string[];
  project?: string | string[];
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function singleValue(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isApplicabilityAnchor(
  value: string,
): value is ApplicabilityAnchorType {
  return (APPLICABILITY_ANCHORS as readonly string[]).includes(value);
}

export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function todayInJapan(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseApplicabilityContext(
  searchParams: ApplicabilitySearchParams,
  today = todayInJapan(),
): ApplicabilityParseResult {
  const anchorValue = singleValue(searchParams.anchor);
  const asOfValue = singleValue(searchParams.asOf);
  const projectId = singleValue(searchParams.project);

  if (!anchorValue && !asOfValue) {
    return {
      kind: "redirect",
      context: { anchor: "TODAY", asOf: today, projectId },
    };
  }

  if (!anchorValue) return { kind: "invalid", reason: "MISSING_ANCHOR" };
  if (!isApplicabilityAnchor(anchorValue)) {
    return { kind: "invalid", reason: "INVALID_ANCHOR" };
  }

  if (anchorValue === "TODAY") {
    if (asOfValue !== today) {
      return {
        kind: "redirect",
        context: { anchor: "TODAY", asOf: today, projectId },
      };
    }
    return {
      kind: "valid",
      context: { anchor: "TODAY", asOf: today, projectId },
    };
  }

  if (!asOfValue) return { kind: "invalid", reason: "MISSING_AS_OF" };
  if (!isIsoCalendarDate(asOfValue)) {
    return { kind: "invalid", reason: "INVALID_AS_OF" };
  }

  return {
    kind: "valid",
    context: { anchor: anchorValue, asOf: asOfValue, projectId },
  };
}

export function buildArticleHref(
  articleId: string,
  context: ApplicabilityContextValue,
): string {
  const params = new URLSearchParams();
  params.set("anchor", context.anchor);
  params.set("asOf", context.asOf);
  if (context.projectId) params.set("project", context.projectId);

  return `/articles/${encodeURIComponent(articleId)}?${params.toString()}`;
}

export function buildArticleHrefFromSearchParams(
  articleId: string,
  searchParams: URLSearchParams,
  today = todayInJapan(),
): string {
  const parsed = parseApplicabilityContext(
    {
      anchor: searchParams.get("anchor") ?? undefined,
      asOf: searchParams.get("asOf") ?? undefined,
      project: searchParams.get("project") ?? undefined,
    },
    today,
  );
  const context =
    parsed.kind === "invalid"
      ? { anchor: "TODAY" as const, asOf: today, projectId: null }
      : parsed.context;
  return buildArticleHref(articleId, context);
}

export function formatRevisionPeriod(
  effectiveFrom: string,
  effectiveTo: string | null,
): string {
  if (effectiveTo === null) return `${effectiveFrom} から現行`;
  return `${effectiveFrom} 以上、${effectiveTo} 未満`;
}
