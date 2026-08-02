import Link from "next/link";
import { notFound } from "next/navigation";
import FullLawReader from "@/components/article/FullLawReader";
import {
  articleDisplayTitle,
  getArticleBreadcrumb,
  getArticleWithTree,
  type ArticleRow,
} from "@/lib/article/article";
import { readerArticleHref } from "@/lib/article/full-law-document";

function buildBreadcrumb(breadcrumb: ArticleRow[]) {
  if (breadcrumb.length === 0) {
    return <span className="text-xs text-neutral-700">法令リーダー</span>;
  }

  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs text-neutral-600">
      <li className="flex items-center gap-1">
        <Link
          href={readerArticleHref(breadcrumb[0].id)}
          className="flex-shrink-0 text-neutral-500 hover:text-[#d92f7e] hover:underline"
        >
          {breadcrumb[0].lawName}
        </Link>
      </li>
      {breadcrumb.map((row, index) => (
        <li key={row.id} className="flex min-w-0 items-center gap-1">
          <span className="flex-shrink-0 text-neutral-400">&gt;</span>
          {index === breadcrumb.length - 1 ? (
            <span className="truncate font-medium text-neutral-950">
              {articleDisplayTitle(row)}
            </span>
          ) : (
            <Link
              href={readerArticleHref(row.id)}
              className="max-w-[120px] truncate hover:text-[#d92f7e] hover:underline sm:max-w-[200px]"
            >
              {articleDisplayTitle(row)}
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tree, breadcrumb] = await Promise.all([
    getArticleWithTree(id),
    getArticleBreadcrumb(id),
  ]);

  if (tree.length === 0) notFound();

  const currentArticle = tree[0];
  return (
    <FullLawReader
      lawRevisionId={currentArticle.lawRevisionId}
      initialArticleId={id}
      lawId={currentArticle.lawId}
      breadcrumb={buildBreadcrumb(breadcrumb)}
    />
  );
}
