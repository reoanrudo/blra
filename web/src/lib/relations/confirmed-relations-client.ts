import {
  RELATION_TYPE_ORDER,
  type ConfirmedRelation,
  type ConfirmedRelationsDocument,
  type RelationEdgeTypeValue,
} from "@/lib/relations/confirmed-relation";

const SUCCESS_TTL_MS = 60_000;
const INVALID_RESPONSE_MESSAGE = "確認済みの関連の応答が不正です";
const relationTypes = new Set<string>(RELATION_TYPE_ORDER);

type CacheEntry = {
  request: Promise<ConfirmedRelationsDocument>;
  expiresAt: number | null;
};

const cache = new Map<string, CacheEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function invalidResponse(): never {
  throw new Error(INVALID_RESPONSE_MESSAGE);
}

function parseConfirmedRelation(value: unknown): ConfirmedRelation {
  if (!isRecord(value) || !isRecord(value.target)) invalidResponse();

  const { id, relationType, rationale, confirmedAt, target } = value;
  if (
    typeof id !== "string" ||
    typeof relationType !== "string" ||
    !relationTypes.has(relationType) ||
    typeof rationale !== "string" ||
    typeof confirmedAt !== "string" ||
    typeof target.articleId !== "string" ||
    typeof target.lawName !== "string" ||
    !isNullableString(target.lawShortName) ||
    !isNullableString(target.articleNumber) ||
    !isNullableString(target.caption)
  ) {
    invalidResponse();
  }

  return {
    id,
    relationType: relationType as RelationEdgeTypeValue,
    rationale,
    confirmedAt,
    target: {
      articleId: target.articleId,
      lawName: target.lawName,
      lawShortName: target.lawShortName,
      articleNumber: target.articleNumber,
      caption: target.caption,
    },
  };
}

function parseConfirmedRelationsDocument(
  value: unknown,
  expectedRevisionId: string,
): ConfirmedRelationsDocument {
  if (
    !isRecord(value) ||
    value.revisionId !== expectedRevisionId ||
    !isRecord(value.relationsBySource)
  ) {
    invalidResponse();
  }

  const relationsBySource = Object.fromEntries(
    Object.entries(value.relationsBySource).map(([sourceId, relations]) => {
      if (!Array.isArray(relations)) invalidResponse();
      return [sourceId, relations.map(parseConfirmedRelation)];
    }),
  );

  return { revisionId: expectedRevisionId, relationsBySource };
}

export async function fetchConfirmedRelations(
  revisionId: string,
  fetcher: typeof fetch = fetch,
): Promise<ConfirmedRelationsDocument> {
  const cached = cache.get(revisionId);
  if (
    cached &&
    (cached.expiresAt === null || cached.expiresAt > Date.now())
  ) {
    return cached.request;
  }
  if (cached) cache.delete(revisionId);

  const request = fetcher(
    `/api/law-revisions/${encodeURIComponent(revisionId)}/confirmed-relations`,
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(`確認済みの関連を取得できません (${response.status})`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      invalidResponse();
    }
    return parseConfirmedRelationsDocument(body, revisionId);
  });

  const entry: CacheEntry = { request, expiresAt: null };
  cache.set(revisionId, entry);
  request.then(
    () => {
      if (cache.get(revisionId) === entry) {
        entry.expiresAt = Date.now() + SUCCESS_TTL_MS;
      }
    },
    () => {
      if (cache.get(revisionId) === entry) cache.delete(revisionId);
    },
  );
  return request;
}

export function clearConfirmedRelationsCache(revisionId?: string): void {
  if (revisionId) cache.delete(revisionId);
  else cache.clear();
}
