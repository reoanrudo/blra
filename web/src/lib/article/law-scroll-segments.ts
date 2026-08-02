import type { ChapterArticle } from "@/lib/article/article";
import type { ScrollScopeInfo } from "@/lib/article/chapter-window";

export interface LawScrollSegment {
  scope: ScrollScopeInfo;
  articles: ChapterArticle[];
  beforeCursor: string | null;
  afterCursor: string | null;
  nextScope: ScrollScopeInfo | null;
}

export function mergePageIntoLastSegment(
  segments: LawScrollSegment[],
  incoming: ChapterArticle[],
  afterCursor: string | null,
  nextScope: ScrollScopeInfo | null,
): LawScrollSegment[] {
  const last = segments.at(-1);
  if (!last) return segments;

  const existingIds = new Set(last.articles.map((article) => article.root.id));
  const deduped = incoming.filter(
    (article) => !existingIds.has(article.root.id),
  );
  const updated: LawScrollSegment = {
    ...last,
    articles: [...last.articles, ...deduped],
    afterCursor,
    nextScope,
  };
  return [...segments.slice(0, -1), updated];
}

export function appendNextScopeSegment(
  segments: LawScrollSegment[],
  incoming: LawScrollSegment,
): LawScrollSegment[] {
  if (segments.some((segment) => segment.scope.id === incoming.scope.id)) {
    return segments;
  }

  const existingArticleIds = new Set(
    segments.flatMap((segment) =>
      segment.articles.map((article) => article.root.id),
    ),
  );
  return [
    ...segments,
    {
      ...incoming,
      articles: incoming.articles.filter(
        (article) => !existingArticleIds.has(article.root.id),
      ),
    },
  ];
}
