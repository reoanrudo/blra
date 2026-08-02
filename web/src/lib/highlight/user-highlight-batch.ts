import type { UserHighlightData } from "@/contexts/UserHighlightContext";

/**
 * ハイライト一括取得クライアント（設計書§4.3, §5）
 *
 * 従来の articleId ごとの個別 fetch（最大124回通信）を廃止し、
 * 1リクエストで取得する。
 */
export async function fetchHighlightsBatch(
  articleIds: string[],
): Promise<Map<string, UserHighlightData[]>> {
  if (articleIds.length === 0) return new Map();

  const res = await fetch("/api/user-highlights/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articleIds }),
  });
  if (!res.ok) throw new Error(`batch highlight fetch failed: ${res.status}`);

  const data: { highlights: Record<string, unknown[]> } = await res.json();
  const result = new Map<string, UserHighlightData[]>();
  for (const [articleId, list] of Object.entries(data.highlights ?? {})) {
    if (Array.isArray(list)) {
      result.set(articleId, list as unknown as UserHighlightData[]);
    }
  }
  return result;
}
