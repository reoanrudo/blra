import type { ConfirmedRelationsDocument } from "@/lib/relations/confirmed-relation";

const cache = new Map<string, Promise<ConfirmedRelationsDocument>>();

export async function fetchConfirmedRelations(
  revisionId: string,
  fetcher: typeof fetch = fetch,
): Promise<ConfirmedRelationsDocument> {
  const cached = cache.get(revisionId);
  if (cached) return cached;

  const request = fetcher(
    `/api/law-revisions/${encodeURIComponent(revisionId)}/confirmed-relations`,
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(`確認済みの関連を取得できません (${response.status})`);
    }
    return (await response.json()) as ConfirmedRelationsDocument;
  });

  cache.set(revisionId, request);
  request.catch(() => {
    if (cache.get(revisionId) === request) cache.delete(revisionId);
  });
  return request;
}

export function clearConfirmedRelationsCache(revisionId?: string): void {
  if (revisionId) cache.delete(revisionId);
  else cache.clear();
}
