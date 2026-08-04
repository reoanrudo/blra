import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import FullLawReader from "@/components/article/FullLawReader";
import HistoricalArticleTree from "@/components/article/HistoricalArticleTree";
import ArticleLayout from "@/components/article/ArticleLayout";
import LeftPanel from "@/components/layout/LeftPanel";
import {
  articleDisplayTitle,
  getArticleBreadcrumb,
  getArticleWithTree,
  getHistoricalArticleWithTree,
  type ArticleRow,
} from "@/lib/article/article";
import { readerArticleHref } from "@/lib/article/full-law-document";
import {
  resolveArticleRoute,
  type ArticleRouteResolution,
} from "@/lib/law-refresh/article-successor";

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

/**
 * removed / historical 解決のときの履歴表示（Task 13 Step 4）。
 *
 * 現行スコープを迂回する読み取り専用 repository から旧 Article subtree、法令名、
 * 公式版番号、施行日を取得し、HistoricalArticleTree で「削除済み」または
 * 「現行条文との対応未確認」を表示する。編集・ハイライト作成操作は出さない。
 */
async function renderHistoricalPage(
  articleId: string,
  resolution: Extract<
    ArticleRouteResolution,
    { kind: "removed" | "historical" }
  >,
) {
  const historical = await getHistoricalArticleWithTree(articleId);
  if (!historical) notFound();

  return (
    <ArticleLayout
      breadcrumb={
        <span className="text-xs text-neutral-700">{historical.lawName}</span>
      }
      leftPanel={
        <LeftPanel toc={[]} documentStatus="ready" currentArticleId={articleId} />
      }
      center={
        <HistoricalArticleTree
          tree={historical.tree}
          lawName={historical.lawName}
          officialVersionKey={historical.officialVersionKey}
          effectiveFrom={historical.effectiveFrom}
          kind={resolution.kind}
          reason={resolution.kind === "historical" ? resolution.reason : undefined}
        />
      }
    />
  );
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // 本文取得前に route resolution を求める（Task 13）。
  const resolution = await resolveArticleRoute(id);

  switch (resolution.kind) {
    case "missing":
      notFound();

    case "redirect":
      // 確定 mapping chain の末尾（現行 Revision の後継 Article）へ恒久転送。
      permanentRedirect(readerArticleHref(resolution.articleId));

    case "removed":
    case "historical":
      return renderHistoricalPage(id, resolution);

    case "current":
    default:
      break;
  }

  // current: 従来通り現行 Revision の本文を表示する。
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
