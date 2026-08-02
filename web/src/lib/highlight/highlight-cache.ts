import type { HighlightResponse } from "@/lib/highlight/highlight";

const cache = new Map<string, HighlightResponse>();

function hashConditions(conditions: Record<string, unknown>): string {
  return JSON.stringify(conditions);
}

export function getCachedHighlight(
  conditions: Record<string, unknown>,
): HighlightResponse | null {
  const key = hashConditions(conditions);
  return cache.get(key) ?? null;
}

export function setCachedHighlight(
  conditions: Record<string, unknown>,
  response: HighlightResponse,
): void {
  const key = hashConditions(conditions);
  cache.set(key, response);
}

export function clearHighlightCache(): void {
  cache.clear();
}
