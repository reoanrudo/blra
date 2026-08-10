export function findPrintableArticleId(target: Element): string | null {
  return (
    target.closest<HTMLElement>("[data-print-article-id]")?.dataset
      .printArticleId ?? null
  );
}

export function printCurrentArticle(articleId: string): boolean {
  const article = Array.from(
    document.querySelectorAll<HTMLElement>("[data-print-article-id]"),
  ).find((element) => element.dataset.printArticleId === articleId);
  const viewer = article?.closest<HTMLElement>("[data-full-law-ready='true']");

  if (!article || !viewer) return false;

  viewer.setAttribute("data-print-current-article", "true");
  article.setAttribute("data-print-current", "true");

  try {
    window.print();
    return true;
  } finally {
    article.removeAttribute("data-print-current");
    viewer.removeAttribute("data-print-current-article");
  }
}
