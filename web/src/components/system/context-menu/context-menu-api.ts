// Pure API functions for the context menu.
// Extracted from ContextMenuProvider handlers — each function performs a
// single fetch, returns parsed data on success, and throws on failure.
// Toast UI, state updates, and DOM cleanup remain in the hook layer.

import type { ProjectItem, TemplateItem } from "./types";
import type { ApplicabilitySnapshot } from "@/contexts/ApplicabilityContext";

/** Create a check item linking an article to a project. */
export async function createCheckItem(
  projectId: string,
  articleId: string,
  snapshot: ApplicabilitySnapshot,
): Promise<void> {
  const res = await fetch("/api/checkitems", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, articleId, ...snapshot }),
  });
  if (!res.ok) throw new Error("create failed");
}

/** Fetch drawing-note templates for an article. */
export async function fetchDrawingNoteTemplates(
  articleId: string,
): Promise<TemplateItem[]> {
  const res = await fetch(
    `/api/notes?articleId=${encodeURIComponent(articleId)}`,
  );
  if (!res.ok) throw new Error("fetch failed");
  return (await res.json()) as TemplateItem[];
}

/** Fetch all projects. */
export async function fetchProjects(): Promise<ProjectItem[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("fetch failed");
  return (await res.json()) as ProjectItem[];
}

/** Create a user highlight over a text range. Returns the new highlight id.
 *  exactQuote には公式原文（data-original-text から復元）を指定する（設計書§6.3）。 */
export async function createHighlight(input: {
  articleId: string;
  rangeStart: number;
  rangeEnd: number;
  exactQuote: string;
  color: string;
  type: string;
  applicabilityAnchor: ApplicabilitySnapshot["applicabilityAnchor"];
  applicabilityDate: string;
  snapshotLawRevisionId: string | null;
}): Promise<{ id: string }> {
  const res = await fetch("/api/user-highlights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error((err as { error?: string }).error ?? "create failed");
  }
  return (await res.json()) as { id: string };
}

/** Attach a tag to an article. */
export async function createTag(
  articleId: string,
  tagName: string,
): Promise<void> {
  const res = await fetch("/api/user-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articleId, tagName }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error((err as { error?: string }).error ?? "create failed");
  }
}

/** Delete a user highlight by id. */
export async function deleteHighlight(highlightId: string): Promise<void> {
  const res = await fetch(
    `/api/user-highlights/${encodeURIComponent(highlightId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error("delete failed");
}

/** Fetch article preview data (e-Gov law id + normalized article number). */
export async function fetchArticlePreview(articleId: string): Promise<{
  egovLawId?: string;
  articleNumberNormalized?: string;
}> {
  const res = await fetch(
    `/api/articles/preview?id=${encodeURIComponent(articleId)}`,
  );
  if (!res.ok) throw new Error("fetch failed");
  return (await res.json()) as {
    egovLawId?: string;
    articleNumberNormalized?: string;
  };
}
