import type { FullLawDocument } from "@/lib/article/full-law-document";

const documentCache = new Map<string, Promise<FullLawDocument>>();

export async function fetchFullLawDocument(
  revisionId: string,
  fetcher: typeof fetch = fetch,
): Promise<FullLawDocument> {
  const cached = documentCache.get(revisionId);
  if (cached) return cached;

  const request = fetcher(
    `/api/law-revisions/${encodeURIComponent(revisionId)}/document`,
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(`全文法令の取得に失敗しました (${response.status})`);
    }
    return (await response.json()) as FullLawDocument;
  });

  documentCache.set(revisionId, request);
  request.catch(() => {
    if (documentCache.get(revisionId) === request) {
      documentCache.delete(revisionId);
    }
  });
  return request;
}

export function clearFullLawDocumentCache(revisionId?: string): void {
  if (revisionId) {
    documentCache.delete(revisionId);
    return;
  }
  documentCache.clear();
}
